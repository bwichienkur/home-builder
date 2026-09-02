import { describe, expect, it } from 'vitest';
import {
  createTakeoffItem,
  defaultTakeoffItems,
  ensureProjectItems,
  sumItemQuantity,
} from './quantities';
import type { TakeoffObject, TakeoffProject } from './types';

describe('takeoff quantities', () => {
  it('seeds default linear/area/count items', () => {
    const items = defaultTakeoffItems();
    expect(items.map((i) => i.mode).sort()).toEqual(['area', 'count', 'count', 'count', 'linear'].sort());
    expect(items.some((i) => i.mode === 'linear')).toBe(true);
    expect(items.some((i) => i.mode === 'area')).toBe(true);
    expect(items.some((i) => i.mode === 'count')).toBe(true);
  });

  it('sums linear LF across pieces', () => {
    const item = createTakeoffItem('linear', 'Walls');
    const objects: TakeoffObject[] = [
      {
        id: 'a',
        pageId: 'p',
        kind: 'wall',
        itemId: item.id,
        measureMode: 'linear',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        lengthFt: 12,
        source: 'manual',
        createdAt: '',
      },
      {
        id: 'b',
        pageId: 'p',
        kind: 'wall',
        itemId: item.id,
        measureMode: 'linear',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        lengthFt: 6.5,
        source: 'manual',
        createdAt: '',
      },
    ];
    const qty = sumItemQuantity(item, objects);
    expect(qty.value).toBeCloseTo(18.5, 5);
    expect(qty.pieceCount).toBe(2);
    expect(qty.formatted).toContain('LF');
  });

  it('sums area SF and count EA', () => {
    const area = createTakeoffItem('area', 'Floor');
    const count = createTakeoffItem('count', 'Doors');
    const objects: TakeoffObject[] = [
      {
        id: 'r1',
        pageId: 'p',
        kind: 'room',
        itemId: area.id,
        measureMode: 'area',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
        areaSqFt: 120.25,
        source: 'manual',
        createdAt: '',
      },
      {
        id: 'd1',
        pageId: 'p',
        kind: 'door',
        itemId: count.id,
        measureMode: 'count',
        points: [{ x: 2, y: 2 }],
        count: 1,
        source: 'manual',
        createdAt: '',
      },
      {
        id: 'd2',
        pageId: 'p',
        kind: 'door',
        itemId: count.id,
        measureMode: 'count',
        points: [{ x: 3, y: 3 }],
        count: 1,
        source: 'manual',
        createdAt: '',
      },
    ];
    expect(sumItemQuantity(area, objects).formatted).toBe('120.3 sf');
    expect(sumItemQuantity(count, objects)).toMatchObject({ value: 2, formatted: '2 EA' });
  });

  it('ensureProjectItems fills missing worksheet', () => {
    const project = {
      id: 't',
      name: 'x',
      createdAt: '',
      updatedAt: '',
      pdfUrl: '',
      sourceFileName: '',
      pages: [],
      objects: [],
      warnings: [],
    } as unknown as TakeoffProject;
    const next = ensureProjectItems(project);
    expect(next.items.length).toBeGreaterThan(0);
  });
});
