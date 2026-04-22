import { useEffect, useState } from 'react';
import { fetchEndpoints, registerEndpoint, updateEndpointHealth, type Endpoint } from '../lib/api';
import { Badge, Button, Card, DataTable, ErrorBanner, Input, Loading, PageHeader } from '../components/ui';

export function EndpointsPage() {
  const [rows, setRows] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    const r = await fetchEndpoints();
    setLoading(false);
    if (!r.success) setError(r.error || 'Failed to load');
    if (r.data) setRows(r.data);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function cycle(ep: Endpoint) {
    const order = ['online', 'degraded', 'maintenance', 'offline'];
    const next = order[(order.indexOf(ep.status) + 1) % order.length];
    const res = await updateEndpointHealth(ep.id, next);
    if (!res.success) setError(res.error || 'Health update failed');
    await refresh();
  }

  return (
    <>
      <PageHeader
        title="Endpoints"
        subtitle="On-prem services reachable via outbound-only Cloudflare Tunnel"
        actions={<Button onClick={() => setShowForm(true)}>Register</Button>}
      />
      <ErrorBanner error={error} />

      <Card>
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'service_type', label: 'Type' },
              { key: 'status', label: 'Status', render: (r: any) => <Badge tone={r.status}>{r.status}</Badge> },
              { key: 'internal_url', label: 'Internal URL' },
              { key: 'external_host', label: 'External host' },
              { key: 'last_seen_at', label: 'Last seen' },
              {
                key: 'actions',
                label: '',
                render: (r: any) => (
                  <Button variant="secondary" onClick={() => cycle(r as Endpoint)}>
                    cycle status
                  </Button>
                ),
              },
            ]}
            empty="No endpoints registered."
          />
        )}
      </Card>

      {showForm && (
        <RegisterModal
          onClose={() => setShowForm(false)}
          onDone={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function RegisterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({
    name: '',
    service_type: 'litellm',
    internal_url: '',
    external_host: '',
    tunnel_id: '',
    health_check_url: '/health',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await registerEndpoint(form);
    setSaving(false);
    if (!res.success) {
      setErr(res.error || 'Failed');
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-[520px] p-5">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="text-lg font-semibold mb-3">Register Endpoint</div>
          <ErrorBanner error={err} />
          <form onSubmit={submit} className="space-y-3">
            {(['name', 'service_type', 'internal_url', 'external_host', 'tunnel_id', 'health_check_url'] as const).map((k) => (
              <div key={k}>
                <label className="block text-xs text-[color:var(--color-gray-300)] mb-1">{k}</label>
                <Input value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.name || !form.internal_url}>
                {saving ? 'Saving…' : 'Register'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
