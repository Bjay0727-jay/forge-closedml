import { Env } from './types';
import { authenticate } from './middleware/auth';
import { handleInference } from './handlers/inference';
import { listModels, registerModel, promoteModel } from './handlers/models';
import { getDashboardStats, getInferenceTimeline, getModelUsageStats } from './handlers/dashboard';
import { queryAuditEvents, logAuditEvent } from './middleware/audit';

const MAX_REQUEST_BYTES = 1024 * 1024; // 1MB

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return json({}, 204);
    if (path === '/health') return json({ success: true, status: 'ok', timestamp: new Date().toISOString() });

    if (!enforceSizeLimit(request)) return json({ success: false, error: 'Request body too large (max 1MB).' }, 413);

    const auth = await authenticate(request, env);
    if (!auth) return json({ success: false, error: 'Unauthorized: actor or service identity required.' }, 401);

    const limit = parseInt(env.RATE_LIMIT_PER_MINUTE || '120', 10);
    const rl = await checkRateLimit(env, auth.identity, limit);
    if (!rl.allowed) return json({ success: false, error: 'Rate limit exceeded.' }, 429, { 'Retry-After': '60' });

    try {
      if (path === '/v1/chat/completions' && request.method === 'POST') return withCors(await handleInference(request, env, auth, ctx));
      if (path === '/api/dashboard/stats' && request.method === 'GET') return withCors(await getDashboardStats(env));
      if (path === '/api/dashboard/timeline' && request.method === 'GET') return withCors(await getInferenceTimeline(env, url));
      if (path === '/api/dashboard/usage' && request.method === 'GET') return withCors(await getModelUsageStats(env));

      if (path === '/api/models' && request.method === 'GET') return withCors(await listModels(env, url));
      if (path === '/api/models' && request.method === 'POST') return withCors(await registerModel(request, env, auth, ctx));
      const promoteMatch = path.match(/^\/api\/models\/([a-f0-9-]+)\/promote$/);
      if (promoteMatch && request.method === 'POST') return withCors(await promoteModel(request, env, auth, ctx, promoteMatch[1]));

      if (path === '/api/endpoints' && request.method === 'GET') {
        const rows = await env.DB.prepare(`SELECT * FROM endpoints WHERE tenant_id='forge' ORDER BY name`).all();
        return withCors(json({ success: true, data: rows.results }));
      }
      if (path === '/api/endpoints' && request.method === 'POST') {
        const body = await parseJson(request);
        if (!body || !isString(body.name) || !isString(body.service_type) || !isString(body.internal_url)) {
          return withCors(json({ success: false, error: 'name, service_type, internal_url are required' }, 400));
        }
        const id = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO endpoints (id,name,service_type,internal_url,external_host,tunnel_id,status,health_check_url,metadata_json) VALUES (?,?,?,?,?,?,?,?,?)`)
          .bind(id, body.name, body.service_type, body.internal_url, body.external_host || null, body.tunnel_id || null, body.status || 'offline', body.health_check_url || '/health', JSON.stringify(body.metadata || {})).run();
        ctx.waitUntil(logAuditEvent(env, auth, { event_type: 'endpoint.created', severity: 'info', action: 'create', resource_type: 'endpoint', resource_id: id }, request));
        return withCors(json({ success: true, data: { id } }, 201));
      }
      const healthMatch = path.match(/^\/api\/endpoints\/([a-f0-9-]+)\/health$/);
      if (healthMatch && request.method === 'POST') {
        const body = await parseJson(request);
        await env.DB.prepare(`UPDATE endpoints SET status=?,last_health_check=datetime('now'),last_seen_at=datetime('now'),gpu_info=?,updated_at=datetime('now') WHERE id=? AND tenant_id='forge'`)
          .bind((body?.status as string) || 'online', body?.gpu_info ? JSON.stringify(body.gpu_info) : null, healthMatch[1]).run();
        return withCors(json({ success: true }));
      }

      if (path === '/api/audit' && request.method === 'GET') {
        const result = await queryAuditEvents(env, { conmon_period: url.searchParams.get('conmon_period') || undefined, severity: url.searchParams.get('severity') || undefined, limit: Number(url.searchParams.get('limit') || 100) });
        return withCors(json({ success: true, data: result.events, meta: { total: result.total } }));
      }
      if (path === '/api/inference-logs' && request.method === 'GET') {
        const rows = await env.DB.prepare(`SELECT * FROM inference_logs WHERE tenant_id='forge' ORDER BY created_at DESC LIMIT 200`).all();
        return withCors(json({ success: true, data: rows.results }));
      }

      return withCors(json({ success: false, error: `Not found: ${request.method} ${path}` }, 404));
    } catch (error) {
      console.error(error);
      return withCors(json({ success: false, error: 'Internal server error' }, 500));
    }
  },
};

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
function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extraHeaders } }); }
function corsHeaders() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret, Cf-Access-Jwt-Assertion, X-Data-Classification, X-PHI-Tokenized' }; }
function withCors(response: Response): Response { const headers = new Headers(response.headers); Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v)); return new Response(response.body, { status: response.status, headers }); }
