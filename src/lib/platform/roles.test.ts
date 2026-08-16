import { describe, expect, it } from 'vitest';
import {
  canEditTradeRates,
  canManageEstimates,
  canManageUsers,
  normalizeRole,
  roleRank,
} from './roles';

describe('roles', () => {
  it('normalizes legacy user to designer', () => {
    expect(normalizeRole(undefined)).toBe('designer');
    expect(normalizeRole('user')).toBe('designer');
    expect(normalizeRole('estimator')).toBe('estimator');
    expect(normalizeRole('system_admin')).toBe('system_admin');
  });

  it('gates user management to system admins', () => {
    expect(canManageUsers('system_admin')).toBe(true);
    expect(canManageUsers('admin')).toBe(false);
    expect(canManageUsers('designer')).toBe(false);
  });

  it('lets estimators edit rates and estimates', () => {
    expect(canEditTradeRates('estimator')).toBe(true);
    expect(canEditTradeRates('designer')).toBe(false);
    expect(canManageEstimates('admin')).toBe(true);
  });

  it('orders role rank', () => {
    expect(roleRank('system_admin')).toBeGreaterThan(roleRank('admin'));
    expect(roleRank('admin')).toBeGreaterThan(roleRank('estimator'));
    expect(roleRank('estimator')).toBeGreaterThan(roleRank('designer'));
  });
});
