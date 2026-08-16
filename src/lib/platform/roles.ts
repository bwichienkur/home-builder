export const USER_ROLES = ['designer', 'estimator', 'pm', 'client_viewer', 'admin', 'system_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  designer: 'Designer',
  estimator: 'Estimator',
  pm: 'Project manager',
  client_viewer: 'Client viewer',
  admin: 'Admin',
  system_admin: 'System admin',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): UserRole {
  if (value === 'user') return 'designer';
  return isUserRole(value) ? value : 'designer';
}

/** System admins manage users/API keys; admins can use staff tools. */
export function canManageUsers(role: UserRole | undefined | null): boolean {
  return role === 'system_admin';
}

/** Estimators, PMs, and admins may edit the shared trade rate book. */
export function canEditTradeRates(role: UserRole | undefined | null): boolean {
  return role === 'estimator' || role === 'pm' || role === 'admin' || role === 'system_admin';
}

/** Authenticated staff can edit plan geometry (not client viewers). */
export function canEditPlan(role: UserRole | undefined | null): boolean {
  return Boolean(role) && role !== 'client_viewer';
}

/** Estimators / PMs lock baselines, mint COs, export bid packages. */
export function canManageEstimates(role: UserRole | undefined | null): boolean {
  return canEditTradeRates(role);
}

/** Clients and staff can view estimate totals; only staff manage them. */
export function canViewEstimates(role: UserRole | undefined | null): boolean {
  return Boolean(role);
}

export function roleRank(role: UserRole): number {
  switch (role) {
    case 'system_admin':
      return 5;
    case 'admin':
      return 4;
    case 'pm':
      return 3;
    case 'estimator':
      return 2;
    case 'designer':
      return 1;
    case 'client_viewer':
    default:
      return 0;
  }
}
