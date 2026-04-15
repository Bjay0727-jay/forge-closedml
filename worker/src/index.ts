// ============================================================================
// ForgeClosedML — Cloudflare Worker API Gateway
// Forge Cyber Defense | Closed ML Environment Control Plane
//
// Routes:
//   POST /v1/chat/completions    → Inference proxy (LiteLLM via Tunnel)
//   GET  /api/dashboard/stats    → Aggregated dashboard metrics
//   GET  /api/dashboard/timeline → Inference timeline for charts
//   GET  /api/dashboard/usage    → Model usage statistics
//   GET  /api/models             → List models
//   GET  /api/models/:id         → Get model
//   POST /api/models             → Register model
//   POST /api/models/:id/promote → Promote model lifecycle
//   GET  /api/audit              → Query audit events
//   GET  /api/endpoints          → List endpoints
//   POST /api/endpoints/:id/health → Update endpoint health
//   GET  /health                 → Worker health check
// ============================================================================

import { Env, ApiResponse } from './types';
import { authenticate, AuthContext } from './middleware/auth';
import { handleInference } from './handlers/inference';
import { listModels, getModel, registerModel, promoteModel } from './handlers/models';
import { getDashboardStats, getInferenceTimeline, getModelUsageStats } from './handlers/dashboard';
import { queryAuditEvents } from './middleware/audit';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers for dashboard
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check — no auth required
    if (path === '/health') {
      return json({
        success: true,
        data: {
          service: 'forge-closedml',
          status: 'operational',
          version: '1.0.0-beta',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // ── Authenticate ──────────────────────────────────────────────────
    const auth = await authenticate(request, env);
    if (!auth) {
      return json({ success: false, error: 'Unauthorized. Provide Cloudflare Access JWT, service token, or API key.' }, 401);
    }

    try {
      // ── Inference Proxy ───────────────────────────────────────────────
      if (path === '/v1/chat/completions' && method === 'POST') {
        return await handleInference(request, env, auth, ctx);
      }

      // ── Dashboard ─────────────────────────────────────────────────────
      if (path === '/api/dashboard/stats' && method === 'GET') {
        return withCors(await getDashboardStats(env));
      }
      if (path === '/api/dashboard/timeline' && method === 'GET') {
        return withCors(await getInferenceTimeline(env, url));
      }
      if (path === '/api/dashboard/usage' && method === 'GET') {
        return withCors(await getModelUsageStats(env));
      }

      // ── Models ────────────────────────────────────────────────────────
      if (path === '/api/models' && method === 'GET') {
        return withCors(await listModels(env, url));
      }
      if (path === '/api/models' && method === 'POST') {
        return withCors(await registerModel(request, env, auth, ctx));
      }

      // Model routes with ID
      const modelMatch = path.match(/^\/api\/models\/([a-f0-9-]+)$/);
      if (modelMatch && method === 'GET') {
        return withCors(await getModel(env, modelMatch[1]));
      }

      const promoteMatch = path.match(/^\/api\/models\/([a-f0-9-]+)\/promote$/);
      if (promoteMatch && method === 'POST') {
        return withCors(await promoteModel(request, env, auth, ctx, promoteMatch[1]));
      }

      // ── Audit ─────────────────────────────────────────────────────────
      if (path === '/api/audit' && method === 'GET') {
        const filters = {
          event_type: url.searchParams.get('event_type') || undefined,
          severity: url.searchParams.get('severity') || undefined,
          actor: url.searchParams.get('actor') || undefined,
          resource_type: url.searchParams.get('resource_type') || undefined,
          conmon_period: url.searchParams.get('conmon_period') || undefined,
          since: url.searchParams.get('since') || undefined,
          limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
          offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
        };
        const result = await queryAuditEvents(env, filters);
        return withCors(json({ success: true, data: result.events, meta: { total: result.total } }));
      }

      // ── Endpoints ─────────────────────────────────────────────────────
      if (path === '/api/endpoints' && method === 'GET') {
        const result = await env.DB.prepare(
          `SELECT * FROM endpoints WHERE tenant_id = 'forge' ORDER BY name`
        ).all();
        return withCors(json({ success: true, data: result.results }));
      }

      // Endpoint health update (called by on-prem health check cron)
      const healthMatch = path.match(/^\/api\/endpoints\/([a-f0-9-]+)\/health$/);
      if (healthMatch && method === 'POST') {
        const body = await request.json() as Record<string, unknown>;
        await env.DB.prepare(`
          UPDATE endpoints SET status = ?, last_health_check = datetime('now'), last_seen_at = datetime('now'), gpu_info = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = 'forge'
        `).bind(
          body.status || 'online',
          body.gpu_info ? JSON.stringify(body.gpu_info) : null,
          healthMatch[1]
        ).run();
        return withCors(json({ success: true }));
      }

      // ── Inference Logs ────────────────────────────────────────────────
      if (path === '/api/inference-logs' && method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const classification = url.searchParams.get('classification');
        const platform = url.searchParams.get('platform');

        let query = `SELECT * FROM inference_logs WHERE tenant_id = 'forge'`;
        const params: unknown[] = [];

        if (classification) { query += ' AND data_classification = ?'; params.push(classification); }
        if (platform) { query += ' AND source_platform = ?'; params.push(platform); }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const result = await env.DB.prepare(query).bind(...params).all();
        return withCors(json({ success: true, data: result.results }));
      }

      // ── 404 ───────────────────────────────────────────────────────────
      return json({ success: false, error: `Not found: ${method} ${path}` }, 404);

    } catch (err) {
      console.error('[WORKER_ERROR]', { path, method, error: (err as Error).message, stack: (err as Error).stack });
      return json({ success: false, error: 'Internal server error' }, 500);
    }
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret, X-Data-Classification, X-PHI-Tokenized',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
