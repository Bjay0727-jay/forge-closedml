import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, getRoles } from '../src/middleware/rbac.ts';
import type { AuthContext } from '../src/middleware/auth.ts';

const viewer: AuthContext = { identity: 'u1', email: null, method: 'cf-access', groups: [] };
const operator: AuthContext = { identity: 'u2', email: null, method: 'cf-access', groups: ['ml-operator'] };
const approver: AuthContext = { identity: 'u3', email: null, method: 'cf-access', groups: ['ml-approver'] };
const admin: AuthContext = { identity: 'u4', email: null, method: 'cf-access', groups: ['admin'] };
const service: AuthContext = { identity: 'svc', email: null, method: 'service-token', groups: ['service'] };

test('maps roles from auth groups', () => {
  assert.deepEqual(getRoles(viewer), ['viewer']);
  assert.deepEqual(getRoles(operator), ['operator']);
  assert.deepEqual(getRoles(approver), ['approver']);
  assert.deepEqual(getRoles(admin), ['admin']);
  assert.deepEqual(getRoles(service), ['service']);
});

test('enforces permissions by role', () => {
  assert.equal(hasPermission(viewer, 'models:read'), true);
  assert.equal(hasPermission(viewer, 'models:write'), false);

  assert.equal(hasPermission(operator, 'models:write'), true);
  assert.equal(hasPermission(operator, 'models:promote'), false);

  assert.equal(hasPermission(approver, 'models:promote'), true);
  assert.equal(hasPermission(service, 'endpoints:health'), true);
  assert.equal(hasPermission(service, 'models:write'), false);
});
