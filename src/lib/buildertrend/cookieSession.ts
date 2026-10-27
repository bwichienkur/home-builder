/** Browser-stored Buildertrend session cookie (reuse until refresh auth fails). */

export const BT_COOKIE_STORAGE_KEY = 'mahnikka-bt-cookie';

/**
 * Auth cookies required after Buildertrend’s Auth0 → ASP.NET Core migration.
 * `.AspNet.Auth0` was replaced by chunked `.AspNetCore.Auth0Cookie*` cookies.
 * `GAESA` is no longer always issued on login — treat it as optional.
 */
export const REQUIRED_BT_COOKIE_NAMES = [
  '.AspNetCore.Auth0Cookie',
  'ASP.NET_SessionId',
] as const;

/** Paste when listed in DevTools — not every login issues all of these. */
export const OPTIONAL_BT_COOKIE_NAMES = [
  'GAESA',
  '.AspNetCore.Auth0CookieC1',
  '.AspNetCore.Auth0CookieC2',
] as const;

export const BT_COOKIE_FIELD_NAMES = [
  ...REQUIRED_BT_COOKIE_NAMES,
  ...OPTIONAL_BT_COOKIE_NAMES,
] as const;

export type RequiredBtCookieName = (typeof REQUIRED_BT_COOKIE_NAMES)[number];
export type OptionalBtCookieName = (typeof OPTIONAL_BT_COOKIE_NAMES)[number];
export type BtCookieFieldName = (typeof BT_COOKIE_FIELD_NAMES)[number];

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
export function buildCookieHeader(
  values: Partial<Record<BtCookieFieldName, string>>,
): string {
  return BT_COOKIE_FIELD_NAMES.map((name) => {
    const value = sanitizeCookieValue(name, values[name]);
    return value ? `${name}=${value}` : '';
  })
    .filter(Boolean)
    .join('; ');
}

/**
 * Normalize a pasted cookie value: trim, strip wrapping quotes, and drop a
 * duplicated `Name=` prefix if the user pasted name+value together.
 */
export function sanitizeCookieValue(name: BtCookieFieldName, raw: string | undefined): string {
  let value = String(raw ?? '').trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  const prefix = `${name}=`;
  if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
    value = value.slice(prefix.length).trim();
  }
  return value;
}

export function isAuthRefreshFailure(code: string | undefined) {
  return code === 'credentials_missing' || code === 'login_failed' || code === 'cookie_rejected';
}

/** Human-readable label for cookie paste errors / cron docs. */
export const BT_COOKIE_NAMES_HINT =
  '.AspNetCore.Auth0Cookie (+ C1/C2 if present), ASP.NET_SessionId, and GAESA when listed';
