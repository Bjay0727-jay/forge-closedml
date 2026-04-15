// ============================================================================
// ForgeClosedML — Models Handler
// Model registry with chain-of-custody and two-person promotion integrity
// ============================================================================

import { Env, ApiResponse, ModelStatus } from '../types';
import { AuthContext } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';

/** List models with optional status filter */
export async function listModels(env: Env, url: URL): Promise<Response> {
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = `SELECT * FROM models WHERE tenant_id = 'forge'`;
  const params: unknown[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...params).all();
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM models WHERE tenant_id = 'forge'${status ? ' AND status = ?' : ''}`
  ).bind(...(status ? [status] : [])).first<{ total: number }>();

  return json({
    success: true,
    data: result.results.map(parseModelJson),
    meta: { total: countResult?.total || 0, page: Math.floor(offset / limit) + 1, per_page: limit },
  });
}

/** Get single model by ID */
export async function getModel(env: Env, id: string): Promise<Response> {
  const model = await env.DB.prepare(
    `SELECT * FROM models WHERE id = ? AND tenant_id = 'forge'`
  ).bind(id).first();

  if (!model) return json({ success: false, error: 'Model not found' }, 404);
  return json({ success: true, data: parseModelJson(model) });
}

/** Register a new model */
export async function registerModel(
  request: Request, env: Env, auth: AuthContext, ctx: ExecutionContext
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const id = crypto.randomUUID();

  const required = ['name', 'version', 'base_model'];
  for (const field of required) {
    if (!body[field]) return json({ success: false, error: `Missing required field: ${field}` }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO models (id, name, version, base_model, quantization, format, status, sha256_hash, size_bytes, parameters, model_card, tags, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'registered', ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name, body.version, body.base_model,
    body.quantization || null,
    body.format || 'gguf',
    body.sha256_hash || null,
    body.size_bytes || null,
    body.parameters ? JSON.stringify(body.parameters) : null,
    body.model_card ? JSON.stringify(body.model_card) : null,
    body.tags ? JSON.stringify(body.tags) : '[]',
    auth.identity
  ).run();

  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: 'model.registered',
    severity: 'info',
    resource_type: 'model',
    resource_id: id,
    action: 'create',
    details: { name: body.name, version: body.version, base_model: body.base_model },
  }, request));

  return json({ success: true, data: { id, status: 'registered' } }, 201);
}

/** Promote model through lifecycle: registered → validating → staging → production */
export async function promoteModel(
  request: Request, env: Env, auth: AuthContext, ctx: ExecutionContext, modelId: string
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const targetStatus = body.target_status as ModelStatus;

  const validTransitions: Record<string, string[]> = {
    'registered': ['validating'],
    'validating': ['staging', 'archived'],
    'staging': ['production', 'archived'],
    'production': ['archived', 'revoked'],
  };

  const model = await env.DB.prepare(
    `SELECT * FROM models WHERE id = ? AND tenant_id = 'forge'`
  ).bind(modelId).first<{ status: string; promoted_by: string | null }>();

  if (!model) return json({ success: false, error: 'Model not found' }, 404);

  const allowed = validTransitions[model.status];
  if (!allowed?.includes(targetStatus)) {
    return json({
      success: false,
      error: `Invalid transition: ${model.status} → ${targetStatus}. Allowed: ${allowed?.join(', ') || 'none'}`,
    }, 400);
  }

  // Two-person integrity for production promotion
  if (targetStatus === 'production') {
    // Check if enforce_two_person_promotion is enabled
    const config = await env.DB.prepare(
      `SELECT value FROM system_config WHERE tenant_id = 'forge' AND key = 'enforce_two_person_promotion'`
    ).first<{ value: string }>();

    if (config?.value === 'true') {
      if (model.promoted_by === auth.identity) {
        return json({
          success: false,
          error: 'Two-person integrity required: production promotion must be approved by a different person than who promoted to staging.',
        }, 403);
      }

      // Record approver
      await env.DB.prepare(
        `UPDATE models SET status = ?, approved_by = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(targetStatus, auth.identity, modelId).run();
    } else {
      await env.DB.prepare(
        `UPDATE models SET status = ?, promoted_by = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(targetStatus, auth.identity, modelId).run();
    }
  } else {
    await env.DB.prepare(
      `UPDATE models SET status = ?, promoted_by = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(targetStatus, auth.identity, modelId).run();
  }

  const eventType = targetStatus === 'revoked' ? 'model.revoked'
    : targetStatus === 'archived' ? 'model.archived'
    : 'model.promoted';

  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: eventType,
    severity: targetStatus === 'revoked' ? 'warning' : 'info',
    resource_type: 'model',
    resource_id: modelId,
    action: targetStatus === 'revoked' ? 'revoke' : 'promote',
    details: { from: model.status, to: targetStatus },
  }, request));

  return json({ success: true, data: { id: modelId, status: targetStatus } });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseModelJson(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    parameters: row.parameters ? JSON.parse(row.parameters as string) : null,
    model_card: row.model_card ? JSON.parse(row.model_card as string) : null,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
