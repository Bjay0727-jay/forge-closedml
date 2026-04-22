const API_BASE = import.meta.env.VITE_API_BASE || '';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total?: number; limit?: number; offset?: number };
}

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const headers = new Headers(options?.headers || {});
    if (options?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
    const payload = await safeJson(res);
    if (!res.ok) {
      return {
        success: false,
        error: payload?.error || `Request failed (${res.status})`,
        data: payload?.data,
        meta: payload?.meta,
      };
    }
    return {
      success: Boolean(payload?.success ?? true),
      data: payload?.data,
      meta: payload?.meta,
      error: payload?.error,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Network error' };
  }
}

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return { success: false, error: 'Invalid JSON response' }; }
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface DashboardStats {
  models_total: number;
  models_production: number;
  inference_today: number;
  inference_tokens_today: number;
  jobs_running: number;
  jobs_completed_30d: number;
  endpoints_online: number;
  endpoints_total: number;
  audit_critical_7d: number;
  classification_violations_30d: number;
}

export interface TimelinePoint {
  date: string;
  requests: number;
  tokens: number;
  avg_latency_ms: number;
  data_classification: string;
}

export interface ModelUsage {
  model_name: string;
  total_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  error_count: number;
}

export const fetchDashboardStats = () => request<DashboardStats>('/api/dashboard/stats');
export const fetchInferenceTimeline = (days = 7) => request<TimelinePoint[]>(`/api/dashboard/timeline?days=${days}`);
export const fetchModelUsage = () => request<ModelUsage[]>('/api/dashboard/usage');

// ── Models ───────────────────────────────────────────────────────────────────
export type LifecycleState = 'dev' | 'staged' | 'approved' | 'production' | 'quarantined';

export interface Model {
  id: string;
  name: string;
  lifecycle_state: LifecycleState;
  owner: string | null;
  artifact_signature: string | null;
  provenance_uri: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const fetchModels = (state?: string) =>
  request<Model[]>(`/api/models${state ? `?state=${encodeURIComponent(state)}` : ''}`);

export const registerModel = (data: Record<string, unknown>) =>
  request<{ id: string }>('/api/models', { method: 'POST', body: JSON.stringify(data) });

export const promoteModel = (id: string, targetState: string, rollbackToPrevious = false) =>
  request<{ id: string; lifecycle_state: string; pending_second_approval?: boolean; approvals_collected?: number }>(
    `/api/models/${id}/promote`,
    {
      method: 'POST',
      body: JSON.stringify(rollbackToPrevious ? { rollback_to_previous: true } : { target_state: targetState }),
    },
  );

// ── Endpoints ────────────────────────────────────────────────────────────────
export interface Endpoint {
  id: string;
  name: string;
  service_type: string;
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  internal_url: string;
  external_host: string | null;
  tunnel_id: string | null;
  health_check_url: string | null;
  last_health_check: string | null;
  last_seen_at: string | null;
  gpu_info: string | null;
}

export const fetchEndpoints = () => request<Endpoint[]>('/api/endpoints');

export const registerEndpoint = (data: Record<string, unknown>) =>
  request<{ id: string }>('/api/endpoints', { method: 'POST', body: JSON.stringify(data) });

export const updateEndpointHealth = (id: string, status: string, gpuInfo?: Record<string, unknown>) =>
  request<void>(`/api/endpoints/${id}/health`, {
    method: 'POST',
    body: JSON.stringify({ status, gpu_info: gpuInfo }),
  });

// ── Inference Logs ───────────────────────────────────────────────────────────
export interface InferenceLog {
  id: string;
  request_id: string;
  model_name: string;
  user_identity: string;
  source_platform: string;
  data_classification: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  status_code: number;
  error_message: string | null;
  created_at: string;
}

export const fetchInferenceLogs = (params?: Record<string, string>) => {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  return request<InferenceLog[]>(`/api/inference-logs${q}`);
};

// ── Audit ────────────────────────────────────────────────────────────────────
export interface AuditEvent {
  id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  actor: string;
  actor_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  details: string | null;
  conmon_period: string | null;
  created_at: string;
}

export const fetchAuditEvents = (params?: Record<string, string>) => {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  return request<AuditEvent[]>(`/api/audit${q}`);
};

export const fetchPolicyViolations = (limit = 100) =>
  request<AuditEvent[]>(`/api/policy-violations?limit=${limit}`);

export const auditExportUrl = (period: string) =>
  `${API_BASE}/api/audit/export?conmon_period=${encodeURIComponent(period)}`;
