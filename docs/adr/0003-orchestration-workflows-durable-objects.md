# ADR-0003: Agent orchestration on Cloudflare Workflows + Durable Objects

- Status: Proposed
- Date: 2026-10-17

## Context
Agent runs are multi-step, can last hours to days, must survive restarts, and
must **pause for human approval** (Gate G4) without holding compute.

## Decision
Use **Cloudflare Workflows** for durable step execution — each tool call is a
`step.do()` with retries, and approvals are `step.waitForEvent()` resumed by
`POST /api/approvals/:id`. Use a **Durable Object** per run for live status
(WebSocket to the dashboard) and per-tenant serialization.
All tool execution happens through the gateway to on-prem services.

Behind a `WorkflowRunner` interface so air-gap mode can use a local runner
(Postgres-backed step log; Temporal is the fallback if needed).

Alternatives: LangGraph / CrewAI on-prem — richer agent libraries but adds a
second control plane outside the gateway's audit path. We may still use a
library for prompt/agent logic *inside* steps.

## Consequences
- + Pauses cost nothing; every step is durable and auditable.
- + Agent logic lives in the same Worker codebase and RBAC.
- − Workflows-specific API; mitigated by the interface.
