import type { Env, EventType, Severity, AuditAction } from '../types';
import type { AuthContext } from './auth';

export interface AuditEntry {
  event_type: EventType;
  severity: Severity;
  resource_type?: string;
  resource_id?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
}

export async function logAuditEvent(env: Env, auth: AuthContext, entry: AuditEntry, request: Request): Promise<void> {
  await writeAudit(env, {
    actor: auth.identity,
    actor_email: auth.email,
    ...entry,
    details: {
      ...entry.details,
      ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null,
      country: request.headers.get('CF-IPCountry') || null,
    },
  });
}

export async function logSystemAuditEvent(
  env: Env,
  actor: string,
  entry: AuditEntry,
): Promise<void> {
  await writeAudit(env, {
    actor,
    actor_email: null,
    ...entry,
  });
}

async function writeAudit(env: Env, input: {
  actor: string;
  actor_email: string | null;
  event_type: EventType;
  severity: Severity;
  resource_type?: string;
  resource_id?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
}): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const conmonPeriod = `${now.getFullYear()}-Q${quarter}`;

  try {
    await env.DB.prepare(
      `INSERT INTO audit_events (id, tenant_id, event_type, severity, actor, actor_email, action, resource_type, resource_id, details, conmon_period, created_at)
       VALUES (?, 'forge', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      id,
      input.event_type,
      input.severity,
      input.actor,
      input.actor_email,
      input.action,
      input.resource_type || null,
      input.resource_id || null,
      input.details ? JSON.stringify(input.details) : null,
      conmonPeriod
    ).run();
  } catch (err) {
    console.error('[AUDIT_WRITE_FAILURE]', { actor: input.actor, event_type: input.event_type, error: (err as Error).message });
  }
}

export async function queryAuditEvents(
  env: Env,
  filters: { event_type?: string; severity?: string; actor?: string; resource_type?: string; conmon_period?: string; since?: string; limit?: number; offset?: number; }
): Promise<{ events: unknown[]; total: number }> {
  const conditions: string[] = ["tenant_id='forge'"];
  const params: unknown[] = [];

  if (filters.event_type) { conditions.push('event_type = ?'); params.push(filters.event_type); }
  if (filters.severity) { conditions.push('severity = ?'); params.push(filters.severity); }
  if (filters.actor) { conditions.push('actor = ?'); params.push(filters.actor); }
  if (filters.resource_type) { conditions.push('resource_type = ?'); params.push(filters.resource_type); }
  if (filters.conmon_period) { conditions.push('conmon_period = ?'); params.push(filters.conmon_period); }
  if (filters.since) { conditions.push('created_at >= ?'); params.push(filters.since); }

  const where = conditions.join(' AND ');
  const limit = Math.min(Math.max(filters.limit || 50, 1), 200);
  const offset = Math.max(filters.offset || 0, 0);

  const [countResult, rows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total FROM audit_events WHERE ${where}`).bind(...params).first<{ total: number }>(),
    env.DB.prepare(`SELECT * FROM audit_events WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
  ]);
  return { events: rows.results, total: countResult?.total || 0 };
}
