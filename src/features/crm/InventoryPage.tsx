import { FormEvent, useMemo, useState } from 'react';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_MOUNTING_TYPES,
  INVENTORY_PLACEMENT_SURFACES,
  INVENTORY_ROOM_TYPES,
  type InventoryPlacementMode,
  type InventoryPriceUnit,
  type InventoryRecord,
} from '../../lib/crm/types';
import {
  optionalNumber,
  parseBool,
  splitListField,
} from '../../lib/crm/inventoryCatalogBridge';
import { useCrmStore } from '../../store/crmStore';
import { CustomFieldsInputs, EntityCrmPage, EntityDrawer } from './EntityCrmPage';

type Draft = Partial<InventoryRecord> & { sku: string; name: string; category: string };

const empty = (): Draft => ({
  sku: '',
  name: '',
  category: 'Seating',
  vendorName: '',
  brand: '',
  model: '',
  subcategory: '',
  description: '',
  note: '',
  width: 0.8,
  depth: 0.8,
  height: 0.8,
  unit: 'm',
  color: '#b9b9b2',
  mountingType: 'floor',
  placementSurfaces: ['floor'],
  placementMode: undefined,
  roomTypes: [],
  tags: [],
  priceUnit: 'each',
  currency: 'USD',
  sellable: true,
  placeholderOnly: false,
  active: true,
  finish: '',
  material: '',
  variantGroup: '',
  variantName: '',
  availability: '',
  thumbnailUrl: '',
  textureUrl: '',
  modelUrl: '',
  lowPolyModelUrl: '',
  emoji: '▧',
  sourceUrl: '',
  sourceLabel: '',
  customFields: {},
});

const PRICE_UNITS: InventoryPriceUnit[] = ['each', 'set', 'box', 'sq ft', 'linear ft', 'allowance'];
const PLACEMENT_MODES: { value: '' | InventoryPlacementMode; label: string }[] = [
  { value: '', label: 'Free place (furniture / fixtures)' },
  { value: 'floor-fill', label: 'Floor fill (tile / flooring)' },
  { value: 'ceiling-perimeter', label: 'Ceiling perimeter (crown)' },
  { value: 'floor-perimeter', label: 'Floor perimeter (baseboard)' },
  { value: 'wall-art', label: 'Wall art' },
];

function toggleList(list: string[] | undefined, value: string): string[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function InventoryPage() {
  const allInventory = useCrmStore((s) => s.inventory);
  const inventory = useMemo(() => (allInventory ?? []).filter((i) => !i.archived), [allInventory]);
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertInventory);
  const archive = useCrmStore((s) => s.archiveEntity);
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <>
      <EntityCrmPage
        entity="inventory"
        title="Inventory"
        lede="Products for quoting and the Build shop. Fields match plan/room builder placement, pricing, materials, and assets."
        fields={fields}
        rows={inventory}
        templateExample={[
          'SOFA-01',
          'Lounge sofa',
          'Roomcraft Home',
          'Roomcraft Home',
          'Modular 3-seat',
          'Seating',
          'Sofa',
          '3-seat lounge',
          'Floor place in living rooms',
          '2.2',
          '0.9',
          '0.8',
          'm',
          '#b8b1a3',
          'floor',
          'floor',
          '',
          'Living room',
          'sofa|seating',
          '1299',
          'each',
          'USD',
          '',
          '',
          '',
          '',
          'true',
          'false',
          'true',
          'Linen',
          'Fabric',
          '',
          '',
          'In stock',
          '14',
          '',
          '',
          '',
          '',
          '',
          '',
          '🛋️',
          '',
          '',
        ]}
        columns={[
          { key: 'sku', label: 'SKU', render: (r) => r.sku },
          { key: 'name', label: 'Name', render: (r) => r.name },
          { key: 'vendorName', label: 'Vendor', render: (r) => r.vendorName || r.brand || '—' },
          { key: 'category', label: 'Category', render: (r) => r.category },
          {
            key: 'placement',
            label: 'Placement',
            render: (r) => r.placementMode || r.mountingType || 'floor',
          },
          {
            key: 'price',
            label: 'Price',
            render: (r) =>
              r.price != null ? `${r.currency} ${r.price}/${r.priceUnit || 'each'}` : '—',
          },
        ]}
        onAdd={() => setDraft(empty())}
        onEdit={(row) => setDraft({ ...row })}
        onArchive={(id) => archive('inventory', id)}
        onImportRows={(objects) => {
          const errors: string[] = [];
          let created = 0;
          for (const { row, values } of objects) {
            if (!values.sku || !values.name || !values.category) {
              errors.push(`Row ${row}: sku, name, category required`);
              continue;
            }
            const customFields: Record<string, string> = {};
            for (const [k, v] of Object.entries(values)) {
              if (k.startsWith('custom.')) customFields[k.slice(7)] = v;
            }
            const placementMode = (values.placementMode || '').trim() as InventoryPlacementMode | '';
            upsert({
              sku: values.sku,
              name: values.name,
              category: values.category,
              vendorName: values.vendorName ?? '',
              brand: values.brand ?? '',
              model: values.model ?? '',
              subcategory: values.subcategory ?? '',
              description: values.description ?? '',
              note: values.note ?? '',
              width: Number(values.width || 0),
              depth: Number(values.depth || 0),
              height: Number(values.height || 0),
              unit: values.unit || 'm',
              color: values.color || '#b9b9b2',
              mountingType: values.mountingType || 'floor',
              placementSurfaces: splitListField(values.placementSurfaces).length
                ? splitListField(values.placementSurfaces)
                : ['floor'],
              placementMode: placementMode || undefined,
              roomTypes: splitListField(values.roomTypes),
              tags: splitListField(values.tags),
              price: optionalNumber(values.price),
              priceUnit: ((values.priceUnit || 'each') as InventoryPriceUnit),
              currency: values.currency || 'USD',
              msrp: optionalNumber(values.msrp),
              cost: optionalNumber(values.cost),
              laborCost: optionalNumber(values.laborCost),
              priceVerifiedAt: values.priceVerifiedAt ?? '',
              sellable: parseBool(values.sellable, true),
              placeholderOnly: parseBool(values.placeholderOnly, false),
              active: parseBool(values.active, true),
              finish: values.finish ?? '',
              material: values.material ?? '',
              variantGroup: values.variantGroup ?? '',
              variantName: values.variantName ?? '',
              availability: values.availability ?? '',
              leadTimeDays: optionalNumber(values.leadTimeDays),
              thumbnailUrl: values.thumbnailUrl ?? '',
              textureUrl: values.textureUrl ?? '',
              textureRepeat: optionalNumber(values.textureRepeat),
              roughness: optionalNumber(values.roughness),
              modelUrl: values.modelUrl ?? '',
              lowPolyModelUrl: values.lowPolyModelUrl ?? '',
              emoji: values.emoji || '▧',
              sourceUrl: values.sourceUrl ?? '',
              sourceLabel: values.sourceLabel ?? '',
              customFields,
            });
            created++;
          }
          return { created, errors };
        }}
      />
      <EntityDrawer
        title={draft?.id ? 'Edit inventory item' : 'Add inventory item'}
        open={!!draft}
        wide
        onClose={() => setDraft(null)}
      >
        {draft && (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              upsert(draft);
              setDraft(null);
            }}
          >
            <fieldset className="data-form-section">
              <legend>Identity</legend>
              <label>
                SKU
                <input required value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
              </label>
              <label>
                Name
                <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label>
                Vendor
                <input
                  value={draft.vendorName ?? ''}
                  onChange={(e) => setDraft({ ...draft, vendorName: e.target.value })}
                />
              </label>
              <label>
                Brand
                <input value={draft.brand ?? ''} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} />
              </label>
              <label>
                Model
                <input value={draft.model ?? ''} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
              </label>
              <label>
                Category
                <select
                  required
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {!INVENTORY_CATEGORIES.includes(draft.category as (typeof INVENTORY_CATEGORIES)[number]) && (
                    <option value={draft.category}>{draft.category}</option>
                  )}
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subcategory
                <input
                  value={draft.subcategory ?? ''}
                  onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
                />
              </label>
              <label>
                Description
                <textarea
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <label>
                Shop / BOM note
                <textarea value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </label>
            </fieldset>

            <fieldset className="data-form-section">
              <legend>Dimensions</legend>
              <div className="data-form-row">
                <label>
                  Width
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.width ?? 0}
                    onChange={(e) => setDraft({ ...draft, width: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Depth
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.depth ?? 0}
                    onChange={(e) => setDraft({ ...draft, depth: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.height ?? 0}
                    onChange={(e) => setDraft({ ...draft, height: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label>
                Dimension unit
                <select value={draft.unit ?? 'm'} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
                  <option value="m">Meters</option>
                  <option value="cm">Centimeters</option>
                  <option value="mm">Millimeters</option>
                  <option value="in">Inches</option>
                  <option value="ft">Feet</option>
                </select>
              </label>
              <label>
                Proxy color
                <input
                  type="color"
                  value={draft.color || '#b9b9b2'}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                />
              </label>
              <label>
                Emoji
                <input value={draft.emoji ?? '▧'} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
              </label>
            </fieldset>

            <fieldset className="data-form-section">
              <legend>Placement (Build)</legend>
              <label>
                Mounting
                <select
                  value={draft.mountingType ?? 'floor'}
                  onChange={(e) => setDraft({ ...draft, mountingType: e.target.value })}
                >
                  {INVENTORY_MOUNTING_TYPES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Placement mode
                <select
                  value={draft.placementMode ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      placementMode: (e.target.value || undefined) as InventoryPlacementMode | undefined,
                    })
                  }
                >
                  {PLACEMENT_MODES.map((m) => (
                    <option key={m.label} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="data-form-checks">
                <span className="data-form-checks-label">Placement surfaces</span>
                {INVENTORY_PLACEMENT_SURFACES.map((surface) => (
                  <label key={surface} className="data-form-check">
                    <input
                      type="checkbox"
                      checked={(draft.placementSurfaces ?? []).includes(surface)}
                      onChange={() =>
                        setDraft({ ...draft, placementSurfaces: toggleList(draft.placementSurfaces, surface) })
                      }
                    />
                    {surface}
                  </label>
                ))}
              </div>
              <div className="data-form-checks">
                <span className="data-form-checks-label">Room types</span>
                {INVENTORY_ROOM_TYPES.map((room) => (
                  <label key={room} className="data-form-check">
                    <input
                      type="checkbox"
                      checked={(draft.roomTypes ?? []).includes(room)}
                      onChange={() => setDraft({ ...draft, roomTypes: toggleList(draft.roomTypes, room) })}
                    />
                    {room}
                  </label>
                ))}
              </div>
              <label>
                Tags (comma or pipe separated)
                <input
                  value={(draft.tags ?? []).join(', ')}
                  onChange={(e) => setDraft({ ...draft, tags: splitListField(e.target.value) })}
                  placeholder="sofa, seating, living"
                />
              </label>
            </fieldset>

            <fieldset className="data-form-section">
              <legend>Pricing</legend>
              <div className="data-form-row">
                <label>
                  Price
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.price ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, price: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Unit
                  <select
                    value={draft.priceUnit ?? 'each'}
                    onChange={(e) => setDraft({ ...draft, priceUnit: e.target.value as InventoryPriceUnit })}
                  >
                    {PRICE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Currency
                  <input
                    value={draft.currency ?? 'USD'}
                    onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                  />
                </label>
              </div>
              <div className="data-form-row">
                <label>
                  MSRP
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.msrp ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, msrp: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Cost
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.cost ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, cost: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Labor cost
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.laborCost ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        laborCost: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Price verified at
                <input
                  type="date"
                  value={(draft.priceVerifiedAt ?? '').slice(0, 10)}
                  onChange={(e) => setDraft({ ...draft, priceVerifiedAt: e.target.value })}
                />
              </label>
              <div className="data-form-checks">
                <label className="data-form-check">
                  <input
                    type="checkbox"
                    checked={draft.sellable ?? true}
                    onChange={(e) => setDraft({ ...draft, sellable: e.target.checked })}
                  />
                  Sellable in shop
                </label>
                <label className="data-form-check">
                  <input
                    type="checkbox"
                    checked={draft.placeholderOnly ?? false}
                    onChange={(e) => setDraft({ ...draft, placeholderOnly: e.target.checked })}
                  />
                  Placeholder only (no GLB yet)
                </label>
                <label className="data-form-check">
                  <input
                    type="checkbox"
                    checked={draft.active ?? true}
                    onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </fieldset>

            <fieldset className="data-form-section">
              <legend>Materials & supply</legend>
              <label>
                Finish
                <input value={draft.finish ?? ''} onChange={(e) => setDraft({ ...draft, finish: e.target.value })} />
              </label>
              <label>
                Material
                <input
                  value={draft.material ?? ''}
                  onChange={(e) => setDraft({ ...draft, material: e.target.value })}
                />
              </label>
              <label>
                Variant group
                <input
                  value={draft.variantGroup ?? ''}
                  onChange={(e) => setDraft({ ...draft, variantGroup: e.target.value })}
                />
              </label>
              <label>
                Variant name
                <input
                  value={draft.variantName ?? ''}
                  onChange={(e) => setDraft({ ...draft, variantName: e.target.value })}
                />
              </label>
              <label>
                Availability
                <input
                  value={draft.availability ?? ''}
                  onChange={(e) => setDraft({ ...draft, availability: e.target.value })}
                />
              </label>
              <label>
                Lead time (days)
                <input
                  type="number"
                  min={0}
                  value={draft.leadTimeDays ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      leadTimeDays: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
            </fieldset>

            <fieldset className="data-form-section">
              <legend>Assets & source</legend>
              <label>
                Thumbnail URL
                <input
                  value={draft.thumbnailUrl ?? ''}
                  onChange={(e) => setDraft({ ...draft, thumbnailUrl: e.target.value })}
                />
              </label>
              <label>
                Texture URL (floor-fill)
                <input
                  value={draft.textureUrl ?? ''}
                  onChange={(e) => setDraft({ ...draft, textureUrl: e.target.value })}
                />
              </label>
              <div className="data-form-row">
                <label>
                  Texture repeat (m)
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.textureRepeat ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        textureRepeat: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Roughness (0–1)
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={1}
                    value={draft.roughness ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        roughness: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Model URL (GLB)
                <input
                  value={draft.modelUrl ?? ''}
                  onChange={(e) => setDraft({ ...draft, modelUrl: e.target.value })}
                />
              </label>
              <label>
                Low-poly model URL
                <input
                  value={draft.lowPolyModelUrl ?? ''}
                  onChange={(e) => setDraft({ ...draft, lowPolyModelUrl: e.target.value })}
                />
              </label>
              <label>
                Source URL
                <input
                  value={draft.sourceUrl ?? ''}
                  onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
                />
              </label>
              <label>
                Source label
                <input
                  value={draft.sourceLabel ?? ''}
                  onChange={(e) => setDraft({ ...draft, sourceLabel: e.target.value })}
                />
              </label>
            </fieldset>

            <CustomFieldsInputs
              entity="inventory"
              fields={fields}
              values={draft.customFields ?? {}}
              onChange={(customFields) => setDraft({ ...draft, customFields })}
            />
            <div className="data-form-actions">
              <button type="submit" className="primary">
                Save to inventory & Build shop
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </EntityDrawer>
    </>
  );
}
