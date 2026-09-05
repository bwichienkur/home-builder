import type { CadPlate } from './types';

const STORAGE_KEY = 'olsen-cad-studio-autosave-v1';
const SAVE_VERSION = 1 as const;

export type CadAutosavePayload = {
  version: typeof SAVE_VERSION;
  savedAt: string;
  plate: CadPlate;
};

export function loadCadAutosave(): CadAutosavePayload | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CadAutosavePayload;
    if (parsed?.version !== SAVE_VERSION || !parsed.plate?.wallCenterlines) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCadAutosave(plate: CadPlate): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const payload: CadAutosavePayload = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      plate,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Quota or private mode — keep working in memory.
    return false;
  }
}

export function clearCadAutosave(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function formatCadAutosaveTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
