import { Download, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CatalogItem } from '../catalog/catalogData';
import type { FurnitureItem, Opening, PlanRoomLabel, UnitSystem, Wall } from '../../types';
import { roomArea } from '../../lib/geometry/rooms';
import { computeConstructionTakeoff } from '../../lib/constructionTakeoff';
import { usePlannerStore } from '../../store/plannerStore';

const M_TO_FT = 1 / 0.3048;
const M2_TO_SQFT = M_TO_FT * M_TO_FT;

/** Soft allowance rates ($ / unit) for construction estimate lines when no catalog cost exists. */
const ALLOWANCE = {
  drywallPerSf: 1.85,
  paintPerSf: 0.85,
  studEach: 4.5,
  sheathingPerSf: 1.35,
  baseboardPerFt: 2.75,
  laborPctOfMaterial: 0.55,
};

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
  const [tab, setTab] = useState<Tab>('ffe');
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualPrice, setManualPrice] = useState('');

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

  const takeoff = useMemo(
    () => computeConstructionTakeoff({ walls, openings, furniture: items }),
    [walls, openings, items],
  );

  const imperial = unitSystem === 'imperial';
  const toSf = (m2: number) => (imperial ? m2 / 0.09290304 : m2);
  const toFt = (m: number) => (imperial ? m / 0.3048 : m);
  const areaUnit = imperial ? 'sq ft' : 'm2';
  const lenUnit = imperial ? 'linear ft' : 'm';
  const waste = 1 + takeoff.wasteFactor;

  const constructionRows: BomRow[] = (
    [
      {
        key: 'const-drywall',
        name: 'Drywall (both faces + waste)',
        category: 'Construction',
        qty: toSf(takeoff.drywallAreaM2) * waste,
        unit: areaUnit,
        cost: ALLOWANCE.drywallPerSf,
        laborCost: ALLOWANCE.drywallPerSf * ALLOWANCE.laborPctOfMaterial * toSf(takeoff.drywallAreaM2) * waste,
        removable: false,
        kind: 'construction' as const,
      },
      {
        key: 'const-paint',
        name: 'Interior paint (+ waste)',
        category: 'Construction',
        qty: toSf(takeoff.paintAreaM2) * waste,
        unit: areaUnit,
        cost: ALLOWANCE.paintPerSf,
        laborCost: ALLOWANCE.paintPerSf * ALLOWANCE.laborPctOfMaterial * toSf(takeoff.paintAreaM2) * waste,
        removable: false,
        kind: 'construction' as const,
      },
      {
        key: 'const-studs',
        name: 'Studs (16″ OC)',
        category: 'Construction',
        qty: takeoff.studCount,
        unit: 'each',
        cost: ALLOWANCE.studEach,
        laborCost: ALLOWANCE.studEach * ALLOWANCE.laborPctOfMaterial * takeoff.studCount,
        removable: false,
        kind: 'construction' as const,
      },
      {
        key: 'const-sheathing',
        name: 'Exterior sheathing (+ waste)',
        category: 'Construction',
        qty: toSf(takeoff.exteriorSheathingAreaM2) * waste,
        unit: areaUnit,
        cost: ALLOWANCE.sheathingPerSf,
        laborCost: ALLOWANCE.sheathingPerSf * ALLOWANCE.laborPctOfMaterial * toSf(takeoff.exteriorSheathingAreaM2) * waste,
        removable: false,
        kind: 'construction' as const,
      },
      {
        key: 'const-baseboard',
        name: 'Baseboard (interior)',
        category: 'Construction',
        qty: toFt(takeoff.baseboardLengthM),
        unit: lenUnit,
        cost: ALLOWANCE.baseboardPerFt,
        laborCost: ALLOWANCE.baseboardPerFt * ALLOWANCE.laborPctOfMaterial * toFt(takeoff.baseboardLengthM),
        removable: false,
        kind: 'construction' as const,
      },
    ] as BomRow[]
  ).filter((r) => r.qty > 0.05);

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
      ? 'Section,SKU,Item,Category,Quantity,Unit,Material unit $,Labor $,Subtotal (mat+labor),Notes'
      : 'Vendor,SKU,Product,Category,Quantity,Unit,Unit price,Subtotal,Price status';
    const body = rows.map((row) => {
      if (isEstimate) {
        const mat = (row.cost ?? 0) * row.qty;
        const labor =
          row.kind === 'construction'
            ? row.laborCost ?? 0
            : row.laborCost ?? mat * 0.25;
        return [
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
          <div className="inventory-warning">
            Construction lines use geometric takeoff + soft allowance rates. Replace with your cost book before bidding.
            Tax, permits, and markup are not included.
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
                      {tab === 'ffe' ? row.brand ?? '—' : row.kind === 'construction' ? 'Takeoff' : row.brand ?? '—'}
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
                Estimate · mat ${materialTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} + labor $
                {laborTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <strong>
                ${estimateTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </>
          )}
        </div>
        <p className="muted">
          {tab === 'ffe'
            ? 'Shopping list for furniture & finishes only — not a construction bid.'
            : 'Soft allowances for drywall, paint, studs, sheathing, and baseboard from plan geometry. Override rates in your cost book.'}
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
