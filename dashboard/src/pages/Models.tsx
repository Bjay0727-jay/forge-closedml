import { useEffect, useState } from 'react';
import { fetchModels, promoteModel, registerModel, type LifecycleState, type Model } from '../lib/api';
import { Badge, Button, Card, DataTable, ErrorBanner, Input, Loading, PageHeader, Select } from '../components/ui';

const STATES: LifecycleState[] = ['dev', 'staged', 'approved', 'production', 'quarantined'];

export function ModelsPage() {
  const [rows, setRows] = useState<Model[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  async function refresh() {
    setLoading(true);
    const r = await fetchModels(filter || undefined);
    setLoading(false);
    if (!r.success) setError(r.error || 'Failed to load');
    if (r.data) setRows(r.data);
  }

  useEffect(() => {
    void refresh();
  }, [filter]);

  async function onPromote(m: Model, target: LifecycleState) {
    setError(null);
    const res = await promoteModel(m.id, target);
    if (!res.success) {
      setError(res.error || 'Promotion failed');
      return;
    }
    if (res.data?.pending_second_approval) {
      setError(`Approval recorded (${res.data.approvals_collected}/2). Second approver required.`);
    }
    await refresh();
  }

  async function onRollback(m: Model) {
    setError(null);
    const res = await promoteModel(m.id, '', true);
    if (!res.success) setError(res.error || 'Rollback failed');
    await refresh();
  }

  return (
    <>
      <PageHeader
        title="Models"
        subtitle="Lifecycle: dev → staged → approved → production. Quarantine bypasses."
        actions={
          <>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All states</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Button onClick={() => setShowRegister(true)}>Register</Button>
          </>
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
              { key: 'name', label: 'Name' },
              { key: 'lifecycle_state', label: 'State', render: (r: any) => <Badge tone={r.lifecycle_state}>{r.lifecycle_state}</Badge> },
              { key: 'owner', label: 'Owner' },
              { key: 'artifact_signature', label: 'Signature', render: (r: any) => (r.artifact_signature ? <Badge tone="info">signed</Badge> : <Badge>unsigned</Badge>) },
              { key: 'updated_at', label: 'Updated' },
              {
                key: 'actions',
                label: '',
                render: (r: any) => <ModelActions model={r as Model} onPromote={onPromote} onRollback={onRollback} />,
              },
            ]}
            empty="No models registered."
          />
        )}
      </Card>

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onDone={async () => {
            setShowRegister(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function ModelActions({
  model,
  onPromote,
  onRollback,
}: {
  model: Model;
  onPromote: (m: Model, s: LifecycleState) => void;
  onRollback: (m: Model) => void;
}) {
  const next: Record<LifecycleState, LifecycleState[]> = {
    dev: ['staged', 'quarantined'],
    staged: ['approved', 'quarantined'],
    approved: ['production', 'staged', 'quarantined'],
    production: ['quarantined'],
    quarantined: ['dev', 'staged'],
  };
  return (
    <div className="flex gap-2 flex-wrap justify-end">
      {next[model.lifecycle_state]?.map((t) => (
        <Button key={t} variant="secondary" onClick={() => onPromote(model, t)}>
          → {t}
        </Button>
      ))}
      <Button variant="ghost" onClick={() => onRollback(model)}>
        rollback
      </Button>
    </div>
  );
}

function RegisterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({
    name: '',
    version: '',
    base_model: '',
    format: 'gguf',
    quantization: '',
    sha256_hash: '',
    artifact_signature: '',
    provenance_uri: '',
    owner: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await registerModel(form);
    setSaving(false);
    if (!res.success) {
      setErr(res.error || 'Failed');
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-[520px] p-5" >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="text-lg font-semibold mb-3">Register Model</div>
          <ErrorBanner error={err} />
          <form onSubmit={submit} className="space-y-3">
            {(['name', 'version', 'base_model', 'owner', 'quantization', 'sha256_hash', 'artifact_signature', 'provenance_uri'] as const).map((k) => (
              <div key={k}>
                <label className="block text-xs text-[color:var(--color-gray-300)] mb-1">{k}</label>
                <Input value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.name || !form.version || !form.base_model}>
                {saving ? 'Saving…' : 'Register'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
