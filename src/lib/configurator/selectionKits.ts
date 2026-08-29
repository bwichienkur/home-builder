import type { CatalogItem } from '../../components/catalog/catalogData';

export type SelectionKitPart = {
  skuPattern?: RegExp;
  namePattern?: RegExp;
  fallbackSku?: string;
  sourceTab?: string;
  label: string;
  required?: boolean;
  hidden?: boolean;
};

export type SelectionKit = {
  id: string;
  name: string;
  category: string;
  roomTypes?: string[];
  visibleParts: SelectionKitPart[];
  hiddenParts: SelectionKitPart[];
};

/** Multi-part plumbing packages — visible picks auto-include behind-wall parts. */
export const SELECTION_KITS: SelectionKit[] = [
  {
    id: 'shower-trim-package',
    name: 'Shower trim package',
    category: 'Plumbing',
    roomTypes: ['Bathroom'],
    visibleParts: [
      { label: 'Shower handle', skuPattern: /^KIT-SHOWER-HANDLE$/i, namePattern: /shower handle|trim kit/i, sourceTab: 'Plumbing' },
      { label: 'Shower head', skuPattern: /^KIT-SHOWER-HEAD$/i, namePattern: /shower head/i, sourceTab: 'Plumbing' },
      { label: 'Hand wand', skuPattern: /^KIT-HAND-WAND$/i, namePattern: /hand shower|wand/i, sourceTab: 'Plumbing' },
    ],
    hiddenParts: [
      {
        label: 'Shower valve',
        skuPattern: /^KIT-SHOWER-VALVE$/i,
        namePattern: /shower rough-in valve|shower valve/i,
        fallbackSku: 'KIT-SHOWER-VALVE',
        sourceTab: 'Plumbing',
        required: true,
        hidden: true,
      },
      {
        label: 'Diverter valve',
        skuPattern: /^KIT-DIVERTER$/i,
        namePattern: /diverter valve/i,
        fallbackSku: 'KIT-DIVERTER',
        sourceTab: 'Plumbing',
        required: true,
        hidden: true,
      },
      {
        label: 'Shower hose',
        skuPattern: /^KIT-SHOWER-HOSE$/i,
        namePattern: /shower hose|hand shower hose/i,
        fallbackSku: 'KIT-SHOWER-HOSE',
        sourceTab: 'Plumbing',
        required: true,
        hidden: true,
      },
    ],
  },
  {
    id: 'tub-filler-package',
    name: 'Tub filler package',
    category: 'Plumbing',
    roomTypes: ['Bathroom'],
    visibleParts: [
      { label: 'Tub filler', skuPattern: /^KIT-TUB-FILLER$/i, namePattern: /tub filler|roman tub/i, sourceTab: 'Plumbing' },
    ],
    hiddenParts: [
      {
        label: 'Tub valve',
        skuPattern: /^KIT-TUB-VALVE$/i,
        namePattern: /tub rough-in valve|tub valve/i,
        fallbackSku: 'KIT-TUB-VALVE',
        sourceTab: 'Plumbing',
        required: true,
        hidden: true,
      },
    ],
  },
  {
    id: 'vanity-faucet-package',
    name: 'Vanity faucet package',
    category: 'Plumbing',
    roomTypes: ['Bathroom', 'Kitchen'],
    visibleParts: [
      { label: 'Faucet', skuPattern: /^KIT-LAV-FAUCET$/i, namePattern: /lavatory faucet|^faucet$/i, sourceTab: 'Plumbing' },
    ],
    hiddenParts: [
      {
        label: 'Supply stops',
        skuPattern: /^KIT-SUPPLY-STOP$/i,
        namePattern: /supply stop|angle stop/i,
        fallbackSku: 'KIT-SUPPLY-STOP',
        sourceTab: 'Plumbing',
        required: true,
        hidden: true,
      },
    ],
  },
];

function matchesPart(item: CatalogItem, part: SelectionKitPart): boolean {
  if (part.sourceTab && item.sourceTab !== part.sourceTab) return false;
  if (part.skuPattern && item.sku && part.skuPattern.test(item.sku)) return true;
  if (part.fallbackSku && item.sku === part.fallbackSku) return true;
  if (part.namePattern && part.namePattern.test(item.name)) return true;
  return false;
}

export function resolveKitParts(kit: SelectionKit, catalog: CatalogItem[], picked: CatalogItem): CatalogItem[] {
  const out: CatalogItem[] = [picked];
  const allParts = [...kit.visibleParts, ...kit.hiddenParts];
  for (const part of allParts) {
    if (matchesPart(picked, part)) continue;
    const match =
      catalog.find((item) => part.fallbackSku && item.sku === part.fallbackSku) ??
      catalog.find((item) => matchesPart(item, part));
    if (match && !out.some((o) => o.id === match.id)) out.push(match);
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
