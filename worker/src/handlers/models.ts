import { Env } from '../types';
import { AuthContext } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';

const STATES = ['dev', 'staged', 'approved', 'production', 'quarantined'] as const;
type LifecycleState = typeof STATES[number];

const allowedTransitions: Record<LifecycleState, LifecycleState[]> = {
  dev: ['staged', 'quarantined'],
  staged: ['approved', 'quarantined'],
  approved: ['production', 'quarantined'],
  production: ['quarantined'],
  quarantined: ['dev'],
};

export async function listModels(env: Env, url: URL): Promise<Response> {
  const state = url.searchParams.get('state');
  const sql = state
    ? `SELECT * FROM models WHERE tenant_id='forge' AND lifecycle_state=? ORDER BY updated_at DESC`
    : `SELECT * FROM models WHERE tenant_id='forge' ORDER BY updated_at DESC`;
  const result = state ? await env.DB.prepare(sql).bind(state).all() : await env.DB.prepare(sql).all();
  return json({ success: true, data: result.results });
}

export async function registerModel(request: Request, env: Env, auth: AuthContext, ctx: ExecutionContext): Promise<Response> {
  const body = await parseJson(request);
  if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);
  if (!isString(body.name) || !isString(body.version) || !isString(body.base_model)) {
    return json({ success: false, error: 'name, version, base_model are required strings' }, 400);
  }

  const modelId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO models (id,name,lifecycle_state,owner,artifact_signature,provenance_uri,created_by,current_version_id) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(modelId, body.name, 'dev', body.owner || null, body.artifact_signature || null, body.provenance_uri || null, auth.identity, versionId),
    env.DB.prepare(`INSERT INTO model_versions (id,model_id,version,base_model,format,quantization,sha256_hash,artifact_signature,provenance_uri,metadata_json,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(versionId, modelId, body.version, body.base_model, body.format || 'gguf', body.quantization || null, body.sha256_hash || null, body.artifact_signature || null, body.provenance_uri || null, JSON.stringify(body.metadata || {}), auth.identity),
  ]);

  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: 'model.registered', severity: 'info', action: 'create', resource_type: 'model', resource_id: modelId, details: { name: body.name, version: body.version },
  }, request));

  return json({ success: true, data: { id: modelId, lifecycle_state: 'dev' } }, 201);
}

export async function promoteModel(request: Request, env: Env, auth: AuthContext, ctx: ExecutionContext, modelId: string): Promise<Response> {
  const body = await parseJson(request);
  if (!body || !isString(body.target_state) || !STATES.includes(body.target_state as LifecycleState)) {
    return json({ success: false, error: 'target_state must be one of dev|staged|approved|production|quarantined' }, 400);
  }

  const target = body.target_state as LifecycleState;
  const model = await env.DB.prepare(`SELECT lifecycle_state FROM models WHERE id=? AND tenant_id='forge'`).bind(modelId).first<{ lifecycle_state: LifecycleState }>();
  if (!model) return json({ success: false, error: 'model not found' }, 404);
  if (!allowedTransitions[model.lifecycle_state]?.includes(target)) {
    return json({ success: false, error: `Invalid transition ${model.lifecycle_state} -> ${target}` }, 400);
  }

  if (target === 'production') {
    const approvals = await env.DB.prepare(`SELECT DISTINCT approver_identity FROM promotion_approvals WHERE model_id=? AND target_state='production'`).bind(modelId).all<{ approver_identity: string }>();
    const approvers = new Set(approvals.results.map(a => a.approver_identity));
    approvers.add(auth.identity);
    await env.DB.prepare(`INSERT INTO promotion_approvals (id,model_id,target_state,approver_identity) VALUES (?,?,?,?)`).bind(crypto.randomUUID(), modelId, 'production', auth.identity).run();
    if (approvers.size < 2) {
      ctx.waitUntil(logAuditEvent(env, auth, {
        event_type: 'model.promotion.approval_recorded', severity: 'warning', action: 'update', resource_type: 'model', resource_id: modelId, details: { approvals_required: 2, approvals_collected: approvers.size },
      }, request));
      return json({ success: true, data: { id: modelId, pending_second_approval: true, approvals_collected: approvers.size } });
    }
  }

  await env.DB.prepare(`UPDATE models SET lifecycle_state=?,updated_at=datetime('now') WHERE id=?`).bind(target, modelId).run();
  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: 'model.promoted', severity: target === 'quarantined' ? 'critical' : 'info', action: 'promote', resource_type: 'model', resource_id: modelId, details: { from: model.lifecycle_state, to: target },
  }, request));

  return json({ success: true, data: { id: modelId, lifecycle_state: target } });
}

function isString(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
async function parseJson(req: Request): Promise<Record<string, any> | null> { try { return await req.json(); } catch { return null; } }
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
