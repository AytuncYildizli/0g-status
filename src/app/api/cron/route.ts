/**
 * Cron endpoint - runs every minute to check providers
 * Stores: raw history (90 points), hourly/daily/monthly aggregates, all-time stats
 */
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { COMPUTE_PROVIDERS, type ComputeProvider } from '@/lib/computeProviders';

interface ProviderCheck {
  name: string;
  isUp: boolean;
  latencyMs: number | null;
  error: string | null;
}

interface HistoryPoint {
  timestamp: number;
  statuses: Record<string, boolean>;
  latencies: Record<string, number | null>;
}

interface AggregateStats {
  checks: number;
  up: Record<string, number>;
  totalLatency: Record<string, number>;
  latencyCount: Record<string, number>;
}

interface AllTimeStats {
  startedAt: string;
  totalChecks: number;
  providers: Record<string, { up: number; checks: number; totalLatency: number; latencyCount: number }>;
}

const HISTORY_KEY = 'status:history';
const MAX_HISTORY = 90; // 90 bars for display

async function checkProvider(provider: ComputeProvider): Promise<ProviderCheck> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${provider.url}/v1/models`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    return {
      name: provider.name,
      isUp: response.status < 500,
      latencyMs,
      error: response.status >= 500 ? `HTTP ${response.status}` : null,
    };
  } catch (err: any) {
    const errorMsg = err.message || '';
    const isTimeout = err.name === 'AbortError';
    const isSslError = errorMsg.includes('SSL') ||
                       errorMsg.includes('TLS') ||
                       errorMsg.includes('certificate') ||
                       errorMsg.includes('fetch failed') ||
                       errorMsg.includes('ECONNRESET');

    // HTTP fallback for SSL errors (same as status route)
    if (isSslError && provider.url.startsWith('https://')) {
      try {
        const httpUrl = provider.url.replace('https://', 'http://');
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
        const httpResponse = await fetch(`${httpUrl}/v1/models`, {
          signal: controller2.signal,
          redirect: 'manual'
        });
        clearTimeout(timeoutId2);
        const latencyMs = Date.now() - startTime;

        if (httpResponse.status < 500) {
          return {
            name: provider.name,
            isUp: true,
            latencyMs,
            error: null,
          };
        }
      } catch {
        // HTTP fallback also failed
      }
    }

    return {
      name: provider.name,
      isUp: false,
      latencyMs: null,
      error: isTimeout ? 'Timeout' : errorMsg.slice(0, 50),
    };
  }
}

function getTimeKeys(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');

  return {
    hourly: `status:hourly:${year}-${month}-${day}-${hour}`,
    daily: `status:daily:${year}-${month}-${day}`,
    monthly: `status:monthly:${year}-${month}`,
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('Cron running (no secret verification)');
  }

  try {
    const now = new Date();
    const checks = await Promise.all(COMPUTE_PROVIDERS.map(checkProvider));

    // Build history point
    const statuses: Record<string, boolean> = {};
    const latencies: Record<string, number | null> = {};

    checks.forEach(c => {
      statuses[c.name] = c.isUp;
      latencies[c.name] = c.latencyMs;
    });

    const newPoint: HistoryPoint = {
      timestamp: Date.now(),
      statuses,
      latencies,
    };

    // 1. Update raw history (last 90 points for bars)
    let history: HistoryPoint[] = await kv.get(HISTORY_KEY) || [];
    history.push(newPoint);
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }
    await kv.set(HISTORY_KEY, history);

    // 2. Update hourly/daily/monthly aggregates
    const keys = getTimeKeys(now);

    for (const [period, key] of Object.entries(keys)) {
      let agg: AggregateStats = await kv.get(key) || {
        checks: 0,
        up: {},
        totalLatency: {},
        latencyCount: {},
      };

      agg.checks += 1;

      checks.forEach(c => {
        if (!agg.up[c.name]) agg.up[c.name] = 0;
        if (!agg.totalLatency[c.name]) agg.totalLatency[c.name] = 0;
        if (!agg.latencyCount[c.name]) agg.latencyCount[c.name] = 0;

        if (c.isUp) {
          agg.up[c.name] += 1;
          if (c.latencyMs) {
            agg.totalLatency[c.name] += c.latencyMs;
            agg.latencyCount[c.name] += 1;
          }
        }
      });

      // Set with TTL: hourly=2days, daily=35days, monthly=400days
      const ttl = period === 'hourly' ? 172800 : period === 'daily' ? 3024000 : 34560000;
      await kv.set(key, agg, { ex: ttl });
    }

    // 3. Update all-time stats
    let allTime: AllTimeStats = await kv.get('status:alltime') || {
      startedAt: now.toISOString(),
      totalChecks: 0,
      providers: {},
    };

    allTime.totalChecks += 1;

    checks.forEach(c => {
      if (!allTime.providers[c.name]) {
        allTime.providers[c.name] = { up: 0, checks: 0, totalLatency: 0, latencyCount: 0 };
      }
      allTime.providers[c.name].checks += 1;
      if (c.isUp) {
        allTime.providers[c.name].up += 1;
        if (c.latencyMs) {
          allTime.providers[c.name].totalLatency += c.latencyMs;
          allTime.providers[c.name].latencyCount += 1;
        }
      }
    });

    await kv.set('status:alltime', allTime);

    const upCount = checks.filter(c => c.isUp).length;

    return NextResponse.json({
      success: true,
      checked: checks.length,
      online: upCount,
      historySize: history.length,
      totalChecks: allTime.totalChecks,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error('Cron error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
