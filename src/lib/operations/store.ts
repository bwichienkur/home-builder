import { seedOpsFromLiveSnapshot, newOpsId } from './seed';
import { isOpsHttpProvider, pushOpsToServer, pullOpsFromServer } from './remote';
import type {
  OpsCashflowEntry,
  OpsDailyLog,
  OpsDeal,
  OpsJob,
  OpsPerson,
  OpsScheduleItem,
  OpsSelection,
  OpsSnapshot,
  OpsTask,
} from './types';
import { OPS_STORAGE_KEY } from './types';

/** In-memory fallback when localStorage is unavailable (SSR / Vitest). */
let memoryRaw: string | null = null;
let remotePushTimer: ReturnType<typeof setTimeout> | null = null;

function storageGet(): string | null {
  if (typeof localStorage !== 'undefined') return localStorage.getItem(OPS_STORAGE_KEY);
  return memoryRaw;
}

function storageSet(value: string) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(OPS_STORAGE_KEY, value);
  else memoryRaw = value;
}

function emptySnapshot(): OpsSnapshot {
  return {
    version: 1,
    settings: {
      targetMarginPct: 15,
      projectedMarginPct: 0,
      rollingRevenue12Mo: 0,
      refreshedAt: new Date().toISOString(),
    },
    jobs: [],
    logs: [],
    tasks: [],
    selections: [],
    deals: [],
    people: [],
    scheduleItems: [],
    cashflow: [],
  };
}

function normalizeSnapshot(parsed: OpsSnapshot): OpsSnapshot {
  return {
    ...parsed,
    scheduleItems: Array.isArray(parsed.scheduleItems) ? parsed.scheduleItems : [],
    cashflow: Array.isArray(parsed.cashflow) ? parsed.cashflow : [],
  };
}

export function loadOpsSnapshot(): OpsSnapshot {
  try {
    const raw = storageGet();
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as OpsSnapshot;
    if (parsed?.version !== 1 || !Array.isArray(parsed.jobs)) return emptySnapshot();
    return normalizeSnapshot(parsed);
  } catch {
    return emptySnapshot();
  }
}

function scheduleRemotePush(snapshot: OpsSnapshot) {
  if (!isOpsHttpProvider()) return;
  if (remotePushTimer) clearTimeout(remotePushTimer);
  remotePushTimer = setTimeout(() => {
    void pushOpsToServer(snapshot).catch((err) => {
      console.warn('[ops] remote save failed', err);
    });
  }, 250);
}

export function saveOpsSnapshot(snapshot: OpsSnapshot) {
  const next = {
    ...snapshot,
    settings: { ...snapshot.settings, refreshedAt: new Date().toISOString() },
  };
  storageSet(JSON.stringify(next));
  scheduleRemotePush(next);
}

export function ensureOpsSeeded(): OpsSnapshot {
  if (storageGet() == null) {
    const seeded = seedOpsFromLiveSnapshot();
    saveOpsSnapshot(seeded);
    return seeded;
  }
  return loadOpsSnapshot();
}

/**
 * When VITE_OPS_PROVIDER=http: pull shared snapshot from API.
 * Empty server → seed from LIVE_DRILLDOWN and push.
 */
export async function hydrateOpsFromRemote(): Promise<OpsSnapshot> {
  if (!isOpsHttpProvider()) return ensureOpsSeeded();
  try {
    const remote = await pullOpsFromServer();
    if (remote && !remote.empty && remote.snapshot.jobs.length > 0) {
      // Write without re-push loop noise: set storage then one push is fine.
      storageSet(JSON.stringify(remote.snapshot));
      return remote.snapshot;
    }
    if (storageGet() == null) {
      const seeded = seedOpsFromLiveSnapshot();
      saveOpsSnapshot(seeded);
      return seeded;
    }
    const local = loadOpsSnapshot();
    if (local.jobs.length) {
      await pushOpsToServer(local);
      return local;
    }
    const seeded = seedOpsFromLiveSnapshot();
    saveOpsSnapshot(seeded);
    return seeded;
  } catch (err) {
    console.warn('[ops] remote hydrate failed; using local', err);
    return ensureOpsSeeded();
  }
}

export function resetOpsFromSnapshot(): OpsSnapshot {
  const seeded = seedOpsFromLiveSnapshot();
  saveOpsSnapshot(seeded);
  return seeded;
}

export function clearOpsStore() {
  saveOpsSnapshot(emptySnapshot());
}

/** Drop persisted data so the next ensureOpsSeeded re-seeds (tests / hard reset). */
export function wipeOpsStoreForTests() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(OPS_STORAGE_KEY);
  memoryRaw = null;
}

function touch(snapshot: OpsSnapshot): OpsSnapshot {
  return { ...snapshot, settings: { ...snapshot.settings, refreshedAt: new Date().toISOString() } };
}

export function upsertOpsJob(job: OpsJob) {
  const snap = ensureOpsSeeded();
  const idx = snap.jobs.findIndex((j) => j.id === job.id);
  const jobs = [...snap.jobs];
  const next = { ...job, updatedAt: new Date().toISOString() };
  if (idx >= 0) jobs[idx] = next;
  else jobs.push(next);
  saveOpsSnapshot(touch({ ...snap, jobs }));
  return next;
}

export function archiveOpsJob(jobId: string) {
  const snap = ensureOpsSeeded();
  const jobs = snap.jobs.map((j) => (j.id === jobId ? { ...j, archived: true, updatedAt: new Date().toISOString() } : j));
  saveOpsSnapshot(touch({ ...snap, jobs }));
}

export function upsertOpsLog(log: OpsDailyLog) {
  const snap = ensureOpsSeeded();
  const idx = snap.logs.findIndex((r) => r.id === log.id);
  const logs = [...snap.logs];
  const next = { ...log, updatedAt: new Date().toISOString() };
  if (idx >= 0) logs[idx] = next;
  else logs.push(next);
  saveOpsSnapshot(touch({ ...snap, logs }));
  return next;
}

export function deleteOpsLog(id: string) {
  const snap = ensureOpsSeeded();
  saveOpsSnapshot(touch({ ...snap, logs: snap.logs.filter((r) => r.id !== id) }));
}

export function upsertOpsTask(task: OpsTask) {
  const snap = ensureOpsSeeded();
  const idx = snap.tasks.findIndex((r) => r.id === task.id);
  const tasks = [...snap.tasks];
  const next = { ...task, updatedAt: new Date().toISOString() };
  if (idx >= 0) tasks[idx] = next;
  else tasks.push(next);
  saveOpsSnapshot(touch({ ...snap, tasks }));
  return next;
}

export function deleteOpsTask(id: string) {
  const snap = ensureOpsSeeded();
  saveOpsSnapshot(touch({ ...snap, tasks: snap.tasks.filter((r) => r.id !== id) }));
}

export function upsertOpsSelection(row: OpsSelection) {
  const snap = ensureOpsSeeded();
  const idx = snap.selections.findIndex((r) => r.id === row.id);
  const selections = [...snap.selections];
  const next = { ...row, updatedAt: new Date().toISOString() };
  if (idx >= 0) selections[idx] = next;
  else selections.push(next);
  saveOpsSnapshot(touch({ ...snap, selections }));
  return next;
}

export function deleteOpsSelection(id: string) {
  const snap = ensureOpsSeeded();
  saveOpsSnapshot(touch({ ...snap, selections: snap.selections.filter((r) => r.id !== id) }));
}

export function upsertOpsDeal(deal: OpsDeal) {
  const snap = ensureOpsSeeded();
  const idx = snap.deals.findIndex((r) => r.id === deal.id);
  const deals = [...snap.deals];
  const next = { ...deal, updatedAt: new Date().toISOString() };
  if (idx >= 0) deals[idx] = next;
  else deals.push(next);
  saveOpsSnapshot(touch({ ...snap, deals }));
  return next;
}

export function archiveOpsDeal(id: string) {
  const snap = ensureOpsSeeded();
  const deals = snap.deals.map((d) => (d.id === id ? { ...d, archived: true, updatedAt: new Date().toISOString() } : d));
  saveOpsSnapshot(touch({ ...snap, deals }));
}

export function upsertOpsPerson(person: OpsPerson) {
  const snap = ensureOpsSeeded();
  const idx = snap.people.findIndex((r) => r.id === person.id);
  const people = [...snap.people];
  const next = { ...person, updatedAt: new Date().toISOString() };
  if (idx >= 0) people[idx] = next;
  else people.push(next);
  saveOpsSnapshot(touch({ ...snap, people }));
  return next;
}

export function upsertOpsScheduleItem(row: OpsScheduleItem) {
  const snap = ensureOpsSeeded();
  const scheduleItems = [...(snap.scheduleItems ?? [])];
  const idx = scheduleItems.findIndex((r) => r.id === row.id);
  const next = { ...row, updatedAt: new Date().toISOString() };
  if (idx >= 0) scheduleItems[idx] = next;
  else scheduleItems.push(next);
  saveOpsSnapshot(touch({ ...snap, scheduleItems }));
  return next;
}

export function deleteOpsScheduleItem(id: string) {
  const snap = ensureOpsSeeded();
  saveOpsSnapshot(
    touch({ ...snap, scheduleItems: (snap.scheduleItems ?? []).filter((r) => r.id !== id) }),
  );
}

export function upsertOpsCashflow(row: OpsCashflowEntry) {
  const snap = ensureOpsSeeded();
  const cashflow = [...(snap.cashflow ?? [])];
  const idx = cashflow.findIndex((r) => r.id === row.id);
  const next = { ...row, updatedAt: new Date().toISOString() };
  if (idx >= 0) cashflow[idx] = next;
  else cashflow.push(next);
  saveOpsSnapshot(touch({ ...snap, cashflow }));
  return next;
}

export function deleteOpsCashflow(id: string) {
  const snap = ensureOpsSeeded();
  saveOpsSnapshot(touch({ ...snap, cashflow: (snap.cashflow ?? []).filter((r) => r.id !== id) }));
}

export { newOpsId };
