// ============================================================================
// ForgeClosedML — Audit Middleware
// Logs events to D1 for FedRAMP AU-2/AU-3/AU-12 compliance
// ============================================================================

import { Env, EventType, Severity, AuditAction } from '../types';
import { AuthContext } from './auth';

export interface AuditEntry {
  event_type: EventType;
  severity: Severity;
  resource_type?: string;
  resource_id?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
}

/**
 * Log an audit event to D1.
 * Non-blocking — fires and forgets via waitUntil in the caller.
 */
export async function logAuditEvent(
  env: Env,
  auth: AuthContext,
  entry: AuditEntry,
  request: Request
): Promise<void> {
  const id = crypto.randomUUID();
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For');
  const country = request.headers.get('CF-IPCountry');

  // Derive ConMon period from current date
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const conmonPeriod = `${now.getFullYear()}-Q${quarter}`;

  try {
    await env.DB.prepare(`
      INSERT INTO audit_events (id, event_type, severity, actor, actor_email, resource_type, resource_id, action, details, ip_address, conmon_period)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      entry.event_type,
      entry.severity,
      auth.identity,
      auth.email,
      entry.resource_type || null,
      entry.resource_id || null,
      entry.action,
      entry.details ? JSON.stringify(entry.details) : null,
      ip,
      conmonPeriod
    ).run();
  } catch (err) {
    // Audit logging should never break the request — log to console for Wazuh pickup
    console.error('[AUDIT_WRITE_FAILURE]', {
      event_type: entry.event_type,
      actor: auth.identity,
      error: (err as Error).message,
    });
  }
}

/**
 * Query audit events with filters.
 */
export async function queryAuditEvents(
  env: Env,
  filters: {
    event_type?: string;
    severity?: string;
    actor?: string;
    resource_type?: string;
    conmon_period?: string;
    since?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ events: unknown[]; total: number }> {
  const conditions: string[] = ["tenant_id = 'forge'"];
  const params: unknown[] = [];

  if (filters.event_type) {
    conditions.push('event_type = ?');
    params.push(filters.event_type);
  }
  if (filters.severity) {
    conditions.push('severity = ?');
    params.push(filters.severity);
  }
  if (filters.actor) {
    conditions.push('actor = ?');
    params.push(filters.actor);
  }
  if (filters.resource_type) {
    conditions.push('resource_type = ?');
    params.push(filters.resource_type);
  }
  if (filters.conmon_period) {
    conditions.push('conmon_period = ?');
    params.push(filters.conmon_period);
  }
  if (filters.since) {
    conditions.push('created_at >= ?');
    params.push(filters.since);
  }

  const where = conditions.join(' AND ');
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const [countResult, dataResult] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as total FROM audit_events WHERE ${where}`).bind(...params).first<{ total: number }>(),
    env.DB.prepare(`SELECT * FROM audit_events WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
  ]);

  return {
    events: dataResult.results,
    total: countResult?.total || 0,
  };
}
