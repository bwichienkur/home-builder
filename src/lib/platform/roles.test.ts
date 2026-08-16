import { describe, expect, it } from 'vitest';
import {
  canEditPlan,
  canEditTradeRates,
  canManageEstimates,
  canManageUsers,
  canViewEstimates,
  normalizeRole,
  roleRank,
} from './roles';

describe('roles', () => {
  it('normalizes legacy user to designer', () => {
    expect(normalizeRole(undefined)).toBe('designer');
    expect(normalizeRole('user')).toBe('designer');
    expect(normalizeRole('estimator')).toBe('estimator');
    expect(normalizeRole('pm')).toBe('pm');
    expect(normalizeRole('client_viewer')).toBe('client_viewer');
    expect(normalizeRole('system_admin')).toBe('system_admin');
  });

  it('gates user management to system admins', () => {
    expect(canManageUsers('system_admin')).toBe(true);
    expect(canManageUsers('admin')).toBe(false);
    expect(canManageUsers('designer')).toBe(false);
  });

  it('lets estimators and PMs edit rates and estimates', () => {
    expect(canEditTradeRates('estimator')).toBe(true);
    expect(canEditTradeRates('pm')).toBe(true);
    expect(canEditTradeRates('designer')).toBe(false);
    expect(canEditTradeRates('client_viewer')).toBe(false);
    expect(canManageEstimates('admin')).toBe(true);
    expect(canEditPlan('client_viewer')).toBe(false);
    expect(canEditPlan('designer')).toBe(true);
    expect(canViewEstimates('client_viewer')).toBe(true);
  });

  it('orders role rank', () => {
    expect(roleRank('system_admin')).toBeGreaterThan(roleRank('admin'));
    expect(roleRank('admin')).toBeGreaterThan(roleRank('pm'));
    expect(roleRank('pm')).toBeGreaterThan(roleRank('estimator'));
    expect(roleRank('estimator')).toBeGreaterThan(roleRank('designer'));
    expect(roleRank('designer')).toBeGreaterThan(roleRank('client_viewer'));
  });
});
