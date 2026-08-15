import { Download, Trash2, X } from 'lucide-react';
import type { CatalogItem } from '../catalog/catalogData';
import type { FurnitureItem, Opening, Wall } from '../../types';
import { wallsNetAreaM2 } from '../../lib/geometry/doorClearance';
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
  return String(Math.round(qty));
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
};

export function BomDialog({
  items,
  catalog,
  walls = [],
  openings = [],
  close,
}: {
  items: FurnitureItem[];
  catalog: CatalogItem[];
  walls?: Wall[];
  openings?: Opening[];
  close: () => void;
}) {
  const removeCatalogFromRoom = usePlannerStore((s) => s.removeCatalogFromRoom);

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
        };
      return all;
    }, {}),
  );

  const paint = catalog.find((p) => p.id === 'interior-paint');
  const netWallM2 = wallsNetAreaM2(walls, openings);
  const wallRows: BomRow[] =
    walls.length && paint
      ? [
          {
            key: 'interior-paint',
            name: paint.name,
            brand: paint.brand,
            sku: paint.sku ?? paint.id,
            category: paint.category,
            qty: netWallM2 * M2_TO_SQFT,
            unit: paint.priceUnit ?? 'sq ft',
            price: paint.price,
            removable: false,
          },
        ]
      : [];

  const rows = [...wallRows, ...productRows].sort(
    (a, b) => (a.brand ?? '').localeCompare(b.brand ?? '') || a.name.localeCompare(b.name),
  );
  const total = rows.reduce((sum, row) => sum + (row.price ?? 0) * row.qty, 0);
  const missing = rows.filter((row) => row.price == null).length;
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
        {walls.length > 0 && (
          <p className="muted">
            Wall finish uses net area after openings ({netWallM2.toFixed(1)} m² / {(netWallM2 * M2_TO_SQFT).toFixed(0)} sf).
          </p>
        )}
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
                        title="Remove from room"
                        onClick={() => removeCatalogFromRoom(row.key)}
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
