import { Download, X } from 'lucide-react';
import type { CatalogItem } from '../catalog/catalogData';
import type { FurnitureItem } from '../../types';

export function BomDialog({ items, catalog, close }: { items: FurnitureItem[]; catalog: CatalogItem[]; close: () => void }) {
  const rows = Object.values(
    items.reduce<Record<string, { item: FurnitureItem; qty: number; product?: CatalogItem }>>((all, item) => {
      const row = all[item.catalogId];
      if (row) row.qty++;
      else all[item.catalogId] = { item, qty: 1, product: catalog.find((p) => p.id === item.catalogId) };
      return all;
    }, {}),
  ).sort((a, b) => (a.product?.brand ?? '').localeCompare(b.product?.brand ?? '') || a.item.name.localeCompare(b.item.name));
  const total = rows.reduce((sum, row) => sum + (row.product?.price ?? 0) * row.qty, 0);
  const missing = rows.filter((row) => row.product?.price == null).length;
  const download = () => {
    const csv = [
      'Vendor,SKU,Product,Category,Quantity,Unit price,Subtotal,Price status',
      ...rows.map(({ item, qty, product }) =>
        [
          product?.brand ?? '',
          product?.sku ?? item.catalogId,
          item.name,
          item.category,
          qty,
          product?.price ?? '',
          product?.price != null ? (product.price * qty).toFixed(2) : '',
          product?.price == null ? 'Quote required' : 'Reference price',
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
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, qty, product }) => (
                <tr key={item.catalogId}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>{product?.priceUnit ?? 'each'}</small>
                  </td>
                  <td>
                    {product?.brand ?? '—'}
                    <small>{product?.sku ?? item.catalogId}</small>
                  </td>
                  <td>{qty}</td>
                  <td>{product?.price == null ? 'Quote required' : `$${product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</td>
                  <td>{product?.price == null ? '—' : `$${(product.price * qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</td>
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
