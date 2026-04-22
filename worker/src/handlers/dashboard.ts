import type { Env } from '../types';

export async function getDashboardStats(env: Env): Promise<Response> {
  const now = new Date();
  const todayStart = `${now.toISOString().split('T')[0]}T00:00:00`;
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const stats = {
    models_total: await count(env, `SELECT COUNT(*) c FROM models WHERE tenant_id='forge'`),
    models_production: await count(env, `SELECT COUNT(*) c FROM models WHERE tenant_id='forge' AND lifecycle_state='production'`),
    inference_today: await count(env, `SELECT COUNT(*) c FROM inference_logs WHERE tenant_id='forge' AND created_at>=?`, [todayStart]),
    inference_tokens_today: await sum(env, `SELECT COALESCE(SUM(total_tokens),0) s FROM inference_logs WHERE tenant_id='forge' AND created_at>=?`, [todayStart]),
    jobs_running: 0,
    jobs_completed_30d: 0,
    endpoints_online: await count(env, `SELECT COUNT(*) c FROM endpoints WHERE tenant_id='forge' AND status='online'`),
    endpoints_total: await count(env, `SELECT COUNT(*) c FROM endpoints WHERE tenant_id='forge'`),
    audit_critical_7d: await count(env, `SELECT COUNT(*) c FROM audit_events WHERE tenant_id='forge' AND severity='critical' AND created_at>=?`, [sevenDaysAgo]),
    classification_violations_30d: await count(env, `SELECT COUNT(*) c FROM audit_events WHERE tenant_id='forge' AND event_type='classification.violation' AND created_at>=?`, [thirtyDaysAgo]),
  };

  return resp({ success: true, data: stats });
}

export async function getInferenceTimeline(env: Env, url: URL): Promise<Response> {
  const days = Math.min(Number(url.searchParams.get('days') || 7), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await env.DB.prepare(`SELECT DATE(created_at) date, COUNT(*) requests, COALESCE(SUM(total_tokens),0) tokens, COALESCE(AVG(latency_ms),0) avg_latency_ms, data_classification FROM inference_logs WHERE tenant_id='forge' AND created_at>=? GROUP BY DATE(created_at), data_classification ORDER BY date ASC`).bind(since).all();
  return resp({ success: true, data: rows.results });
}

export async function getModelUsageStats(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(`SELECT model_name, COUNT(*) total_requests, COALESCE(SUM(total_tokens),0) total_tokens, COALESCE(AVG(latency_ms),0) avg_latency_ms, SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) error_count FROM inference_logs WHERE tenant_id='forge' GROUP BY model_name ORDER BY total_requests DESC LIMIT 25`).all();
  return resp({ success: true, data: rows.results });
}

async function count(env: Env, q: string, p: unknown[] = []) { const r = await env.DB.prepare(q).bind(...p).first<{ c: number }>(); return r?.c || 0; }
async function sum(env: Env, q: string, p: unknown[] = []) { const r = await env.DB.prepare(q).bind(...p).first<{ s: number }>(); return r?.s || 0; }
function resp(body: unknown) { return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }); }
