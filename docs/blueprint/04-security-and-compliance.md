# 04 — Security and Compliance

> Status: **PROPOSED** (Gate G0)

## 1. Trust boundaries

| # | Boundary | Crosses it | Control |
|---|---|---|---|
| B1 | Internet → Cloudflare edge | Users, Forge products | Cloudflare Access (IdP + MFA), WAF, rate limit |
| B2 | Edge → Gateway logic | Every request | `authenticate` + RBAC + classification + audit (existing) |
| B3 | Gateway → on-prem | Inference, tool calls, restricted uploads | Outbound-only Tunnel, CF Access service token on every origin, mTLS (Phase 4c) |
| B3a | Gateway → hosted pilot GPU (Hetzner, EU) | Inference and training on `public` / `internal` / synthetic data only | Same as B3, plus per-endpoint `allowed_classifications`; host firewall denies all inbound; full-disk encryption |
| B7 | Workers → managed Postgres (US) | Metadata, audit, approvals | Hyperdrive over TLS, least-privilege DB roles per environment, provider encryption at rest, no restricted content stored |
| B4 | Tenant ↔ tenant | Retrieval, runs, datasets | Mandatory `tenant_id` + collection ACL filter in gateway; per-tenant Qdrant collections |
| B5 | Untrusted content → model | Uploaded evidence, scan output | Treated as data, never as instructions (see LLM01) |
| B6 | Model output → system of record | Findings, POA&M, narratives | Approval gates G4/G5 |

## 2. OWASP Top 10 for LLM Applications (2025) — mitigations

| Risk | Platform mitigation |
|---|---|
| **LLM01 Prompt injection** (direct + indirect via evidence) | Retrieved/uploaded text is wrapped in delimited, labeled data blocks; system prompt forbids following instructions from data; tool calls validated against schema and tier; injection classifier on ingestion flags suspicious docs for G1 reviewer; agents cannot call T5; red-team suite includes indirect-injection corpus |
| **LLM02 Sensitive information disclosure** | Classification routing (01 §4); restricted content never stored at edge; PHI tokenization (existing `X-PHI-Tokenized`); output scanner for PII/secret patterns before response |
| **LLM03 Supply chain** | Only license-reviewed open-weight models; SHA-256 + signature verified on load (`model_versions.sha256_hash`, `artifact_signature`); pinned container digests; SBOM per release (Syft) + vulnerability scan (Grype) |
| **LLM04 Data and model poisoning** | G1 human approval on every source; hash re-check at training time; dataset lineage; eval regression gates at G3 |
| **LLM05 Improper output handling** | Outputs rendered as text/Markdown only, sanitized; never executed; structured outputs validated with JSON schema |
| **LLM06 Excessive agency** | Tool risk tiers + autonomy caps; T5 not implemented as tools; budgets; kill switch; separation of duties |
| **LLM07 System prompt leakage** | No secrets in prompts; prompts versioned in repo, treated as non-secret |
| **LLM08 Vector and embedding weaknesses** | Tenant + collection filters enforced server-side; per-tenant Qdrant collections for restricted data; no shared index for restricted classes |
| **LLM09 Misinformation** | Citation requirement; rules engine authoritative over LLM on pass/fail facts; "not enough evidence" is a valid, encouraged answer; humans sign conclusions |
| **LLM10 Unbounded consumption** | Existing per-identity rate limit; per-run token/step/GPU budgets; max_tokens cap (existing 16384) |

## 3. NIST AI RMF 1.0 alignment

| Function | How the platform satisfies it |
|---|---|
| **GOVERN** | Gates G0–G5; roles + separation of duties; ADRs; model cards per version; this blueprint |
| **MAP** | Agent catalog defines context, intended use, and prohibited uses per agent; data classification per source |
| **MEASURE** | Eval harness (accuracy, grounding, refusal), red-team suite, drift (PSI, calibration), SHAP explanations |
| **MANAGE** | Promotion/rollback/quarantine (existing lifecycle), kill switch, incident runbook, retraining triggers |

Also tracked against the NIST **Generative AI Profile (NIST AI 600-1)** risk
list during the red-team design in Phase 4b.

## 4. NIST SP 800-53 Rev 5 control mapping (platform's own ATO)

| Family | Controls | Implementation |
|---|---|---|
| AC | AC-2, AC-3, AC-5, AC-6, AC-17 | IdP groups → RBAC; separation of duties on approvals; least-privilege tool tiers; remote access only via Access |
| AU | AU-2, AU-3, AU-6, AU-9, AU-11, AU-12 | `audit_events` (who/what/when/where/outcome), signed export, 7-year retention, dashboard review |
| CA | CA-2, CA-7 | Eval + red-team per release; ConMon export per period |
| CM | CM-2, CM-3, CM-5, CM-8 | G0 PR review; pinned images; model/version inventory in Postgres |
| IA | IA-2, IA-2(1), IA-5, IA-9 | Access MFA; service tokens for machines; secret rotation (TODO) |
| IR | IR-4, IR-6 | Kill switch, quarantine state, `critical` audit alerts |
| RA | RA-3, RA-5 | This threat model; container + dependency scanning in CI |
| SA | SA-8, SA-11, SA-15 | Security-by-design docs, test suites, SAST in CI |
| SC | SC-7, SC-8, SC-12, SC-13, SC-28 | Outbound-only tunnel; TLS everywhere; managed keys (HSM signer TODO); encryption at rest (R2 native, managed-Postgres storage encryption, MinIO SSE) |
| SI | SI-3, SI-4, SI-7, SI-10 | Malware scan at quarantine; anomaly alerts; artifact hash verification; input validation |
| SR | SR-3, SR-4, SR-11 | Model provenance, SBOM, signature verification |
| PT / PM | PT-2, PM-11 | Classification + PHI policy; documented mission/business process per agent |

## 5. Specific design rules

1. The gateway is the **only** caller of on-prem services. On-prem services
   reject requests without a valid CF Access service-token header.
2. Agents run with a **run-scoped token** that carries tenant, scope, and
   autonomy cap; tools re-check it — they do not trust the agent's claims.
3. No restricted content in the control-plane Postgres. `agent_steps` stores summaries and ids only.
4. Prompt templates are files in the repo, versioned, and their hash is logged
   with every generation.
5. Every model version needs a **model card** (intended use, training data
   lineage, eval results, known limits) before G3.
6. The HMAC signing in `handlers/audit.ts` is replaced by an asymmetric key
   (HSM/KMS or cosign keyless in hybrid; offline key in air-gap) in Phase 4c.

## 6. Air-gap specifics

- Offline update bundle: containers (by digest), model weights, migrations,
  SBOM, signatures. Imported on a transfer workstation, verified, then moved
  in. Rejected if any signature fails.
- Local IdP (Keycloak) maps groups to the same role names; no code change.
- Time source and audit export remain available offline; evidence bundles are
  exported to removable media for the customer's ConMon package.
