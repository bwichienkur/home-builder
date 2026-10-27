import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BT_COOKIE_STORAGE_KEY,
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
  it('builds a cookie header from required + optional Auth0 chunks', () => {
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

  it('omits empty optional Auth0 chunks', () => {
    expect(
      buildCookieHeader({
        '.AspNetCore.Auth0Cookie': 'auth-token',
        'ASP.NET_SessionId': 'session',
        GAESA: 'gaesa',
      }),
    ).toBe('.AspNetCore.Auth0Cookie=auth-token; ASP.NET_SessionId=session; GAESA=gaesa');
  });

  it('stores and loads the cookie header', () => {
    storeBtCookie(
      '  .AspNetCore.Auth0Cookie=a; ASP.NET_SessionId=b; GAESA=c; .AspNetCore.Auth0CookieC1=d  ',
    );
    expect(loadStoredBtCookie()).toBe(
      '.AspNetCore.Auth0Cookie=a; ASP.NET_SessionId=b; GAESA=c; .AspNetCore.Auth0CookieC1=d',
    );
    expect(localStorage.getItem(BT_COOKIE_STORAGE_KEY)).toContain('GAESA=c');
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
    expect(
      sanitizeCookieValue('.AspNetCore.Auth0CookieC1', '.AspNetCore.Auth0CookieC1=chunk'),
    ).toBe('chunk');
  });
});
