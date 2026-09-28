/** Shared login id helpers — username "Craftsmen" → craftsmen@mahnikka.local */

const LOCAL_DOMAIN = 'mahnikka.local';
const OLSEN_DOMAIN = 'olsencustomhomes.com';

/** Normalize email or bare username to a preferred stored account key. */
export function normalizeLoginId(raw: string): string {
  const candidates = loginIdCandidates(raw);
  return candidates[0] ?? '';
}

/**
 * Bare usernames try Olsen email first, then local demo domain.
 * e.g. tragno → tragno@olsencustomhomes.com, then tragno@mahnikka.local
 */
export function loginIdCandidates(raw: string): string[] {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!value) return [];
  if (value.includes('@')) return [value];
  return [`${value}@${OLSEN_DOMAIN}`, `${value}@${LOCAL_DOMAIN}`];
}

/** Pick the first candidate that exists in the account map. */
export function resolveLoginId(
  raw: string,
  users: Record<string, unknown> | null | undefined,
): string {
  const candidates = loginIdCandidates(raw);
  if (!candidates.length) return '';
  if (!users) return candidates[0]!;
  for (const id of candidates) {
    if (users[id]) return id;
  }
  return candidates[0]!;
}

/** True when account.expiresAt is set and is in the past. */
export function isAccountExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t < now;
}

export const GUEST_ACCOUNT_EXPIRED_MESSAGE =
  'This guest account has expired. Access ended on December 31, 2026.';

/** Builder20 demo login — valid through end of 2026. */
export const CRAFTSMEN_GUEST = {
  email: 'craftsmen@mahnikka.local',
  id: '00000000-0000-4000-8000-000000000006',
  name: 'Craftsmen',
  password: 'Ericsthebest',
  role: 'client_viewer' as const,
  /** Inclusive through Dec 31, 2026 (UTC). */
  expiresAt: '2026-12-31T23:59:59.999Z',
};
