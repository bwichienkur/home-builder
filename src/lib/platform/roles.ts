export const USER_ROLES = ['designer', 'estimator', 'admin', 'system_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  designer: 'Designer',
  estimator: 'Estimator',
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

/** Estimators and admins may edit the shared trade rate book. */
export function canEditTradeRates(role: UserRole | undefined | null): boolean {
  return role === 'estimator' || role === 'admin' || role === 'system_admin';
}

/** Authenticated users can edit plan geometry. */
export function canEditPlan(role: UserRole | undefined | null): boolean {
  return Boolean(role);
}

/** Estimators lock baselines / mint change orders. */
export function canManageEstimates(role: UserRole | undefined | null): boolean {
  return canEditTradeRates(role);
}

export function roleRank(role: UserRole): number {
  switch (role) {
    case 'system_admin':
      return 4;
    case 'admin':
      return 3;
    case 'estimator':
      return 2;
    case 'designer':
    default:
      return 1;
  }
}
