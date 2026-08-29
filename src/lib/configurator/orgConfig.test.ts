import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_CONFIG_STORAGE, createDefaultOrgConfig, loadOrgConfig, saveOrgConfig } from './orgConfig';
import { useOrgConfigStore } from '../../store/orgConfigStore';

const memory = new Map<string, string>();

describe('org config studio', () => {
  beforeEach(() => {
    memory.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
    });
    useOrgConfigStore.getState().hydrate();
  });

  it('loads Platinum defaults and persists edits', () => {
    const config = loadOrgConfig();
    expect(config.platinumTiers.length).toBeGreaterThan(5);
    expect(config.survey.questions.length).toBeGreaterThan(2);
    const next = {
      ...config,
      platinumTiers: [
        ...config.platinumTiers,
        {
          pricingCategory: 'fireplace',
          sourceTab: 'Fireplace',
          includedLevel: 'Level 3',
          label: 'Fireplace package',
          priceUnit: 'each' as const,
        },
      ],
    };
    saveOrgConfig(next);
    expect(loadOrgConfig().platinumTiers.some((t) => t.pricingCategory === 'fireplace')).toBe(true);
    expect(memory.has(ORG_CONFIG_STORAGE)).toBe(true);
  });

  it('resets a section from the store', () => {
    useOrgConfigStore.getState().setInviteCopy({
      subject: 'Custom subject',
      greeting: 'Hi',
      body: 'Body',
      portalBlurb: 'Blurb',
      closing: 'Bye',
    });
    useOrgConfigStore.getState().resetSection('inviteCopy');
    expect(useOrgConfigStore.getState().config.inviteCopy.subject).toBe(
      createDefaultOrgConfig().inviteCopy.subject,
    );
  });
});
