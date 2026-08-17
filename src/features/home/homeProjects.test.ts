import { describe, expect, it } from 'vitest';
import type { SharedDesign } from '../../lib/designShare';
import { listHomeProjects } from './homeProjects';

const local = (partial: Partial<SharedDesign> & { code: string; name: string }): SharedDesign =>
  ({
    createdAt: '2026-01-01T00:00:00.000Z',
    payload: {
      version: 4,
      roomType: 'Bedroom',
      unitSystem: 'metric',
      activeFloorId: 'ground',
      floors: [],
    },
    ...partial,
  }) as SharedDesign;

describe('listHomeProjects', () => {
  it('sorts current projects by most recently updated', () => {
    const rows = listHomeProjects(
      [
        local({ code: 'OLD12345', name: 'Older local', updatedAt: '2026-02-01T00:00:00.000Z' }),
        local({ code: 'NEW12345', name: 'Newer local', updatedAt: '2026-08-01T00:00:00.000Z' }),
      ],
      [{ id: 'c1', name: 'Cloud job', version: 3, updatedAt: '2026-07-01T00:00:00.000Z' }],
    );
    expect(rows.map((row) => row.name)).toEqual(['Newer local', 'Cloud job', 'Older local']);
    expect(rows[0].href).toBe('/build?design=NEW12345');
    expect(rows[1].href).toBe('/build?cloud=c1');
    expect(rows[1].origin).toBe('cloud');
  });

  it('returns an empty list when there are no projects', () => {
    expect(listHomeProjects([])).toEqual([]);
  });
});
