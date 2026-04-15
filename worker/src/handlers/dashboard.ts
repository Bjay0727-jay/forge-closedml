// ============================================================================
// ForgeClosedML — Dashboard Stats Handler
// Aggregated metrics for the management dashboard
// ============================================================================

import { Env, DashboardStats, ApiResponse } from '../types';

export async function getDashboardStats(env: Env): Promise<Response> {
  const now = new Date();
  const todayStart = now.toISOString().split('T')[0] + 'T00:00:00';
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [
    modelsTotal,
    modelsProduction,
    inferenceToday,
    tokensToday,
    jobsRunning,
    jobsCompleted30d,
    endpointsOnline,
    endpointsTotal,
    auditCritical7d,
    classViolations30d,
  ] = await Promise.all([
    count(env, `SELECT COUNT(*) as c FROM models WHERE tenant_id = 'forge' AND status != 'archived'`),
    count(env, `SELECT COUNT(*) as c FROM models WHERE tenant_id = 'forge' AND status = 'production'`),
    count(env, `SELECT COUNT(*) as c FROM inference_logs WHERE tenant_id = 'forge' AND created_at >= ?`, [todayStart]),
    sum(env, `SELECT COALESCE(SUM(total_tokens), 0) as s FROM inference_logs WHERE tenant_id = 'forge' AND created_at >= ?`, [todayStart]),
    count(env, `SELECT COUNT(*) as c FROM training_jobs WHERE tenant_id = 'forge' AND status = 'running'`),
    count(env, `SELECT COUNT(*) as c FROM training_jobs WHERE tenant_id = 'forge' AND status = 'completed' AND completed_at >= ?`, [thirtyDaysAgo]),
    count(env, `SELECT COUNT(*) as c FROM endpoints WHERE tenant_id = 'forge' AND status = 'online'`),
    count(env, `SELECT COUNT(*) as c FROM endpoints WHERE tenant_id = 'forge'`),
    count(env, `SELECT COUNT(*) as c FROM audit_events WHERE tenant_id = 'forge' AND severity = 'critical' AND created_at >= ?`, [sevenDaysAgo]),
    count(env, `SELECT COUNT(*) as c FROM audit_events WHERE tenant_id = 'forge' AND event_type = 'classification.violation' AND created_at >= ?`, [thirtyDaysAgo]),
  ]);

  const stats: DashboardStats = {
    models_total: modelsTotal,
    models_production: modelsProduction,
    inference_today: inferenceToday,
    inference_tokens_today: tokensToday,
    jobs_running: jobsRunning,
    jobs_completed_30d: jobsCompleted30d,
    endpoints_online: endpointsOnline,
    endpoints_total: endpointsTotal,
    audit_critical_7d: auditCritical7d,
    classification_violations_30d: classViolations30d,
  };

  return new Response(JSON.stringify({ success: true, data: stats } as ApiResponse<DashboardStats>), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Recent inference activity for charts */
export async function getInferenceTimeline(env: Env, url: URL): Promise<Response> {
  const days = Math.min(parseInt(url.searchParams.get('days') || '7'), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const result = await env.DB.prepare(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
      data_classification
    FROM inference_logs
    WHERE tenant_id = 'forge' AND created_at >= ?
    GROUP BY DATE(created_at), data_classification
    ORDER BY date ASC
  `).bind(since).all();

  return new Response(JSON.stringify({ success: true, data: result.results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Top models by usage */
export async function getModelUsageStats(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT
      model_name,
      COUNT(*) as total_requests,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
      COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
    FROM inference_logs
    WHERE tenant_id = 'forge' AND created_at >= datetime('now', '-30 days')
    GROUP BY model_name
    ORDER BY total_requests DESC
    LIMIT 10
  `).all();

  return new Response(JSON.stringify({ success: true, data: result.results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function count(env: Env, query: string, params: unknown[] = []): Promise<number> {
  const result = await env.DB.prepare(query).bind(...params).first<{ c: number }>();
  return result?.c || 0;
}

async function sum(env: Env, query: string, params: unknown[] = []): Promise<number> {
  const result = await env.DB.prepare(query).bind(...params).first<{ s: number }>();
  return result?.s || 0;
}
