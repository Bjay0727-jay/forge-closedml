// ============================================================================
// ForgeClosedML — Inference Handler
// Proxies /v1/chat/completions to on-prem LiteLLM via Cloudflare Tunnel
// ============================================================================

import { Env, DataClassification, InferenceRequest, ApiResponse } from '../types';
import { AuthContext } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';
import { enforceClassification, extractClassification, requiresTokenization } from '../middleware/classify';

/**
 * Handle inference requests — the hot path.
 * 1. Validate auth + classification
 * 2. Enforce data boundary policy
 * 3. Proxy to LiteLLM on-prem
 * 4. Log inference + audit trail
 */
export async function handleInference(
  request: Request,
  env: Env,
  auth: AuthContext,
  ctx: ExecutionContext
): Promise<Response> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonResponse<ApiResponse>({ success: false, error: 'Invalid JSON body' }, 400);
  }

  // Extract and validate data classification (required)
  const classification = extractClassification(request, body);
  if (!classification) {
    ctx.waitUntil(logAuditEvent(env, auth, {
      event_type: 'inference.blocked',
      severity: 'warning',
      action: 'block',
      details: { reason: 'Missing data_classification', request_id: requestId },
    }, request));
    return jsonResponse<ApiResponse>({
      success: false,
      error: 'data_classification is required. Valid values: public, internal, cui, phi, classified',
    }, 400);
  }

  // Enforce classification policy — CUI/PHI/classified must stay on-prem
  // The Worker itself is a cloud component, but it proxies to on-prem via Tunnel.
  // For 'cloud' destination checks, the actual data transits the encrypted Tunnel.
  // For CUI/PHI, we enforce that the request is routed to on-prem inference only.
  const violation = await enforceClassification(env, classification, 'on-prem');
  if (violation) {
    ctx.waitUntil(logAuditEvent(env, auth, {
      event_type: 'classification.violation',
      severity: 'critical',
      action: 'block',
      details: { classification, violation, request_id: requestId },
    }, request));
    return jsonResponse<ApiResponse>({ success: false, error: violation }, 403);
  }

  // PHI tokenization check
  if (classification === 'phi') {
    const needsTokenization = await requiresTokenization(env, classification);
    if (needsTokenization) {
      const hasTokenizationHeader = request.headers.get('X-PHI-Tokenized') === 'true';
      if (!hasTokenizationHeader) {
        ctx.waitUntil(logAuditEvent(env, auth, {
          event_type: 'inference.blocked',
          severity: 'error',
          action: 'block',
          details: { reason: 'PHI data requires field-level tokenization. Set X-PHI-Tokenized: true after tokenizing.', request_id: requestId },
        }, request));
        return jsonResponse<ApiResponse>({
          success: false,
          error: 'PHI data requires field-level tokenization before inference. Tokenize PHI fields and set X-PHI-Tokenized: true header.',
        }, 403);
      }
    }
  }

  // Resolve model — default from config if not specified
  const modelName = (body.model as string) || await getDefaultModel(env);

  // Build LiteLLM-compatible request
  const litellmBody = {
    model: modelName,
    messages: body.messages,
    max_tokens: body.max_tokens || 4096,
    temperature: body.temperature ?? 0.1,
    stream: body.stream || false,
  };

  // Proxy to on-prem LiteLLM via Tunnel
  let litellmResponse: Response;
  try {
    litellmResponse = await fetch(`${env.LITELLM_ENDPOINT}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-Forge-Actor': auth.identity,
        'X-Forge-Classification': classification,
      },
      body: JSON.stringify(litellmBody),
    });
  } catch (err) {
    const latency = Date.now() - startTime;
    ctx.waitUntil(logInference(env, requestId, modelName, auth, classification, body, null, 502, latency, (err as Error).message, request));
    return jsonResponse<ApiResponse>({
      success: false,
      error: 'Inference endpoint unreachable. Verify Cloudflare Tunnel and on-prem node status.',
    }, 502);
  }

  const latency = Date.now() - startTime;

  // Handle streaming responses
  if (body.stream && litellmResponse.ok && litellmResponse.body) {
    ctx.waitUntil(logInference(env, requestId, modelName, auth, classification, body, null, litellmResponse.status, latency, null, request));
    return new Response(litellmResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Request-ID': requestId,
        'X-Forge-Latency-Ms': String(latency),
      },
    });
  }

  // Handle non-streaming response
  const responseBody = await litellmResponse.json() as Record<string, unknown>;
  const usage = responseBody.usage as Record<string, number> | undefined;

  // Log inference (non-blocking)
  ctx.waitUntil(logInference(
    env, requestId, modelName, auth, classification, body, usage,
    litellmResponse.status, latency, litellmResponse.ok ? null : JSON.stringify(responseBody), request
  ));

  return new Response(JSON.stringify({
    ...responseBody,
    forge_metadata: {
      request_id: requestId,
      data_classification: classification,
      latency_ms: latency,
      model: modelName,
    },
  }), {
    status: litellmResponse.status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Forge-Latency-Ms': String(latency),
    },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getDefaultModel(env: Env): Promise<string> {
  const config = await env.DB.prepare(
    `SELECT value FROM system_config WHERE tenant_id = 'forge' AND key = 'default_model'`
  ).first<{ value: string }>();
  return config?.value || 'llama-3.1-8b';
}

async function logInference(
  env: Env,
  requestId: string,
  modelName: string,
  auth: AuthContext,
  classification: DataClassification,
  body: Record<string, unknown>,
  usage: Record<string, number> | undefined | null,
  statusCode: number,
  latencyMs: number,
  errorMessage: string | null,
  request: Request
): Promise<void> {
  const id = crypto.randomUUID();
  const ip = request.headers.get('CF-Connecting-IP');
  const country = request.headers.get('CF-IPCountry');
  const sourcePlatform = (body.source_platform as string) || 'api';

  try {
    await env.DB.prepare(`
      INSERT INTO inference_logs (
        id, request_id, model_id, model_name, model_version,
        user_identity, user_email, source_platform, data_classification,
        endpoint, prompt_tokens, completion_tokens, total_tokens,
        latency_ms, status_code, error_message, ip_address, geo_country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, requestId, modelName, modelName, 'latest',
      auth.identity, auth.email, sourcePlatform, classification,
      '/v1/chat/completions',
      usage?.prompt_tokens || null,
      usage?.completion_tokens || null,
      usage?.total_tokens || null,
      latencyMs, statusCode, errorMessage, ip, country
    ).run();
  } catch (err) {
    console.error('[INFERENCE_LOG_FAILURE]', { request_id: requestId, error: (err as Error).message });
  }

  // Also log as audit event
  await logAuditEvent(env, auth, {
    event_type: statusCode >= 400 ? 'inference.blocked' : 'inference.completed',
    severity: statusCode >= 400 ? 'warning' : 'info',
    action: statusCode >= 400 ? 'block' : 'read',
    resource_type: 'model',
    resource_id: modelName,
    details: {
      request_id: requestId,
      classification,
      source_platform: sourcePlatform,
      tokens: usage?.total_tokens,
      latency_ms: latencyMs,
      status_code: statusCode,
    },
  }, request);
}

function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
