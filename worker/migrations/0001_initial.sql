PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'forge',
  name TEXT NOT NULL,
  current_version_id TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'dev',
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name)
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
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  conmon_period TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classification_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'forge',
  classification TEXT NOT NULL,
  allowed_destinations TEXT NOT NULL,
  tokenization_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, classification)
);

CREATE TABLE IF NOT EXISTS system_config (
  tenant_id TEXT NOT NULL DEFAULT 'forge',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_models_state ON models(tenant_id, lifecycle_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_models_name ON models(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_approvals_model ON promotion_approvals(model_id, target_state, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_endpoints_status ON endpoints(tenant_id, status, service_type);
CREATE INDEX IF NOT EXISTS idx_inference_created ON inference_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inference_model ON inference_logs(tenant_id, model_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inference_class ON inference_logs(tenant_id, data_classification, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_lookup ON audit_events(tenant_id, event_type, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_conmon ON audit_events(tenant_id, conmon_period, created_at DESC);

-- Defaults aligned with doc §4.2 and the HIPAA engagement profile (§6.1):
--   phi, classified, internal require tokenization; cui permitted unencrypted
--   for lab/federal workloads where tokenization is out-of-band; public is
--   the only level that leaves on-prem.
INSERT OR IGNORE INTO classification_policies (id, tenant_id, classification, allowed_destinations, tokenization_required)
VALUES
('cp-public','forge','public','["on-prem","cloud","r2"]',0),
('cp-internal','forge','internal','["on-prem","cloud"]',1),
('cp-cui','forge','cui','["on-prem"]',0),
('cp-phi','forge','phi','["on-prem"]',1),
('cp-classified','forge','classified','["on-prem"]',1);

INSERT OR IGNORE INTO system_config (tenant_id, key, value, updated_by)
VALUES
('forge','default_model','llama-3.1-8b','system'),
('forge','require_data_classification','true','system');
