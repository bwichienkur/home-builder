import type { CatalogItem } from '../../components/catalog/catalogData';

export type SelectionKitPart = {
  skuPattern?: RegExp;
  namePattern?: RegExp;
  sourceTab?: string;
  label: string;
  required?: boolean;
};

export type SelectionKit = {
  id: string;
  name: string;
  category: string;
  roomTypes?: string[];
  visibleParts: SelectionKitPart[];
  hiddenParts: SelectionKitPart[];
};

/** Multi-part plumbing/shower packages — visible picks auto-include behind-wall parts. */
export const SELECTION_KITS: SelectionKit[] = [
  {
    id: 'shower-trim-package',
    name: 'Shower trim package',
    category: 'Plumbing',
    roomTypes: ['Bathroom'],
    visibleParts: [
      { label: 'Shower handle', namePattern: /handle|trim/i, sourceTab: 'Plumbing' },
      { label: 'Shower head', namePattern: /shower head|rain/i, sourceTab: 'Plumbing' },
      { label: 'Hand wand', namePattern: /wand|hand shower/i, sourceTab: 'Plumbing' },
    ],
    hiddenParts: [
      { label: 'Shower valve', namePattern: /valve/i, sourceTab: 'Plumbing', required: true },
      { label: 'Diverter valve', namePattern: /diverter/i, sourceTab: 'Plumbing', required: true },
      { label: 'Shower hose', namePattern: /hose/i, sourceTab: 'Plumbing', required: true },
    ],
  },
  {
    id: 'tub-filler-package',
    name: 'Tub filler package',
    category: 'Plumbing',
    roomTypes: ['Bathroom'],
    visibleParts: [{ label: 'Tub filler', namePattern: /tub filler|roman tub/i, sourceTab: 'Plumbing' }],
    hiddenParts: [
      { label: 'Tub valve', namePattern: /tub valve|valve/i, sourceTab: 'Plumbing', required: true },
    ],
  },
  {
    id: 'vanity-faucet-package',
    name: 'Vanity faucet package',
    category: 'Plumbing',
    roomTypes: ['Bathroom', 'Kitchen'],
    visibleParts: [{ label: 'Faucet', namePattern: /faucet|lav/i, sourceTab: 'Plumbing' }],
    hiddenParts: [
      { label: 'Supply lines', namePattern: /supply|stop/i, sourceTab: 'Plumbing', required: true },
    ],
  },
];

function matchesPart(item: CatalogItem, part: SelectionKitPart): boolean {
  if (part.sourceTab && item.sourceTab !== part.sourceTab) return false;
  if (part.skuPattern && item.sku && part.skuPattern.test(item.sku)) return true;
  if (part.namePattern && part.namePattern.test(item.name)) return true;
  return false;
}

export function resolveKitParts(kit: SelectionKit, catalog: CatalogItem[], picked: CatalogItem): CatalogItem[] {
  const out: CatalogItem[] = [picked];
  const allParts = [...kit.visibleParts, ...kit.hiddenParts];
  for (const part of allParts) {
    if (matchesPart(picked, part)) continue;
    const match = catalog.find((item) => matchesPart(item, part));
    if (match && !out.some((o) => o.id === match.id)) out.push(match);
  }
  for (const part of kit.hiddenParts.filter((p) => p.required !== false)) {
    if (!out.some((item) => matchesPart(item, part))) {
      const fallback = catalog.find((item) => matchesPart(item, part));
      if (fallback) out.push(fallback);
    }
  }
  return out;
}

export function kitForCatalogItem(item: CatalogItem): SelectionKit | undefined {
  return SELECTION_KITS.find((kit) =>
    [...kit.visibleParts, ...kit.hiddenParts].some((part) => matchesPart(item, part)),
  );
}

export function expandCatalogSelection(item: CatalogItem, catalog: CatalogItem[]): { items: CatalogItem[]; kitId?: string } {
  const kit = kitForCatalogItem(item);
  if (!kit) return { items: [item] };
  return { items: resolveKitParts(kit, catalog, item), kitId: kit.id };
}
