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

/**
 * Prompt for each required cookie VALUE (names are fixed).
 * Returns the assembled cookie header, or null if the user cancels.
 */
export function promptForBtCookieValues(reason?: string): string | null {
  const promptFn = typeof globalThis.prompt === 'function' ? globalThis.prompt.bind(globalThis) : null;
  if (!promptFn) return null;

  const intro =
    (reason ? `${reason}\n\n` : '') +
    'Chrome: open your logged-in Buildertrend tab → F12 → Application → Cookies → https://buildertrend.net\n' +
    'For each cookie below, copy only the Value column (not the name).\n' +
    'Cancel any prompt to abort.';

  // Show the overview once (OK / Cancel). Empty default keeps paste easy on next prompts.
  const start = promptFn(intro + `\n\nClick OK, then paste values for:\n• ${REQUIRED_BT_COOKIE_NAMES.join('\n• ')}`, '');
  if (start === null) return null;

  const values: Partial<Record<RequiredBtCookieName, string>> = {};
  for (const name of REQUIRED_BT_COOKIE_NAMES) {
    const value = promptFn(
      `Paste the VALUE only for:\n\n${name}\n\n(Chrome → Application → Cookies → buildertrend.net → ${name} → Value)`,
      '',
    )?.trim();
    if (!value) return null;
    values[name] = value;
  }

  const header = buildCookieHeader(values);
  return header || null;
}
