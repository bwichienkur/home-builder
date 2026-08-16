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

  it('local auth accepts the demo account', async () => {
    const auth = new LocalAuthProvider();
    const result = await auth.login(DEMO_LOGIN.email, DEMO_LOGIN.password);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.email).toBe(DEMO_LOGIN.email);
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
