import { Download, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CatalogItem } from '../catalog/catalogData';
import type { FurnitureItem, Opening, PlanRoomLabel, UnitSystem, Wall } from '../../types';
import { roomArea } from '../../lib/geometry/rooms';
import { usePlannerStore } from '../../store/plannerStore';
import { pickTradeRates, useTradeRatesStore } from '../../store/tradeRatesStore';
import { computeHouseTakeoff } from '../../lib/houseEstimate';
import {
  buildEstimateLines,
  buildEstimateSnapshot,
  computeEstimateTotals,
  createChangeOrderRecord,
  diffEstimateAgainstBaseline,
  ESTIMATE_DISCLAIMER,
} from '../../lib/estimateSnapshot';
import {
  downloadBidProposalPdf,
  downloadTextFile as downloadBidFile,
  scheduleOfValuesCsv,
} from '../../lib/bidPackage';
import { canEditTradeRates, canManageEstimates } from '../../lib/platform/roles';
import { useAuthStore } from '../../store/authStore';

const M_TO_FT = 1 / 0.3048;
const M2_TO_SQFT = M_TO_FT * M_TO_FT;

function lineQty(item: FurnitureItem, product?: CatalogItem) {
  if (product?.priceUnit === 'linear ft' || item.placementKind === 'perimeter-trim') {
    return item.width * M_TO_FT;
  }
  return 1;
}

function formatQty(qty: number, unit?: string) {
  if (unit === 'linear ft' || unit === 'sq ft') return qty.toFixed(1);
  return String(Math.round(qty * 100) / 100);
}

type BomRow = {
  key: string;
  name: string;
  brand?: string;
  sku?: string;
  csi?: string;
  category: string;
  qty: number;
  unit?: string;
  /** FF&E / sell reference */
  price?: number;
  /** Builder material cost */
  cost?: number;
  /** Builder labor */
  laborCost?: number;
  removable: boolean;
  kind: 'product' | 'floor' | 'manual' | 'construction';
};

type Tab = 'ffe' | 'estimate';

export function BomDialog({
  items,
  catalog,
  walls = [],
  openings = [],
  planRooms = [],
  unitSystem = 'imperial',
  close,
}: {
  items: FurnitureItem[];
  catalog: CatalogItem[];
  walls?: Wall[];
  openings?: Opening[];
  planRooms?: PlanRoomLabel[];
  unitSystem?: UnitSystem;
  close: () => void;
}) {
  const removeCatalogFromRoom = usePlannerStore((s) => s.removeCatalogFromRoom);
  const manualBomLines = usePlannerStore((s) => s.manualBomLines);
  const addManualBomLine = usePlannerStore((s) => s.addManualBomLine);
  const removeManualBomLine = usePlannerStore((s) => s.removeManualBomLine);
  const clearFloorFinish = usePlannerStore((s) => s.clearFloorFinish);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);
  const rates = useTradeRatesStore();
  const [tab, setTab] = useState<Tab>('ffe');
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualPrice, setManualPrice] = useState('');
  const [ratesOpen, setRatesOpen] = useState(false);

  const productRows: BomRow[] = Object.values(
    items
      .filter((item) => item.placementKind !== 'stair')
      .reduce<Record<string, BomRow>>((all, item) => {
        const product = catalog.find((p) => p.id === item.catalogId);
        const add = lineQty(item, product);
        const row = all[item.catalogId];
        if (row) {
          row.qty += add;
          if (product?.laborCost != null) row.laborCost = (row.laborCost ?? 0) + product.laborCost * add;
        } else {
          all[item.catalogId] = {
            key: item.catalogId,
            name: item.name,
            brand: product?.brand,
            sku: product?.sku ?? item.catalogId,
            category: item.category,
            qty: add,
            unit: product?.priceUnit ?? 'each',
            price: product?.price,
            cost: product?.cost,
            laborCost: product?.laborCost != null ? product.laborCost * add : undefined,
            removable: true,
            kind: 'product',
          };
        }
        return all;
      }, {}),
  );

  const floorRows: BomRow[] = [];
  const roomsWithFloor = planRooms.filter((r) => r.floorCatalogId);
  const focusRooms =
    selectedRoomId && roomsWithFloor.some((r) => r.id === selectedRoomId)
      ? roomsWithFloor.filter((r) => r.id === selectedRoomId)
      : roomsWithFloor;
  for (const room of focusRooms) {
    const product = catalog.find((p) => p.id === room.floorCatalogId);
    if (!product && !room.floorName) continue;
    const areaM2 = roomArea(room.points);
    const qty = areaM2 * M2_TO_SQFT;
    floorRows.push({
      key: `floor-${room.id}-${room.floorCatalogId}`,
      name: room.floorName ?? product?.name ?? 'Floor finish',
      brand: product?.brand,
      sku: product?.sku ?? room.floorCatalogId,
      category: product?.category ?? 'Tile',
      qty,
      unit: product?.priceUnit ?? 'sq ft',
      price: product?.price,
      cost: product?.cost,
      laborCost: product?.laborCost != null ? product.laborCost * qty : undefined,
      removable: true,
      kind: 'floor',
    });
  }

  const manualRows: BomRow[] = manualBomLines.map((line) => ({
    key: line.id,
    name: line.name,
    category: 'Manual',
    qty: line.qty,
    unit: line.unit,
    price: line.price,
    cost: line.price,
    removable: true,
    kind: 'manual',
  }));

  const ratesPicked = useMemo(() => pickTradeRates(rates), [rates]);
  const takeoff = useMemo(
    () =>
      computeHouseTakeoff({
        floors,
        activeFloorId,
        live: { walls, openings, furniture: items, planRooms },
        wasteFactor: ratesPicked.wasteFactor,
      }),
    [floors, activeFloorId, walls, openings, items, planRooms, ratesPicked.wasteFactor],
  );

  const floorCount = floors.length;
  const vendorQuotes = usePlannerStore((s) => s.vendorQuotes);
  const addVendorQuote = usePlannerStore((s) => s.addVendorQuote);
  const removeVendorQuote = usePlannerStore((s) => s.removeVendorQuote);
  const bidSettings = usePlannerStore((s) => s.bidSettings);
  const setBidSettings = usePlannerStore((s) => s.setBidSettings);
  const setChangeOrderStatus = usePlannerStore((s) => s.setChangeOrderStatus);
  const estimateLines = useMemo(
    () => buildEstimateLines(takeoff, ratesPicked, vendorQuotes),
    [takeoff, ratesPicked, vendorQuotes],
  );
  const estimateTotals = useMemo(() => computeEstimateTotals(estimateLines, ratesPicked), [estimateLines, ratesPicked]);

  const constructionRows: BomRow[] = estimateLines
    .filter((l) => !l.assemblyOf || l.material > 0 || l.labor > 0)
    .map((l) => ({
      key: `const-${l.key}`,
      name: l.name,
      category: 'Construction',
      sku: l.csi,
      csi: l.csi,
      qty: l.qty,
      unit: l.unit,
      cost: l.unitCost,
      laborCost: l.labor,
      removable: false,
      kind: 'construction',
    }));

  const baseline = usePlannerStore((s) => s.baselineEstimate);
  const setEstimateSnapshot = usePlannerStore((s) => s.setEstimateSnapshot);
  const lockBaseline = usePlannerStore((s) => s.lockEstimateBaseline);
  const clearBaseline = usePlannerStore((s) => s.clearEstimateBaseline);
  const changeOrders = usePlannerStore((s) => s.changeOrders);
  const addChangeOrder = usePlannerStore((s) => s.addChangeOrder);
  const role = useAuthStore((s) => s.user?.role);
  const canEditRates = canEditTradeRates(role);
  const canEstimate = canManageEstimates(role);
  const [quoteVendor, setQuoteVendor] = useState('');
  const [quoteLabel, setQuoteLabel] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteLineKey, setQuoteLineKey] = useState('');
  const [bidOpen, setBidOpen] = useState(false);

  const liveSnapPreview = useMemo(
    () => ({
      version: 0,
      savedAt: '',
      label: 'Live',
      disclaimer: ESTIMATE_DISCLAIMER,
      takeoff,
      rates: ratesPicked,
      lines: estimateLines,
      totals: estimateTotals,
    }),
    [takeoff, ratesPicked, estimateLines, estimateTotals],
  );
  const changeOrder = useMemo(
    () => diffEstimateAgainstBaseline(liveSnapPreview, baseline),
    [liveSnapPreview, baseline],
  );

  const ffeRows = [...floorRows, ...productRows, ...manualRows].sort(
    (a, b) => (a.brand ?? '').localeCompare(b.brand ?? '') || a.name.localeCompare(b.name),
  );
  const estimateProductRows = ffeRows.map((r) => ({
    ...r,
    // Prefer cost; fall back to sell as soft allowance when cost missing.
    cost: r.cost ?? r.price,
  }));
  const estimateRows = [...constructionRows, ...estimateProductRows];

  const ffeTotal = ffeRows.reduce((sum, row) => sum + (row.price ?? 0) * row.qty, 0);
  const ffeMissing = ffeRows.filter((row) => row.price == null).length;
  const materialTotal = estimateRows.reduce((sum, row) => sum + (row.cost ?? 0) * row.qty, 0);
  const laborTotal = estimateRows.reduce((sum, row) => {
    if (row.kind === 'construction') return sum + (row.laborCost ?? 0);
    if (row.laborCost != null) return sum + row.laborCost;
    // Soft labor when only unit cost known.
    return sum + (row.cost ?? 0) * row.qty * 0.25;
  }, 0);
  const estimateTotal = materialTotal + laborTotal;

  const rows = tab === 'ffe' ? ffeRows : estimateRows;

  const addManual = () => {
    const name = manualName.trim();
    const qty = Number(manualQty);
    const price = Number(manualPrice);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return;
    addManualBomLine({ name, qty, unit: 'each', price });
    setManualName('');
    setManualQty('1');
    setManualPrice('');
  };

  const removeRow = (row: BomRow) => {
    if (row.kind === 'manual') {
      removeManualBomLine(row.key);
      return;
    }
    if (row.kind === 'floor') {
      clearFloorFinish();
      return;
    }
    if (row.kind === 'construction') return;
    removeCatalogFromRoom(row.key);
  };

  const download = () => {
    const isEstimate = tab === 'estimate';
    const header = isEstimate
      ? 'CSI,Section,SKU,Item,Category,Quantity,Unit,Material unit $,Labor $,Subtotal (mat+labor),Notes'
      : 'Vendor,SKU,Product,Category,Quantity,Unit,Unit price,Subtotal,Price status';
    const body = rows.map((row) => {
      if (isEstimate) {
        const mat = (row.cost ?? 0) * row.qty;
        const labor =
          row.kind === 'construction'
            ? row.laborCost ?? 0
            : row.laborCost ?? mat * 0.25;
        return [
          row.csi ?? '',
          row.kind === 'construction' ? 'Construction' : 'FF&E',
          row.sku ?? row.key,
          row.name,
          row.category,
          formatQty(row.qty, row.unit),
          row.unit ?? 'each',
          row.cost ?? '',
          labor.toFixed(2),
          (mat + labor).toFixed(2),
          row.cost == null && row.price == null ? 'Allowance / quote' : 'Reference',
        ];
      }
      return [
        row.brand ?? '',
        row.sku ?? row.key,
        row.name,
        row.category,
        formatQty(row.qty, row.unit),
        row.unit ?? 'each',
        row.price ?? '',
        row.price != null ? (row.price * row.qty).toFixed(2) : '',
        row.price == null ? 'Quote required' : 'Reference price',
      ];
    });
    const csv = [header, ...body.map((cols) => cols.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))].join(
      '\n',
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = isEstimate ? 'builder-estimate.csv' : 'ffe-shopping-list.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div
      className="inventory-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="inventory-dialog bom-dialog" role="dialog" aria-modal="true" aria-labelledby="bom-title">
        <header>
          <div>
            <p className="eyebrow">{tab === 'ffe' ? 'FF&E' : 'ESTIMATE'}</p>
            <h2 id="bom-title">{tab === 'ffe' ? 'Furniture & finishes list' : 'Construction estimate'}</h2>
          </div>
          <button onClick={close} aria-label="Close">
            <X />
          </button>
        </header>

        <div className="bom-tabs" role="tablist" aria-label="List type">
          <button type="button" role="tab" aria-selected={tab === 'ffe'} className={tab === 'ffe' ? 'active' : ''} onClick={() => setTab('ffe')}>
            FF&E shopping
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'estimate'}
            className={tab === 'estimate' ? 'active' : ''}
            onClick={() => setTab('estimate')}
          >
            Builder estimate
          </button>
        </div>

        {tab === 'ffe' && ffeMissing > 0 && (
          <div className="inventory-warning">
            {ffeMissing} line {ffeMissing === 1 ? 'needs' : 'need'} a vendor quote. The FF&E total only includes known
            sell prices — not a construction bid.
          </div>
        )}
        {tab === 'estimate' && (
          <div className="inventory-warning">{ESTIMATE_DISCLAIMER}</div>
        )}

        {tab === 'estimate' && (
          <div className="bom-rate-book">
            <div className="bom-rate-actions">
              <button type="button" className="bom-rate-toggle" onClick={() => setRatesOpen((v) => !v)}>
                {ratesOpen ? 'Hide trade rates' : canEditRates ? 'Edit trade rates' : 'View trade rates'}
              </button>
              {canEstimate && (
                <button
                  type="button"
                  className="bom-rate-toggle"
                  onClick={() => {
                  const snap = buildEstimateSnapshot({
                    takeoff,
                    rates: ratesPicked,
                    quotes: vendorQuotes,
                    previousVersion: baseline?.version ?? 0,
                    label: 'Baseline',
                  });
                  setEstimateSnapshot(snap);
                  lockBaseline();
                }}
                title="Lock current live estimate as change-order baseline"
              >
                Lock baseline
              </button>
              )}
              {canEstimate && baseline && (
                <button
                  type="button"
                  className="bom-rate-toggle"
                  onClick={() => {
                    const live = buildEstimateSnapshot({
                      takeoff,
                      rates: ratesPicked,
                      quotes: vendorQuotes,
                      previousVersion: baseline.version,
                      label: `Live vs baseline v${baseline.version}`,
                    });
                    setEstimateSnapshot(live);
                    const record = createChangeOrderRecord({
                      live,
                      baseline,
                      previous: changeOrders,
                    });
                    addChangeOrder(record);
                  }}
                  title="Mint a numbered change-order record from live vs baseline"
                >
                  Create CO
                </button>
              )}
              {canEstimate && (
                <button
                  type="button"
                  className="bom-rate-toggle"
                  onClick={() => {
                    const snap = buildEstimateSnapshot({
                      takeoff,
                      rates: ratesPicked,
                      quotes: vendorQuotes,
                      previousVersion: baseline?.version ?? 0,
                      label: 'Bid package',
                    });
                    setEstimateSnapshot(snap);
                    downloadBidProposalPdf(
                      snap,
                      {
                        projectName: 'Mahnikka project',
                        jurisdiction: bidSettings.jurisdiction,
                        validityDays: bidSettings.validityDays,
                        paymentTerms: bidSettings.paymentTerms,
                        inclusions: bidSettings.inclusions,
                        exclusions: bidSettings.exclusions,
                        alternateNotes: bidSettings.alternateNotes,
                      },
                      'bid-proposal.pdf',
                    );
                  }}
                >
                  Bid proposal PDF
                </button>
              )}
              {canEstimate && (
                <button
                  type="button"
                  className="bom-rate-toggle"
                  onClick={() => {
                    const snap = buildEstimateSnapshot({
                      takeoff,
                      rates: ratesPicked,
                      quotes: vendorQuotes,
                      previousVersion: baseline?.version ?? 0,
                      label: 'SOV',
                    });
                    setEstimateSnapshot(snap);
                    downloadBidFile(
                      scheduleOfValuesCsv(snap, {
                        projectName: 'Mahnikka project',
                        jurisdiction: bidSettings.jurisdiction,
                      }),
                      'schedule-of-values.csv',
                    );
                  }}
                >
                  Export SOV CSV
                </button>
              )}
              <button type="button" className="bom-rate-toggle" onClick={() => setBidOpen((v) => !v)}>
                {bidOpen ? 'Hide bid terms' : 'Bid terms'}
              </button>
              {canEstimate && baseline && (
                <button type="button" className="bom-rate-reset" onClick={() => clearBaseline()}>
                  Clear baseline v{baseline.version}
                </button>
              )}
            </div>
            {changeOrder.hasBaseline && changeOrder.delta != null && (
              <div style={{ marginTop: 8 }}>
                <p className="muted">
                  Change order vs baseline v{changeOrder.baselineVersion}:{' '}
                  <strong>
                    {changeOrder.delta >= 0 ? '+' : ''}
                    ${changeOrder.delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </strong>{' '}
                  (live ${changeOrder.liveGrandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </p>
                {changeOrder.lineDeltas.length > 0 && (
                  <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                    {changeOrder.lineDeltas.slice(0, 8).map((d) => (
                      <li key={d.key}>
                        {d.name}: {d.delta >= 0 ? '+' : ''}$
                        {d.delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {changeOrders.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 12 }}>Change orders</strong>
                <ul className="muted" style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
                  {changeOrders.map((co) => (
                    <li key={co.id}>
                      {co.label} · {co.status ?? 'draft'} · {co.delta >= 0 ? '+' : ''}$
                      {co.delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      {canEstimate && (
                        <span style={{ marginLeft: 8 }}>
                          {(['draft', 'submitted', 'approved', 'rejected'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              className="bom-rate-reset"
                              style={{ marginRight: 4, fontSize: 11 }}
                              disabled={(co.status ?? 'draft') === st}
                              onClick={() => setChangeOrderStatus(co.id, st)}
                            >
                              {st}
                            </button>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {bidOpen && (
              <div className="bom-rate-grid" style={{ marginTop: 10 }}>
                <label>
                  Jurisdiction
                  <input
                    type="text"
                    value={bidSettings.jurisdiction}
                    disabled={!canEstimate}
                    onChange={(e) => setBidSettings({ jurisdiction: e.target.value })}
                  />
                </label>
                <label>
                  Validity days
                  <input
                    type="number"
                    min={1}
                    value={bidSettings.validityDays}
                    disabled={!canEstimate}
                    onChange={(e) => setBidSettings({ validityDays: Number(e.target.value) || 30 })}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Payment terms
                  <input
                    type="text"
                    value={bidSettings.paymentTerms}
                    disabled={!canEstimate}
                    onChange={(e) => setBidSettings({ paymentTerms: e.target.value })}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Inclusions
                  <textarea
                    rows={2}
                    value={bidSettings.inclusions}
                    disabled={!canEstimate}
                    onChange={(e) => setBidSettings({ inclusions: e.target.value })}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Exclusions
                  <textarea
                    rows={2}
                    value={bidSettings.exclusions}
                    disabled={!canEstimate}
                    onChange={(e) => setBidSettings({ exclusions: e.target.value })}
                  />
                </label>
              </div>
            )}
            {canEstimate && (
              <form
                className="bom-manual-add"
                style={{ marginTop: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const amount = Number(quoteAmount);
                  if (!quoteVendor.trim() || !quoteLabel.trim() || !Number.isFinite(amount) || amount < 0) return;
                  addVendorQuote({
                    vendor: quoteVendor.trim(),
                    label: quoteLabel.trim(),
                    amount,
                    lineKey: quoteLineKey || undefined,
                    quoteDate: new Date().toISOString().slice(0, 10),
                  });
                  setQuoteVendor('');
                  setQuoteLabel('');
                  setQuoteAmount('');
                  setQuoteLineKey('');
                }}
              >
                <strong>Vendor quote</strong>
                <div className="bom-manual-fields">
                  <input
                    type="text"
                    placeholder="Vendor"
                    value={quoteVendor}
                    onChange={(e) => setQuoteVendor(e.target.value)}
                    aria-label="Vendor"
                  />
                  <input
                    type="text"
                    placeholder="Quote label"
                    value={quoteLabel}
                    onChange={(e) => setQuoteLabel(e.target.value)}
                    aria-label="Quote label"
                  />
                  <div className="bom-manual-row">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Amount $"
                      value={quoteAmount}
                      onChange={(e) => setQuoteAmount(e.target.value)}
                      aria-label="Quote amount"
                    />
                    <select
                      value={quoteLineKey}
                      onChange={(e) => setQuoteLineKey(e.target.value)}
                      aria-label="Link to line"
                    >
                      <option value="">New lump-sum line</option>
                      {estimateLines.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.csi} {l.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit">
                      <Plus size={16} /> Add quote
                    </button>
                  </div>
                </div>
                {vendorQuotes.length > 0 && (
                  <ul className="muted" style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
                    {vendorQuotes.map((q) => (
                      <li key={q.id}>
                        {q.vendor}: {q.label} · ${q.amount.toLocaleString()}
                        <button type="button" className="bom-rate-reset" onClick={() => removeVendorQuote(q.id)}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </form>
            )}
            {ratesOpen && (
              <div className="bom-rate-grid">
                {(
                  [
                    ['drywallPerSf', 'Drywall $/SF'],
                    ['paintPerSf', 'Paint $/SF'],
                    ['studEach', 'Stud $'],
                    ['platePerFt', 'Plate $/LF'],
                    ['headerEach', 'Header $'],
                    ['sheathingPerSf', 'Sheathing $/SF'],
                    ['insulationPerSf', 'Insulation $/SF'],
                    ['baseboardPerFt', 'Baseboard $/LF'],
                    ['flooringPerSf', 'Flooring $/SF'],
                    ['slabPerSf', 'Slab $/SF'],
                    ['footingPerFt', 'Footing $/LF'],
                    ['roofPerSf', 'Roof $/SF'],
                    ['doorEach', 'Door $'],
                    ['windowPerSf', 'Window $/SF'],
                    ['electricalOutletEach', 'Outlet $'],
                    ['lightingFixtureEach', 'Light $'],
                    ['electricalPanelEach', 'Panel $'],
                    ['plumbingFixtureEach', 'Plumbing fix $'],
                    ['hvacTonEach', 'HVAC $/ton'],
                    ['ductPerFt', 'Duct $/LF'],
                    ['excavationPerCy', 'Excavation $/CY'],
                    ['landscapingPerSf', 'Landscape $/SF'],
                    ['laborPctOfMaterial', 'Labor × mat'],
                    ['laborRatePerHour', 'Labor $/hr'],
                    ['wasteFactor', 'Waste'],
                    ['contingencyPct', 'Contingency'],
                    ['escalationPct', 'Escalation'],
                    ['markupPct', 'OH&P markup'],
                    ['taxPct', 'Tax'],
                    ['bondPct', 'Bond'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={rates[key]}
                      disabled={!canEditRates}
                      onChange={(e) => rates.setRate(key, Number(e.target.value))}
                    />
                  </label>
                ))}
                {canEditRates && (
                  <button type="button" className="bom-rate-reset" onClick={() => rates.resetRates()}>
                    Reset defaults
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="inventory-preview">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>{tab === 'ffe' ? 'Vendor / SKU' : 'SKU / section'}</th>
                <th>Qty</th>
                <th>{tab === 'ffe' ? 'Sell $' : 'Mat $'}</th>
                <th>Subtotal</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <p className="muted">No lines yet — place products or draw walls for takeoff.</p>
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const unitSell = tab === 'ffe' ? row.price : row.cost;
                const mat = (row.cost ?? 0) * row.qty;
                const labor =
                  row.kind === 'construction' ? row.laborCost ?? 0 : row.laborCost ?? mat * 0.25;
                const sub =
                  tab === 'ffe'
                    ? row.price != null
                      ? row.price * row.qty
                      : null
                    : mat + labor;
                return (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.name}</strong>
                      <small>
                        {row.unit ?? 'each'}
                        {row.kind === 'construction' ? ' · takeoff' : ''}
                      </small>
                    </td>
                    <td>
                      {tab === 'ffe'
                        ? row.brand ?? '—'
                        : row.kind === 'construction'
                          ? row.csi ?? 'Takeoff'
                          : row.brand ?? '—'}
                      <small>{row.sku ?? row.key}</small>
                    </td>
                    <td>{formatQty(row.qty, row.unit)}</td>
                    <td>
                      {unitSell == null
                        ? 'Quote'
                        : `$${unitSell.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td>
                      {sub == null ? '—' : `$${sub.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td>
                      {row.removable ? (
                        <button
                          type="button"
                          className="bom-remove"
                          aria-label={`Remove ${row.name}`}
                          title="Remove"
                          onClick={() => removeRow(row)}
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tab === 'ffe' && (
          <form
            className="bom-manual-add"
            onSubmit={(e) => {
              e.preventDefault();
              addManual();
            }}
          >
            <strong>Add manual FF&E item</strong>
            <div className="bom-manual-fields">
              <input
                type="text"
                className="bom-manual-name"
                placeholder="Item name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                aria-label="Manual item name"
              />
              <div className="bom-manual-row">
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  placeholder="Qty"
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  aria-label="Quantity"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Unit $"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  aria-label="Unit price"
                />
                <button type="submit" aria-label="Add manual item">
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="bom-total">
          {tab === 'ffe' ? (
            <>
              <span>FF&E sell total (known prices)</span>
              <strong>${ffeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </>
          ) : (
            <>
              <span>
                {floorCount} fl · mat ${estimateTotals.material.toLocaleString(undefined, { maximumFractionDigits: 0 })} ·
                labor ${estimateTotals.labor.toLocaleString(undefined, { maximumFractionDigits: 0 })} · cont $
                {estimateTotals.contingency.toLocaleString(undefined, { maximumFractionDigits: 0 })} · esc $
                {estimateTotals.escalation.toLocaleString(undefined, { maximumFractionDigits: 0 })} · OH&P $
                {estimateTotals.markup.toLocaleString(undefined, { maximumFractionDigits: 0 })} · tax $
                {estimateTotals.tax.toLocaleString(undefined, { maximumFractionDigits: 0 })} · bond $
                {estimateTotals.bond.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <strong>
                ${estimateTotals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </>
          )}
        </div>
        <p className="muted">
          {tab === 'ffe'
            ? 'Shopping list for furniture & finishes only — not a construction bid.'
            : ESTIMATE_DISCLAIMER}
        </p>
        <footer>
          <button onClick={download}>
            <Download size={16} /> Export CSV
          </button>
        </footer>
      </section>
    </div>
  );
}
