PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'forge',
  name TEXT NOT NULL,
  current_version_id TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'dev', -- dev|staged|approved|production|quarantined
  owner TEXT,
  artifact_signature TEXT,
  provenance_uri TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  version TEXT NOT NULL,
  base_model TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'gguf',
  quantization TEXT,
  sha256_hash TEXT,
  artifact_signature TEXT,
  provenance_uri TEXT,
  metadata_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE,
  UNIQUE(model_id, version)
);

CREATE TABLE IF NOT EXISTS promotion_approvals (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  target_state TEXT NOT NULL,
  approver_identity TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS endpoints (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'forge',
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  internal_url TEXT NOT NULL,
  external_host TEXT,
  tunnel_id TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  health_check_url TEXT,
  last_health_check TEXT,
  last_seen_at TEXT,
  metadata_json TEXT,
  gpu_info TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inference_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'forge',
  request_id TEXT NOT NULL UNIQUE,
  model_id TEXT,
  model_name TEXT NOT NULL,
  user_identity TEXT NOT NULL,
  source_platform TEXT,
  data_classification TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'forge',
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  conmon_period TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_models_state ON models(tenant_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_inference_created ON inference_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_conmon ON audit_events(tenant_id, conmon_period);
