import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BT_COOKIE_STORAGE_KEY,
  REQUIRED_BT_COOKIE_NAMES,
  buildCookieHeader,
  clearStoredBtCookie,
  isAuthRefreshFailure,
  loadStoredBtCookie,
  sanitizeCookieValue,
  storeBtCookie,
} from './cookieSession';

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryLocalStorage(),
    configurable: true,
  });
});

afterEach(() => {
  clearStoredBtCookie();
});

describe('cookieSession', () => {
  it('requires Auth0 + session only — GAESA is optional', () => {
    expect([...REQUIRED_BT_COOKIE_NAMES]).toEqual([
      '.AspNetCore.Auth0Cookie',
      'ASP.NET_SessionId',
    ]);
  });

  it('builds a cookie header without GAESA when omitted', () => {
    expect(
      buildCookieHeader({
        '.AspNetCore.Auth0Cookie': 'auth-token',
        'ASP.NET_SessionId': 'session',
        '.AspNetCore.Auth0CookieC1': 'chunk1',
      }),
    ).toBe(
      '.AspNetCore.Auth0Cookie=auth-token; ASP.NET_SessionId=session; .AspNetCore.Auth0CookieC1=chunk1',
    );
  });

  it('includes GAESA when pasted', () => {
    expect(
      buildCookieHeader({
        '.AspNetCore.Auth0Cookie': 'auth-token',
        'ASP.NET_SessionId': 'session',
        GAESA: 'gaesa',
        '.AspNetCore.Auth0CookieC1': 'chunk1',
        '.AspNetCore.Auth0CookieC2': 'chunk2',
      }),
    ).toBe(
      '.AspNetCore.Auth0Cookie=auth-token; ASP.NET_SessionId=session; GAESA=gaesa; .AspNetCore.Auth0CookieC1=chunk1; .AspNetCore.Auth0CookieC2=chunk2',
    );
  });

  it('stores and loads the cookie header', () => {
    storeBtCookie('  .AspNetCore.Auth0Cookie=a; ASP.NET_SessionId=b; .AspNetCore.Auth0CookieC1=d  ');
    expect(loadStoredBtCookie()).toBe(
      '.AspNetCore.Auth0Cookie=a; ASP.NET_SessionId=b; .AspNetCore.Auth0CookieC1=d',
    );
    expect(localStorage.getItem(BT_COOKIE_STORAGE_KEY)).toContain('ASP.NET_SessionId=b');
    clearStoredBtCookie();
    expect(loadStoredBtCookie()).toBeNull();
  });

  it('detects auth refresh failure codes', () => {
    expect(isAuthRefreshFailure('cookie_rejected')).toBe(true);
    expect(isAuthRefreshFailure('ok')).toBe(false);
  });

  it('sanitizes pasted cookie values', () => {
    expect(sanitizeCookieValue('GAESA', '  "abc"  ')).toBe('abc');
    expect(
      sanitizeCookieValue('.AspNetCore.Auth0Cookie', '.AspNetCore.Auth0Cookie=token-value'),
    ).toBe('token-value');
  });
});
