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
import {
  isOrgConfigHttp,
  pullOrgConfigFromServer,
  pushOrgConfigToServer,
} from '../lib/configurator/orgConfigRemote';
import type { ContractIncludedLevel } from '../lib/configurator/contractTypes';
import { setSurveyConfig, type SurveyConfig } from '../lib/configurator/surveyConfig';

type OrgConfigState = {
  config: OrgConfig;
  dirty: boolean;
  hydrating: boolean;
  hydrate: () => void;
  hydrateRemote: () => Promise<void>;
  replaceConfig: (config: OrgConfig) => void;
  setPlatinumTiers: (tiers: ContractIncludedLevel[]) => void;
  setSurvey: (survey: SurveyConfig) => void;
  setTabMappings: (mappings: CatalogTabMapping[]) => void;
  setLookbookSeeds: (seeds: LookbookSeedRule[]) => void;
  setClientRules: (rules: ClientCatalogRules) => void;
  setInviteCopy: (copy: InviteCopyConfig) => void;
  save: () => void;
  saveAsync: () => Promise<void>;
  resetSection: (section: keyof Omit<OrgConfig, 'version' | 'updatedAt'>) => void;
  resetAll: () => void;
};

function applySurvey(survey: SurveyConfig) {
  setSurveyConfig(survey);
}

function mergeRemote(config: OrgConfig): OrgConfig {
  const base = createDefaultOrgConfig();
  return {
    ...base,
    ...config,
    platinumTiers: config.platinumTiers?.length ? config.platinumTiers : base.platinumTiers,
    survey: config.survey?.questions?.length ? config.survey : base.survey,
    tabMappings: config.tabMappings?.length ? config.tabMappings : base.tabMappings,
    lookbookSeeds: config.lookbookSeeds?.length ? config.lookbookSeeds : base.lookbookSeeds,
    clientRules: { ...base.clientRules, ...(config.clientRules ?? {}) },
    inviteCopy: { ...base.inviteCopy, ...(config.inviteCopy ?? {}) },
    version: config.version ?? 1,
    updatedAt: config.updatedAt ?? base.updatedAt,
  };
}

export const useOrgConfigStore = create<OrgConfigState>((set, get) => ({
  config: createDefaultOrgConfig(),
  dirty: false,
  hydrating: false,
  hydrate: () => {
    const config = loadOrgConfig();
    applySurvey(config.survey);
    set({ config, dirty: false });
    if (isOrgConfigHttp()) void get().hydrateRemote();
  },
  hydrateRemote: async () => {
    if (!isOrgConfigHttp()) return;
    set({ hydrating: true });
    try {
      const remote = await pullOrgConfigFromServer();
      if (remote?.config && !remote.empty) {
        const config = mergeRemote(remote.config);
        saveOrgConfig(config);
        applySurvey(config.survey);
        set({ config, dirty: false, hydrating: false });
        return;
      }
      // Seed Neon from local defaults / cache when empty.
      const local = loadOrgConfig();
      await pushOrgConfigToServer(local);
      set({ hydrating: false });
    } catch (err) {
      console.warn('Org config remote hydrate failed', err);
      set({ hydrating: false });
    }
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
    void get().saveAsync();
  },
  saveAsync: async () => {
    const saved = saveOrgConfig(get().config) ?? get().config;
    applySurvey(saved.survey);
    set({ config: saved, dirty: false });
    if (isOrgConfigHttp()) {
      try {
        await pushOrgConfigToServer(saved);
      } catch (err) {
        console.warn('Org config remote save failed', err);
      }
    }
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
