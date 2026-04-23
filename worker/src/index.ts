import type { Env } from './types';
import { authenticate, type AuthContext } from './middleware/auth';
import { handleInference } from './handlers/inference';
import { listModels, registerModel, promoteModel } from './handlers/models';
import { getDashboardStats, getInferenceTimeline, getModelUsageStats } from './handlers/dashboard';
import { exportAuditEvidence } from './handlers/audit';
import { logAuditEvent, logSystemAuditEvent, queryAuditEvents } from './middleware/audit';
import { hasPermission, type Permission } from './middleware/rbac';

const MAX_REQUEST_BYTES = 1024 * 1024;
const DEFAULT_ALLOWED_ORIGIN = 'https://closedml.forgecyberdefense.com';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();
    const origin = request.headers.get('Origin');

    if (method === 'OPTIONS') {
      return withRequestId(new Response(null, { status: 204, headers: corsHeaders(env, origin) }), requestId);
    }

    if (path === '/health') {
      return withRequestId(withCors(json({ success: true, service: 'forge-closedml-worker', status: 'healthy', timestamp: new Date().toISOString() }), env, origin), requestId);
    }
    if (path === '/ready') {
      const checks = await readinessChecks(env);
      const ok = checks.db && checks.cache;
      return withRequestId(withCors(json({ success: ok, status: ok ? 'ready' : 'not-ready', checks }, ok ? 200 : 503), env, origin), requestId);
    }

    if (!enforceSizeLimit(request)) {
      ctx.waitUntil(logSystemAuditEvent(env, 'system:gateway', {
        event_type: 'request.rejected', severity: 'warning', action: 'block', resource_type: 'http', resource_id: path,
        details: { reason: 'request_too_large', request_id: requestId },
      }));
      return withRequestId(withCors(json({ success: false, error: 'Request body too large (max 1MB).' }, 413), env, origin), requestId);
    }

    const auth = await authenticate(request, env);
    if (!auth) {
      ctx.waitUntil(logSystemAuditEvent(env, 'system:gateway', {
        event_type: 'auth.denied', severity: 'warning', action: 'block', resource_type: 'auth', resource_id: method + ' ' + path,
        details: { request_id: requestId },
      }));
      return withRequestId(withCors(json({ success: false, error: 'Unauthorized: actor or service identity required.' }, 401), env, origin), requestId);
    }

    const limit = parseInt(env.RATE_LIMIT_PER_MINUTE || '120', 10);
    const rl = await checkRateLimit(env, auth.identity, limit);
    if (!rl.allowed) {
      ctx.waitUntil(logAuditEvent(env, auth, {
        event_type: 'rate_limited', severity: 'warning', action: 'block', resource_type: 'auth', resource_id: auth.identity,
        details: { request_id: requestId, per_minute_limit: limit },
      }, request));
      return withRequestId(withCors(json({ success: false, error: 'Rate limit exceeded.' }, 429, { 'Retry-After': '60' }), env, origin), requestId);
    }

    try {
      const res = await routeRequest(request, env, ctx, auth, url, path, method, requestId);
      return withRequestId(withCors(res, env, origin), requestId);
    } catch (error) {
      ctx.waitUntil(logAuditEvent(env, auth, {
        event_type: 'request.failed', severity: 'error', action: 'block', resource_type: 'http', resource_id: method + ' ' + path,
        details: { request_id: requestId, error: (error as Error).message },
      }, request));
      return withRequestId(withCors(json({ success: false, error: 'Internal server error' }, 500), env, origin), requestId);
    }
  },
};

function denyForbidden(auth: AuthContext, permission: Permission): Response | null {
  if (!hasPermission(auth, permission)) {
    return json({ success: false, error: `Forbidden: missing permission ${permission}` }, 403);
  }
  return null;
}

async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  auth: AuthContext,
  url: URL,
  path: string,
  method: string,
  requestId: string,
): Promise<Response> {
  if (path === '/v1/chat/completions' && method === 'POST') {
    const denied = denyForbidden(auth, 'inference:invoke');
    if (denied) return denied;
    return handleInference(request, env, auth, ctx, requestId);
  }

  if (path === '/api/dashboard/stats' && method === 'GET') return getDashboardStats(env);
  if (path === '/api/dashboard/timeline' && method === 'GET') {
    const days = Number(url.searchParams.get('days') || 7);
    if (!Number.isInteger(days) || days < 1 || days > 90) return json({ success: false, error: 'days must be between 1 and 90' }, 400);
    return getInferenceTimeline(env, url);
  }
  if (path === '/api/dashboard/usage' && method === 'GET') return getModelUsageStats(env);

  if (path === '/api/models' && method === 'GET') {
    const denied = denyForbidden(auth, 'models:read');
    if (denied) return denied;
    return listModels(env, url);
  }
  if (path === '/api/models' && method === 'POST') {
    const denied = denyForbidden(auth, 'models:write');
    if (denied) return denied;
    await auditPrivilegedStart(env, auth, request, ctx, 'model.create.requested', 'model', 'new', requestId);
    return registerModel(request, env, auth, ctx);
  }

  const promoteMatch = path.match(/^\/api\/models\/([a-f0-9-]+)\/promote$/);
  if (promoteMatch && method === 'POST') {
    const denied = denyForbidden(auth, 'models:promote');
    if (denied) return denied;
    await auditPrivilegedStart(env, auth, request, ctx, 'model.promote.requested', 'model', promoteMatch[1], requestId);
    return promoteModel(request, env, auth, ctx, promoteMatch[1], requestId);
  }

  if (path === '/api/endpoints' && method === 'GET') {
    const denied = denyForbidden(auth, 'endpoints:read');
    if (denied) return denied;
    const rows = await env.DB.prepare(`SELECT * FROM endpoints WHERE tenant_id='forge' ORDER BY name`).all();
    return json({ success: true, data: rows.results });
  }
  if (path === '/api/endpoints' && method === 'POST') {
    const denied = denyForbidden(auth, 'endpoints:write');
    if (denied) return denied;
    const body = await parseJson(request);
    if (!body || !isString(body.name) || !isString(body.service_type) || !isString(body.internal_url)) {
      return json({ success: false, error: 'name, service_type, internal_url are required strings' }, 400);
    }
    if (body.external_host && !isString(body.external_host)) return json({ success: false, error: 'external_host must be a string' }, 400);

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO endpoints (id, tenant_id, name, service_type, internal_url, external_host, tunnel_id, status, health_check_url, metadata_json, created_at, updated_at)
       VALUES (?, 'forge', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(id, body.name, body.service_type, body.internal_url, body.external_host || null, body.tunnel_id || null, body.status || 'offline', body.health_check_url || '/health', JSON.stringify(body.metadata || {})).run();

    ctx.waitUntil(logAuditEvent(env, auth, {
      event_type: 'endpoint.created', severity: 'info', action: 'create', resource_type: 'endpoint', resource_id: id,
      details: { request_id: requestId, name: body.name },
    }, request));

    return json({ success: true, data: { id } }, 201);
  }

  const healthMatch = path.match(/^\/api\/endpoints\/([a-f0-9-]+)\/health$/);
  if (healthMatch && method === 'POST') {
    const denied = denyForbidden(auth, 'endpoints:health');
    if (denied) return denied;
    const body = await parseJson(request);
    if (!body || (body.status && !['online', 'offline', 'degraded', 'maintenance'].includes(String(body.status)))) {
      return json({ success: false, error: 'status must be one of online|offline|degraded|maintenance' }, 400);
    }

    await env.DB.prepare(
      `UPDATE endpoints SET status=?, last_health_check=datetime('now'), last_seen_at=datetime('now'), gpu_info=?, updated_at=datetime('now') WHERE id=? AND tenant_id='forge'`
    ).bind(String(body.status || 'online'), body.gpu_info ? JSON.stringify(body.gpu_info) : null, healthMatch[1]).run();

    ctx.waitUntil(logAuditEvent(env, auth, {
      event_type: 'endpoint.health.updated', severity: 'info', action: 'update', resource_type: 'endpoint', resource_id: healthMatch[1],
      details: { request_id: requestId, status: body.status || 'online' },
    }, request));

    return json({ success: true });
  }

  if (path === '/api/audit' && method === 'GET') {
    const denied = denyForbidden(auth, 'audit:read');
    if (denied) return denied;
    const limit = Number(url.searchParams.get('limit') || 100);
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return json({ success: false, error: 'limit must be 1-200' }, 400);
    if (!Number.isInteger(offset) || offset < 0) return json({ success: false, error: 'offset must be >= 0' }, 400);

    const result = await queryAuditEvents(env, {
      conmon_period: url.searchParams.get('conmon_period') || undefined,
      severity: url.searchParams.get('severity') || undefined,
      event_type: url.searchParams.get('event_type') || undefined,
      actor: url.searchParams.get('actor') || undefined,
      resource_type: url.searchParams.get('resource_type') || undefined,
      limit,
      offset,
    });
    return json({ success: true, data: result.events, meta: { total: result.total, limit, offset } });
  }

  if (path === '/api/audit/export' && method === 'GET') {
    const denied = denyForbidden(auth, 'audit:read');
    if (denied) return denied;
    return exportAuditEvidence(request, env, auth, url, ctx, requestId);
  }

  if (path === '/api/policy-violations' && method === 'GET') {
    const denied = denyForbidden(auth, 'audit:read');
    if (denied) return denied;
    const limit = Number(url.searchParams.get('limit') || 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return json({ success: false, error: 'limit must be 1-200' }, 400);
    const rows = await env.DB.prepare(
      `SELECT * FROM audit_events WHERE tenant_id='forge' AND (event_type='classification.violation' OR severity='critical') ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all();
    return json({ success: true, data: rows.results });
  }

  if (path === '/api/inference-logs' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') || 200);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return json({ success: false, error: 'limit must be 1-500' }, 400);

    const rows = await env.DB.prepare(`SELECT * FROM inference_logs WHERE tenant_id='forge' ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
    return json({ success: true, data: rows.results });
  }

  return json({ success: false, error: `Not found: ${method} ${path}` }, 404);
}

async function auditPrivilegedStart(env: Env, auth: AuthContext, request: Request, ctx: ExecutionContext, eventType: string, resourceType: string, resourceId: string, requestId: string) {
  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: eventType,
    severity: 'info',
    action: 'update',
    resource_type: resourceType,
    resource_id: resourceId,
    details: { request_id: requestId },
  }, request));
}

async function readinessChecks(env: Env): Promise<{ db: boolean; cache: boolean }> {
  let db = false;
  let cache = false;
  try { await env.DB.prepare(`SELECT 1 as ok`).first(); db = true; } catch { db = false; }
  try { const key = `ready:${crypto.randomUUID()}`; await env.INFERENCE_CACHE.put(key, '1', { expirationTtl: 30 }); await env.INFERENCE_CACHE.get(key); cache = true; } catch { cache = false; }
  return { db, cache };
}

async function checkRateLimit(env: Env, identity: string, limit: number) {
  const key = `rl:${identity}:${Math.floor(Date.now() / 60000)}`;
  const curr = Number((await env.INFERENCE_CACHE.get(key)) || '0');
  if (curr >= limit) return { allowed: false };
  await env.INFERENCE_CACHE.put(key, String(curr + 1), { expirationTtl: 70 });
  return { allowed: true };
}

function enforceSizeLimit(request: Request) {
  const len = Number(request.headers.get('content-length') || 0);
  return !len || len <= MAX_REQUEST_BYTES;
}
function isString(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
async function parseJson(req: Request): Promise<Record<string, any> | null> { try { return await req.json(); } catch { return null; } }
function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } });
}
function getAllowedOrigin(env: Env, origin?: string | null) {
  const configured = env.CORS_ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  if (configured === '*') return origin || '*';
  const allowlist = configured.split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowlist.includes(origin)) return origin;
  return allowlist[0] || DEFAULT_ALLOWED_ORIGIN;
}
function corsHeaders(env: Env, origin?: string | null) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(env, origin),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret, Cf-Access-Jwt-Assertion, X-Data-Classification, X-PHI-Tokenized, X-Request-ID',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function withCors(response: Response, env: Env, origin?: string | null): Response {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(env, origin)).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}
function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  return new Response(response.body, { status: response.status, headers });
}
