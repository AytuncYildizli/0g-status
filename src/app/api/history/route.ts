/**
 * History API - returns status history and aggregated stats
 */
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

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

const PROVIDER_ALIASES: Record<string, string> = {
  'deepseek-v3': 'glm-5-fp8',
  'flux-turbo': 'z-image',
};

function normalizeProviderName(name: string): string {
  return PROVIDER_ALIASES[name] || name;
}

function getTimeKeys(hoursBack: number = 24) {
  const keys: string[] = [];
  const now = new Date();

  for (let i = 0; i < hoursBack; i++) {
    const d = new Date(now.getTime() - i * 3600000);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hour = String(d.getUTCHours()).padStart(2, '0');
    keys.push(`status:hourly:${year}-${month}-${day}-${hour}`);
  }

  return keys;
}

function getDailyKeys(daysBack: number = 30) {
  const keys: string[] = [];
  const now = new Date();

  for (let i = 0; i < daysBack; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    keys.push(`status:daily:${year}-${month}-${day}`);
  }

  return keys;
}

function getMonthlyBuckets(monthsBack: number = 13) {
  const buckets: Array<{ key: string; timestamp: number }> = [];
  const now = new Date();

  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0));
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    buckets.push({
      key: `status:monthly:${year}-${month}`,
      timestamp: d.getTime(),
    });
  }

  return buckets;
}

function buildPointFromAggregate(agg: AggregateStats): Omit<HistoryPoint, 'timestamp'> {
  const statuses: Record<string, boolean> = {};
  const latencies: Record<string, number | null> = {};
  const providersByNormalized: Record<string, string[]> = {};

  Object.keys(agg.up || {}).forEach(provider => {
    const normalized = normalizeProviderName(provider);
    if (!providersByNormalized[normalized]) {
      providersByNormalized[normalized] = [];
    }
    providersByNormalized[normalized].push(provider);
  });

  Object.entries(providersByNormalized).forEach(([provider, sourceProviders]) => {
    const upCount = sourceProviders.reduce((sum, p) => sum + (agg.up?.[p] || 0), 0);
    const totalLatency = sourceProviders.reduce((sum, p) => sum + (agg.totalLatency?.[p] || 0), 0);
    const latencyCount = sourceProviders.reduce((sum, p) => sum + (agg.latencyCount?.[p] || 0), 0);

    statuses[provider] = upCount / agg.checks >= 0.5;
    latencies[provider] = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : null;
  });

  return { statuses, latencies };
}

async function aggregateStats(keys: string[]): Promise<Record<string, { uptime: number; avgLatency: number | null }>> {
  const stats: Record<string, { up: number; checks: number; totalLatency: number; latencyCount: number }> = {};

  const results = await Promise.all(keys.map(k => kv.get<AggregateStats>(k)));

  results.forEach(agg => {
    if (!agg) return;

    const providersByNormalized: Record<string, string[]> = {};
    Object.keys(agg.up || {}).forEach(provider => {
      const normalized = normalizeProviderName(provider);
      if (!providersByNormalized[normalized]) {
        providersByNormalized[normalized] = [];
      }
      providersByNormalized[normalized].push(provider);
    });

    Object.entries(providersByNormalized).forEach(([normalizedProvider, sourceProviders]) => {
      if (!stats[normalizedProvider]) {
        stats[normalizedProvider] = { up: 0, checks: 0, totalLatency: 0, latencyCount: 0 };
      }

      const up = sourceProviders.reduce((sum, p) => sum + (agg.up?.[p] || 0), 0);
      const totalLatency = sourceProviders.reduce((sum, p) => sum + (agg.totalLatency?.[p] || 0), 0);
      const latencyCount = sourceProviders.reduce((sum, p) => sum + (agg.latencyCount?.[p] || 0), 0);

      stats[normalizedProvider].up += up;
      stats[normalizedProvider].checks += agg.checks || 0;
      stats[normalizedProvider].totalLatency += totalLatency;
      stats[normalizedProvider].latencyCount += latencyCount;
    });
  });

  const result: Record<string, { uptime: number; avgLatency: number | null }> = {};

  Object.entries(stats).forEach(([provider, s]) => {
    result[provider] = {
      uptime: s.checks > 0 ? Math.round((s.up / s.checks) * 100) : 0,
      avgLatency: s.latencyCount > 0 ? Math.round(s.totalLatency / s.latencyCount) : null,
    };
  });

  return result;
}

// Build hourly history points from aggregates for status bars
async function buildHourlyHistory(hoursBack: number = 90): Promise<HistoryPoint[]> {
  const keys = getTimeKeys(hoursBack);
  const results = await Promise.all(keys.map(k => kv.get<AggregateStats>(k)));

  const history: HistoryPoint[] = [];
  const now = new Date();

  // Process in reverse order (oldest first) for chronological display
  for (let i = hoursBack - 1; i >= 0; i--) {
    const agg = results[i];
    const timestamp = now.getTime() - i * 3600000;

    if (agg && agg.checks > 0) {
      history.push({ timestamp, ...buildPointFromAggregate(agg) });
    }
    // Skip hours with no data (they'll appear as gaps)
  }

  return history;
}

async function buildDailyHistory(daysBack: number = 30): Promise<HistoryPoint[]> {
  const keys = getDailyKeys(daysBack);
  const results = await Promise.all(keys.map(k => kv.get<AggregateStats>(k)));

  const history: HistoryPoint[] = [];
  const now = new Date();

  for (let i = daysBack - 1; i >= 0; i--) {
    const agg = results[i];
    const timestamp = now.getTime() - i * 86400000;

    if (agg && agg.checks > 0) {
      history.push({ timestamp, ...buildPointFromAggregate(agg) });
    }
  }

  return history;
}

async function buildMonthlyHistory(monthsBack: number = 13): Promise<HistoryPoint[]> {
  const buckets = getMonthlyBuckets(monthsBack);
  const results = await Promise.all(buckets.map(({ key }) => kv.get<AggregateStats>(key)));

  const history: HistoryPoint[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const agg = results[i];
    const timestamp = buckets[i].timestamp;

    if (agg && agg.checks > 0) {
      history.push({ timestamp, ...buildPointFromAggregate(agg) });
    }
  }

  return history;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '24'), 200);
    const allTime: AllTimeStats | null = await kv.get('status:alltime');
    const now = new Date();

    let monthsBack = 13;
    if (allTime?.startedAt) {
      const started = new Date(allTime.startedAt);
      const diffMonths =
        (now.getUTCFullYear() - started.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - started.getUTCMonth()) + 1;
      monthsBack = Math.max(1, Math.min(13, diffMonths));
    }

    // Build period-specific history for bars.
    const [history24h, history7d, history30d, historyAllTime] = await Promise.all([
      buildHourlyHistory(limit),
      buildDailyHistory(7),
      buildDailyHistory(30),
      buildMonthlyHistory(monthsBack),
    ]);

    // Calculate period stats
    const [stats24h, stats7d, stats30d] = await Promise.all([
      aggregateStats(getTimeKeys(24)),
      aggregateStats(getDailyKeys(7)),
      aggregateStats(getDailyKeys(30)),
    ]);

    // Calculate all-time uptime per provider
    const allTimeStats: Record<string, { uptime: number; avgLatency: number | null }> = {};
    if (allTime?.providers) {
      const normalizedAllTime: Record<string, { up: number; checks: number; totalLatency: number; latencyCount: number }> = {};

      Object.entries(allTime.providers).forEach(([provider, s]) => {
        const normalized = normalizeProviderName(provider);
        if (!normalizedAllTime[normalized]) {
          normalizedAllTime[normalized] = { up: 0, checks: 0, totalLatency: 0, latencyCount: 0 };
        }

        normalizedAllTime[normalized].up += s.up;
        normalizedAllTime[normalized].checks += s.checks;
        normalizedAllTime[normalized].totalLatency += s.totalLatency;
        normalizedAllTime[normalized].latencyCount += s.latencyCount;
      });

      Object.entries(normalizedAllTime).forEach(([provider, s]) => {
        allTimeStats[provider] = {
          uptime: s.checks > 0 ? Math.round((s.up / s.checks) * 100) : 0,
          avgLatency: s.latencyCount > 0 ? Math.round(s.totalLatency / s.latencyCount) : null,
        };
      });
    }

    return NextResponse.json({
      history: history24h,
      historyByPeriod: {
        '24h': history24h,
        '7d': history7d,
        '30d': history30d,
        'allTime': historyAllTime,
      },
      stats: {
        '24h': stats24h,
        '7d': stats7d,
        '30d': stats30d,
        'allTime': allTimeStats,
      },
      meta: {
        totalChecks: allTime?.totalChecks || 0,
        startedAt: allTime?.startedAt || null,
        historyPoints: history24h.length,
        historyPointsByPeriod: {
          '24h': history24h.length,
          '7d': history7d.length,
          '30d': history30d.length,
          'allTime': historyAllTime.length,
        },
        granularityByPeriod: {
          '24h': 'hourly',
          '7d': 'daily',
          '30d': 'daily',
          'allTime': 'monthly',
        },
      },
    });
  } catch (error: any) {
    console.error('History API error:', error);
    return NextResponse.json({
      history: [],
      stats: {},
      error: error.message
    }, { status: 500 });
  }
}
