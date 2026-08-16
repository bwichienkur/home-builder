import { describe, expect, it } from 'vitest';
import { canManageUsers, normalizeRole, roleRank } from './roles';

describe('roles', () => {
  it('normalizes unknown roles to user', () => {
    expect(normalizeRole(undefined)).toBe('user');
    expect(normalizeRole('system_admin')).toBe('system_admin');
  });

  it('gates user management to system admins', () => {
    expect(canManageUsers('system_admin')).toBe(true);
    expect(canManageUsers('admin')).toBe(false);
    expect(canManageUsers('user')).toBe(false);
  });

  it('orders role rank', () => {
    expect(roleRank('system_admin')).toBeGreaterThan(roleRank('admin'));
    expect(roleRank('admin')).toBeGreaterThan(roleRank('user'));
  });
});
