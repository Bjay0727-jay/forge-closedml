import type { Env } from '../types';
import type { AuthContext } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';

const STATES = ['dev', 'staged', 'approved', 'production', 'quarantined'] as const;
type LifecycleState = typeof STATES[number];

const allowedTransitions: Record<LifecycleState, LifecycleState[]> = {
  dev: ['staged', 'quarantined'],
  staged: ['approved', 'quarantined', 'dev'],
  approved: ['production', 'quarantined', 'staged'],
  production: ['quarantined', 'approved'],
  quarantined: ['dev', 'staged'],
};

export async function listModels(env: Env, url: URL): Promise<Response> {
  const state = url.searchParams.get('state');
  if (state && !STATES.includes(state as LifecycleState)) {
    return json({ success: false, error: 'Invalid state filter' }, 400);
  }

  const sql = state
    ? `SELECT * FROM models WHERE tenant_id='forge' AND lifecycle_state=? ORDER BY updated_at DESC`
    : `SELECT * FROM models WHERE tenant_id='forge' ORDER BY updated_at DESC`;
  const rows = state ? await env.DB.prepare(sql).bind(state).all() : await env.DB.prepare(sql).all();
  return json({ success: true, data: rows.results });
}

export async function registerModel(request: Request, env: Env, auth: AuthContext, ctx: ExecutionContext): Promise<Response> {
  const body = await parseJson(request);
  if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);

  const required = ['name', 'version', 'base_model'];
  for (const field of required) if (!isString(body[field])) return json({ success: false, error: `${field} must be a non-empty string` }, 400);
  if (body.format && !['gguf', 'gptq', 'safetensors', 'onnx'].includes(String(body.format))) {
    return json({ success: false, error: 'format must be gguf|gptq|safetensors|onnx' }, 400);
  }

  const modelId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO models (id, tenant_id, name, current_version_id, lifecycle_state, owner, artifact_signature, provenance_uri, created_by, created_at, updated_at)
       VALUES (?, 'forge', ?, ?, 'dev', ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(modelId, body.name, versionId, body.owner || null, body.artifact_signature || null, body.provenance_uri || null, auth.identity),
    env.DB.prepare(
      `INSERT INTO model_versions (id, model_id, version, base_model, format, quantization, sha256_hash, artifact_signature, provenance_uri, metadata_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(versionId, modelId, body.version, body.base_model, body.format || 'gguf', body.quantization || null, body.sha256_hash || null, body.artifact_signature || null, body.provenance_uri || null, JSON.stringify(body.metadata || {}), auth.identity),
  ]);

  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: 'model.registered', severity: 'info', action: 'create', resource_type: 'model', resource_id: modelId,
    details: { name: body.name, version: body.version },
  }, request));

  return json({ success: true, data: { id: modelId, lifecycle_state: 'dev' } }, 201);
}

export async function promoteModel(
  request: Request,
  env: Env,
  auth: AuthContext,
  ctx: ExecutionContext,
  modelId: string,
  requestId: string,
): Promise<Response> {
  const body = await parseJson(request);
  if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);

  const rollback = body.rollback_to_previous === true;
  const targetStateInput = body.target_state;
  if (!rollback && (!isString(targetStateInput) || !STATES.includes(targetStateInput as LifecycleState))) {
    return json({ success: false, error: 'target_state must be one of dev|staged|approved|production|quarantined' }, 400);
  }

  const model = await env.DB.prepare(`SELECT lifecycle_state FROM models WHERE id=? AND tenant_id='forge'`).bind(modelId).first<{ lifecycle_state: LifecycleState }>();
  if (!model) return json({ success: false, error: 'model not found' }, 404);

  let target = targetStateInput as LifecycleState;
  if (rollback) {
    const lastPromotion = await env.DB.prepare(
      `SELECT details FROM audit_events WHERE tenant_id='forge' AND event_type='model.promoted' AND resource_id=? ORDER BY created_at DESC LIMIT 1`
    ).bind(modelId).first<{ details: string }>();
    if (!lastPromotion?.details) return json({ success: false, error: 'No prior promotion state available for rollback' }, 400);
    const details = JSON.parse(lastPromotion.details) as { from?: LifecycleState };
    if (!details.from || !STATES.includes(details.from)) return json({ success: false, error: 'Prior state not recoverable' }, 400);
    target = details.from;
  }

  if (!allowedTransitions[model.lifecycle_state]?.includes(target)) {
    return json({ success: false, error: `Invalid transition ${model.lifecycle_state} -> ${target}` }, 400);
  }

  if (target === 'production') {
    const approvals = await env.DB.prepare(
      `SELECT COUNT(DISTINCT approver_identity) as approvals FROM promotion_approvals WHERE model_id=? AND target_state='production'`
    ).bind(modelId).first<{ approvals: number }>();

    await env.DB.prepare(
      `INSERT INTO promotion_approvals (id, model_id, target_state, approver_identity, approved_at) VALUES (?, ?, 'production', ?, datetime('now'))`
    ).bind(crypto.randomUUID(), modelId, auth.identity).run();

    if ((approvals?.approvals || 0) < 1) {
      ctx.waitUntil(logAuditEvent(env, auth, {
        event_type: 'model.promotion.approval_recorded', severity: 'warning', action: 'update', resource_type: 'model', resource_id: modelId,
        details: { approvals_required: 2, approvals_collected: (approvals?.approvals || 0) + 1, request_id: requestId },
      }, request));
      return json({ success: true, data: { id: modelId, pending_second_approval: true, approvals_collected: (approvals?.approvals || 0) + 1 } });
    }
  }

  await env.DB.prepare(`UPDATE models SET lifecycle_state=?, updated_at=datetime('now') WHERE id=? AND tenant_id='forge'`).bind(target, modelId).run();

  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: rollback ? 'model.rollback' : 'model.promoted',
    severity: target === 'quarantined' ? 'critical' : 'info',
    action: 'promote',
    resource_type: 'model',
    resource_id: modelId,
    details: { from: model.lifecycle_state, to: target, rollback, request_id: requestId },
  }, request));

  return json({ success: true, data: { id: modelId, lifecycle_state: target, rollback } });
}

function isString(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
async function parseJson(req: Request): Promise<Record<string, unknown> | null> { try { return await req.json() as Record<string, unknown>; } catch { return null; } }
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
