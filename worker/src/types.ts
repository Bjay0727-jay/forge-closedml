export interface Env {
  DB: D1Database;
  MODEL_STORE: R2Bucket;
  INFERENCE_CACHE: KVNamespace;
  LITELLM_ENDPOINT: string;
  MLFLOW_ENDPOINT: string;
  API_SECRET: string;
  ENVIRONMENT: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

export type DataClassification = 'public' | 'internal' | 'cui' | 'phi' | 'classified';
export type AllowedDestination = 'on-prem' | 'cloud' | 'r2';

export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'promote' | 'revoke' | 'block';
export type EventType = string;

export interface CfAccessIdentity {
  email: string;
  sub: string;
  name?: string;
  groups?: string[];
  iat: number;
  exp: number;
}
