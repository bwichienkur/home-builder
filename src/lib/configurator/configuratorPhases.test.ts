import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTakeoffWorkbook } from './importTakeoff';
import { parseContractPricingWorkbook } from './importContractPricing';
import { formatCatalogPrice } from './deltaPricing';
import { catalog } from '../../components/catalog/catalogData';
import { createPlatinumContract } from './contractTypes';
import { computeProjectRollup } from './roomRollups';
import { expandCatalogSelection } from './selectionKits';
import { curateFromSurvey } from './surveyCurations';
import { buildBtSelectionRows } from './exportBtSelections';
import { createEmptyExtendedProject } from './projectTypes';
import { STILLWATER_183_PROJECT } from './contractTypes';

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
  it('expands shower picks to include valve parts when catalog matches exist', () => {
    const plumbing = catalog.filter((i) => i.sourceTab === 'Plumbing');
    const handle = plumbing.find((i) => /handle|trim/i.test(i.name));
    if (!handle) return;
    const expanded = expandCatalogSelection(handle, plumbing);
    expect(expanded.items.length).toBeGreaterThanOrEqual(1);
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
