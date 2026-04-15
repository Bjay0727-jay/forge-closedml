// ============================================================================
// ForgeClosedML — Data Classification Enforcement
// Ensures data never leaves its classified boundary
// ============================================================================

import { Env, DataClassification, AllowedDestination } from '../types';

interface ClassificationPolicy {
  classification: string;
  allowed_destinations: string;
  encryption_required: number;
  tokenization_required: number;
  baa_required: number;
}

/**
 * Validate that a request's data classification is allowed for the given destination.
 * Returns null if allowed, or an error string if blocked.
 */
export async function enforceClassification(
  env: Env,
  classification: DataClassification,
  destination: AllowedDestination
): Promise<string | null> {
  const policy = await env.DB.prepare(
    `SELECT * FROM classification_policies WHERE tenant_id = 'forge' AND classification = ?`
  ).bind(classification).first<ClassificationPolicy>();

  if (!policy) {
    return `Unknown data classification: ${classification}. Request blocked.`;
  }

  const allowed: string[] = JSON.parse(policy.allowed_destinations);

  if (!allowed.includes(destination)) {
    return `CLASSIFICATION VIOLATION: ${classification.toUpperCase()} data cannot transit to ${destination}. Allowed: ${allowed.join(', ')}. This incident has been logged.`;
  }

  return null; // Allowed
}

/**
 * Check if PHI tokenization is required for a given classification.
 */
export async function requiresTokenization(
  env: Env,
  classification: DataClassification
): Promise<boolean> {
  const policy = await env.DB.prepare(
    `SELECT tokenization_required FROM classification_policies WHERE tenant_id = 'forge' AND classification = ?`
  ).bind(classification).first<{ tokenization_required: number }>();

  return policy?.tokenization_required === 1;
}

/**
 * Validate that required data_classification header is present on inference requests.
 */
export function extractClassification(request: Request, body: Record<string, unknown>): DataClassification | null {
  // Check body first (preferred — set by calling platform)
  const bodyClass = body?.data_classification as string;
  if (bodyClass && isValidClassification(bodyClass)) {
    return bodyClass as DataClassification;
  }

  // Fallback to header
  const headerClass = request.headers.get('X-Data-Classification');
  if (headerClass && isValidClassification(headerClass)) {
    return headerClass as DataClassification;
  }

  return null;
}

function isValidClassification(value: string): boolean {
  return ['public', 'internal', 'cui', 'phi', 'classified'].includes(value);
}
