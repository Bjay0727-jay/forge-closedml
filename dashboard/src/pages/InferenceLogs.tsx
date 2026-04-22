import { useEffect, useState } from 'react';
import { fetchInferenceLogs, type InferenceLog } from '../lib/api';
import { Badge, Card, DataTable, ErrorBanner, Loading, PageHeader, Select } from '../components/ui';

export function InferenceLogsPage() {
  const [rows, setRows] = useState<InferenceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState('100');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchInferenceLogs({ limit }).then((r) => {
      if (!mounted) return;
      setLoading(false);
      if (!r.success) setError(r.error || 'Failed to load');
      if (r.data) setRows(r.data);
    });
    return () => {
      mounted = false;
    };
  }, [limit]);

  return (
    <>
      <PageHeader
        title="Inference Logs"
        subtitle="All /v1/chat/completions calls, tagged by classification"
        actions={
          <Select value={limit} onChange={(e) => setLimit(e.target.value)}>
            {['50', '100', '200', '500'].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        }
      />
      <ErrorBanner error={error} />
      <Card>
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'created_at', label: 'Time' },
              { key: 'request_id', label: 'Request', render: (r: any) => <span className="font-mono text-xs">{String(r.request_id).slice(0, 12)}…</span> },
              { key: 'model_name', label: 'Model' },
              { key: 'user_identity', label: 'Actor' },
              { key: 'data_classification', label: 'Class', render: (r: any) => <Badge>{r.data_classification}</Badge> },
              { key: 'status_code', label: 'Status', render: (r: any) => <Badge tone={r.status_code >= 400 ? 'error' : 'info'}>{r.status_code}</Badge> },
              { key: 'total_tokens', label: 'Tokens', className: 'text-right' },
              { key: 'latency_ms', label: 'Latency (ms)', className: 'text-right' },
            ]}
            empty="No inference activity."
          />
        )}
      </Card>
    </>
  );
}
