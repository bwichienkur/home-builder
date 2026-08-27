/** Browser-stored Buildertrend session cookie (reuse until refresh auth fails). */

export const BT_COOKIE_STORAGE_KEY = 'mahnikka-bt-cookie';

/** Auth cookies required for the read-only Buildertrend pull. */
export const REQUIRED_BT_COOKIE_NAMES = ['.AspNet.Auth0', 'ASP.NET_SessionId', 'GAESA'] as const;

export type RequiredBtCookieName = (typeof REQUIRED_BT_COOKIE_NAMES)[number];

export function loadStoredBtCookie(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BT_COOKIE_STORAGE_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function storeBtCookie(cookie: string) {
  if (typeof localStorage === 'undefined') return;
  const trimmed = cookie.trim();
  if (!trimmed) return;
  localStorage.setItem(BT_COOKIE_STORAGE_KEY, trimmed);
}

export function clearStoredBtCookie() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(BT_COOKIE_STORAGE_KEY);
}

/** Build `name=value; name=value` from a name→value map (skips empty values). */
export function buildCookieHeader(values: Partial<Record<RequiredBtCookieName, string>>): string {
  return REQUIRED_BT_COOKIE_NAMES.map((name) => {
    const value = values[name]?.trim();
    return value ? `${name}=${value}` : '';
  })
    .filter(Boolean)
    .join('; ');
}

export function isAuthRefreshFailure(code: string | undefined) {
  return code === 'credentials_missing' || code === 'login_failed';
}
