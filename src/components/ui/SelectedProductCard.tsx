import { ExternalLink, PencilRuler, X } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { catalog } from '../catalog/catalogData';
import { complementaryProducts } from '../../lib/catalog/complements';
import { formatLength } from '../../lib/measurements';
import { useInventoryStore } from '../../store/inventoryStore';
import { usePlannerStore } from '../../store/plannerStore';
import type { RoomType } from '../../types';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

type Props = {
  roomType: RoomType;
  onModify: () => void;
  onClose: () => void;
  onPlaceComplement: () => void;
};

export function SelectedProductCard({ roomType, onModify, onClose, onPlaceComplement }: Props) {
  const selectedId = usePlannerStore((s) => s.selectedFurnitureId);
  const furniture = usePlannerStore((s) => s.furniture);
  const unit = usePlannerStore((s) => s.unitSystem);
  const begin = usePlannerStore((s) => s.beginPlacement);
  const pending = usePlannerStore((s) => s.pendingPlacement);
  const custom = useInventoryStore((s) => s.items);
  const item = furniture.find((f) => f.id === selectedId);
  const all = useMemo(() => [...catalog, ...custom], [custom]);
  const product = item ? all.find((c) => c.id === item.catalogId) : undefined;
  const complements = useMemo(() => {
    if (!item) return [];
    return complementaryProducts(
      { id: item.catalogId, category: item.category, roomTypes: product?.roomTypes },
      all,
      roomType,
      4,
    );
  }, [item, product, all, roomType]);

  if (!item || pending) return null;

  const price = product?.price;
  const placeComplement = (c: (typeof complements)[number]) => {
    begin(c.id, c.name, c.category, c.dims, c.color, item.x + 0.6, item.z + 0.4, {
      mountingType: c.mountingType,
      clearance:
        c.category === 'Bedroom'
          ? { front: 0.7, back: 0.05, left: 0.3, right: 0.3 }
          : c.mountingType === 'wall'
            ? { front: 0.05, back: 0, left: 0.05, right: 0.05 }
            : { front: 0.45, back: 0.05, left: 0.1, right: 0.1 },
    });
    onPlaceComplement();
  };

  return (
    <aside className="studio-product-card" aria-label="Selected product">
      <header>
        <div
          className="studio-product-thumb"
          style={{ '--product-color': item.color } as CSSProperties}
          aria-hidden="true"
        >
          {product?.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : <span>{product?.emoji ?? '▭'}</span>}
        </div>
        <div className="studio-product-meta">
          {product?.brand && <span className="studio-product-brand">{product.brand}</span>}
          <strong>{item.name}</strong>
          <span className="studio-product-price">
            {price != null ? money.format(price) : 'Price by dealer/design'}
            {product?.priceUnit ? ` / ${product.priceUnit}` : ''}
          </span>
          <span className="studio-product-dims">
            {formatLength(item.width, unit)} × {formatLength(item.depth, unit)} × {formatLength(item.height, unit)}
          </span>
        </div>
        <button onClick={onClose} aria-label="Dismiss product card">
          <X size={18} />
        </button>
      </header>

      <div className="studio-product-actions">
        <button className="primary" onClick={onModify}>
          <PencilRuler size={16} />
          Modify product
        </button>
        {product?.sourceUrl && (
          <a href={product.sourceUrl} target="_blank" rel="noreferrer">
            {product.sourceLabel ?? 'Source'} <ExternalLink size={12} />
          </a>
        )}
      </div>

      {complements.length > 0 && (
        <section className="studio-product-complements" aria-label="Works well with">
          <h3>Works well with</h3>
          <ul>
            {complements.slice(0, 4).map((c) => (
              <li key={c.id}>
                <button onClick={() => placeComplement(c)} title={`Place ${c.name}`}>
                  <span className="thumb" style={{ '--product-color': c.color } as CSSProperties}>
                    {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" /> : c.emoji}
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.price != null ? money.format(c.price) : c.category}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
