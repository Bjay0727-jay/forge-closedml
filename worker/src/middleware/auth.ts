import { Env, CfAccessIdentity } from '../types';

export interface AuthContext {
  identity: string;
  email: string | null;
  method: 'cf-access' | 'service-token' | 'api-key';
  groups: string[];
}

export async function authenticate(request: Request, env: Env): Promise<AuthContext | null> {
  const cfAuth = request.headers.get('Cf-Access-Jwt-Assertion');
  if (cfAuth) {
    const identity = await validateCfAccessJwt(cfAuth, env);
    if (identity) {
      return {
        identity: identity.sub,
        email: identity.email || null,
        method: 'cf-access',
        groups: identity.groups || [],
      };
    }
  }

  const serviceToken = request.headers.get('CF-Access-Client-Id');
  const serviceSecret = request.headers.get('CF-Access-Client-Secret');
  if (serviceToken && serviceSecret && isValidServiceToken(serviceToken, serviceSecret, env)) {
    return {
      identity: `service:${serviceToken}`,
      email: null,
      method: 'service-token',
      groups: ['service'],
    };
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (constantTimeEqual(token, env.API_SECRET)) {
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

function isValidServiceToken(clientId: string, clientSecret: string, env: Env): boolean {
  if (!env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) return false;
  return constantTimeEqual(clientId, env.CF_ACCESS_CLIENT_ID) && constantTimeEqual(clientSecret, env.CF_ACCESS_CLIENT_SECRET);
}

async function validateCfAccessJwt(token: string, env: Env): Promise<CfAccessIdentity | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as CfAccessIdentity;

    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || payload.exp < now || payload.iat > now + 60) return null;

    if (env.ACCESS_AUD) {
      const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!audList.includes(env.ACCESS_AUD)) return null;
    }

    if (env.ACCESS_TEAM_DOMAIN && payload.iss && !payload.iss.includes(env.ACCESS_TEAM_DOMAIN)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export function requireGroup(auth: AuthContext, group: string): boolean {
  return auth.groups.includes(group) || auth.groups.includes('admin');
}
