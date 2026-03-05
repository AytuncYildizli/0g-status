/**
 * 0G Compute Provider Status API
 */
import { NextResponse } from 'next/server';
import { COMPUTE_PROVIDERS, type ComputeProvider } from '@/lib/computeProviders';

type ProviderState = 'up' | 'down' | 'ssl_error' | 'timeout' | 'unknown';

interface ProviderStatus {
  name: string;
  model: string;
  isUp: boolean;
  state: ProviderState;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

async function checkProvider(provider: ComputeProvider): Promise<ProviderStatus> {
  const startTime = Date.now();

  // Try HTTPS first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${provider.url}/v1/models`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    const isUp = response.status < 500;
    return {
      name: provider.name,
      model: provider.model,
      isUp,
      state: isUp ? 'up' : 'down',
      latencyMs,
      error: response.status >= 500 ? `HTTP ${response.status}` : null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const errorMsg = err.message || '';
    const isTimeout = err.name === 'AbortError';
    const isSslError = errorMsg.includes('SSL') ||
                       errorMsg.includes('TLS') ||
                       errorMsg.includes('certificate') ||
                       errorMsg.includes('fetch failed') ||
                       errorMsg.includes('ECONNRESET');

    // If SSL error, try HTTP fallback to see if server is running
    if (isSslError) {
      try {
        const httpUrl = provider.url.replace('https://', 'http://');
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
        const httpResponse = await fetch(`${httpUrl}/v1/models`, {
          signal: controller2.signal,
          redirect: 'manual' // Don't follow redirects
        });
        clearTimeout(timeoutId2);
        const latencyMs = Date.now() - startTime;

        // 301/302 redirect or any response means server is running
        if (httpResponse.status < 500) {
          return {
            name: provider.name,
            model: provider.model,
            isUp: true,
            state: 'up',
            latencyMs,
            error: null,
            checkedAt: new Date().toISOString(),
          };
        }
      } catch {
        // HTTP fallback also failed, continue to return ssl_error
      }
    }

    let state: ProviderState = 'unknown';
    let displayError = errorMsg;

    if (isTimeout) {
      state = 'timeout';
      displayError = 'Timeout';
    } else if (isSslError) {
      state = 'ssl_error';
      displayError = 'SSL/Connection Error - Check via 0G Dashboard';
    }

    return {
      name: provider.name,
      model: provider.model,
      isUp: false,
      state,
      latencyMs: null,
      error: displayError,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function GET() {
  const statuses = await Promise.all(COMPUTE_PROVIDERS.map(checkProvider));
  const upCount = statuses.filter(s => s.isUp).length;
  const unknownCount = statuses.filter(s => ['ssl_error', 'timeout', 'unknown'].includes(s.state)).length;
  const downCount = statuses.filter(s => s.state === 'down').length;
  const verifiedCount = statuses.length - unknownCount;

  // Health % based only on verified checks (up vs confirmed down)
  const healthPercent = verifiedCount > 0
    ? Math.round((upCount / verifiedCount) * 100)
    : 0;

  return NextResponse.json({
    summary: {
      online: upCount,
      unknown: unknownCount,
      offline: downCount,
      total: statuses.length,
      healthPercent,
      checkedAt: new Date().toISOString(),
    },
    providers: statuses,
  });
}
