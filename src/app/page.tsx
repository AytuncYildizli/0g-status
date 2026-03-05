'use client';

import { useEffect, useState, useCallback } from 'react';

type ProviderState = 'up' | 'down' | 'ssl_error' | 'timeout' | 'unknown';

interface ProviderStatus {
  name: string;
  model: string;
  isUp: boolean;
  state?: ProviderState;
  latencyMs: number | null;
  error: string | null;
}

interface StatusData {
  summary: { online: number; unknown?: number; offline?: number; total: number; healthPercent: number; checkedAt: string };
  providers: ProviderStatus[];
}

interface HistoryPoint {
  timestamp: number;
  statuses: Record<string, boolean>;
  latencies: Record<string, number | null>;
}

interface PeriodStats {
  uptime: number;
  avgLatency: number | null;
}

interface HistoryData {
  history: HistoryPoint[];
  historyByPeriod?: {
    '24h': HistoryPoint[];
    '7d': HistoryPoint[];
    '30d': HistoryPoint[];
    'allTime': HistoryPoint[];
  };
  stats: {
    '24h': Record<string, PeriodStats>;
    '7d': Record<string, PeriodStats>;
    '30d': Record<string, PeriodStats>;
    'allTime': Record<string, PeriodStats>;
  };
  meta: {
    totalChecks: number;
    startedAt: string | null;
    historyPoints: number;
    granularityByPeriod?: Record<Period, 'hourly' | 'daily' | 'monthly'>;
  };
}

type Period = '24h' | '7d' | '30d' | 'allTime';

function UptimeBars({ history, providerName, stats, period }: {
  history: HistoryPoint[];
  providerName: string;
  stats: Record<string, PeriodStats>;
  period: Period;
}) {
  if (history.length === 0) {
    return <div className="text-xs text-zinc-600">Collecting data...</div>;
  }

  const providerStats = stats[providerName];
  const uptimePct = providerStats?.uptime ?? 0;
  const avgLatency = providerStats?.avgLatency;

  const periodLabel = period === 'allTime' ? 'all time' : period;

  // Format time for hourly bars
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.round((now.getTime() - timestamp) / 3600000);

    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="mt-2">
      <div className="flex gap-px h-6">
        {history.map((point, i) => {
          const hasData = Object.hasOwn(point.statuses, providerName);
          const isUp = hasData ? point.statuses[providerName] : null;
          const latency = hasData ? point.latencies?.[providerName] : null;
          const date = new Date(point.timestamp);
          const fullTime = date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const pointClass = isUp === true ? 'bg-green-500' : isUp === false ? 'bg-red-500' : 'bg-zinc-700';
          const pointLabel = isUp === true ? `Up (${latency}ms avg)` : isUp === false ? 'Down' : 'No data';

          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all hover:opacity-80 cursor-pointer ${pointClass}`}
              title={`${fullTime}: ${pointLabel}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-xs text-zinc-500">
        <span>
          {history.length > 0 ? formatTime(history[0].timestamp) : ''}
        </span>
        <span>
          {uptimePct}% uptime ({periodLabel})
          {avgLatency ? ` · ${avgLatency}ms avg` : ''}
        </span>
        <span>Now</span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('24h');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/history?limit=24')
      ]);

      const statusData: StatusData = await statusRes.json();
      const histData: HistoryData = await historyRes.json();

      setData(statusData);
      setHistoryData(histData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 60000);
    return () => clearInterval(i);
  }, [refresh]);

  const health = data?.summary.healthPercent ?? 0;
  const statusColor = health === 100 ? 'bg-green-500' : health > 50 ? 'bg-yellow-500' : 'bg-red-500';
  const statusText = health === 100 ? 'All Systems Operational' : health > 50 ? 'Partial Outage' : 'Major Outage';

  const periods: { key: Period; label: string }[] = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
    { key: 'allTime', label: 'All' },
  ];

  const selectedHistory = historyData?.historyByPeriod?.[period] || historyData?.history || [];
  const barGranularity = historyData?.meta?.granularityByPeriod?.[period] || 'hourly';
  const granularityLabel =
    barGranularity === 'hourly' ? '1 hour' : barGranularity === 'daily' ? '1 day' : '1 month';

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">0G Compute Status</h1>
        <p className="text-zinc-500 mb-8">Real-time status of decentralized AI compute providers</p>

        {data && (
          <div className="bg-zinc-900 rounded-xl p-5 mb-8 border border-zinc-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${statusColor}`} />
              <div>
                <div className="font-semibold text-lg">{statusText}</div>
                <div className="text-zinc-500 text-sm">
                  <span className="text-green-400">{data.summary.online} online</span>
                  {(data.summary.unknown ?? 0) > 0 && (
                    <span className="text-yellow-400"> · {data.summary.unknown} unknown</span>
                  )}
                  {(data.summary.offline ?? 0) > 0 && (
                    <span className="text-red-400"> · {data.summary.offline} down</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-4xl font-bold">{health}%</div>
          </div>
        )}

        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Providers</h2>
            <div className="flex bg-zinc-800 rounded-lg p-0.5">
              {periods.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    period === p.key
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        <div className="space-y-3">
          {data?.providers.map((p) => {
            const state = p.state || (p.isUp ? 'up' : 'down');
            const isSslError = state === 'ssl_error';
            const isTimeout = state === 'timeout';
            const isUnknown = state === 'unknown' || isSslError || isTimeout;

            const dotColor = p.isUp ? 'bg-green-500' : isUnknown ? 'bg-yellow-500' : 'bg-red-500';
            const textColor = p.isUp ? 'text-green-400' : isUnknown ? 'text-yellow-400' : 'text-red-400';
            const statusText = p.isUp ? 'Up' : isSslError ? 'Unknown' : isTimeout ? 'Timeout' : 'Down';

            return (
            <div key={p.name} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-zinc-500">{p.model}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={textColor}>
                    {statusText}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {p.isUp ? `${p.latencyMs}ms` : isSslError ? 'Check 0G Dashboard' : p.error}
                  </div>
                </div>
              </div>
              <UptimeBars
                history={selectedHistory}
                providerName={p.name}
                stats={historyData?.stats?.[period] || {}}
                period={period}
              />
            </div>
            );
          })}
        </div>

        <div className="text-center text-zinc-600 text-xs mt-10 space-y-1">
          <p>Auto-refreshes every 60s · Each bar = {granularityLabel} of checks</p>
          <p>
            {historyData?.meta?.totalChecks
              ? `${historyData.meta.totalChecks.toLocaleString()} total checks`
              : 'Starting data collection...'}
            {historyData?.meta?.startedAt && (
              <> · Since {new Date(historyData.meta.startedAt).toLocaleDateString()}</>
            )}
          </p>
          <p>
            <a href="https://0g.ai" className="text-zinc-500 hover:text-white">0G Labs</a>
          </p>
        </div>
      </div>
    </div>
  );
}
