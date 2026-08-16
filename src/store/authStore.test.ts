import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './authStore';
import { DEMO_LOGIN } from '../lib/platform/localAuthProvider';

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    },
    configurable: true,
  });
}

describe('auth session gate', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    useAuthStore.setState({
      user: null,
      token: null,
      sessionReady: false,
    });
  });

  it('login establishes a user session', async () => {
    const result = await useAuthStore.getState().login(DEMO_LOGIN.email, DEMO_LOGIN.password);
    expect(result.ok).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe(DEMO_LOGIN.email);
    expect(useAuthStore.getState().sessionReady).toBe(true);
  });

  it('logout clears the session so pages must re-auth', async () => {
    await useAuthStore.getState().login(DEMO_LOGIN.email, DEMO_LOGIN.password);
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().sessionReady).toBe(true);
  });

  it('restoreSession marks the gate ready for local auth', async () => {
    await useAuthStore.getState().restoreSession();
    expect(useAuthStore.getState().sessionReady).toBe(true);
  });
});
