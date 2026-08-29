import type { DrawingPackage, DrawingSheet } from './drawingPackage';
import type { HousePlan } from './buildPlan';
import { apiBaseUrl, apiHeaders, isCloudPersistHttp } from '../platform/config';

const DB_NAME = 'olsen-drawing-packages';
const DB_VERSION = 1;
const STORE = 'packages';

export type StoredDrawingPackage = {
  id: string;
  meta: Omit<DrawingPackage, 'sheets'> & { sheets: Omit<DrawingSheet, 'svg'>[] };
  /** sheetId → svg markup */
  sheetSvgs: Record<string, string>;
  plan?: HousePlan;
  pdfBlob?: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, type = 'application/pdf'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function pushDrawingRemote(record: StoredDrawingPackage) {
  if (!isCloudPersistHttp()) return;
  try {
    let pdfBase64: string | null = null;
    if (record.pdfBlob) {
      pdfBase64 = await blobToBase64(record.pdfBlob);
    }
    const res = await fetch(`${apiBaseUrl()}/api/drawing-packages/${encodeURIComponent(record.id)}`, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify({
        meta: record.meta,
        sheetSvgs: record.sheetSvgs,
        plan: record.plan ?? null,
        pdfBase64,
      }),
    });
    if (!res.ok) console.warn('Drawing package remote save failed', res.status);
  } catch (err) {
    console.warn('Drawing package remote save failed', err);
  }
}

async function pullDrawingRemote(id: string): Promise<StoredDrawingPackage | null> {
  if (!isCloudPersistHttp()) return null;
  try {
    const res = await fetch(`${apiBaseUrl()}/api/drawing-packages/${encodeURIComponent(id)}`, {
      headers: apiHeaders(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      id: string;
      meta: StoredDrawingPackage['meta'];
      sheetSvgs?: Record<string, string>;
      plan?: HousePlan;
      pdfBase64?: string | null;
    };
    if (!body?.meta) return null;
    return {
      id: body.id || id,
      meta: body.meta,
      sheetSvgs: body.sheetSvgs ?? {},
      plan: body.plan,
      pdfBlob: body.pdfBase64 ? base64ToBlob(body.pdfBase64) : undefined,
    };
  } catch (err) {
    console.warn('Drawing package remote load failed', err);
    return null;
  }
}

export async function saveDrawingPackage(input: {
  package: DrawingPackage;
  plan: HousePlan;
  pdfBlob?: Blob;
}): Promise<string> {
  const id = input.package.id;
  const sheetSvgs: Record<string, string> = {};
  const sheets = input.package.sheets.map((s) => {
    if (s.svg) sheetSvgs[s.id] = s.svg;
    const { svg: _svg, ...rest } = s;
    return rest;
  });
  const record: StoredDrawingPackage = {
    id,
    meta: { ...input.package, sheets },
    sheetSvgs,
    plan: input.plan,
    pdfBlob: input.pdfBlob,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
  void pushDrawingRemote(record);
  return id;
}

export async function loadDrawingPackage(id: string): Promise<{
  package: DrawingPackage;
  plan?: HousePlan;
  pdfBlob?: Blob;
} | null> {
  const db = await openDb();
  let record = await new Promise<StoredDrawingPackage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredDrawingPackage | undefined);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
  });
  db.close();

  if (!record) {
    record = (await pullDrawingRemote(id)) ?? undefined;
    if (record) {
      const db2 = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db2.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record!);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      });
      db2.close();
    }
  }

  if (!record) return null;

  let pdfUrl = record.meta.pdfUrl;
  if (record.pdfBlob) {
    pdfUrl = URL.createObjectURL(record.pdfBlob);
  }

  const sheets: DrawingSheet[] = record.meta.sheets.map((s) => ({
    ...s,
    svg: record!.sheetSvgs[s.id],
    imageUrl: s.imageUrl,
  }));

  return {
    package: { ...record.meta, sheets, pdfUrl },
    plan: record.plan,
    pdfBlob: record.pdfBlob,
  };
}
