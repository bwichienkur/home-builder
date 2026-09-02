/**
 * Persist takeoff projects in Neon jsonb (ops_snapshots pattern).
 */
import { loadSnapshot, saveSnapshot } from './snapshotStore.js';

const TABLE = 'takeoff_projects';

export async function loadTakeoffProject(id) {
  try {
    return await loadSnapshot(TABLE, id);
  } catch (err) {
    console.error('[takeoffStore] load failed', err?.message || err);
    return { payload: null, backend: 'none' };
  }
}

export async function saveTakeoffProject(id, project) {
  if (!project?.id) return { backend: 'none', saved: false };
  try {
    // Strip huge thumbnails if any — keep thumbs small already.
    const result = await saveSnapshot(TABLE, project, id);
    return { ...result, saved: true };
  } catch (err) {
    if (err?.status === 503) return { backend: 'none', saved: false };
    console.error('[takeoffStore] save failed', err?.message || err);
    return { backend: 'none', saved: false };
  }
}
