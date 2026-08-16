import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSharedDesign,
  designShareUrl,
  listSharedDesigns,
  loadSharedDesign,
  makeDesignCode,
  saveSharedDesign,
  upsertSharedDesign,
} from './designShare';
import { shoppingListCsvFromDesign } from './shoppingListCsv';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
});
vi.stubGlobal('location', new URL('http://localhost:5173/'));
vi.stubGlobal('crypto', {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = (i * 17 + 3) % 256;
    return arr;
  },
});

const samplePayload = {
  version: 4,
  roomType: 'Bedroom' as const,
  unitSystem: 'metric' as const,
  activeFloorId: 'ground',
  floors: [
    {
      id: 'ground',
      name: 'Ground floor',
      scene: {
        walls: [],
        openings: [],
        furniture: [
          {
            id: 'f1',
            catalogId: 'bed-1',
            name: 'Bed',
            category: 'Bedroom',
            x: 0,
            y: 0,
            z: 0,
            rotation: 0,
            color: '#fff',
            width: 1.6,
            depth: 2,
            height: 0.5,
          },
        ],
        floorColor: '#fff',
        wallColor: '#fff',
        ceilingColor: '#fff',
      },
    },
  ],
};

describe('design share codes', () => {
  beforeEach(() => {
    store.clear();
  });

  it('persists and reloads a design by code', () => {
    const entry = saveSharedDesign('Test', samplePayload, 'ABCD2345');
    expect(entry.code).toBe('ABCD2345');
    expect(loadSharedDesign('abcd2345')?.name).toBe('Test');
    expect(designShareUrl('ABCD2345')).toContain('design=ABCD2345');
  });

  it('creates codes without ambiguous characters', () => {
    const code = makeDesignCode(12);
    expect(code).toHaveLength(12);
    expect(code).not.toMatch(/[01IO]/);
  });

  it('lists and deletes saved designs', () => {
    saveSharedDesign('One', samplePayload, 'ONE12345');
    saveSharedDesign('Two', samplePayload, 'TWO12345');
    expect(listSharedDesigns()).toHaveLength(2);
    deleteSharedDesign('ONE12345');
    expect(listSharedDesigns().map((d) => d.code)).toEqual(['TWO12345']);
  });

  it('upserts an existing saved build without minting a new code', () => {
    const first = upsertSharedDesign('Draft', samplePayload, 'KEEP1234');
    const second = upsertSharedDesign('Bedroom study', { ...samplePayload, roomType: 'Office' }, 'KEEP1234');
    expect(second.code).toBe(first.code);
    expect(listSharedDesigns()).toHaveLength(1);
    expect(loadSharedDesign('KEEP1234')?.name).toBe('Bedroom study');
    expect(loadSharedDesign('KEEP1234')?.payload.roomType).toBe('Office');
    expect(second.updatedAt).toBeTruthy();
  });
});

describe('shopping list csv from saved builds', () => {
  it('exports furniture lines for a stored payload', () => {
    const csv = shoppingListCsvFromDesign(samplePayload, [
      {
        id: 'bed-1',
        name: 'Bed',
        brand: 'Acme',
        sku: 'BED-1',
        category: 'Bedroom',
        price: 499,
        priceUnit: 'each',
        width: 1.6,
        depth: 2,
        height: 0.5,
        tags: [],
        rooms: ['Bedroom'],
      } as any,
    ]);
    expect(csv).toContain('BED-1');
    expect(csv).toContain('Bed');
    expect(csv).toContain('499');
  });
});
