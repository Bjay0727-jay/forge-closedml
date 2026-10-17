# 00 — Forge AI Platform Overview

> Status: **PROPOSED** — awaiting human design approval (Gate G0).
> Scope: blueprint only. No code in this PR.

## 1. What we are building

A Forge-owned, Forge-maintained AI platform that **generates, analyzes,
predicts, and acts** — built on the existing ForgeClosedML gateway and
registry. It learns from data Forge (and its customers) provide, runs in a
**hybrid** Cloudflare + on-prem topology by default, and can be switched per
tenant into a fully **air-gapped** ("closed") mode.

The first product it serves is **CanaPoint** — continuous trust, risk, and
assurance for the RMF lifecycle.

Design principle in one line:

> **AI discovers, analyzes, drafts, and recommends. Deterministic rules enforce
> compliance facts. Designated humans decide.**

## 2. Starting point (already in this repo)

| Capability | Where | Status |
|---|---|---|
| Identity (CF Access JWT / service token / bearer) | `worker/src/middleware/auth.ts` | Built |
| RBAC (`viewer`, `operator`, `approver`, `admin`, `service`) | `worker/src/middleware/rbac.ts` | Built |
| Classification enforcement (`public` → `classified`) | `worker/src/middleware/classify.ts`, `classification_policies` | Built |
| Structured audit + ConMon period | `worker/src/middleware/audit.ts`, `audit_events` | Built |
| Signed evidence export | `worker/src/handlers/audit.ts` | Built (HMAC placeholder) |
| OpenAI-compatible inference proxy | `worker/src/handlers/inference.ts` → LiteLLM → Ollama | Built |
| Model registry, lifecycle, two-person promotion, rollback | `worker/src/handlers/models.ts` | Built |
| Dashboard | `dashboard/` | Built |
| On-prem stack (Ollama, LiteLLM, MLflow, cloudflared) | `docker-compose.yml`, `config/` | Built |

This is roadmap **Phases 1–2** ("Gateway" + "Governed Registry"). The blueprint
covers **Phases 3–4** and the AI engines on top.

## 3. The engines

| Engine | Verb | CanaPoint / RMF application | Primary technology |
|---|---|---|---|
| **Knowledge (RAG)** | *Recalls* | Grounds every answer in Forge/customer evidence, policies, OSCAL catalogs | On-prem embeddings + Qdrant (restricted) / Vectorize (public, internal) |
| **Generative** | *Creates* | Drafts SSP control narratives, SAR findings, POA&M entries, executive summaries | LiteLLM → vLLM / Ollama, Forge fine-tuned model |
| **Analytical** | *Evaluates* | Does this evidence satisfy AC-2(1)? Where are the gaps? What is inconsistent? | Deterministic rules engine (OSCAL 800-53 Rev 5) + LLM evidence assessor |
| **Predictive** | *Forecasts* | Risk exposure, evidence expiry, control-failure likelihood, assessment readiness | LightGBM/XGBoost, MLflow-tracked, FastAPI scorer |
| **Agentic** | *Acts* | Coordinates Categorize → Select → Implement → Assess → Authorize → Monitor | Supervisor + specialist agents on Cloudflare Workflows, approval-gated |
| **Multimodal** | *Sees* | Reads screenshots, diagrams, PDFs, config exports | Docling/Tesseract parse + local vision-language model |
| **Training Factory** | *Learns* | Fine-tunes on Forge corpus; retrains predictors on outcomes | QLoRA (Axolotl/Unsloth) on on-prem GPU; eval + red-team harness |
| **Governance** | *Controls* | Human approvals, authority boundaries, audit, AI accountability | Existing gateway + new approval service (Gates G0–G5) |

These overlap by design: an agent run uses Knowledge to retrieve evidence,
Analytical to score it, Generative to draft, and Predictive to prioritize.

## 4. Autonomy model

Forge uses the five-level illustrative model. **The platform is capped at
Level 4 (conditional autonomy).** Level 5 is out of scope.

| Level | Name | What AI may do on this platform | Example |
|---|---|---|---|
| L1 | Assistance | Answer, summarize, explain | "Explain SC-7(5)" |
| L2 | Copilot | Recommend + draft; human applies | Draft an SSP narrative for review |
| L3 | Supervised agent | Execute an approved workflow; escalate decisions | Evidence-review agent scores 120 artifacts, flags 9 |
| L4 | Conditional autonomy | Act inside explicit bounds; sensitive ops need approval | ConMon agent opens a draft POA&M item, waits for ISSO approval |
| L5 | High autonomy | — | **Not permitted** |

Each tenant and each agent has a **maximum autonomy level** configured by an
`admin`. Default for new tenants: **L2**.

### Reserved human decisions (never delegated — Gate G5)

- Assessment conclusions (satisfied / other-than-satisfied)
- Risk acceptance and risk determinations
- Authorization decisions (ATO, IATT, DATO)
- Closing POA&M items
- Releasing data across a classification boundary
- Promoting a model to production (two-person rule)

## 5. Human approval gates (summary)

| Gate | Decision | Who | Enforced by |
|---|---|---|---|
| G0 | Design / code change | Forge engineering lead | GitHub PR review + merge |
| G1 | Data source or dataset admitted | Data owner (`data-steward` role) | `approval_requests` + ingestion pipeline |
| G2 | Training run launched | `approver` | `training_jobs` state machine |
| G3 | Model promoted to production | Two distinct `approver`s + passing eval | Existing `handlers/models.ts` + eval check |
| G4 | Agent action above auto tier | Assigned human (ISSO, assessor, operator) | Workflow pause + `approval_requests` |
| G5 | Reserved decisions | Designated authority (AO, SCA, ISSO) | Not callable by any agent tool |

Details: [`03-agents-and-governance.md`](03-agents-and-governance.md).

## 6. What this platform is not

- **Not AGI/ASI.** These are specialized, bounded systems. Marketing and
  customer docs must not claim otherwise.
- **Not a foundation-model lab.** We **fine-tune and adapt** open-weight base
  models (e.g. Llama 3.x, Qwen, Mistral); we do not pre-train from scratch.
- **Not an autonomous authorizer.** No model output becomes a compliance
  determination without a human signature recorded in the audit log.

## 7. Blueprint index

| Doc | Contents |
|---|---|
| [`01-architecture.md`](01-architecture.md) | Components, data flows, hybrid vs air-gap |
| [`02-data-and-learning.md`](02-data-and-learning.md) | How you give it data; RAG; fine-tuning; predictive training |
| [`03-agents-and-governance.md`](03-agents-and-governance.md) | Agent catalog, gates, approval UX, proposed schema |
| [`04-security-and-compliance.md`](04-security-and-compliance.md) | Threat model, OWASP LLM Top 10, NIST AI RMF / 800-53 mapping |
| [`05-roadmap.md`](05-roadmap.md) | Phases, PR plan, acceptance criteria, hardware sizing |
| [`../adr/`](../adr/) | Architecture Decision Records |

## 8. How we build it (Claude + human)

1. Claude drafts each phase as a plan, then as a PR — all from the web UI.
2. A Forge human reviews the design and approves (G0). Nothing merges without it.
3. Claude implements, tests, and drives CI to green; the human merges.
4. Each phase ends with a demo checklist in the dashboard before the next begins.
