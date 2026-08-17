import { getProject, listProjects, saveProject, type CloudProjectSummary } from '../api/client';
import { platformConfig } from './platform/config';

const CLOUD_ID_KEY = 'mahnikka-cloud-project-id';
const CLOUD_VERSION_KEY = 'mahnikka-cloud-project-version';

export function readCloudProjectRef(): { id: string; version: number } | null {
  try {
    const id = localStorage.getItem(CLOUD_ID_KEY);
    const version = Number(localStorage.getItem(CLOUD_VERSION_KEY) || '0');
    if (!id || !version) return null;
    return { id, version };
  } catch {
    return null;
  }
}

export function writeCloudProjectRef(id: string, version: number) {
  try {
    localStorage.setItem(CLOUD_ID_KEY, id);
    localStorage.setItem(CLOUD_VERSION_KEY, String(version));
  } catch {
    /* ignore */
  }
}

export function clearCloudProjectRef() {
  try {
    localStorage.removeItem(CLOUD_ID_KEY);
    localStorage.removeItem(CLOUD_VERSION_KEY);
  } catch {
    /* ignore */
  }
}

export type CloudSaveResult =
  | { ok: true; mode: 'cloud'; id: string; version: number }
  | { ok: true; mode: 'local'; reason: string }
  | { ok: false; error: string };

/** Prefer cloud when VITE_API_URL is set; soft-fall back to local if API/DB is down.
 *  Cloud saves carry the full project payload (including estimate + change orders). */
export async function saveProjectToCloud(name: string, scene: unknown): Promise<CloudSaveResult> {
  if (!platformConfig.cloudConfigured()) {
    return { ok: true, mode: 'local', reason: 'No API configured (set VITE_API_URL)' };
  }
  try {
    const ref = readCloudProjectRef();
    const saved = await saveProject(ref?.id, name, scene, ref?.version ?? 1);
    writeCloudProjectRef(saved.id, saved.version);
    return { ok: true, mode: 'cloud', id: saved.id, version: saved.version };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cloud save failed';
    if (/DATABASE_URL|503|Failed to fetch|NetworkError|could not be saved/i.test(msg)) {
      return { ok: true, mode: 'local', reason: msg };
    }
    return { ok: false, error: msg };
  }
}

export async function loadCloudProject(id: string) {
  const row = await getProject(id);
  writeCloudProjectRef(row.id, row.version);
  return row;
}

export async function fetchCloudProjects(): Promise<CloudProjectSummary[]> {
  try {
    return await listProjects();
  } catch {
    return [];
  }
}

export function readCloudProjectIdFromLocation() {
  try {
    return new URLSearchParams(location.search).get('cloud')?.trim() || null;
  } catch {
    return null;
  }
}

export function readNewProjectFromLocation() {
  try {
    return new URLSearchParams(location.search).get('new') === '1';
  } catch {
    return false;
  }
}
