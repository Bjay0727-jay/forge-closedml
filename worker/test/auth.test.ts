import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJwtClaims } from '../src/middleware/auth.ts';

const now = Math.floor(Date.now() / 1000);

const env: any = {
  ACCESS_AUD: 'expected-aud',
  ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
};

test('accepts valid JWT claims', () => {
  const ok = validateJwtClaims({
    sub: 'user-1',
    email: 'u@example.com',
    aud: 'expected-aud',
    iss: 'https://example.cloudflareaccess.com',
    iat: now - 10,
    exp: now + 120,
  }, env);
  assert.equal(ok, true);
});

test('rejects invalid audience and expired token', () => {
  const badAud = validateJwtClaims({
    sub: 'user-1',
    aud: 'wrong-aud',
    iss: 'https://example.cloudflareaccess.com',
    iat: now - 10,
    exp: now + 120,
  }, env);

  const expired = validateJwtClaims({
    sub: 'user-1',
    aud: 'expected-aud',
    iss: 'https://example.cloudflareaccess.com',
    iat: now - 1000,
    exp: now - 1,
  }, env);

  assert.equal(badAud, false);
  assert.equal(expired, false);
});
