import type { RoomType, UnitSystem } from '../types';
import type { BidSettings, ChangeOrderRecord, EstimateSnapshot, VendorQuote } from './estimateSnapshot';
import { apiBaseUrl, apiHeaders, isCloudPersistHttp } from './platform/config';

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
    /** Latest frozen estimate on save. */
    estimateSnapshot?: EstimateSnapshot | null;
    /** Locked baseline for change orders. */
    baselineEstimate?: EstimateSnapshot | null;
    /** Numbered CO records minted while estimating. */
    changeOrders?: ChangeOrderRecord[];
    vendorQuotes?: VendorQuote[];
    bidSettings?: BidSettings;
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

function designsHttpEnabled() {
  return isCloudPersistHttp();
}

async function pushDesignRemote(entry: SharedDesign) {
  if (!designsHttpEnabled()) return;
  try {
    const res = await fetch(`${apiBaseUrl()}/api/designs/${encodeURIComponent(entry.code)}`, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify({ name: entry.name, payload: entry.payload }),
    });
    if (!res.ok) console.warn('Design remote save failed', res.status);
  } catch (err) {
    console.warn('Design remote save failed', err);
  }
}

async function deleteDesignRemote(code: string) {
  if (!designsHttpEnabled()) return;
  try {
    await fetch(`${apiBaseUrl()}/api/designs/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    });
  } catch (err) {
    console.warn('Design remote delete failed', err);
  }
}

/** Pull server designs into localStorage (merge by updatedAt). */
export async function hydrateDesignsFromRemote(): Promise<SharedDesign[]> {
  if (!designsHttpEnabled()) return listSharedDesigns();
  try {
    const res = await fetch(`${apiBaseUrl()}/api/designs`, { headers: apiHeaders() });
    if (!res.ok) return listSharedDesigns();
    const body = (await res.json()) as {
      items?: Array<{
        code: string;
        name: string;
        payload: SharedDesign['payload'];
        createdAt?: string;
        updatedAt?: string;
      }>;
    };
    const map = readMap();
    for (const item of body.items ?? []) {
      const code = String(item.code || '').toUpperCase();
      if (!code || !item.payload) continue;
      const existing = map[code];
      const remoteUpdated = item.updatedAt ?? item.createdAt ?? '';
      const localUpdated = existing?.updatedAt ?? existing?.createdAt ?? '';
      if (!existing || remoteUpdated >= localUpdated) {
        map[code] = {
          code,
          name: item.name || 'Untitled',
          createdAt: item.createdAt ?? existing?.createdAt ?? remoteUpdated,
          updatedAt: remoteUpdated || existing?.updatedAt,
          payload: item.payload,
        };
      }
    }
    writeMap(map);
  } catch (err) {
    console.warn('Design remote hydrate failed', err);
  }
  return listSharedDesigns();
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
  void pushDesignRemote(entry);
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

/** Async load — checks localStorage first, then Neon when cloud persist is on. */
export async function loadSharedDesignAsync(code: string): Promise<SharedDesign | null> {
  const local = loadSharedDesign(code);
  if (local || !designsHttpEnabled()) return local;
  try {
    const res = await fetch(`${apiBaseUrl()}/api/designs/${encodeURIComponent(code.trim().toUpperCase())}`, {
      headers: apiHeaders(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as SharedDesign & { payload: SharedDesign['payload'] };
    if (!body?.payload) return null;
    const entry: SharedDesign = {
      code: String(body.code || code).toUpperCase(),
      name: body.name || 'Untitled',
      createdAt: body.createdAt ?? new Date().toISOString(),
      updatedAt: body.updatedAt,
      payload: body.payload,
    };
    const map = readMap();
    map[entry.code] = entry;
    writeMap(map);
    return entry;
  } catch {
    return null;
  }
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
  void deleteDesignRemote(code.trim().toUpperCase());
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
