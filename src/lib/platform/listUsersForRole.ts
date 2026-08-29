import { apiBaseUrl, apiHeaders } from './config';
import type { AdminUserRow } from './authProvider';
import type { UserRole } from './roles';
import { getAuthProvider } from './getAuthProvider';

/** Load users for team assignment dropdowns (by role). */
export async function listUsersForRole(role: UserRole): Promise<AdminUserRow[]> {
  const provider = getAuthProvider();
  if (provider.id === 'remote') {
    const res = await fetch(`${apiBaseUrl()}/api/users?role=${encodeURIComponent(role)}`, {
      headers: apiHeaders(),
    });
    if (!res.ok) {
      // Fall back to admin list when signed in as system admin.
      if (provider.listUsers) {
        const all = await provider.listUsers(role);
        return all.filter((u) => u.role === role);
      }
      throw new Error('Could not load users.');
    }
    const body = (await res.json()) as { items?: AdminUserRow[] };
    return (body.items ?? []).filter((u) => u.role === role);
  }
  if (!provider.listUsers) return [];
  const all = await provider.listUsers();
  return all.filter((u) => u.role === role);
}
