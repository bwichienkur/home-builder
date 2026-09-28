import { beforeEach, describe, expect, it } from 'vitest';
import {
  CRAFTSMEN_GUEST,
  GUEST_ACCOUNT_EXPIRED_MESSAGE,
  isAccountExpired,
  loginIdCandidates,
  normalizeLoginId,
  resolveLoginId,
} from './loginIdentity';
import { LocalAuthProvider } from './localAuthProvider';

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

describe('loginIdentity', () => {
  it('prefers Olsen domain for bare usernames, then local demo domain', () => {
    expect(loginIdCandidates('tragno')).toEqual([
      'tragno@olsencustomhomes.com',
      'tragno@mahnikka.local',
    ]);
    expect(normalizeLoginId('Craftsmen')).toBe('craftsmen@olsencustomhomes.com');
    expect(normalizeLoginId('craftsmen@mahnikka.local')).toBe('craftsmen@mahnikka.local');
  });

  it('resolves bare usernames to the matching stored account', () => {
    expect(resolveLoginId('Craftsmen', { 'craftsmen@mahnikka.local': {} })).toBe(
      'craftsmen@mahnikka.local',
    );
    expect(resolveLoginId('tragno', { 'tragno@olsencustomhomes.com': {} })).toBe(
      'tragno@olsencustomhomes.com',
    );
    expect(resolveLoginId('eolsen', { 'eolsen@olsencustomhomes.com': {} })).toBe(
      'eolsen@olsencustomhomes.com',
    );
  });

  it('detects expired accounts', () => {
    expect(isAccountExpired(undefined)).toBe(false);
    expect(isAccountExpired('2099-01-01T00:00:00.000Z')).toBe(false);
    expect(isAccountExpired('2020-01-01T00:00:00.000Z')).toBe(true);
    expect(isAccountExpired(CRAFTSMEN_GUEST.expiresAt, Date.parse('2027-01-01T00:00:00.000Z'))).toBe(
      true,
    );
    expect(GUEST_ACCOUNT_EXPIRED_MESSAGE).toContain('December 31, 2026');
  });
});

describe('Craftsmen guest account (local)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
  });

  it('logs in with username Craftsmen before expiry', async () => {
    const auth = new LocalAuthProvider();
    const result = await auth.login('Craftsmen', CRAFTSMEN_GUEST.password);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe(CRAFTSMEN_GUEST.email);
      expect(result.user.role).toBe('client_viewer');
      expect(result.user.name).toBe('Craftsmen');
    }
  });

  it('rejects a non-seed account past expiresAt', async () => {
    const auth = new LocalAuthProvider();
    const email = 'temp-guest@mahnikka.local';
    const password = 'tempguest1';
    await auth.register(email, password, 'Temp Guest');
    const key = 'mahnikka-local-accounts-v1';
    const accounts = JSON.parse(localStorage.getItem(key) ?? '{}');
    accounts[email] = { ...accounts[email], expiresAt: '2020-06-01T00:00:00.000Z' };
    localStorage.setItem(key, JSON.stringify(accounts));
    const result = await auth.login(email, password);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(GUEST_ACCOUNT_EXPIRED_MESSAGE);
  });
});

describe('Olsen staff admins (local)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
  });

  it('logs in Trevor and Eric as system_admin with short usernames', async () => {
    const auth = new LocalAuthProvider();
    for (const account of [
      { login: 'tragno', email: 'tragno@olsencustomhomes.com', name: 'Trevor Ragno' },
      { login: 'eolsen', email: 'eolsen@olsencustomhomes.com', name: 'Eric Olsen' },
    ]) {
      const result = await auth.login(account.login, 'Password123!');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user.email).toBe(account.email);
        expect(result.user.role).toBe('system_admin');
        expect(result.user.name).toBe(account.name);
      }
    }
  });
});
