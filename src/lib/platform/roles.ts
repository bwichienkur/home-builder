export const USER_ROLES = ['user', 'admin', 'system_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  admin: 'Admin',
  system_admin: 'System admin',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): UserRole {
  return isUserRole(value) ? value : 'user';
}

/** System admins manage users/API keys; admins can use staff tools; users are standard. */
export function canManageUsers(role: UserRole | undefined | null): boolean {
  return role === 'system_admin';
}

/** Admins and system admins may edit the shared trade rate book. */
export function canEditTradeRates(role: UserRole | undefined | null): boolean {
  return role === 'admin' || role === 'system_admin';
}

export function roleRank(role: UserRole): number {
  switch (role) {
    case 'system_admin':
      return 3;
    case 'admin':
      return 2;
    default:
      return 1;
  }
}
