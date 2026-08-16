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
  /** Crew hours when hour-based labor is used. */
  laborHours?: number;
  /** Assembly parent key when this line is a component breakdown. */
  assemblyOf?: string;
  /** Linked vendor quote id when overridden by a quote. */
  quoteId?: string;
};

export type EstimateTotals = {
  material: number;
  labor: number;
  subtotal: number;
  contingency: number;
  escalation: number;
  markup: number;
  tax: number;
  bond: number;
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

export type ChangeOrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

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
  status: ChangeOrderStatus;
  reason?: string;
  decidedAt?: string;
};

export type VendorQuote = {
  id: string;
  vendor: string;
  label: string;
  amount: number;
  csi?: string;
  quoteDate: string;
  validUntil?: string;
  notes?: string;
  /** When set, replaces that estimate line's material+labor with quote amount. */
  lineKey?: string;
};

export type BidSettings = {
  jurisdiction: string;
  validityDays: number;
  paymentTerms: string;
  inclusions: string;
  exclusions: string;
  alternateNotes: string;
};

export const DEFAULT_BID_SETTINGS: BidSettings = {
  jurisdiction: '',
  validityDays: 30,
  paymentTerms: 'Progress payments monthly; retainage 5%; final on punch completion.',
  inclusions:
    'Architectural framing, envelope allowances, interior finishes from takeoff, MEP rough allowances, sitework proxies, OH&P, tax, and bond as shown.',
  exclusions:
    'Specialty engineered systems, utility company fees, permits/impact fees unless listed, furnishings beyond FF&E schedule, hazardous materials, winter conditions, and owner-furnished equipment.',
  alternateNotes:
    'Unit prices and allowances are schematic; owner selections may adjust the contract sum via change order.',
};

const M2_TO_SF = 1 / 0.09290304;
const M_TO_FT = 1 / 0.3048;

export const ESTIMATE_DISCLAIMER =
  'Bid package from geometric takeoff + rate book + schematic MEP/site proxies. Not engineering-sealed; specialty trades should be confirmed with licensed subcontractors before award.';

function line(
  key: string,
  name: string,
  csi: string,
  qty: number,
  unit: string,
  unitCost: number,
  laborPct: number,
  opts?: { laborHours?: number; laborRate?: number; assemblyOf?: string },
): EstimateLine | null {
  if (!Number.isFinite(qty) || qty <= 0.05) return null;
  const material = qty * unitCost;
  const labor =
    opts?.laborHours != null && opts.laborRate != null
      ? opts.laborHours * opts.laborRate
      : material * laborPct;
  return {
    key,
    name,
    csi,
    qty,
    unit,
    unitCost,
    material,
    labor,
    laborHours: opts?.laborHours,
    assemblyOf: opts?.assemblyOf,
  };
}

/** Expand exterior envelope into assembly component notes (priced via parent lines). */
export function buildAssemblyBreakdown(takeoff: ConstructionTakeoff): EstimateLine[] {
  if (takeoff.exteriorWallLengthM < 0.5) return [];
  const ft = takeoff.exteriorWallLengthM * M_TO_FT;
  return [
    {
      key: 'asm-ext-studs',
      name: 'Assembly · exterior studs (informational)',
      csi: '06 10 00',
      qty: takeoff.studCount * (takeoff.exteriorWallLengthM / Math.max(0.01, takeoff.wallLengthM)),
      unit: 'ea',
      unitCost: 0,
      material: 0,
      labor: 0,
      assemblyOf: 'sheathing',
    },
    {
      key: 'asm-ext-lf',
      name: 'Assembly · exterior wall LF (informational)',
      csi: '06 10 00',
      qty: ft,
      unit: 'lf',
      unitCost: 0,
      material: 0,
      labor: 0,
      assemblyOf: 'sheathing',
    },
  ].filter((l) => l.qty > 0.05);
}

/** Build priced construction + MEP + site lines from takeoff + rate book. */
export function buildEstimateLines(
  takeoff: ConstructionTakeoff,
  rates: TradeRates,
  quotes: VendorQuote[] = [],
): EstimateLine[] {
  const waste = 1 + (rates.wasteFactor ?? takeoff.wasteFactor ?? 0.1);
  const laborPct = rates.laborPctOfMaterial;
  const hr = rates.laborRatePerHour;
  const sf = (m2: number) => m2 * M2_TO_SF;
  const ft = (m: number) => m * M_TO_FT;
  const raw: (EstimateLine | null)[] = [
    line('excavation', 'Site excavation (proxy)', '31 20 00', takeoff.excavationCy, 'cy', rates.excavationPerCy, laborPct),
    line('footing', 'Continuous footing', '03 30 00', ft(takeoff.footingLengthM), 'lf', rates.footingPerFt, laborPct),
    line('slab', 'Slab on grade', '03 30 00', sf(takeoff.slabAreaM2), 'sf', rates.slabPerSf, laborPct, {
      laborHours: sf(takeoff.slabAreaM2) / 350,
      laborRate: hr,
    }),
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
      takeoff.avgInsulationR != null && takeoff.avgInsulationR > 0
        ? `Wall insulation (R-${takeoff.avgInsulationR.toFixed(0)})`
        : 'Wall insulation',
      '07 21 00',
      sf(takeoff.insulationAreaM2) * waste,
      'sf',
      rates.insulationPerSf,
      laborPct,
    ),
    line('drywall', 'Drywall (both faces + waste)', '09 29 00', sf(takeoff.drywallAreaM2) * waste, 'sf', rates.drywallPerSf, laborPct, {
      laborHours: (sf(takeoff.drywallAreaM2) * waste) / 80,
      laborRate: hr,
    }),
    line('paint', 'Interior paint (+ waste)', '09 91 00', sf(takeoff.paintAreaM2) * waste, 'sf', rates.paintPerSf, laborPct),
    line('baseboard', 'Baseboard', '06 20 00', ft(takeoff.baseboardLengthM), 'lf', rates.baseboardPerFt, laborPct),
    line('flooring', 'Flooring allowance', '09 60 00', sf(takeoff.flooringAreaM2), 'sf', rates.flooringPerSf, laborPct),
    line('doors', 'Doors (allowance)', '08 10 00', takeoff.doorCount, 'ea', rates.doorEach, laborPct),
    line('windows', 'Windows (allowance)', '08 50 00', sf(takeoff.windowAreaM2), 'sf', rates.windowPerSf, laborPct),
    line(
      'elec-outlets',
      'Electrical outlets (schematic)',
      '26 05 00',
      takeoff.electricalOutletCount,
      'ea',
      rates.electricalOutletEach,
      laborPct,
    ),
    line(
      'elec-lights',
      'Lighting fixtures (schematic)',
      '26 51 00',
      takeoff.lightingFixtureCount,
      'ea',
      rates.lightingFixtureEach,
      laborPct,
    ),
    line(
      'elec-panel',
      'Electrical panel (schematic)',
      '26 24 00',
      takeoff.electricalPanelCount,
      'ea',
      rates.electricalPanelEach,
      laborPct,
    ),
    line(
      'plumbing',
      'Plumbing fixtures (schematic)',
      '22 40 00',
      takeoff.plumbingFixtureCount,
      'ea',
      rates.plumbingFixtureEach,
      laborPct,
    ),
    line('hvac', 'HVAC equipment (schematic tons)', '23 00 00', takeoff.hvacTons, 'ton', rates.hvacTonEach, laborPct),
    line('duct', 'Ductwork (schematic)', '23 31 00', ft(takeoff.ductLengthM), 'lf', rates.ductPerFt, laborPct),
    line(
      'landscape',
      'Landscaping allowance',
      '32 90 00',
      sf(takeoff.landscapingAreaM2),
      'sf',
      rates.landscapingPerSf,
      laborPct,
    ),
  ];

  // Named room finishes as explicit schedule lines (allowance already in flooring; tag for SOV clarity).
  for (const fin of takeoff.finishSchedule ?? []) {
    if (!fin.floorName) continue;
    raw.push(
      line(
        `finish-${fin.roomId}`,
        `Finish · ${fin.roomName} (${fin.floorName})`,
        '09 60 00',
        sf(fin.areaM2),
        'sf',
        0,
        0,
      ),
    );
  }

  let lines = [...raw.filter((l): l is EstimateLine => !!l), ...buildAssemblyBreakdown(takeoff)];

  // Apply vendor quotes: replace matching lineKey material+labor with quoted lump sum.
  for (const q of quotes) {
    if (!q.lineKey || !Number.isFinite(q.amount) || q.amount < 0) continue;
    const idx = lines.findIndex((l) => l.key === q.lineKey);
    if (idx < 0) {
      lines.push({
        key: `quote-${q.id}`,
        name: `${q.vendor}: ${q.label}`,
        csi: q.csi ?? '01 00 00',
        qty: 1,
        unit: 'ls',
        unitCost: q.amount,
        material: q.amount,
        labor: 0,
        quoteId: q.id,
      });
      continue;
    }
    const prev = lines[idx]!;
    lines[idx] = {
      ...prev,
      name: `${prev.name} (quote: ${q.vendor})`,
      material: q.amount,
      labor: 0,
      unitCost: q.amount / Math.max(prev.qty, 1),
      quoteId: q.id,
    };
  }

  return lines;
}

export function computeEstimateTotals(lines: EstimateLine[], rates: TradeRates): EstimateTotals {
  // Informational assembly rows carry $0 and should not affect totals.
  const priced = lines.filter((l) => !l.assemblyOf || l.material > 0 || l.labor > 0);
  const material = priced.reduce((s, l) => s + l.material, 0);
  const labor = priced.reduce((s, l) => s + l.labor, 0);
  const subtotal = material + labor;
  const contingency = subtotal * (rates.contingencyPct ?? 0);
  const escalation = (subtotal + contingency) * (rates.escalationPct ?? 0);
  const markup = (subtotal + contingency + escalation) * rates.markupPct;
  const taxable = subtotal + contingency + escalation + markup;
  const tax = taxable * rates.taxPct;
  const preBond = taxable + tax;
  const bond = preBond * (rates.bondPct ?? 0);
  return {
    material,
    labor,
    subtotal,
    contingency,
    escalation,
    markup,
    tax,
    bond,
    grandTotal: preBond + bond,
  };
}

export function buildEstimateSnapshot(input: {
  takeoff: ConstructionTakeoff;
  rates?: TradeRates;
  quotes?: VendorQuote[];
  version?: number;
  previousVersion?: number;
  label?: string;
}): EstimateSnapshot {
  const rates = { ...DEFAULT_TRADE_RATES, ...input.rates };
  const lines = buildEstimateLines(input.takeoff, rates, input.quotes ?? []);
  const totals = computeEstimateTotals(lines, rates);
  const version = input.version ?? (input.previousVersion != null ? input.previousVersion + 1 : 1);
  return {
    version,
    savedAt: new Date().toISOString(),
    label: input.label ?? `Bid v${version}`,
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
  reason?: string;
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
    status: 'draft',
    reason: input.reason,
  };
}

export function setChangeOrderStatus(
  record: ChangeOrderRecord,
  status: ChangeOrderStatus,
): ChangeOrderRecord {
  return {
    ...record,
    status,
    decidedAt: status === 'draft' ? undefined : new Date().toISOString(),
  };
}
