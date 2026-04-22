import type { Env } from '../types';
import type { AuthContext } from '../middleware/auth';
import { logAuditEvent, queryAuditEvents } from '../middleware/audit';

const CONMON_PERIOD_RE = /^\d{4}-Q[1-4]$/;

export async function exportAuditEvidence(
  request: Request,
  env: Env,
  auth: AuthContext,
  url: URL,
  ctx: ExecutionContext,
  requestId: string,
): Promise<Response> {
  const period = url.searchParams.get('conmon_period');
  if (!period || !CONMON_PERIOD_RE.test(period)) {
    return json({ success: false, error: 'conmon_period (e.g. 2026-Q2) is required' }, 400);
  }

  const events: unknown[] = [];
  let offset = 0;
  const pageSize = 200;
  let total = 0;

  // Stream through all pages for the period. Bounded by D1 query limits; for
  // very large periods this should move to R2 streaming + async bundle job.
  // TODO(hardening): offload to a Durable Object / Queue for >50k-event periods.
  for (;;) {
    const page = await queryAuditEvents(env, { conmon_period: period, limit: pageSize, offset });
    total = page.total;
    events.push(...page.events);
    if (page.events.length < pageSize) break;
    offset += pageSize;
    if (offset >= total) break;
    if (offset > 50_000) break; // MVP safety cap
  }

  const generatedAt = new Date().toISOString();
  const bundle = {
    schema: 'forge.audit.evidence-bundle.v1',
    tenant_id: 'forge',
    conmon_period: period,
    generated_at: generatedAt,
    generated_by: auth.identity,
    generated_by_email: auth.email,
    event_count: events.length,
    total_events_in_period: total,
    truncated: events.length < total,
    events,
  };

  const payload = JSON.stringify(bundle);
  const digest = await sha256Hex(payload);
  const signature = await hmacSha256Hex(env.API_SECRET, payload);

  ctx.waitUntil(logAuditEvent(env, auth, {
    event_type: 'audit.export',
    severity: 'info',
    action: 'read',
    resource_type: 'audit',
    resource_id: period,
    details: {
      request_id: requestId,
      event_count: events.length,
      total_events_in_period: total,
      digest_sha256: digest,
    },
  }, request));

  return new Response(JSON.stringify({
    success: true,
    data: bundle,
    signature: {
      // TODO(hardening): swap HMAC placeholder for Sigstore/cosign-style signature
      // backed by an HSM-managed key; attach detached sig + pubkey URI.
      algorithm: 'HMAC-SHA256',
      key_id: 'api-secret',
      digest_sha256: digest,
      value: signature,
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="forge-audit-${period}.json"`,
      'X-Request-ID': requestId,
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(buf));
}

async function hmacSha256Hex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return toHex(new Uint8Array(sig));
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
