# ADR-0005: Predictive stack — LightGBM + MLflow + FastAPI scorer

- Status: Proposed
- Date: 2026-10-17

## Context
Predictive targets (control-failure risk, evidence expiry, readiness, POA&M
slippage) are tabular, moderately sized, and need explanations.

## Decision
Gradient-boosted trees (**LightGBM**, XGBoost as alternate) with probability
calibration and **SHAP** explanations; experiments and registry in the
existing **MLflow**; served by a small **FastAPI** `scorer` that loads the
registered production alias. Promotion still goes through the gateway's model
registry and two-person rule (G3).

Deep learning is not used for these targets unless a benchmark shows a clear gain.

## Consequences
- + Fast to train on CPU, strong on tabular data, explainable.
- + Reuses MLflow already in `docker-compose.yml`.
- − Requires labeled history; cold-start plan in blueprint 02 §5.
