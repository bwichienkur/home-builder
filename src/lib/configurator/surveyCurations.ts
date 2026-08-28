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

/** Look Book defaults — Level at or below Platinum included tier per tab. */
export function lookbookDefaults(catalog: CatalogItem[]): CuratedOption[] {
  const tabs = ['Countertops', 'Tile-Floor', 'Tile-Wall', 'Tile - Backsplash', 'Plumbing'];
  const out: CuratedOption[] = [];
  for (const tab of tabs) {
    const pick = catalog.find((i) => i.sourceTab === tab && i.thumbnailUrl?.includes('/lookbook/') && i.level?.match(/level\s*[3-5]/i));
    if (pick) {
      out.push({
        catalogId: pick.id,
        label: pick.name,
        roomType: pick.roomTypes?.[0] ?? 'Whole home',
        tier: 'lookbook',
      });
    }
  }
  return out;
}
