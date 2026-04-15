// ============================================================================
// ForgeClosedML — Type Definitions
// ============================================================================

export interface Env {
  DB: D1Database;
  MODEL_STORE: R2Bucket;
  INFERENCE_CACHE: KVNamespace;
  LITELLM_ENDPOINT: string;        // on-prem LiteLLM URL via Tunnel
  MLFLOW_ENDPOINT: string;          // on-prem MLflow URL via Tunnel
  API_SECRET: string;               // service-to-service auth
  ENVIRONMENT: string;              // development | staging | production
}

// ── Data Classification ─────────────────────────────────────────────────────
export type DataClassification = 'public' | 'internal' | 'cui' | 'phi' | 'classified';
export type AllowedDestination = 'on-prem' | 'cloud' | 'r2';

// ── Models ──────────────────────────────────────────────────────────────────
export type ModelStatus = 'registered' | 'validating' | 'staging' | 'production' | 'archived' | 'revoked';
export type ModelFormat = 'gguf' | 'gptq' | 'safetensors' | 'onnx';

export interface Model {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  base_model: string;
  quantization: string | null;
  format: ModelFormat;
  status: ModelStatus;
  sha256_hash: string | null;
  size_bytes: number | null;
  parameters: Record<string, unknown> | null;
  model_card: ModelCard | null;
  promoted_by: string | null;
  approved_by: string | null;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ModelCard {
  intended_use: string;
  data_classification: DataClassification;
  training_data_sources: string[];
  evaluation_results: Record<string, number>;
  limitations: string[];
  framework_alignment: string[];     // e.g. ['FedRAMP', 'HIPAA', 'NIST-AI-RMF']
}

// ── Inference ───────────────────────────────────────────────────────────────
export type SourcePlatform = 'forgecomply' | 'forgescan' | 'forgeai_govern' | 'forgeredops' | 'api' | 'dashboard';

export interface InferenceRequest {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  // Forge-specific metadata
  data_classification: DataClassification;
  source_platform: SourcePlatform;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceLog {
  id: string;
  tenant_id: string;
  request_id: string;
  model_id: string;
  model_name: string;
  model_version: string;
  user_identity: string;
  user_email: string | null;
  source_platform: SourcePlatform;
  data_classification: DataClassification;
  endpoint: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  status_code: number;
  error_message: string | null;
  ip_address: string | null;
  geo_country: string | null;
  created_at: string;
}

// ── Training Jobs ───────────────────────────────────────────────────────────
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TrainingMethod = 'qlora' | 'lora' | 'full' | 'rag';

export interface TrainingJob {
  id: string;
  tenant_id: string;
  job_name: string;
  base_model_id: string | null;
  output_model_id: string | null;
  method: TrainingMethod;
  status: JobStatus;
  data_classification: DataClassification;
  dataset_version: string | null;
  dataset_sources: string[];
  hyperparameters: Record<string, unknown> | null;
  metrics: Record<string, number> | null;
  mlflow_run_id: string | null;
  model_card: ModelCard | null;
  started_at: string | null;
  completed_at: string | null;
  error_log: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Audit Events ────────────────────────────────────────────────────────────
export type EventType =
  | 'model.registered' | 'model.promoted' | 'model.revoked' | 'model.archived'
  | 'config.changed'
  | 'access.granted' | 'access.denied'
  | 'inference.completed' | 'inference.blocked'
  | 'job.started' | 'job.completed' | 'job.failed'
  | 'classification.violation';

export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'promote' | 'revoke' | 'block';

export interface AuditEvent {
  id: string;
  tenant_id: string;
  event_type: EventType;
  severity: Severity;
  actor: string;
  actor_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action: AuditAction;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  conmon_period: string | null;
  created_at: string;
}

// ── Endpoints ───────────────────────────────────────────────────────────────
export type ServiceType = 'litellm' | 'ollama' | 'vllm' | 'mlflow' | 'airflow';
export type EndpointStatus = 'online' | 'offline' | 'degraded' | 'maintenance';

export interface Endpoint {
  id: string;
  tenant_id: string;
  name: string;
  service_type: ServiceType;
  tunnel_id: string | null;
  internal_url: string;
  external_host: string | null;
  status: EndpointStatus;
  health_check_url: string | null;
  last_health_check: string | null;
  last_seen_at: string | null;
  gpu_info: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── API Response ────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    tenant_id?: string;
  };
}

// ── Cloudflare Access JWT ───────────────────────────────────────────────────
export interface CfAccessIdentity {
  email: string;
  sub: string;            // user ID
  name?: string;
  groups?: string[];
  iat: number;
  exp: number;
}

// ── Dashboard Stats ─────────────────────────────────────────────────────────
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
