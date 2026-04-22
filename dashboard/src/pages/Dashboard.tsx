import { useEffect, useMemo, useState } from 'react';
import {
  fetchDashboardStats,
  fetchInferenceTimeline,
  fetchModelUsage,
  type DashboardStats,
  type ModelUsage,
  type TimelinePoint,
} from '../lib/api';
import { Card, ErrorBanner, Loading, PageHeader, Stat, DataTable } from '../components/ui';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [usage, setUsage] = useState<ModelUsage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [s, t, u] = await Promise.all([
        fetchDashboardStats(),
        fetchInferenceTimeline(7),
        fetchModelUsage(),
      ]);
      if (!mounted) return;
      if (!s.success) setError(s.error || 'Failed to load stats');
      if (s.data) setStats(s.data);
      if (t.data) setTimeline(t.data);
      if (u.data) setUsage(u.data);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const rollup = useMemo(() => {
    const byDate = new Map<string, { date: string; requests: number; tokens: number }>();
    for (const p of timeline) {
      const cur = byDate.get(p.date) || { date: p.date, requests: 0, tokens: 0 };
      cur.requests += p.requests;
      cur.tokens += p.tokens;
      byDate.set(p.date, cur);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [timeline]);

  if (loading) return <Loading />;

  return (
    <>
      <PageHeader title="Control Plane" subtitle="Closed-boundary ML governance at a glance" />
      <ErrorBanner error={error} />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Stat label="Models" value={stats.models_total} hint={`${stats.models_production} in production`} />
          <Stat label="Inference today" value={stats.inference_today.toLocaleString()} hint={`${stats.inference_tokens_today.toLocaleString()} tokens`} />
          <Stat label="Endpoints online" value={`${stats.endpoints_online}/${stats.endpoints_total}`} />
          <Stat label="Critical events 7d" value={stats.audit_critical_7d} />
          <Stat label="Classification violations 30d" value={stats.classification_violations_30d} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <div className="text-sm text-[color:var(--color-gray-300)] mb-2">Inference (last 7 days)</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={rollup}>
                <defs>
                  <linearGradient id="req" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-teal)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-teal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-gray-300)" fontSize={11} />
                <YAxis stroke="var(--color-gray-300)" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--color-navy-deep)', border: '1px solid var(--color-navy-light)' }} />
                <Area type="monotone" dataKey="requests" stroke="var(--color-teal)" fill="url(#req)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-[color:var(--color-gray-300)] mb-3">Top models</div>
          <DataTable
            rows={usage.slice(0, 8) as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'model_name', label: 'Model' },
              { key: 'total_requests', label: 'Reqs', className: 'text-right' },
              { key: 'error_count', label: 'Err', className: 'text-right' },
            ]}
            empty="No usage yet."
          />
        </Card>
      </div>
    </>
  );
}
