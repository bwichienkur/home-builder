import type { CatalogItem } from '../../components/catalog/catalogData';
import type { SurveyResponse } from './projectTypes';

export type CuratedOption = {
  catalogId: string;
  label: string;
  roomType: string;
  tier: 'lookbook' | 'survey' | 'designer';
};

const STYLE_TAGS: Record<string, string[]> = {
  modern: ['modern', 'matte', 'linear', 'contemporary'],
  traditional: ['raised', 'maple', 'classic', 'polished'],
  coastal: ['light', 'white', 'beach', 'sand'],
  warm: ['bronze', 'gold', 'walnut', 'warm'],
};

function scoreItem(item: CatalogItem, tokens: string[]): number {
  const hay = `${item.name} ${item.brand ?? ''} ${item.level ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase();
  return tokens.reduce((sum, t) => (hay.includes(t) ? sum + 2 : sum), 0);
}

/** Map survey responses to 3 curated Platinum options per room type. */
export function curateFromSurvey(catalog: CatalogItem[], survey: SurveyResponse): CuratedOption[] {
  const tokens = [
    survey.exteriorStyle,
    survey.interiorStyle,
    survey.palette,
    ...(STYLE_TAGS[survey.interiorStyle?.toLowerCase() ?? ''] ?? []),
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  const roomTypes = ['Kitchen', 'Master Bath', 'Living', 'Bedroom', 'Laundry'];
  const out: CuratedOption[] = [];

  for (const roomType of roomTypes) {
    const candidates = catalog
      .filter((i) => i.roomTypes?.includes(roomType) || i.roomTypes?.length === 0)
      .filter((i) => i.level && /level\s*[1-5]/i.test(i.level))
      .map((item) => ({ item, score: scoreItem(item, tokens) }))
      .sort((a, b) => b.score - a.score || (a.item.price ?? 0) - (b.item.price ?? 0))
      .slice(0, 3);

    candidates.forEach(({ item }, idx) => {
      out.push({
        catalogId: item.id,
        label: `Option ${idx + 1}: ${item.name}`,
        roomType,
        tier: 'survey',
      });
    });
  }

  return out;
}

/** Look Book defaults — driven by org Config studio seeds when present. */
export function lookbookDefaults(catalog: CatalogItem[]): CuratedOption[] {
  let seeds = [
    { sourceTab: 'Countertops', minLevel: 'Level 3', roomType: 'Kitchen' },
    { sourceTab: 'Tile-Floor', minLevel: 'Level 3', roomType: 'Living' },
    { sourceTab: 'Tile-Wall', minLevel: 'Level 3', roomType: 'Master Bath' },
    { sourceTab: 'Tile - Backsplash', minLevel: 'Level 3', roomType: 'Kitchen' },
    { sourceTab: 'Plumbing', minLevel: 'Level 3', roomType: 'Whole home' },
  ];
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('olsen-org-config-v1') : null;
    if (raw) {
      const parsed = JSON.parse(raw) as {
        lookbookSeeds?: { sourceTab: string; minLevel: string; roomType: string }[];
      };
      if (parsed.lookbookSeeds?.length) seeds = parsed.lookbookSeeds;
    }
  } catch {
    /* defaults */
  }
  const out: CuratedOption[] = [];
  for (const seed of seeds) {
    const minNum = Number(seed.minLevel.match(/\d+/)?.[0] ?? 3);
    const pick = catalog.find((i) => {
      if (i.sourceTab !== seed.sourceTab) return false;
      if (!i.thumbnailUrl?.includes('/lookbook/')) return false;
      const n = Number(i.level?.match(/\d+/)?.[0] ?? 0);
      return n >= minNum;
    });
    if (pick) {
      out.push({
        catalogId: pick.id,
        label: pick.name,
        roomType: seed.roomType || pick.roomTypes?.[0] || 'Whole home',
        tier: 'lookbook',
      });
    }
  }
  return out;
}
