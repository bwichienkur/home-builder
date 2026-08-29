import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTakeoffWorkbook, effectiveQty } from './importTakeoff';
import { parseContractPricingWorkbook } from './importContractPricing';
import { formatCatalogPrice } from './deltaPricing';
import { catalog } from '../../components/catalog/catalogData';
import { createPlatinumContract, STILLWATER_183_PROJECT } from './contractTypes';
import { computeProjectRollup } from './roomRollups';
import { expandCatalogSelection } from './selectionKits';
import { curateFromSurvey } from './surveyCurations';
import { buildBtSelectionRows } from './exportBtSelections';
import { createEmptyExtendedProject } from './projectTypes';
import stillwaterTakeoff from './stillwater183Takeoff.json';
import { stillwater183Plan } from '../housePlans/stillwater183Plan';

function sheetBuffer(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Tile');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('importTakeoff', () => {
  it('parses qty rows from synthetic takeoff sheet', () => {
    const buf = sheetBuffer([
      ['Item', 'Qty', 'Unit'],
      ['Kitchen floor tile', 244, 'sf'],
      ['Master bath shower floor', 55, 'sf'],
    ]);
    const snap = parseTakeoffWorkbook(buf, 'test.xlsx');
    expect(snap.lines.length).toBeGreaterThan(0);
    expect(snap.lines.some((l) => l.unit === 'sq ft')).toBe(true);
  });

  it('skips bare dollar budget rows without units', () => {
    const buf = sheetBuffer([
      ['Tile Floors matl', 23688],
      ['Walls to 8\'', 244, 'sf'],
    ]);
    const snap = parseTakeoffWorkbook(buf, 'cof-tile.xlsx');
    expect(snap.lines.some((l) => l.qty === 23688)).toBe(false);
    expect(snap.lines.some((l) => l.qty === 244 && l.unit === 'sq ft')).toBe(true);
  });
});

describe('importContractPricing', () => {
  it('extracts level hints from synthetic pricing sheet', () => {
    const buf = sheetBuffer([
      ['Description', 'Amount'],
      ['Client pre-purchased Level 8 floor tile allowance', '$12000'],
      ['Upgrade kitchen countertops Level 7', '$5000'],
    ]);
    const parsed = parseContractPricingWorkbook(buf);
    expect(parsed.levelOverrides.length + parsed.allowances.length).toBeGreaterThan(0);
  });
});

describe('delta pricing credits', () => {
  it('shows credit when selected item is cheaper than contract override baseline', () => {
    const contract = createPlatinumContract('Test');
    const floorItems = catalog.filter((i) => i.sourceTab === 'Tile-Floor' && i.price != null);
    const level5 = floorItems.find((i) => i.level === 'Level 5');
    expect(level5).toBeTruthy();
    const view = formatCatalogPrice(level5!, catalog, contract, 'designer', [
      { pricingCategory: 'floor-tile', includedLevel: 'Level 8', source: 'contract_pricing_page' },
    ]);
    if (view.delta != null) {
      expect(view.delta).toBeLessThan(0);
      expect(view.label).toContain('credit');
    }
  });
});

describe('room rollups', () => {
  it('computes job delta from empty scene', () => {
    const project = createEmptyExtendedProject(STILLWATER_183_PROJECT);
    const rollup = computeProjectRollup({
      catalog,
      contract: project.contract,
      furniture: [],
      planRooms: [],
      role: 'designer',
    });
    expect(rollup.jobDelta).toBe(0);
  });
});

describe('selection kits', () => {
  it('expands shower handle stub into valve/diverter/hose kit parts', () => {
    const handle = catalog.find((i) => i.sku === 'KIT-SHOWER-HANDLE');
    expect(handle).toBeTruthy();
    const expanded = expandCatalogSelection(handle!, catalog);
    expect(expanded.kitId).toBe('shower-trim-package');
    expect(expanded.items.length).toBeGreaterThanOrEqual(4);
    expect(expanded.items.some((i) => i.sku === 'KIT-SHOWER-VALVE')).toBe(true);
    expect(expanded.items.some((i) => i.sku === 'KIT-DIVERTER')).toBe(true);
    expect(expanded.items.some((i) => i.sku === 'KIT-SHOWER-HOSE')).toBe(true);
  });
});

describe('survey curations', () => {
  it('returns curated options per room type', () => {
    const curated = curateFromSurvey(catalog, { interiorStyle: 'modern', palette: 'neutrals' });
    expect(curated.length).toBeGreaterThan(0);
  });
});

describe('bt export', () => {
  it('builds trade-grouped BT rows', () => {
    const project = createEmptyExtendedProject(STILLWATER_183_PROJECT);
    const rows = buildBtSelectionRows({ project, catalog, furniture: [], planRooms: [] });
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe('qty source of truth', () => {
  it('prefers takeoff after approval when lines exist', () => {
    const takeoff = {
      importedAt: new Date().toISOString(),
      qtySource: 'takeoff' as const,
      lines: [
        {
          id: '1',
          sheet: 'Tile',
          room: "Owner's Bath",
          category: 'shower-pan',
          description: 'Shower Floor',
          qty: 55,
          unit: 'sq ft',
          source: 'cof_xlsx' as const,
        },
      ],
    };
    expect(
      effectiveQty({
        planVerification: 'approved_for_selections',
        takeoff,
        category: 'shower-pan',
        room: "Owner's Bath",
        geometryQty: 40,
      }),
    ).toBe(55);
  });
});

describe('stillwater pilot seed', () => {
  it('has named rooms for COF categories', () => {
    const names = stillwater183Plan.floors[0]!.rooms.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['Kitchen', "Owner's Bath", 'Bath 2', 'Bath 3', 'Laundry', 'Great Room']),
    );
    expect(stillwater183Plan.floors[0]!.rooms.length).toBeGreaterThanOrEqual(12);
  });

  it('seeds takeoff with COF tile/granite qty', () => {
    expect(stillwaterTakeoff.lines.length).toBeGreaterThan(20);
    expect(stillwaterTakeoff.lines.some((l) => l.category === 'floor-tile' && l.qty >= 2000)).toBe(true);
    expect(stillwaterTakeoff.lines.some((l) => l.category === 'shower-pan' && l.room === "Owner's Bath")).toBe(true);
  });
});
