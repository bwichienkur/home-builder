import { Download, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { CatalogItem } from '../catalog/catalogData';
import type { FurnitureItem, Opening, PlanRoomLabel, Wall } from '../../types';
import { roomArea } from '../../lib/geometry/rooms';
import { usePlannerStore } from '../../store/plannerStore';

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
  category: string;
  qty: number;
  unit?: string;
  price?: number;
  removable: boolean;
  kind: 'product' | 'floor' | 'manual';
};

export function BomDialog({
  items,
  catalog,
  walls = [],
  openings = [],
  planRooms = [],
  close,
}: {
  items: FurnitureItem[];
  catalog: CatalogItem[];
  walls?: Wall[];
  openings?: Opening[];
  planRooms?: PlanRoomLabel[];
  close: () => void;
}) {
  const removeCatalogFromRoom = usePlannerStore((s) => s.removeCatalogFromRoom);
  const manualBomLines = usePlannerStore((s) => s.manualBomLines);
  const addManualBomLine = usePlannerStore((s) => s.addManualBomLine);
  const removeManualBomLine = usePlannerStore((s) => s.removeManualBomLine);
  const clearFloorFinish = usePlannerStore((s) => s.clearFloorFinish);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualPrice, setManualPrice] = useState('');

  void walls;
  void openings;

  const productRows: BomRow[] = Object.values(
    items.reduce<Record<string, BomRow>>((all, item) => {
      const product = catalog.find((p) => p.id === item.catalogId);
      const add = lineQty(item, product);
      const row = all[item.catalogId];
      if (row) row.qty += add;
      else
        all[item.catalogId] = {
          key: item.catalogId,
          name: item.name,
          brand: product?.brand,
          sku: product?.sku ?? item.catalogId,
          category: item.category,
          qty: add,
          unit: product?.priceUnit ?? 'each',
          price: product?.price,
          removable: true,
          kind: 'product',
        };
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
    floorRows.push({
      key: `floor-${room.id}-${room.floorCatalogId}`,
      name: room.floorName ?? product?.name ?? 'Floor finish',
      brand: product?.brand,
      sku: product?.sku ?? room.floorCatalogId,
      category: product?.category ?? 'Tile',
      qty: areaM2 * M2_TO_SQFT,
      unit: product?.priceUnit ?? 'sq ft',
      price: product?.price,
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
    removable: true,
    kind: 'manual',
  }));

  const rows = [...floorRows, ...productRows, ...manualRows].sort(
    (a, b) => (a.brand ?? '').localeCompare(b.brand ?? '') || a.name.localeCompare(b.name),
  );
  const total = rows.reduce((sum, row) => sum + (row.price ?? 0) * row.qty, 0);
  const missing = rows.filter((row) => row.price == null).length;

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
    removeCatalogFromRoom(row.key);
  };

  const download = () => {
    const csv = [
      'Vendor,SKU,Product,Category,Quantity,Unit,Unit price,Subtotal,Price status',
      ...rows.map((row) =>
        [
          row.brand ?? '',
          row.sku ?? row.key,
          row.name,
          row.category,
          formatQty(row.qty, row.unit),
          row.unit ?? 'each',
          row.price ?? '',
          row.price != null ? (row.price * row.qty).toFixed(2) : '',
          row.price == null ? 'Quote required' : 'Reference price',
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(','),
      ),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'roomcraft-bill-of-materials.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="inventory-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="inventory-dialog bom-dialog" role="dialog" aria-modal="true" aria-labelledby="bom-title">
        <header>
          <div>
            <p className="eyebrow">SHOPPING LIST</p>
            <h2 id="bom-title">Products in this room</h2>
          </div>
          <button onClick={close} aria-label="Close">
            <X />
          </button>
        </header>
        {missing > 0 && (
          <div className="inventory-warning">
            {missing} product {missing === 1 ? 'line needs' : 'lines need'} a vendor quote. The total below only includes known reference prices and is not treated as $0.
          </div>
        )}
        <div className="inventory-preview">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Vendor / SKU</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Subtotal</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <p className="muted">No products yet — add furniture, tile, or a manual line below.</p>
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.unit ?? 'each'}</small>
                  </td>
                  <td>
                    {row.brand ?? '—'}
                    <small>{row.sku ?? row.key}</small>
                  </td>
                  <td>{formatQty(row.qty, row.unit)}</td>
                  <td>{row.price == null ? 'Quote required' : `$${row.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</td>
                  <td>{row.price == null ? '—' : `$${(row.price * row.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</td>
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
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="bom-manual-add"
          onSubmit={(e) => {
            e.preventDefault();
            addManual();
          }}
        >
          <strong>Add manual item</strong>
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
        <div className="bom-total">
          <span>Known product total</span>
          <strong>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
        <p className="muted">Reference product prices do not include tax, freight, waste, fabrication, installation, labor, permits, or builder markup unless explicitly included by the vendor.</p>
        <footer>
          <button onClick={download}>
            <Download size={16} /> Export CSV
          </button>
        </footer>
      </section>
    </div>
  );
}
