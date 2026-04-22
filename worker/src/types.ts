export interface Env {
  DB: D1Database;
  MODEL_BUCKET: R2Bucket;
  INFERENCE_CACHE: KVNamespace;
  LITELLM_ENDPOINT: string;
  MLFLOW_ENDPOINT: string;
  API_SECRET: string;
  ENVIRONMENT: string;
  RATE_LIMIT_PER_MINUTE?: string;
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_JWKS_URL?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  CORS_ALLOWED_ORIGIN?: string;
}

export type DataClassification = 'public' | 'internal' | 'cui' | 'phi' | 'classified';
export type AllowedDestination = 'on-prem' | 'cloud' | 'r2';

export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'promote' | 'revoke' | 'block';
export type EventType = string;

export interface CfAccessIdentity {
  email?: string;
  sub: string;
  aud?: string | string[];
  iss?: string;
  name?: string;
  groups?: string[];
  iat: number;
  exp: number;
}
