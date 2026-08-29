import { create } from 'zustand';
import {
  createDefaultOrgConfig,
  loadOrgConfig,
  saveOrgConfig,
  type CatalogTabMapping,
  type ClientCatalogRules,
  type InviteCopyConfig,
  type LookbookSeedRule,
  type OrgConfig,
} from '../lib/configurator/orgConfig';
import type { ContractIncludedLevel } from '../lib/configurator/contractTypes';
import { setSurveyConfig, type SurveyConfig } from '../lib/configurator/surveyConfig';

type OrgConfigState = {
  config: OrgConfig;
  dirty: boolean;
  hydrate: () => void;
  replaceConfig: (config: OrgConfig) => void;
  setPlatinumTiers: (tiers: ContractIncludedLevel[]) => void;
  setSurvey: (survey: SurveyConfig) => void;
  setTabMappings: (mappings: CatalogTabMapping[]) => void;
  setLookbookSeeds: (seeds: LookbookSeedRule[]) => void;
  setClientRules: (rules: ClientCatalogRules) => void;
  setInviteCopy: (copy: InviteCopyConfig) => void;
  save: () => void;
  resetSection: (section: keyof Omit<OrgConfig, 'version' | 'updatedAt'>) => void;
  resetAll: () => void;
};

function applySurvey(survey: SurveyConfig) {
  setSurveyConfig(survey);
}

export const useOrgConfigStore = create<OrgConfigState>((set, get) => ({
  config: createDefaultOrgConfig(),
  dirty: false,
  hydrate: () => {
    const config = loadOrgConfig();
    applySurvey(config.survey);
    set({ config, dirty: false });
  },
  replaceConfig: (config) => {
    applySurvey(config.survey);
    set({ config, dirty: true });
  },
  setPlatinumTiers: (platinumTiers) => set({ config: { ...get().config, platinumTiers }, dirty: true }),
  setSurvey: (survey) => {
    applySurvey(survey);
    set({ config: { ...get().config, survey }, dirty: true });
  },
  setTabMappings: (tabMappings) => set({ config: { ...get().config, tabMappings }, dirty: true }),
  setLookbookSeeds: (lookbookSeeds) => set({ config: { ...get().config, lookbookSeeds }, dirty: true }),
  setClientRules: (clientRules) => set({ config: { ...get().config, clientRules }, dirty: true }),
  setInviteCopy: (inviteCopy) => set({ config: { ...get().config, inviteCopy }, dirty: true }),
  save: () => {
    const saved = saveOrgConfig(get().config) ?? get().config;
    applySurvey(saved.survey);
    set({ config: saved, dirty: false });
  },
  resetSection: (section) => {
    const defaults = createDefaultOrgConfig();
    const next = { ...get().config, [section]: defaults[section] };
    if (section === 'survey') applySurvey(defaults.survey);
    set({ config: next, dirty: true });
  },
  resetAll: () => {
    const config = createDefaultOrgConfig();
    applySurvey(config.survey);
    set({ config, dirty: true });
  },
}));

/** Sync survey defaults as soon as the module loads in the browser. */
if (typeof window !== 'undefined') {
  useOrgConfigStore.getState().hydrate();
}
