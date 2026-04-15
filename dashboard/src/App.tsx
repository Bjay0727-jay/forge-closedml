import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Box, Activity, Shield, Server,
  ScrollText, ChevronRight, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, Clock, Zap, Database, Cpu,
  ArrowUpRight, ArrowDownRight, Minus, Eye
} from 'lucide-react';
import {
  fetchDashboardStats, fetchModels, fetchAuditEvents,
  fetchEndpoints, fetchInferenceLogs, fetchInferenceTimeline,
  type DashboardStats, type Model, type AuditEvent,
  type Endpoint, type InferenceLog, type TimelinePoint
} from './lib/api';

// ── Types ───────────────────────────────────────────────────────────────────
type Page = 'dashboard' | 'models' | 'inference' | 'audit' | 'endpoints';

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-16'} flex-shrink-0 border-r transition-all duration-200`}
        style={{ background: 'var(--color-navy)', borderColor: 'rgba(0,168,157,0.1)' }}
      >
        <div className="p-4 border-b" style={{ borderColor: 'rgba(0,168,157,0.1)' }}>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--color-teal-dim)', color: 'var(--color-teal)', fontFamily: 'var(--font-mono)' }}
            >
              ML
            </div>
            {sidebarOpen && (
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>ForgeClosedML</div>
                <div className="text-[10px]" style={{ color: 'var(--color-gray-500)', fontFamily: 'var(--font-mono)' }}>CONTROL PLANE</div>
              </div>
            )}
          </div>
        </div>

        <nav className="p-2 flex flex-col gap-0.5">
          {([
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'models', icon: Box, label: 'Model Registry' },
            { id: 'inference', icon: Zap, label: 'Inference Logs' },
            { id: 'audit', icon: ScrollText, label: 'Audit Trail' },
            { id: 'endpoints', icon: Server, label: 'Endpoints' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                page === id ? 'font-medium' : ''
              }`}
              style={{
                background: page === id ? 'var(--color-teal-dim)' : 'transparent',
                color: page === id ? 'var(--color-teal)' : 'var(--color-gray-300)',
              }}
            >
              <Icon size={16} />
              {sidebarOpen && label}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-3 border-t" style={{ borderColor: 'rgba(0,168,157,0.08)' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-xs flex items-center gap-2 px-2 py-1 rounded transition-colors w-full"
            style={{ color: 'var(--color-gray-500)', fontFamily: 'var(--font-mono)' }}
          >
            <ChevronRight size={12} className={`transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
            {sidebarOpen && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--color-navy-deep)' }}>
        {page === 'dashboard' && <DashboardPage />}
        {page === 'models' && <ModelsPage />}
        {page === 'inference' && <InferencePage />}
        {page === 'audit' && <AuditPage />}
        {page === 'endpoints' && <EndpointsPage />}
      </main>
    </div>
  );
}

// ── PAGE HEADER ─────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, onRefresh }: { title: string; subtitle: string; onRefresh?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-gray-100)' }}>{title}</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-gray-500)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>{subtitle}</p>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors"
          style={{ border: '1px solid rgba(0,168,157,0.2)', color: 'var(--color-teal)', fontFamily: 'var(--font-mono)' }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════════════════
function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([fetchDashboardStats(), fetchInferenceTimeline(7)]);
      if (s.data) setStats(s.data);
      if (t.data) setTimeline(t.data);
    } catch { /* offline fallback */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Demo data when API is not yet connected
  const s = stats || {
    models_total: 0, models_production: 0, inference_today: 0,
    inference_tokens_today: 0, jobs_running: 0, jobs_completed_30d: 0,
    endpoints_online: 0, endpoints_total: 0, audit_critical_7d: 0,
    classification_violations_30d: 0,
  };

  return (
    <div className="p-6">
      <PageHeader title="Control Plane" subtitle="FORGE CLOSED ML ENVIRONMENT" onRefresh={load} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px mb-6" style={{ background: 'rgba(0,168,157,0.1)' }}>
        <StatCard label="Models (Production)" value={s.models_production} total={s.models_total} icon={Box} />
        <StatCard label="Inference Today" value={s.inference_today} icon={Zap} accent />
        <StatCard label="Tokens Today" value={formatNumber(s.inference_tokens_today)} icon={Activity} />
        <StatCard label="Endpoints Online" value={s.endpoints_online} total={s.endpoints_total} icon={Server}
          status={s.endpoints_online === s.endpoints_total ? 'good' : s.endpoints_online > 0 ? 'warn' : 'error'} />
        <StatCard label="Critical Events (7d)" value={s.audit_critical_7d} icon={AlertTriangle}
          status={s.audit_critical_7d === 0 ? 'good' : 'error'} />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-6" style={{ background: 'rgba(0,168,157,0.1)' }}>
        <StatCard label="Jobs Running" value={s.jobs_running} icon={Cpu} small />
        <StatCard label="Jobs (30d)" value={s.jobs_completed_30d} icon={CheckCircle2} small />
        <StatCard label="Classification Violations (30d)" value={s.classification_violations_30d} icon={Shield}
          status={s.classification_violations_30d === 0 ? 'good' : 'error'} small />
        <StatCard label="Total Models" value={s.models_total} icon={Database} small />
      </div>

      {/* Data Classification Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded p-4" style={{ background: 'var(--color-navy)', border: '1px solid rgba(0,168,157,0.1)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-gray-100)' }}>Data Classification Policies</h3>
          <div className="flex flex-col gap-2">
            {[
              { level: 'CLASSIFIED / CUI', dest: 'On-Prem Only', color: '#EF4444' },
              { level: 'PHI', dest: 'On-Prem · Tokenized · BAA Required', color: '#EF4444' },
              { level: 'INTERNAL', dest: 'On-Prem + Cloud (Encrypted)', color: '#F59E0B' },
              { level: 'PUBLIC', dest: 'All Destinations', color: '#22C55E' },
            ].map(p => (
              <div key={p.level} className="flex items-center justify-between py-1.5 px-3 rounded text-xs"
                style={{ background: 'var(--color-navy-deep)', border: '1px solid rgba(0,168,157,0.06)' }}>
                <span className="font-medium flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', color: p.color }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  {p.level}
                </span>
                <span style={{ color: 'var(--color-gray-300)' }}>{p.dest}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded p-4" style={{ background: 'var(--color-navy)', border: '1px solid rgba(0,168,157,0.1)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-gray-100)' }}>System Status</h3>
          <div className="flex flex-col gap-2">
            {[
              { name: 'Cloudflare Worker API', status: 'operational' },
              { name: 'Cloudflare Tunnel', status: s.endpoints_online > 0 ? 'operational' : 'awaiting-setup' },
              { name: 'On-Prem Inference (LiteLLM)', status: s.endpoints_online > 0 ? 'operational' : 'awaiting-setup' },
              { name: 'MLflow Tracking', status: 'awaiting-setup' },
              { name: 'Wazuh SIEM', status: 'awaiting-setup' },
            ].map(s => (
              <div key={s.name} className="flex items-center justify-between py-1.5 px-3 rounded text-xs"
                style={{ background: 'var(--color-navy-deep)', border: '1px solid rgba(0,168,157,0.06)' }}>
                <span style={{ color: 'var(--color-gray-200)' }}>{s.name}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODELS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchModels(statusFilter || undefined);
    if (res.data) setModels(res.data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const statusColors: Record<string, string> = {
    registered: '#94A3B8', validating: '#F59E0B', staging: '#3B82F6',
    production: '#22C55E', archived: '#64748B', revoked: '#EF4444',
  };

  return (
    <div className="p-6">
      <PageHeader title="Model Registry" subtitle="CHAIN OF CUSTODY · TWO-PERSON INTEGRITY" onRefresh={load} />

      {/* Lifecycle */}
      <div className="flex items-center gap-1 mb-4 text-[10px] px-2 py-2 rounded"
        style={{ background: 'var(--color-navy)', fontFamily: 'var(--font-mono)', color: 'var(--color-gray-500)', border: '1px solid rgba(0,168,157,0.08)' }}>
        <span style={{ color: statusColors.registered }}>REGISTERED</span> <ChevronRight size={10} />
        <span style={{ color: statusColors.validating }}>VALIDATING</span> <ChevronRight size={10} />
        <span style={{ color: statusColors.staging }}>STAGING</span> <ChevronRight size={10} />
        <span style={{ color: statusColors.production }}>PRODUCTION</span>
        <span className="ml-4 opacity-50">|</span>
        <span className="ml-2" style={{ color: statusColors.archived }}>ARCHIVED</span>
        <span style={{ color: statusColors.revoked }} className="ml-2">REVOKED</span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4">
        {['', 'registered', 'staging', 'production', 'archived'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-1 rounded text-xs transition-colors"
            style={{
              background: statusFilter === s ? 'var(--color-teal-dim)' : 'transparent',
              color: statusFilter === s ? 'var(--color-teal)' : 'var(--color-gray-500)',
              border: `1px solid ${statusFilter === s ? 'rgba(0,168,157,0.3)' : 'rgba(0,168,157,0.08)'}`,
              fontFamily: 'var(--font-mono)',
            }}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded overflow-hidden" style={{ border: '1px solid rgba(0,168,157,0.1)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(0,168,157,0.06)' }}>
              {['Name', 'Version', 'Base Model', 'Format', 'Status', 'Hash', 'Created'].map(h => (
                <th key={h} className="text-left px-4 py-2 text-[10px] font-medium"
                  style={{ color: 'var(--color-teal)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-gray-500)' }}>
                  {loading ? 'Loading...' : 'No models registered. Deploy your first model to get started.'}
                </td>
              </tr>
            ) : models.map(m => (
              <tr key={m.id} className="transition-colors" style={{ borderTop: '1px solid rgba(0,168,157,0.06)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,168,157,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--color-gray-100)' }}>{m.name}</td>
                <td className="px-4 py-2.5" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-gray-300)' }}>{m.version}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-gray-300)' }}>{m.base_model}</td>
                <td className="px-4 py-2.5 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-500)' }}>{m.format}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{
                    background: `${statusColors[m.status]}20`,
                    color: statusColors[m.status],
                    fontFamily: 'var(--font-mono)',
                  }}>{m.status.toUpperCase()}</span>
                </td>
                <td className="px-4 py-2.5 text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-500)' }}>
                  {m.sha256_hash ? m.sha256_hash.slice(0, 12) + '...' : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-gray-500)' }}>
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INFERENCE LOGS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function InferencePage() {
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchInferenceLogs({ limit: '100' });
    if (res.data) setLogs(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const classColors: Record<string, string> = {
    public: '#22C55E', internal: '#F59E0B', cui: '#EF4444', phi: '#EF4444', classified: '#DC2626',
  };

  return (
    <div className="p-6">
      <PageHeader title="Inference Logs" subtitle="EVERY REQUEST · FULL AUDIT TRAIL · AU-2 COMPLIANT" onRefresh={load} />

      <div className="rounded overflow-hidden" style={{ border: '1px solid rgba(0,168,157,0.1)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(0,168,157,0.06)' }}>
              {['Time', 'Model', 'Platform', 'Classification', 'Tokens', 'Latency', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-2 text-[10px] font-medium"
                  style={{ color: 'var(--color-teal)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-gray-500)' }}>
                  {loading ? 'Loading...' : 'No inference logs yet. Connect an inference endpoint to begin.'}
                </td>
              </tr>
            ) : logs.map(log => (
              <tr key={log.id} style={{ borderTop: '1px solid rgba(0,168,157,0.06)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,168,157,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td className="px-4 py-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>
                  {new Date(log.created_at).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2 text-xs font-medium" style={{ color: 'var(--color-gray-100)' }}>{log.model_name}</td>
                <td className="px-4 py-2 text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-500)' }}>
                  {log.source_platform}
                </td>
                <td className="px-4 py-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{
                    background: `${classColors[log.data_classification] || '#94A3B8'}20`,
                    color: classColors[log.data_classification] || '#94A3B8',
                    fontFamily: 'var(--font-mono)',
                  }}>{log.data_classification.toUpperCase()}</span>
                </td>
                <td className="px-4 py-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>
                  {log.total_tokens?.toLocaleString() || '—'}
                </td>
                <td className="px-4 py-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>
                  {log.latency_ms ? `${log.latency_ms}ms` : '—'}
                </td>
                <td className="px-4 py-2">
                  {log.status_code < 400
                    ? <CheckCircle2 size={14} style={{ color: '#22C55E' }} />
                    : <XCircle size={14} style={{ color: '#EF4444' }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT TRAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (severity) params.severity = severity;
    const res = await fetchAuditEvents(params);
    if (res.data) setEvents(res.data);
    setLoading(false);
  }, [severity]);

  useEffect(() => { load(); }, [load]);

  const sevColors: Record<string, string> = {
    info: '#3B82F6', warning: '#F59E0B', error: '#EF4444', critical: '#DC2626',
  };

  return (
    <div className="p-6">
      <PageHeader title="Audit Trail" subtitle="NIST 800-53 AU-2 · AU-3 · AU-6 · AU-12" onRefresh={load} />

      <div className="flex gap-1 mb-4">
        {['', 'info', 'warning', 'error', 'critical'].map(s => (
          <button key={s} onClick={() => setSeverity(s)}
            className="px-3 py-1 rounded text-xs transition-colors"
            style={{
              background: severity === s ? 'var(--color-teal-dim)' : 'transparent',
              color: severity === s ? 'var(--color-teal)' : 'var(--color-gray-500)',
              border: `1px solid ${severity === s ? 'rgba(0,168,157,0.3)' : 'rgba(0,168,157,0.08)'}`,
              fontFamily: 'var(--font-mono)',
            }}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="rounded overflow-hidden" style={{ border: '1px solid rgba(0,168,157,0.1)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(0,168,157,0.06)' }}>
              {['Time', 'Severity', 'Event', 'Actor', 'Resource', 'Action', 'ConMon Period'].map(h => (
                <th key={h} className="text-left px-4 py-2 text-[10px] font-medium"
                  style={{ color: 'var(--color-teal)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-gray-500)' }}>
                  {loading ? 'Loading...' : 'No audit events recorded yet.'}
                </td>
              </tr>
            ) : events.map(e => (
              <tr key={e.id} style={{ borderTop: '1px solid rgba(0,168,157,0.06)' }}
                onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(0,168,157,0.03)')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                <td className="px-4 py-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{
                    background: `${sevColors[e.severity]}20`, color: sevColors[e.severity],
                    fontFamily: 'var(--font-mono)',
                  }}>{e.severity.toUpperCase()}</span>
                </td>
                <td className="px-4 py-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-200)' }}>{e.event_type}</td>
                <td className="px-4 py-2 text-xs" style={{ color: 'var(--color-gray-300)' }}>{e.actor_email || e.actor}</td>
                <td className="px-4 py-2 text-xs" style={{ color: 'var(--color-gray-500)' }}>
                  {e.resource_type ? `${e.resource_type}:${e.resource_id?.slice(0, 8)}` : '—'}
                </td>
                <td className="px-4 py-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>{e.action}</td>
                <td className="px-4 py-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-500)' }}>{e.conmon_period || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchEndpoints();
    if (res.data) setEndpoints(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <PageHeader title="Endpoints" subtitle="ON-PREM NODES · CLOUDFLARE TUNNEL · ZERO EXPOSED PORTS" onRefresh={load} />

      {endpoints.length === 0 ? (
        <div className="rounded p-8 text-center" style={{ background: 'var(--color-navy)', border: '1px solid rgba(0,168,157,0.1)' }}>
          <Server size={32} className="mx-auto mb-3" style={{ color: 'var(--color-gray-500)' }} />
          <p className="text-sm mb-2" style={{ color: 'var(--color-gray-300)' }}>No endpoints registered yet.</p>
          <p className="text-xs" style={{ color: 'var(--color-gray-500)', maxWidth: 400, margin: '0 auto' }}>
            Deploy the on-prem Docker stack and configure Cloudflare Tunnel. Endpoints will appear here once the health reporter connects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {endpoints.map(ep => (
            <div key={ep.id} className="rounded p-4" style={{ background: 'var(--color-navy)', border: '1px solid rgba(0,168,157,0.1)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm" style={{ color: 'var(--color-gray-100)' }}>{ep.name}</span>
                <StatusBadge status={ep.status} />
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-gray-500)' }}>Type</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>{ep.service_type}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-gray-500)' }}>Internal</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>{ep.internal_url}</span>
                </div>
                {ep.external_host && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--color-gray-500)' }}>External</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-teal)' }}>{ep.external_host}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-gray-500)' }}>Last Seen</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gray-300)' }}>
                    {ep.last_seen_at ? new Date(ep.last_seen_at).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, total, icon: Icon, accent, status, small }:
  { label: string; value: number | string; total?: number; icon: React.ElementType; accent?: boolean; status?: 'good' | 'warn' | 'error'; small?: boolean }) {
  const statusColor = status === 'good' ? '#22C55E' : status === 'warn' ? '#F59E0B' : status === 'error' ? '#EF4444' : undefined;
  return (
    <div className={`${small ? 'p-3' : 'p-4'}`} style={{ background: 'var(--color-navy-deep)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase" style={{ color: 'var(--color-gray-500)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <Icon size={small ? 12 : 14} style={{ color: statusColor || (accent ? 'var(--color-teal)' : 'var(--color-gray-500)') }} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`${small ? 'text-lg' : 'text-2xl'} font-bold`}
          style={{ fontFamily: 'var(--font-mono)', color: statusColor || (accent ? 'var(--color-teal)' : 'var(--color-gray-100)') }}>
          {value}
        </span>
        {total !== undefined && (
          <span className="text-xs" style={{ color: 'var(--color-gray-500)', fontFamily: 'var(--font-mono)' }}>/ {total}</span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    online: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' },
    operational: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' },
    offline: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
    degraded: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
    maintenance: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' },
    'awaiting-setup': { bg: 'rgba(148,163,184,0.1)', text: '#94A3B8' },
  };
  const c = colors[status] || colors['awaiting-setup'];
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-medium"
      style={{ background: c.bg, color: c.text, fontFamily: 'var(--font-mono)' }}>
      {status.toUpperCase().replace('-', ' ')}
    </span>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}
