import { beforeEach, describe, expect, it, vi } from 'vitest';
import { designShareUrl, loadSharedDesign, makeDesignCode, saveSharedDesign } from './designShare';

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

describe('design share codes', () => {
  beforeEach(() => {
    store.clear();
  });

  it('persists and reloads a design by code', () => {
    const payload = {
      version: 4,
      roomType: 'Bedroom' as const,
      unitSystem: 'metric' as const,
      activeFloorId: 'ground',
      floors: [{ id: 'ground', name: 'Ground floor', scene: { walls: [], openings: [], furniture: [], floorColor: '#fff', wallColor: '#fff' } }],
    };
    const entry = saveSharedDesign('Test', payload, 'ABCD2345');
    expect(entry.code).toBe('ABCD2345');
    expect(loadSharedDesign('abcd2345')?.name).toBe('Test');
    expect(designShareUrl('ABCD2345')).toContain('design=ABCD2345');
  });

  it('creates codes without ambiguous characters', () => {
    const code = makeDesignCode(12);
    expect(code).toHaveLength(12);
    expect(code).not.toMatch(/[01IO]/);
  });
});
