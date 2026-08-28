import { describe, expect, it } from 'vitest';
import { catalog } from '../../components/catalog/catalogData';
import { createPlatinumContract, STILLWATER_183_PROJECT } from './contractTypes';
import { buildCofRows, buildCofWorkbook } from './exportCof';
import type { FurnitureItem, PlanRoomLabel } from '../../types';

describe('exportCof', () => {
  const contract = createPlatinumContract('Test COF', '183 Stillwater');

  it('groups countertop and tile selections into COF sheets', () => {
    const counter = catalog.find((i) => i.sourceTab === 'Countertops' && i.level === 'Level 9');
    const tile = catalog.find((i) => i.sourceTab === 'Tile-Floor' && i.placementMode === 'floor-fill');
    expect(counter).toBeTruthy();
    expect(tile).toBeTruthy();

    const furniture: FurnitureItem[] = [
      {
        id: 'f1',
        catalogId: counter!.id,
        name: counter!.name,
        category: counter!.category,
        x: 0,
        y: 0,
        z: 0,
        width: 1,
        depth: 1,
        height: 1,
        rotation: 0,
        color: '#fff',
      },
    ];
    const planRooms: PlanRoomLabel[] = [
      {
        id: 'r1',
        name: 'Kitchen',
        roomType: 'Kitchen',
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 },
        ],
        floorCatalogId: tile!.id,
        floorName: tile!.name,
      },
    ];

    const sheets = buildCofRows({
      project: STILLWATER_183_PROJECT,
      contract,
      catalog,
      furniture,
      planRooms,
    });
    expect(sheets.Countertops?.length).toBeGreaterThan(0);
    expect(sheets['Tile-Floor']?.length).toBeGreaterThan(0);
    expect(sheets.Countertops?.[0].productName).not.toMatch(/Level \d/);
  });

  it('builds a multi-sheet workbook', () => {
    const wb = buildCofWorkbook({
      project: STILLWATER_183_PROJECT,
      contract,
      catalog: catalog.slice(0, 20),
      furniture: [],
      planRooms: [],
    });
    expect(wb.SheetNames).toContain('Countertops');
    expect(wb.SheetNames).toContain('Tile-Floor');
    expect(wb.SheetNames).toContain('Options');
  });
});
