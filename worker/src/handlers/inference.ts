import type { Env, DataClassification } from '../types';
import type { AuthContext } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';
import { enforceClassification, extractClassification, requiresTokenization } from '../middleware/classify';

export async function handleInference(
  request: Request,
  env: Env,
  auth: AuthContext,
  ctx: ExecutionContext,
  requestId: string,
): Promise<Response> {
  const startTime = Date.now();

  const body = await parseJson(request);
  if (!body) return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400, requestId);
  if (!Array.isArray(body.messages)) return jsonResponse({ success: false, error: 'messages[] is required' }, 400, requestId);
  if (body.max_tokens && (!Number.isInteger(body.max_tokens) || Number(body.max_tokens) <= 0 || Number(body.max_tokens) > 16384)) {
    return jsonResponse({ success: false, error: 'max_tokens must be an integer between 1 and 16384' }, 400, requestId);
  }

  const classification = extractClassification(request, body);
  if (!classification) {
    ctx.waitUntil(logAuditEvent(env, auth, {
      event_type: 'inference.blocked', severity: 'warning', action: 'block', resource_type: 'policy', resource_id: 'classification',
      details: { reason: 'Missing/invalid or mismatched X-Data-Classification', request_id: requestId },
    }, request));
    return jsonResponse({ success: false, error: 'X-Data-Classification is required and must match body.data_classification when provided' }, 400, requestId);
  }

  const violation = await enforceClassification(env, classification, 'on-prem');
  if (violation) {
    ctx.waitUntil(logAuditEvent(env, auth, {
      event_type: 'classification.violation', severity: 'critical', action: 'block', resource_type: 'policy', resource_id: classification,
      details: { violation, request_id: requestId },
    }, request));
    return jsonResponse({ success: false, error: violation }, 403, requestId);
  }

  if (await requiresTokenization(env, classification)) {
    if (request.headers.get('X-PHI-Tokenized') !== 'true') {
      ctx.waitUntil(logAuditEvent(env, auth, {
        event_type: 'inference.blocked', severity: 'warning', action: 'block', resource_type: 'policy', resource_id: classification,
        details: { reason: 'tokenization_required', request_id: requestId },
      }, request));
      return jsonResponse({ success: false, error: `Classification ${classification} requires tokenization; send X-PHI-Tokenized: true` }, 403, requestId);
    }
  }

  const modelName = (typeof body.model === 'string' ? body.model : null) || await getDefaultModel(env);
  const litellmBody = {
    model: modelName,
    messages: body.messages,
    max_tokens: body.max_tokens || 4096,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.1,
    stream: body.stream === true,
  };

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
    return jsonResponse({ success: false, error: 'Inference endpoint unreachable' }, 502, requestId);
  }

  const latency = Date.now() - startTime;

  if (body.stream === true && litellmResponse.ok && litellmResponse.body) {
    ctx.waitUntil(logInference(env, requestId, modelName, auth, classification, body, null, litellmResponse.status, latency, null, request));
    return new Response(litellmResponse.body, {
      status: litellmResponse.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Request-ID': requestId,
      },
    });
  }

  const responseBody = await parseResponseJson(litellmResponse);
  const responseObj = (responseBody && typeof responseBody === 'object') ? responseBody as Record<string, unknown> : { upstream_raw: String(responseBody) };
  const usage = responseObj.usage as Record<string, number> | undefined;
  ctx.waitUntil(logInference(env, requestId, modelName, auth, classification, body, usage, litellmResponse.status, latency, litellmResponse.ok ? null : JSON.stringify(responseObj), request));

  return new Response(JSON.stringify({
    ...responseObj,
    forge_metadata: { request_id: requestId, data_classification: classification, latency_ms: latency, model: modelName },
  }), {
    status: litellmResponse.status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Forge-Latency-Ms': String(latency),
    },
  });
}

async function getDefaultModel(env: Env): Promise<string> {
  const config = await env.DB.prepare(`SELECT value FROM system_config WHERE tenant_id='forge' AND key='default_model'`).first<{ value: string }>();
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
  try {
    await env.DB.prepare(
      `INSERT INTO inference_logs (id, tenant_id, request_id, model_id, model_name, user_identity, source_platform, data_classification, status_code, prompt_tokens, completion_tokens, total_tokens, latency_ms, error_message, created_at)
       VALUES (?, 'forge', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      id,
      requestId,
      modelName,
      modelName,
      auth.identity,
      (body.source_platform as string) || 'api',
      classification,
      statusCode,
      usage?.prompt_tokens || null,
      usage?.completion_tokens || null,
      usage?.total_tokens || null,
      latencyMs,
      errorMessage,
    ).run();
  } catch (err) {
    console.error('[INFERENCE_LOG_FAILURE]', { request_id: requestId, error: (err as Error).message });
  }

  await logAuditEvent(env, auth, {
    event_type: statusCode >= 400 ? 'inference.blocked' : 'inference.completed',
    severity: statusCode >= 400 ? 'warning' : 'info',
    action: statusCode >= 400 ? 'block' : 'read',
    resource_type: 'model',
    resource_id: modelName,
    details: { request_id: requestId, classification, tokens: usage?.total_tokens || 0, latency_ms: latencyMs, status_code: statusCode },
  }, request);
}

async function parseJson(req: Request): Promise<Record<string, unknown> | null> { try { return await req.json() as Record<string, unknown>; } catch { return null; } }
async function parseResponseJson(res: Response): Promise<unknown> { try { return await res.json(); } catch { return { error: 'upstream returned non-json response' }; } }
function jsonResponse(body: unknown, status = 200, requestId?: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(requestId ? { 'X-Request-ID': requestId } : {}) } });
}
