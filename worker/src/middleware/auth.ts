import { Env, CfAccessIdentity } from '../types';

export interface AuthContext {
  identity: string;
  email: string | null;
  method: 'cf-access' | 'service-token' | 'api-key';
  groups: string[];
}

interface JwtParts {
  header: Record<string, unknown>;
  payload: CfAccessIdentity;
  signedContent: string;
  signature: Uint8Array;
}

let cachedJwks: { url: string; expiresAt: number; keys: JsonWebKey[] } | null = null;

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
  const jwt = parseJwt(token);
  if (!jwt) return null;

  if (!validateJwtClaims(jwt.payload, env)) return null;

  const jwksUrl = getJwksUrl(env);
  if (!jwksUrl) return null;

  const verified = await verifyJwtSignature(jwt, jwksUrl);
  return verified ? jwt.payload : null;
}

export function validateJwtClaims(payload: CfAccessIdentity, env: Env): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || !payload.exp || !payload.iat) return false;
  if (payload.exp < now || payload.iat > now + 60) return false;

  if (env.ACCESS_AUD) {
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audList.includes(env.ACCESS_AUD)) return false;
  }

  if (env.ACCESS_TEAM_DOMAIN && payload.iss && !payload.iss.includes(env.ACCESS_TEAM_DOMAIN)) {
    return false;
  }

  return true;
}

function parseJwt(token: string): JwtParts | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(base64UrlDecodeToString(parts[0])) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlDecodeToString(parts[1])) as CfAccessIdentity;
    const signature = base64UrlDecode(parts[2]);
    return {
      header,
      payload,
      signedContent: `${parts[0]}.${parts[1]}`,
      signature,
    };
  } catch {
    return null;
  }
}

function getJwksUrl(env: Env): string | null {
  if (env.ACCESS_JWKS_URL) return env.ACCESS_JWKS_URL;
  if (env.ACCESS_TEAM_DOMAIN) return `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  return null;
}

async function verifyJwtSignature(jwt: JwtParts, jwksUrl: string): Promise<boolean> {
  if (jwt.header.alg !== 'RS256') return false;

  const keys = await fetchJwks(jwksUrl);
  const kid = typeof jwt.header.kid === 'string' ? jwt.header.kid : null;
  const candidateKeys = kid ? keys.filter((k) => (k as unknown as { kid?: string }).kid === kid) : keys;

  const encoder = new TextEncoder();
  for (const jwk of candidateKeys) {
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const ok = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        jwt.signature,
        encoder.encode(jwt.signedContent)
      );
      if (ok) return true;
    } catch {
      // try next key
    }
  }

  return false;
}

async function fetchJwks(url: string): Promise<JsonWebKey[]> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.url === url && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Unable to fetch JWKS: ${res.status}`);
  const data = await res.json() as { keys?: JsonWebKey[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];

  cachedJwks = {
    url,
    keys,
    expiresAt: now + 5 * 60 * 1000,
  };

  return keys;
}

function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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
