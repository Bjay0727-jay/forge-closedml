// ============================================================================
// ForgeClosedML — Auth Middleware
// Validates Cloudflare Access JWT or API service token
// ============================================================================

import { Env, CfAccessIdentity } from '../types';

export interface AuthContext {
  identity: string;
  email: string | null;
  method: 'cf-access' | 'service-token' | 'api-key';
  groups: string[];
}

/**
 * Extract and validate authentication from request.
 * Priority: Cloudflare Access JWT → Service Token → API Key
 */
export async function authenticate(request: Request, env: Env): Promise<AuthContext | null> {
  // 1. Cloudflare Access JWT (browser users via Access)
  const cfAuth = request.headers.get('Cf-Access-Jwt-Assertion');
  if (cfAuth) {
    const identity = await validateCfAccessJwt(cfAuth);
    if (identity) {
      return {
        identity: identity.sub,
        email: identity.email,
        method: 'cf-access',
        groups: identity.groups || [],
      };
    }
  }

  // 2. Service Token (platform-to-platform: ForgeComply → inference)
  const serviceToken = request.headers.get('CF-Access-Client-Id');
  const serviceSecret = request.headers.get('CF-Access-Client-Secret');
  if (serviceToken && serviceSecret) {
    return {
      identity: `service:${serviceToken}`,
      email: null,
      method: 'service-token',
      groups: ['service'],
    };
  }

  // 3. API Key (direct API access)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === env.API_SECRET) {
      return {
        identity: 'api-key',
        email: null,
        method: 'api-key',
        groups: ['api'],
      };
    }
  }

  return null;
}

/**
 * Decode Cloudflare Access JWT.
 * In production, validate against your team's JWKS endpoint:
 * https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
 *
 * For now, decode and trust (Cloudflare validates before forwarding).
 */
async function validateCfAccessJwt(token: string): Promise<CfAccessIdentity | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    // Basic expiry check
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload as CfAccessIdentity;
  } catch {
    return null;
  }
}

/**
 * Require specific group membership
 */
export function requireGroup(auth: AuthContext, group: string): boolean {
  return auth.groups.includes(group) || auth.groups.includes('admin');
}
