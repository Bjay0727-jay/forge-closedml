const API_BASE = import.meta.env.VITE_API_BASE || 'https://closedml-api.forgecyberdefense.com';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total?: number; page?: number; per_page?: number; limit?: number; offset?: number };
}

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

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
    return {
      success: false,
      error: (err as Error).message || 'Network error',
    };
  }
}

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return { success: false, error: 'Invalid JSON response' }; }
}

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

export const fetchDashboardStats = () => request<DashboardStats>('/api/dashboard/stats');
export const fetchInferenceTimeline = (days = 7) => request<TimelinePoint[]>(`/api/dashboard/timeline?days=${days}`);
export const fetchModelUsage = () => request<ModelUsage[]>('/api/dashboard/usage');

export interface Model {
  id: string;
  name: string;
  lifecycle_state: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const fetchModels = (state?: string) => request<Model[]>(`/api/models${state ? `?state=${state}` : ''}`);
export const registerModel = (data: Record<string, unknown>) => request<{ id: string }>('/api/models', { method: 'POST', body: JSON.stringify(data) });
export const promoteModel = (id: string, targetState: string, rollbackToPrevious = false) =>
  request<{ id: string; lifecycle_state: string }>(`/api/models/${id}/promote`, {
    method: 'POST',
    body: JSON.stringify(rollbackToPrevious ? { rollback_to_previous: true } : { target_state: targetState }),
  });

export interface AuditEvent {
  id: string;
  event_type: string;
  severity: string;
  actor: string;
  actor_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  conmon_period: string | null;
  created_at: string;
}

export const fetchAuditEvents = (params?: Record<string, string>) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return request<AuditEvent[]>(`/api/audit${query}`);
};

export interface Endpoint {
  id: string;
  name: string;
  service_type: string;
  status: string;
  internal_url: string;
  external_host: string | null;
  last_seen_at: string | null;
  gpu_info: Record<string, unknown> | null;
}

export const fetchEndpoints = () => request<Endpoint[]>('/api/endpoints');

export interface InferenceLog {
  id: string;
  request_id: string;
  model_name: string;
  user_identity: string;
  source_platform: string;
  data_classification: string;
  total_tokens: number | null;
  latency_ms: number | null;
  status_code: number;
  created_at: string;
}

export const fetchInferenceLogs = (params?: Record<string, string>) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return request<InferenceLog[]>(`/api/inference-logs${query}`);
};

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
