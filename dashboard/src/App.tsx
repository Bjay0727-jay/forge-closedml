import { useEffect, useMemo, useState } from 'react';
import { fetchAuditEvents, fetchDashboardStats, fetchEndpoints, fetchInferenceLogs, fetchModels, type AuditEvent, type DashboardStats, type Endpoint, type InferenceLog, type Model } from './lib/api';

type Page = 'Dashboard' | 'Models' | 'Endpoints' | 'Inference Logs' | 'Audit Events' | 'Policy Violations';

export default function App() {
  const [page, setPage] = useState<Page>('Dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [models, setModels] = useState<Model[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);

  useEffect(() => {
    fetchDashboardStats().then(r => {
      if (r.success && r.data) {
        setStats(r.data);
        setStatsError(null);
      } else {
        setStatsError(r.error || 'Failed to load dashboard stats');
      }
      setLoadingStats(false);
    });

    fetchModels().then(r => r.data && setModels(r.data));
    fetchEndpoints().then(r => r.data && setEndpoints(r.data));
    fetchInferenceLogs().then(r => r.data && setLogs(r.data));
    fetchAuditEvents().then(r => r.data && setAudits(r.data));
  }, []);

  const policyViolations = useMemo(() => audits.filter(a => a.event_type.includes('classification') || a.severity === 'critical'), [audits]);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: 20 }}>
      <h1>ForgeClosedML Dashboard</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['Dashboard', 'Models', 'Endpoints', 'Inference Logs', 'Audit Events', 'Policy Violations'] as Page[]).map(p => (
          <button key={p} onClick={() => setPage(p)} style={{ padding: '6px 10px' }}>{p}</button>
        ))}
      </div>

      {page === 'Dashboard' && (
        loadingStats ? <p>Loading dashboard stats...</p> :
        statsError ? <p>Dashboard error: {statsError}</p> :
        <pre>{JSON.stringify(stats, null, 2)}</pre>
      )}
      {page === 'Models' && <Table rows={models} />}
      {page === 'Endpoints' && <Table rows={endpoints} />}
      {page === 'Inference Logs' && <Table rows={logs} />}
      {page === 'Audit Events' && <Table rows={audits} />}
      {page === 'Policy Violations' && <Table rows={policyViolations} />}
    </div>
  );
}

function Table({ rows }: { rows: any[] }) {
  if (!rows.length) return <p>No records.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{cols.map(c => <th key={c} style={{ border: '1px solid #ddd', textAlign: 'left', padding: 6 }}>{c}</th>)}</tr></thead>
      <tbody>{rows.slice(0, 100).map((r, i) => <tr key={i}>{cols.map(c => <td key={c} style={{ border: '1px solid #ddd', padding: 6 }}>{typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c] ?? '')}</td>)}</tr>)}</tbody>
    </table>
  );
}
