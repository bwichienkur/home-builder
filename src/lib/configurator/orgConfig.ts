/**
 * Org-wide Build / COF configuration — Platinum tiers, survey, mappings,
 * Look Book seeds, client catalog rules, and invite copy.
 * Cached in localStorage; production syncs via /api/org-config → Neon.
 */
import type { PriceUnit } from '../../components/catalog/catalogTypes';
import {
  PLATINUM_INCLUDED_LEVELS,
  type ContractIncludedLevel,
  type PricingCategory,
} from './contractTypes';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type SurveyQuestion } from './surveyConfig';

export const ORG_CONFIG_STORAGE = 'olsen-org-config-v1';

export type CatalogTabMapping = {
  id: string;
  sourceTab: string;
  pricingCategory: PricingCategory;
  cofSheet: string;
  /** When true, Countertops uses kitchen vs bath by room type */
  kitchenBathSplit?: boolean;
};

export type LookbookSeedRule = {
  id: string;
  sourceTab: string;
  minLevel: string;
  roomType: string;
  label?: string;
};

export type ClientCatalogRules = {
  /** Only show curated catalog IDs when survey curated options exist */
  curatedOnlyWhenAvailable: boolean;
  /** Regex or level pattern clients may see, e.g. Level 1-5 */
  maxLevelPattern: string;
  /** Hide all prices for clients */
  hidePricing: boolean;
  /** Lock structural / architect tools for clients */
  lockStructuralEdits: boolean;
};

export type InviteCopyConfig = {
  subject: string;
  greeting: string;
  body: string;
  portalBlurb: string;
  closing: string;
};

export type OrgConfig = {
  version: number;
  updatedAt: string;
  platinumTiers: ContractIncludedLevel[];
  survey: SurveyConfig;
  tabMappings: CatalogTabMapping[];
  lookbookSeeds: LookbookSeedRule[];
  clientRules: ClientCatalogRules;
  inviteCopy: InviteCopyConfig;
};

export const DEFAULT_TAB_MAPPINGS: CatalogTabMapping[] = [
  { id: 'map-ct', sourceTab: 'Countertops', pricingCategory: 'countertops-kitchen', cofSheet: 'Countertops', kitchenBathSplit: true },
  { id: 'map-floor', sourceTab: 'Tile-Floor', pricingCategory: 'floor-tile', cofSheet: 'Tile-Floor' },
  { id: 'map-wall', sourceTab: 'Tile-Wall', pricingCategory: 'wall-tile-shower', cofSheet: 'Tile-Floor' },
  { id: 'map-back', sourceTab: 'Tile - Backsplash', pricingCategory: 'backsplash', cofSheet: 'Tile-Floor' },
  { id: 'map-pan', sourceTab: 'Tile - Pan', pricingCategory: 'shower-pan', cofSheet: 'Tile-Floor' },
  { id: 'map-doors', sourceTab: 'Interior Doors', pricingCategory: 'interior-doors', cofSheet: 'Options' },
  { id: 'map-ext-doors', sourceTab: 'Ext. Door Install', pricingCategory: 'interior-doors', cofSheet: 'Options' },
  { id: 'map-plumb', sourceTab: 'Plumbing', pricingCategory: 'plumbing-fixtures', cofSheet: 'Options' },
  { id: 'map-shaker', sourceTab: 'Shaker Drs', pricingCategory: 'cabinetry', cofSheet: 'Cabinets' },
  { id: 'map-ushaker', sourceTab: 'Upgrade Shaker Drs', pricingCategory: 'cabinetry', cofSheet: 'Cabinets' },
  { id: 'map-stone-e', sourceTab: 'Stone-Eldorado', pricingCategory: 'stone-veneer', cofSheet: 'Stone' },
  { id: 'map-stone', sourceTab: 'Stone', pricingCategory: 'stone-veneer', cofSheet: 'Stone' },
  { id: 'map-trim', sourceTab: 'Trim Material', pricingCategory: 'trim', cofSheet: 'Options' },
  { id: 'map-win', sourceTab: 'PGT Windows', pricingCategory: 'windows', cofSheet: 'Options' },
  { id: 'map-sk', sourceTab: 'Summer Kitchen', pricingCategory: 'outdoor-kitchen', cofSheet: 'Summer Kitchen' },
  { id: 'map-pavers', sourceTab: 'Pavers', pricingCategory: 'pavers', cofSheet: 'Pavers' },
];

export const DEFAULT_LOOKBOOK_SEEDS: LookbookSeedRule[] = [
  { id: 'lb-ct', sourceTab: 'Countertops', minLevel: 'Level 3', roomType: 'Kitchen' },
  { id: 'lb-floor', sourceTab: 'Tile-Floor', minLevel: 'Level 3', roomType: 'Living' },
  { id: 'lb-wall', sourceTab: 'Tile-Wall', minLevel: 'Level 3', roomType: 'Master Bath' },
  { id: 'lb-back', sourceTab: 'Tile - Backsplash', minLevel: 'Level 3', roomType: 'Kitchen' },
  { id: 'lb-plumb', sourceTab: 'Plumbing', minLevel: 'Level 3', roomType: 'Whole home' },
];

export const DEFAULT_CLIENT_RULES: ClientCatalogRules = {
  curatedOnlyWhenAvailable: true,
  maxLevelPattern: 'level\\s*[1-5]',
  hidePricing: true,
  lockStructuralEdits: true,
};

export const DEFAULT_INVITE_COPY: InviteCopyConfig = {
  subject: 'Your Olsen Custom Homes design portal',
  greeting: 'Welcome to your design portal',
  body: 'Use this private link to complete your design discovery survey and choose Platinum finishes for your home. You can save progress and return anytime. Pricing is not shown at this stage — your designer will review upgrades in person.',
  portalBlurb: 'Survey → curated Platinum options → finish selections → schedule your design meeting.',
  closing: '— Olsen Custom Homes Design Team',
};

export function createDefaultOrgConfig(): OrgConfig {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    platinumTiers: PLATINUM_INCLUDED_LEVELS.map((r) => ({ ...r })),
    survey: structuredClone(DEFAULT_SURVEY_CONFIG),
    tabMappings: DEFAULT_TAB_MAPPINGS.map((m) => ({ ...m })),
    lookbookSeeds: DEFAULT_LOOKBOOK_SEEDS.map((m) => ({ ...m })),
    clientRules: { ...DEFAULT_CLIENT_RULES },
    inviteCopy: { ...DEFAULT_INVITE_COPY },
  };
}

export function loadOrgConfig(): OrgConfig {
  if (typeof localStorage === 'undefined') return createDefaultOrgConfig();
  try {
    const raw = localStorage.getItem(ORG_CONFIG_STORAGE);
    if (!raw) return createDefaultOrgConfig();
    const parsed = JSON.parse(raw) as Partial<OrgConfig>;
    const base = createDefaultOrgConfig();
    return {
      ...base,
      ...parsed,
      platinumTiers: parsed.platinumTiers?.length ? parsed.platinumTiers : base.platinumTiers,
      survey: parsed.survey?.questions?.length ? parsed.survey : base.survey,
      tabMappings: parsed.tabMappings?.length ? parsed.tabMappings : base.tabMappings,
      lookbookSeeds: parsed.lookbookSeeds?.length ? parsed.lookbookSeeds : base.lookbookSeeds,
      clientRules: { ...base.clientRules, ...(parsed.clientRules ?? {}) },
      inviteCopy: { ...base.inviteCopy, ...(parsed.inviteCopy ?? {}) },
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? base.updatedAt,
    };
  } catch {
    return createDefaultOrgConfig();
  }
}

export function saveOrgConfig(config: OrgConfig) {
  if (typeof localStorage === 'undefined') return config;
  const next = { ...config, updatedAt: new Date().toISOString() };
  localStorage.setItem(ORG_CONFIG_STORAGE, JSON.stringify(next));
  return next;
}

export function slugCategory(label: string): PricingCategory {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (slug || `tier-${Date.now()}`) as PricingCategory;
}

export function newSurveyQuestion(): SurveyQuestion {
  return {
    id: `q-${Date.now().toString(36)}`,
    label: 'New question',
    type: 'single',
    required: false,
    options: [
      { value: 'option-a', label: 'Option A' },
      { value: 'option-b', label: 'Option B' },
    ],
  };
}

export function newPlatinumTierRow(partial?: Partial<ContractIncludedLevel>): ContractIncludedLevel {
  const label = partial?.label ?? 'New allowance / trade';
  return {
    pricingCategory: partial?.pricingCategory ?? slugCategory(label),
    sourceTab: partial?.sourceTab ?? '',
    includedLevel: partial?.includedLevel ?? 'Level 3',
    label,
    priceUnit: (partial?.priceUnit ?? 'each') as PriceUnit,
  };
}

/** Build sourceTab → pricingCategory map from org config (kitchen/bath split handled by caller). */
export function buildTabCategoryMap(mappings: CatalogTabMapping[]): Record<string, PricingCategory> {
  const out: Record<string, PricingCategory> = {};
  for (const m of mappings) {
    if (!m.kitchenBathSplit) out[m.sourceTab] = m.pricingCategory;
  }
  return out;
}

export function buildTabCofSheetMap(mappings: CatalogTabMapping[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mappings) out[m.sourceTab] = m.cofSheet;
  return out;
}

export function formatInviteEmail(copy: InviteCopyConfig, opts: { clientName?: string; projectName?: string; inviteUrl: string }) {
  const name = opts.clientName?.trim() || 'there';
  const project = opts.projectName?.trim() || 'your home';
  return [
    `Subject: ${copy.subject}`,
    '',
    `Hi ${name},`,
    '',
    copy.greeting,
    '',
    copy.body.replace(/your home/gi, project),
    '',
    copy.portalBlurb,
    '',
    opts.inviteUrl,
    '',
    copy.closing,
  ].join('\n');
}
