import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  BT_COOKIE_STORAGE_KEY,
  buildCookieHeader,
  clearStoredBtCookie,
  isAuthRefreshFailure,
  loadStoredBtCookie,
  promptForBtCookieValues,
  storeBtCookie,
} from './cookieSession';

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

describe('cookieSession', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a cookie header from named values', () => {
    expect(
      buildCookieHeader({
        '.AspNet.Auth0': 'auth-token',
        'ASP.NET_SessionId': 'session',
        GAESA: 'gaesa',
      }),
    ).toBe('.AspNet.Auth0=auth-token; ASP.NET_SessionId=session; GAESA=gaesa');
  });

  it('stores and loads the cookie header', () => {
    storeBtCookie('  .AspNet.Auth0=a; ASP.NET_SessionId=b; GAESA=c  ');
    expect(loadStoredBtCookie()).toBe('.AspNet.Auth0=a; ASP.NET_SessionId=b; GAESA=c');
    expect(localStorage.getItem(BT_COOKIE_STORAGE_KEY)).toContain('GAESA=c');
    clearStoredBtCookie();
    expect(loadStoredBtCookie()).toBeNull();
  });

  it('detects auth refresh failure codes', () => {
    expect(isAuthRefreshFailure('credentials_missing')).toBe(true);
    expect(isAuthRefreshFailure('login_failed')).toBe(true);
    expect(isAuthRefreshFailure('not_running')).toBe(false);
  });

  it('prompts for each required cookie value in order', () => {
    const prompt = vi
      .fn()
      .mockReturnValueOnce('') // intro OK
      .mockReturnValueOnce('auth-val')
      .mockReturnValueOnce('session-val')
      .mockReturnValueOnce('gaesa-val');
    vi.stubGlobal('prompt', prompt);

    expect(promptForBtCookieValues('Session expired')).toBe(
      '.AspNet.Auth0=auth-val; ASP.NET_SessionId=session-val; GAESA=gaesa-val',
    );
    expect(prompt).toHaveBeenCalledTimes(4);
    expect(String(prompt.mock.calls[1]?.[0])).toContain('.AspNet.Auth0');
    expect(String(prompt.mock.calls[2]?.[0])).toContain('ASP.NET_SessionId');
    expect(String(prompt.mock.calls[3]?.[0])).toContain('GAESA');
  });

  it('returns null when the user cancels a value prompt', () => {
    const prompt = vi.fn().mockReturnValueOnce('').mockReturnValueOnce(null);
    vi.stubGlobal('prompt', prompt);
    expect(promptForBtCookieValues()).toBeNull();
  });
});
