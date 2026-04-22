import type { AuthContext } from './auth';

export type Role = 'viewer' | 'operator' | 'approver' | 'admin' | 'service';

export type Permission =
  | 'models:read'
  | 'models:write'
  | 'models:promote'
  | 'endpoints:read'
  | 'endpoints:write'
  | 'endpoints:health'
  | 'audit:read'
  | 'inference:invoke';

const rolePermissions: Record<Role, Permission[]> = {
  viewer: ['models:read', 'endpoints:read', 'audit:read'],
  operator: ['models:read', 'models:write', 'endpoints:read', 'endpoints:write', 'endpoints:health', 'audit:read', 'inference:invoke'],
  approver: ['models:read', 'models:promote', 'audit:read', 'endpoints:read'],
  admin: ['models:read', 'models:write', 'models:promote', 'endpoints:read', 'endpoints:write', 'endpoints:health', 'audit:read', 'inference:invoke'],
  service: ['inference:invoke', 'endpoints:health'],
};

export function getRoles(auth: AuthContext): Role[] {
  if (auth.method === 'service-token') return ['service'];

  const groups = new Set(auth.groups || []);
  const roles: Role[] = [];

  if (groups.has('admin')) roles.push('admin');
  if (groups.has('ml-operator')) roles.push('operator');
  if (groups.has('ml-approver')) roles.push('approver');
  if (!roles.length) roles.push('viewer');

  return roles;
}

export function hasPermission(auth: AuthContext, permission: Permission): boolean {
  const roles = getRoles(auth);
  return roles.some((role) => rolePermissions[role].includes(permission));
}
