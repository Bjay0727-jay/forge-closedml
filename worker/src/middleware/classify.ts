import { Env, DataClassification, AllowedDestination } from '../types';

interface ClassificationPolicy {
  classification: string;
  allowed_destinations: string;
  tokenization_required: number;
}

const ALLOWED_CLASSIFICATIONS: DataClassification[] = ['public', 'internal', 'cui', 'phi', 'classified'];

export async function enforceClassification(
  env: Env,
  classification: DataClassification,
  destination: AllowedDestination
): Promise<string | null> {
  const policy = await env.DB.prepare(
    `SELECT classification, allowed_destinations, tokenization_required FROM classification_policies WHERE tenant_id='forge' AND classification=?`
  ).bind(classification).first<ClassificationPolicy>();

  if (!policy) return `Unknown data classification: ${classification}`;

  const allowed = JSON.parse(policy.allowed_destinations) as string[];
  if (!allowed.includes(destination)) {
    return `CLASSIFICATION VIOLATION: ${classification} not permitted for ${destination}`;
  }
  return null;
}

export async function requiresTokenization(env: Env, classification: DataClassification): Promise<boolean> {
  const policy = await env.DB.prepare(
    `SELECT tokenization_required FROM classification_policies WHERE tenant_id='forge' AND classification=?`
  ).bind(classification).first<{ tokenization_required: number }>();
  return policy?.tokenization_required === 1;
}

export function extractClassification(request: Request, body: Record<string, unknown>): DataClassification | null {
  const headerClass = request.headers.get('X-Data-Classification');
  if (!headerClass || !isValidClassification(headerClass)) return null;

  const bodyClass = typeof body.data_classification === 'string' ? body.data_classification : null;
  if (bodyClass && bodyClass !== headerClass) return null;

  return headerClass as DataClassification;
}

function isValidClassification(value: string): value is DataClassification {
  return ALLOWED_CLASSIFICATIONS.includes(value as DataClassification);
}
