import { useEffect, useState } from 'react';
import { fetchPolicyViolations, type AuditEvent } from '../lib/api';
import { Badge, Card, DataTable, ErrorBanner, Loading, PageHeader } from '../components/ui';

export function PolicyViolationsPage() {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchPolicyViolations(200).then((r) => {
      if (!mounted) return;
      setLoading(false);
      if (!r.success) setError(r.error || 'Failed to load');
      if (r.data) setRows(r.data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Policy Violations"
        subtitle="Classification violations and critical-severity audit events"
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
              { key: 'severity', label: 'Severity', render: (r: any) => <Badge tone={r.severity}>{r.severity}</Badge> },
              { key: 'event_type', label: 'Event' },
              { key: 'actor', label: 'Actor' },
              { key: 'resource_id', label: 'Resource' },
              {
                key: 'details',
                label: 'Details',
                render: (r: any) => (
                  <pre className="text-xs text-[color:var(--color-gray-300)] whitespace-pre-wrap">
                    {typeof r.details === 'string' ? r.details : JSON.stringify(r.details)}
                  </pre>
                ),
              },
            ]}
            empty="No violations. Good."
          />
        )}
      </Card>
    </>
  );
}
