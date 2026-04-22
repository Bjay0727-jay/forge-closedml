import { useEffect, useState } from 'react';
import { auditExportUrl, fetchAuditEvents, type AuditEvent } from '../lib/api';
import { Badge, Button, Card, DataTable, ErrorBanner, Input, Loading, PageHeader, Select } from '../components/ui';

const SEVERITIES = ['', 'info', 'warning', 'error', 'critical'] as const;

export function AuditEventsPage() {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    severity: '',
    event_type: '',
    actor: '',
    conmon_period: '',
  });

  async function refresh() {
    setLoading(true);
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    const r = await fetchAuditEvents(params);
    setLoading(false);
    if (!r.success) setError(r.error || 'Failed to load');
    if (r.data) setRows(r.data);
  }

  useEffect(() => {
    void refresh();
  }, [filters]);

  const exportDisabled = !filters.conmon_period;

  return (
    <>
      <PageHeader
        title="Audit Events"
        subtitle="Structured log of every privileged action, authentication decision, and policy outcome"
        actions={
          <a
            href={exportDisabled ? undefined : auditExportUrl(filters.conmon_period)}
            target="_blank"
            rel="noreferrer"
            className={exportDisabled ? 'pointer-events-none opacity-40' : ''}
          >
            <Button disabled={exportDisabled}>Export ConMon bundle</Button>
          </a>
        }
      />
      <ErrorBanner error={error} />

      <Card className="p-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
            {SEVERITIES.map((s) => (
              <option key={s || 'any'} value={s}>
                {s || 'Any severity'}
              </option>
            ))}
          </Select>
          <Input
            placeholder="event_type (e.g. model.promoted)"
            value={filters.event_type}
            onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}
          />
          <Input
            placeholder="actor"
            value={filters.actor}
            onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
          />
          <Input
            placeholder="ConMon period (2026-Q2)"
            value={filters.conmon_period}
            onChange={(e) => setFilters({ ...filters, conmon_period: e.target.value })}
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'created_at', label: 'Time' },
              { key: 'severity', label: 'Severity', render: (r: any) => <Badge tone={r.severity}>{r.severity}</Badge> },
              { key: 'event_type', label: 'Event' },
              { key: 'actor', label: 'Actor' },
              { key: 'resource_type', label: 'Resource' },
              { key: 'resource_id', label: 'ID' },
              { key: 'conmon_period', label: 'Period' },
            ]}
            empty="No audit events."
          />
        )}
      </Card>
    </>
  );
}
