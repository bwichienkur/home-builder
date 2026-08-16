import { ExternalLink, Search, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePlannerStore } from '../../store/plannerStore';
import { catalog } from './catalogData';
import type { RoomType } from '../../types';
import { useInventoryStore } from '../../store/inventoryStore';

const categories = ['All', 'Appliances', 'Cabinetry', 'Surfaces', 'Tile', 'Plumbing', 'Paneling', 'Trim', 'Seating', 'Tables', 'Storage', 'Bedroom', 'Lighting', 'Decor', 'Textiles'];
export const roomCategories: Record<RoomType, string[]> = {
  Bedroom: ['Bedroom', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim'],
  'Living room': ['Seating', 'Tables', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Paneling', 'Trim'],
  Bathroom: ['Plumbing', 'Cabinetry', 'Tile', 'Surfaces', 'Lighting', 'Trim'],
  Kitchen: ['Appliances', 'Cabinetry', 'Surfaces', 'Plumbing', 'Tile', 'Seating', 'Lighting', 'Trim'],
  'Dining room': ['Seating', 'Tables', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim'],
  Office: ['Tables', 'Seating', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim'],
  'Children’s room': ['Bedroom', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim'],
  Laundry: ['Appliances', 'Cabinetry', 'Storage', 'Surfaces', 'Plumbing', 'Lighting', 'Trim'],
  Hallway: ['Storage', 'Tables', 'Lighting', 'Decor', 'Textiles', 'Trim'],
  'Storage / wardrobe': ['Storage', 'Cabinetry', 'Lighting', 'Decor', 'Trim'],
  Outdoor: ['Seating', 'Tables', 'Lighting', 'Decor', 'Surfaces', 'Trim'],
};
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const PAGE = 36;

export const CatalogPanel = memo(function CatalogPanel({
  close,
  onAdd,
  roomType,
}: {
  close: () => void;
  onAdd?: () => void;
  roomType: RoomType;
}) {
  const begin = usePlannerStore((s) => s.beginPlacement);
  const custom = useInventoryStore((s) => s.items);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [vendor, setVendor] = useState('All');
  const [sort, setSort] = useState('name');
  const [recommended, setRecommended] = useState(true);
  const [entered, setEntered] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  const relevant = roomCategories[roomType];
  const all = useMemo(() => {
    // Inventory can mirror catalog starter SKUs — keep one row per id (inventory wins).
    const byId = new Map(catalog.map((i) => [i.id, i]));
    for (const item of custom) byId.set(item.id, item);
    return Array.from(byId.values());
  }, [custom]);
  const vendors = useMemo(() => ['All', ...Array.from(new Set(all.map((i) => i.brand).filter(Boolean) as string[])).sort()], [all]);
  const visibleCategories = recommended
    ? ['All', ...Array.from(new Set([...relevant, ...custom.filter((i) => i.roomTypes?.includes(roomType)).map((i) => i.category)]))]
    : ['All', ...Array.from(new Set([...categories, ...all.map((i) => i.category)]))];

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const choose = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (next && visibleCategories.includes(next)) {
        setRecommended(true);
        setCategory(next);
      }
    };
    window.addEventListener('roomcraft-catalog-category', choose);
    return () => window.removeEventListener('roomcraft-catalog-category', choose);
  }, [visibleCategories]);

  const items = useMemo(
    () =>
      all
        .filter((i) => {
          const haystack = `${i.brand ?? ''} ${i.model ?? ''} ${i.sku ?? ''} ${i.name} ${i.category} ${i.tags?.join(' ') ?? ''}`.toLowerCase();
          const roomMatch = i.roomTypes?.length ? i.roomTypes.includes(roomType) : relevant.includes(i.category);
          return (
            (!recommended || roomMatch) &&
            (category === 'All' || i.category === category) &&
            (vendor === 'All' || i.brand === vendor) &&
            haystack.includes(q.toLowerCase())
          );
        })
        .sort((a, b) =>
          sort === 'price-low'
            ? (a.price ?? Infinity) - (b.price ?? Infinity)
            : sort === 'price-high'
              ? (b.price ?? -1) - (a.price ?? -1)
              : a.name.localeCompare(b.name),
        ),
    [all, q, category, vendor, sort, recommended, relevant, roomType],
  );

  useEffect(() => {
    setVisibleCount(PAGE);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [q, category, vendor, sort, recommended, roomType]);

  const shown = items.slice(0, visibleCount);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 240) {
      setVisibleCount((count) => Math.min(items.length, count + PAGE));
    }
  };

  const addItem = (i: (typeof items)[number]) => {
    if (i.placementMode === 'ceiling-perimeter' || i.placementMode === 'floor-perimeter') {
      usePlannerStore.getState().applyPerimeterTrim(
        i.id,
        i.name,
        i.category,
        i.dims,
        i.color,
        i.placementMode === 'ceiling-perimeter' ? 'ceiling' : 'floor',
      );
      onAdd?.();
      return;
    }
    if (i.placementMode === 'floor-fill') {
      usePlannerStore.getState().beginFloorFill({ catalogId: i.id, name: i.name, color: i.color });
      onAdd?.();
      return;
    }
    // Omit x/z so the ghost starts at the room center (visible immediately).
    begin(i.id, i.name, i.category, i.dims, i.color, undefined, undefined, {
      mountingType: i.mountingType,
      clearance:
        i.category === 'Bedroom'
          ? { front: 0.7, back: 0.05, left: 0.3, right: 0.3 }
          : i.mountingType === 'wall'
            ? { front: 0.05, back: 0, left: 0.05, right: 0.05 }
            : { front: 0.45, back: 0.05, left: 0.1, right: 0.1 },
    });
    onAdd?.();
  };

  return (
    <>
      <button className="catalog-backdrop" aria-label="Close catalog" onClick={close} />
      <aside className={`catalog-panel${entered ? ' is-open' : ''}`} role="dialog" aria-label={`${roomType} products`} ref={listRef} onScroll={onScroll}>
        <div className="catalog-title">
          <div>
            <p className="eyebrow">Products</p>
            <h2>{category === 'All' ? roomType : category}</h2>
          </div>
          <button aria-label="Close catalog" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <label className="room-filter">
          <input
            type="checkbox"
            checked={recommended}
            onChange={(e) => {
              setRecommended(e.target.checked);
              setCategory('All');
            }}
          />
          Recommended for this room
        </label>
        <p className="catalog-disclaimer">Reference prices and dimensions help you plan — not a final quote.</p>
        <div className="search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, SKU, or brands" />
        </div>
        <div className="catalog-selects">
          <select aria-label="Filter by vendor" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            {vendors.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </div>
        <div className="catalog-result-count">
          Showing {shown.length} of {items.length} products
        </div>
        <div className="chips">
          {visibleCategories.map((c) => (
            <button className={c === category ? 'active' : ''} onClick={() => setCategory(c)} key={c}>
              {c}
            </button>
          ))}
        </div>
        <div className="catalog-grid">
          {shown.map((i) => (
            <article key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData('catalogId', i.id)}>
              <div className="thumb" style={{ '--product-color': i.color } as CSSProperties}>
                {i.thumbnailUrl ? <img src={i.thumbnailUrl} loading="lazy" alt="" /> : <span className="thumb-fallback">{i.emoji}</span>}
              </div>
              {i.brand && <span className="catalog-brand">{i.brand}</span>}
              <strong>{i.name}</strong>
              {i.mountingType === 'wall' && <small className="mount-badge">Wall mount</small>}
              {(i.placementMode === 'ceiling-perimeter' || i.placementMode === 'floor-perimeter') && (
                <small className="mount-badge">{i.placementMode === 'ceiling-perimeter' ? 'Ceiling corners' : 'Floor corners'}</small>
              )}
              {i.placementMode === 'floor-fill' && (
                <small className="mount-badge">Fill room floor</small>
              )}
              {i.modelUrl && <small className="mount-badge model">3D model</small>}
              {i.sku && <small>SKU {i.sku}</small>}
              <span>{i.price !== undefined ? `${money.format(i.price)} / ${i.priceUnit ?? 'each'}` : 'Price by dealer/design'}</span>
              {i.placeholderOnly && <small>Dimensionally accurate placeholder</small>}
              {i.note && <small>{i.note}</small>}
              {i.sourceUrl && (
                <a href={i.sourceUrl} target="_blank" rel="noreferrer" draggable={false}>
                  {i.sourceLabel} <ExternalLink size={10} />
                </a>
              )}
              <button onClick={() => addItem(i)}>
                {i.placementMode === 'ceiling-perimeter' || i.placementMode === 'floor-perimeter' || i.placementMode === 'floor-fill'
                  ? 'Apply to room'
                  : 'Place in room'}
              </button>
            </article>
          ))}
        </div>
        {shown.length < items.length && (
          <button className="catalog-load-more" onClick={() => setVisibleCount((count) => Math.min(items.length, count + PAGE))}>
            Load more products
          </button>
        )}
      </aside>
    </>
  );
});
