-- ============================================================================
-- ForgeClosedML — D1 Schema v1
-- Forge Cyber Defense | Closed ML Environment Control Plane
-- ============================================================================
-- Internal-first with tenant_id for future multi-tenant productization.
-- Default tenant: 'forge'
-- ============================================================================

-- ── Model Registry ──────────────────────────────────────────────────────────
-- Every model artifact is versioned, signed, and tracked with chain of custody.
CREATE TABLE IF NOT EXISTS models (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL DEFAULT 'forge',
  name              TEXT NOT NULL,
  version           TEXT NOT NULL,
  base_model        TEXT NOT NULL,                          -- e.g. 'llama-3.1-8b', 'mistral-7b', 'phi-3'
  quantization      TEXT,                                   -- e.g. 'Q4_K_M', 'GPTQ-4bit'
  format            TEXT NOT NULL DEFAULT 'gguf',            -- gguf | gptq | safetensors | onnx
  status            TEXT NOT NULL DEFAULT 'registered',      -- registered | validating | staging | production | archived | revoked
  sha256_hash       TEXT,                                   -- artifact integrity hash
  size_bytes        INTEGER,
  parameters        TEXT,                                   -- JSON: training params, hyperparameters
  model_card        TEXT,                                   -- JSON: Model Card (data classification, intended use, eval results)
  promoted_by       TEXT,                                   -- who promoted to production (two-person integrity)
  approved_by       TEXT,                                   -- second approver for production promotion
  tags              TEXT,                                   -- JSON array: ['compliance', 'oscal', 'vulnerability']
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name, version)
);

CREATE INDEX idx_models_tenant ON models(tenant_id);
CREATE INDEX idx_models_status ON models(tenant_id, status);
CREATE INDEX idx_models_name   ON models(tenant_id, name);

-- ── Inference Logs ──────────────────────────────────────────────────────────
-- Every inference request logged for FedRAMP AU-2 / HIPAA audit requirements.
CREATE TABLE IF NOT EXISTS inference_logs (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL DEFAULT 'forge',
  request_id            TEXT NOT NULL UNIQUE,
  model_id              TEXT NOT NULL,
  model_name            TEXT NOT NULL,
  model_version         TEXT NOT NULL,
  user_identity         TEXT NOT NULL,                      -- from Cloudflare Access JWT
  user_email            TEXT,
  source_platform       TEXT,                               -- forgecomply | forgescan | forgeai_govern | forgeredops | api
  data_classification   TEXT NOT NULL,                      -- public | internal | cui | phi | classified
  endpoint              TEXT NOT NULL DEFAULT '/v1/chat/completions',
  prompt_tokens         INTEGER,
  completion_tokens     INTEGER,
  total_tokens          INTEGER,
  latency_ms            INTEGER,
  status_code           INTEGER NOT NULL,
  error_message         TEXT,
  ip_address            TEXT,
  geo_country           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_inference_tenant    ON inference_logs(tenant_id, created_at);
CREATE INDEX idx_inference_model     ON inference_logs(tenant_id, model_id);
CREATE INDEX idx_inference_user      ON inference_logs(tenant_id, user_identity);
CREATE INDEX idx_inference_class     ON inference_logs(tenant_id, data_classification);
CREATE INDEX idx_inference_platform  ON inference_logs(tenant_id, source_platform);

-- ── Training Jobs ───────────────────────────────────────────────────────────
-- Tracks fine-tuning runs with full audit trail for ConMon evidence.
CREATE TABLE IF NOT EXISTS training_jobs (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL DEFAULT 'forge',
  job_name          TEXT NOT NULL,
  base_model_id     TEXT,                                   -- FK to models.id (base model)
  output_model_id   TEXT,                                   -- FK to models.id (fine-tuned output)
  method            TEXT NOT NULL DEFAULT 'qlora',           -- qlora | lora | full | rag
  status            TEXT NOT NULL DEFAULT 'queued',          -- queued | running | completed | failed | cancelled
  data_classification TEXT NOT NULL DEFAULT 'internal',
  dataset_version   TEXT,                                   -- DVC hash or version tag
  dataset_sources   TEXT,                                   -- JSON array: ['nist-800-53', 'oscal', 'fedramp']
  hyperparameters   TEXT,                                   -- JSON: {rank, alpha, epochs, lr, batch_size}
  metrics           TEXT,                                   -- JSON: {loss, eval_loss, accuracy}
  mlflow_run_id     TEXT,                                   -- links to MLflow for full experiment detail
  model_card        TEXT,                                   -- JSON: generated Model Card
  started_at        TEXT,
  completed_at      TEXT,
  error_log         TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_tenant  ON training_jobs(tenant_id, created_at);
CREATE INDEX idx_jobs_status  ON training_jobs(tenant_id, status);

-- ── Audit Events ────────────────────────────────────────────────────────────
-- General audit trail: covers model promotions, config changes, access events.
-- Maps to NIST 800-53 AU-2, AU-3, AU-6, AU-12.
CREATE TABLE IF NOT EXISTS audit_events (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL DEFAULT 'forge',
  event_type      TEXT NOT NULL,                            -- model.promoted | model.revoked | config.changed | access.granted | access.denied | inference.blocked | job.started | job.completed
  severity        TEXT NOT NULL DEFAULT 'info',              -- info | warning | error | critical
  actor           TEXT NOT NULL,                            -- user identity or 'system'
  actor_email     TEXT,
  resource_type   TEXT,                                     -- model | job | config | endpoint | policy
  resource_id     TEXT,
  action          TEXT NOT NULL,                            -- create | read | update | delete | promote | revoke | block
  details         TEXT,                                     -- JSON: event-specific context
  ip_address      TEXT,
  conmon_period    TEXT,                                    -- e.g. '2026-Q2' for ConMon evidence grouping
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_tenant    ON audit_events(tenant_id, created_at);
CREATE INDEX idx_audit_type      ON audit_events(tenant_id, event_type);
CREATE INDEX idx_audit_severity  ON audit_events(tenant_id, severity);
CREATE INDEX idx_audit_actor     ON audit_events(tenant_id, actor);
CREATE INDEX idx_audit_conmon    ON audit_events(tenant_id, conmon_period);

-- ── Data Classification Policies ────────────────────────────────────────────
-- Enforces which data classifications can route where.
CREATE TABLE IF NOT EXISTS classification_policies (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL DEFAULT 'forge',
  classification        TEXT NOT NULL,                      -- public | internal | cui | phi | classified
  allowed_destinations  TEXT NOT NULL,                      -- JSON array: ['on-prem', 'cloud', 'r2']
  encryption_required   INTEGER NOT NULL DEFAULT 1,         -- boolean
  tokenization_required INTEGER NOT NULL DEFAULT 0,         -- boolean: PHI field-level tokenization
  baa_required          INTEGER NOT NULL DEFAULT 0,         -- boolean: BAA analysis before cloud transit
  retention_days        INTEGER NOT NULL DEFAULT 365,
  description           TEXT,
  created_by            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, classification)
);

-- ── Endpoint Registry ───────────────────────────────────────────────────────
-- Tracks on-prem inference endpoints connected via Cloudflare Tunnel.
CREATE TABLE IF NOT EXISTS endpoints (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL DEFAULT 'forge',
  name            TEXT NOT NULL,                            -- e.g. 'inference-node-01', 'mlflow-primary'
  service_type    TEXT NOT NULL,                            -- litellm | ollama | vllm | mlflow | airflow
  tunnel_id       TEXT,                                     -- Cloudflare Tunnel ID
  internal_url    TEXT NOT NULL,                            -- e.g. 'http://localhost:4000'
  external_host   TEXT,                                     -- e.g. 'inference.forgecyberdefense.com'
  status          TEXT NOT NULL DEFAULT 'offline',           -- online | offline | degraded | maintenance
  health_check_url TEXT,                                    -- e.g. '/health'
  last_health_check TEXT,
  last_seen_at    TEXT,
  gpu_info        TEXT,                                     -- JSON: {model, vram_gb, utilization}
  metadata        TEXT,                                     -- JSON: additional endpoint info
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_endpoints_tenant ON endpoints(tenant_id);
CREATE INDEX idx_endpoints_type   ON endpoints(tenant_id, service_type);

-- ── System Config ───────────────────────────────────────────────────────────
-- Key-value store for runtime configuration.
CREATE TABLE IF NOT EXISTS system_config (
  tenant_id   TEXT NOT NULL DEFAULT 'forge',
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, key)
);

-- ── Seed Data ───────────────────────────────────────────────────────────────

-- Default classification policies
INSERT INTO classification_policies (id, classification, allowed_destinations, encryption_required, tokenization_required, baa_required, retention_days, description, created_by) VALUES
  ('cp-001', 'classified',  '["on-prem"]',               1, 0, 0, 730, 'CUI/FedRAMP data — on-prem only, never enters cloud layer', 'system'),
  ('cp-002', 'cui',         '["on-prem"]',               1, 0, 0, 730, 'Controlled Unclassified Information — on-prem boundary only', 'system'),
  ('cp-003', 'phi',         '["on-prem"]',               1, 1, 1, 2555, 'HIPAA PHI — encrypted, tokenized, BAA required for any cloud transit', 'system'),
  ('cp-004', 'internal',    '["on-prem","cloud"]',       1, 0, 0, 365, 'Internal Forge data — can transit cloud layer with encryption', 'system'),
  ('cp-005', 'public',      '["on-prem","cloud","r2"]',  0, 0, 0, 180, 'Public/test data — no classification restrictions', 'system');

-- Default system config
INSERT INTO system_config (key, value, updated_by) VALUES
  ('default_model', 'llama-3.1-8b-forge-compliance', 'system'),
  ('max_tokens_default', '4096', 'system'),
  ('inference_timeout_ms', '30000', 'system'),
  ('audit_retention_days', '730', 'system'),
  ('conmon_current_period', '2026-Q2', 'system'),
  ('require_data_classification', 'true', 'system'),
  ('enforce_two_person_promotion', 'true', 'system');
