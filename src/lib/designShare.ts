import type { RoomType, UnitSystem } from '../types';

const DESIGNS_KEY = 'roomcraft-designs-v1';
const RECOVERY_KEY = 'roomcraft-recovery-v1';

export type SharedDesign = {
  code: string;
  name: string;
  createdAt: string;
  /** Last save/share time; falls back to createdAt for older entries. */
  updatedAt?: string;
  payload: {
    version: number;
    roomType: RoomType;
    unitSystem: UnitSystem;
    activeFloorId: string;
    floors: unknown[];
    clientId?: string | null;
  };
};

const ACTIVE_DESIGN_KEY = 'roomcraft-active-design-code';

export function readActiveDesignCode() {
  try {
    return sessionStorage.getItem(ACTIVE_DESIGN_KEY)?.trim().toUpperCase() || null;
  } catch {
    return null;
  }
}

export function writeActiveDesignCode(code: string | null) {
  try {
    if (!code) sessionStorage.removeItem(ACTIVE_DESIGN_KEY);
    else sessionStorage.setItem(ACTIVE_DESIGN_KEY, code.trim().toUpperCase());
  } catch {
    /* ignore quota / private mode */
  }
}

function readMap(): Record<string, SharedDesign> {
  try {
    return JSON.parse(localStorage.getItem(DESIGNS_KEY) ?? '{}') as Record<string, SharedDesign>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, SharedDesign>) {
  localStorage.setItem(DESIGNS_KEY, JSON.stringify(map));
}

export function makeDesignCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

/** Create or update a saved build. Pass an existing code to overwrite that entry. */
export function upsertSharedDesign(name: string, payload: SharedDesign['payload'], code?: string) {
  const map = readMap();
  const resolved = (code ?? makeDesignCode()).trim().toUpperCase();
  const existing = map[resolved];
  const now = new Date().toISOString();
  const entry: SharedDesign = {
    code: resolved,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    payload,
  };
  map[resolved] = entry;
  writeMap(map);
  return entry;
}

/** @deprecated Prefer upsertSharedDesign — kept for callers that always mint a new code. */
export function saveSharedDesign(name: string, payload: SharedDesign['payload'], code = makeDesignCode()) {
  return upsertSharedDesign(name, payload, code);
}

export function loadSharedDesign(code: string) {
  const normalized = code.trim().toUpperCase();
  return readMap()[normalized] ?? null;
}

export function listSharedDesigns() {
  return Object.values(readMap()).sort((a, b) => {
    const aAt = a.updatedAt ?? a.createdAt;
    const bAt = b.updatedAt ?? b.createdAt;
    return bAt.localeCompare(aAt);
  });
}

export function deleteSharedDesign(code: string) {
  const map = readMap();
  delete map[code.trim().toUpperCase()];
  writeMap(map);
}

export function designShareUrl(code: string) {
  const url = new URL(location.href);
  url.searchParams.set('design', code);
  url.hash = '';
  return url.toString();
}

export function readDesignCodeFromLocation() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('design');
  if (fromQuery) return fromQuery.toUpperCase();
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('d/')) return hash.slice(2).toUpperCase();
  return null;
}

export function writeRecoverySnapshot(payload: unknown) {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), payload }));
}

export function readRecoverySnapshot<T = unknown>() {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { savedAt: string; payload: T };
  } catch {
    return null;
  }
}

export function clearRecoverySnapshot() {
  localStorage.removeItem(RECOVERY_KEY);
}
