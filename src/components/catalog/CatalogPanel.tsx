import { ExternalLink, Search, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePlannerStore } from '../../store/plannerStore';
import type { RoomType } from '../../types';
import { useInventoryStore } from '../../store/inventoryStore';
import { useBuildCatalog, useCatalogStore } from '../../store/catalogStore';
import { CATALOG_CATEGORIES } from '../../lib/catalog/catalogSource';
import { catalogCardImage } from '../../lib/catalog/catalogCardImage';
import { formatCatalogPrice } from '../../lib/configurator/deltaPricing';
import { expandCatalogSelection } from '../../lib/configurator/selectionKits';
import { useConfiguratorStore } from '../../store/configuratorStore';

const categories = CATALOG_CATEGORIES.filter((c) => c !== 'All');
export const roomCategories: Record<RoomType, string[]> = {
  Bedroom: ['Flooring', 'Tile', 'Bedroom', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim', 'Doors', 'Windows'],
  'Living room': ['Flooring', 'Seating', 'Tables', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Paneling', 'Trim', 'Doors', 'Windows', 'Surfaces'],
  Bathroom: ['Flooring', 'Plumbing', 'Cabinetry', 'Tile', 'Surfaces', 'Lighting', 'Trim', 'Doors'],
  Kitchen: ['Flooring', 'Appliances', 'Cabinetry', 'Surfaces', 'Plumbing', 'Tile', 'Seating', 'Lighting', 'Trim', 'Doors', 'Windows'],
  'Dining room': ['Flooring', 'Seating', 'Tables', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim', 'Doors'],
  Office: ['Flooring', 'Tables', 'Seating', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim', 'Doors', 'Windows'],
  'Children’s room': ['Flooring', 'Bedroom', 'Storage', 'Lighting', 'Decor', 'Textiles', 'Trim', 'Doors'],
  Laundry: ['Flooring', 'Appliances', 'Cabinetry', 'Storage', 'Surfaces', 'Plumbing', 'Lighting', 'Trim'],
  Hallway: ['Flooring', 'Storage', 'Tables', 'Lighting', 'Decor', 'Textiles', 'Trim', 'Doors'],
  'Storage / wardrobe': ['Flooring', 'Storage', 'Cabinetry', 'Lighting', 'Decor', 'Trim'],
  Outdoor: ['Flooring', 'Seating', 'Tables', 'Lighting', 'Decor', 'Surfaces', 'Trim', 'Exterior', 'Appliances'],
};
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
  const hydrateCatalog = useCatalogStore((s) => s.hydrate);
  const catalogLoading = useCatalogStore((s) => s.loading);
  const catalogSource = useCatalogStore((s) => s.source);
  const role = useConfiguratorStore((s) => s.role);
  const contract = useConfiguratorStore((s) => s.contract);
  const project = useConfiguratorStore((s) => s.project);
  const activeRoomFilter = useConfiguratorStore((s) => s.activeRoomFilter);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [vendor, setVendor] = useState('All');
  const [sort, setSort] = useState('name');
  const [recommended, setRecommended] = useState(true);
  const [entered, setEntered] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  const relevant = roomCategories[roomType];
  const baseCatalog = useBuildCatalog(custom);
  const all = useMemo(() => baseCatalog, [baseCatalog]);

  useEffect(() => {
    void hydrateCatalog();
  }, [hydrateCatalog]);
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
    () => {
      const curatedIds = new Set(project?.curatedOptions?.map((c) => c.catalogId) ?? []);
      const clientPlatinumOnly = role === 'client';
      let curatedOnlyWhenAvailable = true;
      let levelPattern = /level\s*[1-5]/i;
      try {
        const raw = localStorage.getItem('olsen-org-config-v1');
        if (raw) {
          const parsed = JSON.parse(raw) as {
            clientRules?: { curatedOnlyWhenAvailable?: boolean; maxLevelPattern?: string };
          };
          if (parsed.clientRules?.curatedOnlyWhenAvailable === false) curatedOnlyWhenAvailable = false;
          if (parsed.clientRules?.maxLevelPattern) {
            try {
              levelPattern = new RegExp(parsed.clientRules.maxLevelPattern, 'i');
            } catch {
              /* keep default */
            }
          }
        }
      } catch {
        /* defaults */
      }
      return all
        .filter((i) => {
          const haystack = `${i.brand ?? ''} ${i.model ?? ''} ${i.sku ?? ''} ${i.name} ${i.category} ${i.tags?.join(' ') ?? ''}`.toLowerCase();
          const roomMatch = i.roomTypes?.length ? i.roomTypes.includes(roomType) : relevant.includes(i.category);
          const roomFilterMatch =
            !activeRoomFilter ||
            i.roomTypes?.some((rt) => activeRoomFilter.toLowerCase().includes(rt.toLowerCase())) ||
            i.name.toLowerCase().includes(activeRoomFilter.toLowerCase());
          const curatedMatch =
            !clientPlatinumOnly ||
            !curatedOnlyWhenAvailable ||
            curatedIds.size === 0 ||
            curatedIds.has(i.id);
          const platinumMatch =
            !clientPlatinumOnly || !i.level || levelPattern.test(i.level) || curatedIds.has(i.id);
          return (
            (!recommended || roomMatch) &&
            roomFilterMatch &&
            curatedMatch &&
            platinumMatch &&
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
        );
    },
    [all, q, category, vendor, sort, recommended, relevant, roomType, activeRoomFilter, role, project?.curatedOptions],
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
    const perimeter =
      i.placementMode === 'ceiling-perimeter' ||
      i.placementMode === 'floor-perimeter' ||
      (i.category === 'Trim' && /crown/i.test(i.name) && !/chair/i.test(i.name)) ||
      (i.category === 'Trim' && /baseboard/i.test(i.name));
    if (perimeter) {
      const edge =
        i.placementMode === 'floor-perimeter' || /baseboard/i.test(i.name) ? 'floor' : 'ceiling';
      usePlannerStore.getState().applyPerimeterTrim(i.id, i.name, i.category, i.dims, i.color, edge);
      close();
      return;
    }
    if (i.placementMode === 'floor-fill') {
      usePlannerStore.getState().beginFloorFill({ catalogId: i.id, name: i.name, color: i.color });
      onAdd?.();
      return;
    }

    const expanded = expandCatalogSelection(i, all);
    const primary = expanded.items[0] ?? i;
    begin(primary.id, primary.name, primary.category, primary.dims, primary.color, undefined, undefined, {
      mountingType: primary.mountingType,
      clearance:
        primary.category === 'Bedroom'
          ? { front: 0.7, back: 0.05, left: 0.3, right: 0.3 }
          : primary.mountingType === 'wall'
            ? { front: 0.05, back: 0, left: 0.05, right: 0.05 }
            : { front: 0.45, back: 0.05, left: 0.1, right: 0.1 },
    });
    // Auto-add behind-wall kit companions so valves/hoses aren't forgotten.
    expanded.items.slice(1).forEach((part, idx) => {
      usePlannerStore
        .getState()
        .addFurniture(part.id, part.name, part.category, part.dims, part.color, 0.4 + idx * 0.35, 0.4, {
          mountingType: part.mountingType,
        });
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
        <p className="catalog-disclaimer">
          Olsen Cost Library reference pricing — not a final quote.
          {catalogSource === 'seed+api' ? ' Live catalog synced.' : catalogLoading ? ' Syncing…' : ''}
        </p>
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
          {shown.map((i) => {
            const img = catalogCardImage(i);
            const priceView = formatCatalogPrice(i, all, contract, role, project?.levelOverrides);
            return (
            <article key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData('catalogId', i.id)}>
              <div className="thumb" style={{ '--product-color': i.color } as CSSProperties}>
                {img ? <img src={img} loading="lazy" alt="" /> : <span className="thumb-fallback">{i.emoji}</span>}
              </div>
              {i.brand && <span className="catalog-brand">{i.brand}</span>}
              <strong>{i.name}</strong>
              {i.mountingType === 'wall' && <small className="mount-badge">Wall mount</small>}
              {(i.placementMode === 'ceiling-perimeter' || i.placementMode === 'floor-perimeter') && (
                <small className="mount-badge">{i.placementMode === 'ceiling-perimeter' ? 'Ceiling corners' : 'Floor corners'}</small>
              )}
              {i.placementMode === 'floor-fill' && (
                <small className="mount-badge">3D floor fill</small>
              )}
              {i.level && <small className="mount-badge">{i.level}</small>}
              {i.modelUrl && <small className="mount-badge model">3D model</small>}
              {i.sku && <small>SKU {i.sku}</small>}
              <span className={priceView.included ? 'catalog-price included' : priceView.delta ? 'catalog-price delta' : 'catalog-price'}>
                {priceView.label}
              </span>
              {priceView.detail && <small>{priceView.detail}</small>}
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
            );
          })}
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
