import { describe, expect, it, beforeEach } from 'vitest';
import { platformConfig } from './config';
import { getAuthProvider, resetAuthProviderCache } from './getAuthProvider';
import { getCrmProvider, resetCrmProviderCache } from './getCrmProvider';
import { LocalAuthProvider, DEMO_LOGIN } from './localAuthProvider';
import { LocalCrmProvider } from './localCrmProvider';

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  const memory = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

describe('platform providers ($0 defaults)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetAuthProviderCache();
    resetCrmProviderCache();
    localStorage.clear();
  });

  it('defaults to local auth and local CRM', () => {
    expect(platformConfig.authProvider).toBe('local');
    expect(platformConfig.crmProvider).toBe('local');
    expect(getAuthProvider()).toBeInstanceOf(LocalAuthProvider);
    expect(getCrmProvider()).toBeInstanceOf(LocalCrmProvider);
  });

  it('local auth accepts the demo account as system admin', async () => {
    const auth = new LocalAuthProvider();
    const result = await auth.login(DEMO_LOGIN.email, DEMO_LOGIN.password);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe(DEMO_LOGIN.email);
      expect(result.user.role).toBe('system_admin');
    }
  });

  it('lists users, assigns roles, and issues API keys', async () => {
    const auth = new LocalAuthProvider();
    await auth.register('vendor@example.com', 'secret12', 'Vendor Co');
    const listed = await auth.listUsers!('vendor');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.role).toBe('designer');

    const roleResult = await auth.setUserRole!(listed[0]!.id, 'admin');
    expect(roleResult.ok).toBe(true);
    expect((await auth.listUsers!('vendor'))[0]?.role).toBe('admin');

    const created = await auth.createApiKey!(listed[0]!.id, 'ERP sync');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.key.startsWith('mnk_')).toBe(true);
    const keys = await auth.listApiKeys!(listed[0]!.id);
    expect(keys.some((k) => k.label === 'ERP sync' && !k.revokedAt)).toBe(true);
    await auth.revokeApiKey!(listed[0]!.id, created.meta.id);
    expect((await auth.listApiKeys!(listed[0]!.id)).find((k) => k.id === created.meta.id)?.revokedAt).toBeTruthy();
  });

  it('local CRM round-trips a snapshot', async () => {
    const crm = new LocalCrmProvider();
    await crm.save({
      clients: [
        {
          id: 'c1',
          name: 'Ada',
          email: '',
          phone: '',
          company: '',
          address: '',
          notes: '',
          customFields: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archived: false,
        },
      ],
      vendors: [],
      inventory: [],
      customFields: [],
      housePlans: [],
    });
    const loaded = await crm.load();
    expect(loaded.clients).toHaveLength(1);
    expect(loaded.clients[0]?.name).toBe('Ada');
  });
});
