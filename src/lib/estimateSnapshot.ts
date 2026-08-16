import type { ConstructionTakeoff } from './constructionTakeoff';
import type { TradeRates } from '../store/tradeRatesStore';
import { DEFAULT_TRADE_RATES } from '../store/tradeRatesStore';

export type EstimateLine = {
  key: string;
  name: string;
  /** MasterFormat-ish division code for GC sorting. */
  csi?: string;
  qty: number;
  unit: string;
  unitCost: number;
  material: number;
  labor: number;
};

export type EstimateTotals = {
  material: number;
  labor: number;
  subtotal: number;
  markup: number;
  tax: number;
  grandTotal: number;
};

export type EstimateSnapshot = {
  version: number;
  savedAt: string;
  label: string;
  disclaimer: string;
  takeoff: ConstructionTakeoff;
  rates: TradeRates;
  lines: EstimateLine[];
  totals: EstimateTotals;
};

export type ChangeOrderRecord = {
  id: string;
  number: number;
  createdAt: string;
  label: string;
  baselineVersion: number;
  liveVersion: number;
  delta: number;
  lineDeltas: ChangeOrderDelta['lineDeltas'];
  totals: { baseline: number; live: number };
};

const M2_TO_SF = 1 / 0.09290304;
const M_TO_FT = 1 / 0.3048;

export const ESTIMATE_DISCLAIMER =
  'Internal GC estimate from geometric takeoff + rate book. Not a contract bid; exclude MEP specialty trades unless quoted.';

function line(
  key: string,
  name: string,
  csi: string,
  qty: number,
  unit: string,
  unitCost: number,
  laborPct: number,
): EstimateLine | null {
  if (!Number.isFinite(qty) || qty <= 0.05) return null;
  const material = qty * unitCost;
  return {
    key,
    name,
    csi,
    qty,
    unit,
    unitCost,
    material,
    labor: material * laborPct,
  };
}

/** Build priced construction lines from takeoff + rate book (imperial units for $ rates). */
export function buildEstimateLines(takeoff: ConstructionTakeoff, rates: TradeRates): EstimateLine[] {
  const waste = 1 + (rates.wasteFactor ?? takeoff.wasteFactor ?? 0.1);
  const laborPct = rates.laborPctOfMaterial;
  const sf = (m2: number) => m2 * M2_TO_SF;
  const ft = (m: number) => m * M_TO_FT;
  const raw: (EstimateLine | null)[] = [
    line('footing', 'Continuous footing', '03 30 00', ft(takeoff.footingLengthM), 'lf', rates.footingPerFt, laborPct),
    line('slab', 'Slab on grade', '03 30 00', sf(takeoff.slabAreaM2), 'sf', rates.slabPerSf, laborPct),
    line('studs', 'Studs', '06 10 00', takeoff.studCount, 'ea', rates.studEach, laborPct),
    line('plates', 'Top/bottom plates', '06 10 00', ft(takeoff.plateLengthM), 'lf', rates.platePerFt, laborPct),
    line('headers', 'Headers (rough openings)', '06 10 00', takeoff.headerCount, 'ea', rates.headerEach, laborPct),
    line(
      'sheathing',
      'Exterior sheathing (+ waste)',
      '06 16 00',
      sf(takeoff.exteriorSheathingAreaM2) * waste,
      'sf',
      rates.sheathingPerSf,
      laborPct,
    ),
    line('roof', 'Roofing (envelope proxy)', '07 30 00', sf(takeoff.roofAreaM2), 'sf', rates.roofPerSf, laborPct),
    line(
      'insulation',
      takeoff.avgInsulationR != null
        ? `Wall insulation (R-${takeoff.avgInsulationR.toFixed(0)})`
        : 'Wall insulation',
      '07 21 00',
      sf(takeoff.insulationAreaM2) * waste,
      'sf',
      rates.insulationPerSf,
      laborPct,
    ),
    line('drywall', 'Drywall (both faces + waste)', '09 29 00', sf(takeoff.drywallAreaM2) * waste, 'sf', rates.drywallPerSf, laborPct),
    line('paint', 'Interior paint (+ waste)', '09 91 00', sf(takeoff.paintAreaM2) * waste, 'sf', rates.paintPerSf, laborPct),
    line('baseboard', 'Baseboard', '06 20 00', ft(takeoff.baseboardLengthM), 'lf', rates.baseboardPerFt, laborPct),
    line('flooring', 'Flooring allowance', '09 60 00', sf(takeoff.flooringAreaM2), 'sf', rates.flooringPerSf, laborPct),
    line('doors', 'Doors (allowance)', '08 10 00', takeoff.doorCount, 'ea', rates.doorEach, laborPct),
    line('windows', 'Windows (allowance)', '08 50 00', sf(takeoff.windowAreaM2), 'sf', rates.windowPerSf, laborPct),
  ];
  return raw.filter((l): l is EstimateLine => !!l);
}

export function computeEstimateTotals(lines: EstimateLine[], rates: TradeRates): EstimateTotals {
  const material = lines.reduce((s, l) => s + l.material, 0);
  const labor = lines.reduce((s, l) => s + l.labor, 0);
  const subtotal = material + labor;
  const markup = subtotal * rates.markupPct;
  const taxed = subtotal + markup;
  const tax = taxed * rates.taxPct;
  return {
    material,
    labor,
    subtotal,
    markup,
    tax,
    grandTotal: taxed + tax,
  };
}

export function buildEstimateSnapshot(input: {
  takeoff: ConstructionTakeoff;
  rates?: TradeRates;
  version?: number;
  previousVersion?: number;
  label?: string;
}): EstimateSnapshot {
  const rates = { ...DEFAULT_TRADE_RATES, ...input.rates };
  const lines = buildEstimateLines(input.takeoff, rates);
  const totals = computeEstimateTotals(lines, rates);
  const version = input.version ?? (input.previousVersion != null ? input.previousVersion + 1 : 1);
  return {
    version,
    savedAt: new Date().toISOString(),
    label: input.label ?? `Estimate v${version}`,
    disclaimer: ESTIMATE_DISCLAIMER,
    takeoff: input.takeoff,
    rates,
    lines,
    totals,
  };
}

export type ChangeOrderDelta = {
  hasBaseline: boolean;
  baselineVersion: number | null;
  liveGrandTotal: number;
  baselineGrandTotal: number | null;
  delta: number | null;
  lineDeltas: Array<{ key: string; name: string; baseline: number; live: number; delta: number }>;
};

/** Diff live estimate vs locked baseline snapshot (change order). */
export function diffEstimateAgainstBaseline(
  live: EstimateSnapshot,
  baseline: EstimateSnapshot | null | undefined,
): ChangeOrderDelta {
  if (!baseline) {
    return {
      hasBaseline: false,
      baselineVersion: null,
      liveGrandTotal: live.totals.grandTotal,
      baselineGrandTotal: null,
      delta: null,
      lineDeltas: [],
    };
  }
  const keys = new Set([...live.lines.map((l) => l.key), ...baseline.lines.map((l) => l.key)]);
  const lineDeltas: ChangeOrderDelta['lineDeltas'] = [];
  for (const key of keys) {
    const a = baseline.lines.find((l) => l.key === key);
    const b = live.lines.find((l) => l.key === key);
    const baselineAmt = (a?.material ?? 0) + (a?.labor ?? 0);
    const liveAmt = (b?.material ?? 0) + (b?.labor ?? 0);
    const d = liveAmt - baselineAmt;
    if (Math.abs(d) < 0.5) continue;
    lineDeltas.push({
      key,
      name: b?.name ?? a?.name ?? key,
      baseline: baselineAmt,
      live: liveAmt,
      delta: d,
    });
  }
  lineDeltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return {
    hasBaseline: true,
    baselineVersion: baseline.version,
    liveGrandTotal: live.totals.grandTotal,
    baselineGrandTotal: baseline.totals.grandTotal,
    delta: live.totals.grandTotal - baseline.totals.grandTotal,
    lineDeltas,
  };
}

/** Mint a numbered change-order record from a live-vs-baseline diff. */
export function createChangeOrderRecord(input: {
  live: EstimateSnapshot;
  baseline: EstimateSnapshot;
  previous?: ChangeOrderRecord[];
  label?: string;
}): ChangeOrderRecord {
  const delta = diffEstimateAgainstBaseline(input.live, input.baseline);
  const number = (input.previous?.reduce((m, r) => Math.max(m, r.number), 0) ?? 0) + 1;
  return {
    id: crypto.randomUUID(),
    number,
    createdAt: new Date().toISOString(),
    label: input.label ?? `CO-${String(number).padStart(3, '0')}`,
    baselineVersion: input.baseline.version,
    liveVersion: input.live.version,
    delta: delta.delta ?? 0,
    lineDeltas: delta.lineDeltas,
    totals: {
      baseline: input.baseline.totals.grandTotal,
      live: input.live.totals.grandTotal,
    },
  };
}
