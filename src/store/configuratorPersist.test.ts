import { describe, expect, it, beforeEach } from 'vitest';
import {
  persistConfiguratorLocal,
  slimProjectForLocalPersist,
  createBlankSelectionProject,
} from './configuratorStore';
import type { HousePlan } from '../lib/housePlans/buildPlan';

const STORAGE = 'roomcraft-configurator-v2';

const memory = new Map<string, string>();
let setItemHook: ((key: string, value: string) => void) | null = null;

function installLocalStorage() {
  memory.clear();
  setItemHook = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (setItemHook) setItemHook(k, v);
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
    },
  });
}

function hugeImportedPlan(): HousePlan {
  const wallSegmentsFt = Array.from({ length: 8000 }, (_, i) => ({
    x1: i,
    y1: 0,
    x2: i + 1,
    y2: 0,
    exterior: i % 17 === 0,
  }));
  return {
    id: 'dxf-huge',
    name: 'Huge import',
    stories: 1,
    beds: 3,
    baths: 2,
    livingSqFt: 2400,
    sourceUrl: '',
    note: 'test',
    floors: [
      {
        id: 'f1',
        name: 'First',
        rooms: Array.from({ length: 40 }, (_, i) => ({
          id: `r${i}`,
          name: `Room ${i}`,
          roomType: 'Living room' as const,
          x: i * 10,
          y: 0,
          w: 12,
          h: 14,
          pointsFt: [
            { x: i * 10, y: 0 },
            { x: i * 10 + 12, y: 0 },
            { x: i * 10 + 12, y: 14 },
            { x: i * 10, y: 14 },
          ],
        })),
        wallSegmentsFt,
      },
    ],
  };
}

describe('configurator localStorage persist', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('slimProjectForLocalPersist drops importedHousePlan', () => {
    const project = {
      ...createBlankSelectionProject('Quota test'),
      housePlanId: 'custom',
      drawingPackageId: 'pkg-1',
      importedHousePlan: hugeImportedPlan(),
      drawingPackage: {
        id: 'pkg-1',
        sourceFileName: 'MODEL.dwg',
        importedAt: new Date().toISOString(),
        warnings: [],
        sheetSource: 'pdf' as const,
        pdfUrl: 'blob:http://localhost/fake',
        sheets: [{ id: 's1', name: 'FLOOR', order: 1, kind: 'floor' as const, svg: '<svg>huge</svg>' }],
      },
    };
    const slim = slimProjectForLocalPersist(project);
    expect(slim.importedHousePlan).toBeUndefined();
    expect(slim.drawingPackageId).toBe('pkg-1');
    expect(slim.drawingPackage?.pdfUrl).toBeUndefined();
    expect(slim.drawingPackage?.sheets[0]?.svg).toBeUndefined();
  });

  it('persistConfiguratorLocal does not store importedHousePlan', () => {
    const project = {
      ...createBlankSelectionProject('Quota test'),
      housePlanId: 'custom',
      drawingPackageId: 'pkg-1',
      importedHousePlan: hugeImportedPlan(),
    };
    expect(project.drawingPackageId).toBe('pkg-1');
    expect(slimProjectForLocalPersist(project).drawingPackageId).toBe('pkg-1');
    persistConfiguratorLocal({
      role: 'designer',
      project,
      contract: project.contract,
      remoteId: null,
      activeRoomFilter: null,
      shareToken: null,
      lastInviteUrl: null,
    });
    const stored = localStorage.getItem(STORAGE);
    expect(stored).toBeTruthy();
    const raw = JSON.parse(stored ?? '{}') as {
      project?: { importedHousePlan?: unknown; drawingPackageId?: string; housePlanId?: string };
    };
    expect(raw.project?.housePlanId).toBe('custom');
    expect(raw.project?.importedHousePlan).toBeUndefined();
    expect(raw.project?.drawingPackageId).toBe('pkg-1');
    expect(JSON.stringify(raw).length).toBeLessThan(50_000);
  });

  it('persistConfiguratorLocal recovers from QuotaExceededError', () => {
    const project = {
      ...createBlankSelectionProject('Quota test'),
      housePlanId: 'custom',
      drawingPackageId: 'pkg-1',
      importedHousePlan: hugeImportedPlan(),
      drawingPackage: {
        id: 'pkg-1',
        sourceFileName: 'MODEL.dwg',
        importedAt: new Date().toISOString(),
        warnings: ['a'.repeat(2000)],
        sheetSource: 'pdf' as const,
        sheets: Array.from({ length: 20 }, (_, i) => ({
          id: `s${i}`,
          name: `Sheet ${i}`,
          order: i,
          kind: 'other' as const,
        })),
      },
      takeoff: {
        importedAt: new Date().toISOString(),
        lines: Array.from({ length: 200 }, (_, i) => ({
          id: `l${i}`,
          sheet: 'COF',
          category: 'flooring',
          description: `Line ${i}`,
          qty: 1,
          unit: 'SF',
          source: 'manual' as const,
        })),
      },
    };

    let calls = 0;
    setItemHook = (key) => {
      calls += 1;
      if (calls === 1 && key === STORAGE) {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
    };

    expect(() =>
      persistConfiguratorLocal({
        role: 'designer',
        project,
        contract: project.contract,
        remoteId: null,
        activeRoomFilter: null,
        shareToken: null,
        lastInviteUrl: null,
      }),
    ).not.toThrow();

    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as {
      project?: {
        importedHousePlan?: unknown;
        takeoff?: { lines: unknown[] };
        drawingPackage?: { sheets: unknown[] };
      };
    };
    expect(raw.project?.importedHousePlan).toBeUndefined();
    expect(raw.project?.takeoff?.lines).toEqual([]);
    expect(raw.project?.drawingPackage?.sheets).toEqual([]);
  });
});
