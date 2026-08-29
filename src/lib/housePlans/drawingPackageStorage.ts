import type { DrawingPackage, DrawingSheet } from './drawingPackage';
import type { HousePlan } from './buildPlan';

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
  return id;
}

export async function loadDrawingPackage(id: string): Promise<{
  package: DrawingPackage;
  plan?: HousePlan;
  pdfBlob?: Blob;
} | null> {
  const db = await openDb();
  const record = await new Promise<StoredDrawingPackage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredDrawingPackage | undefined);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
  });
  db.close();
  if (!record) return null;

  let pdfUrl = record.meta.pdfUrl;
  if (record.pdfBlob) {
    pdfUrl = URL.createObjectURL(record.pdfBlob);
  }

  const sheets: DrawingSheet[] = record.meta.sheets.map((s) => ({
    ...s,
    svg: record.sheetSvgs[s.id],
    imageUrl: s.imageUrl,
  }));

  return {
    package: { ...record.meta, sheets, pdfUrl },
    plan: record.plan,
    pdfBlob: record.pdfBlob,
  };
}
