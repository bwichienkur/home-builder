import type { CrmProvider, CrmSnapshot } from './crmProvider';

const KEY = 'mahnikka-crm-v1';

const empty = (): CrmSnapshot => ({
  clients: [],
  vendors: [],
  inventory: [],
  customFields: [],
  housePlans: [],
});

/** $0 browser CRM — no database required. */
export class LocalCrmProvider implements CrmProvider {
  readonly id = 'local' as const;

  async load(): Promise<CrmSnapshot> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw) as Partial<CrmSnapshot> & { state?: CrmSnapshot };
      // Zustand persist shape { state, version } or raw snapshot.
      const state = parsed.state ?? parsed;
      return {
        clients: state.clients ?? [],
        vendors: state.vendors ?? [],
        inventory: state.inventory ?? [],
        customFields: state.customFields ?? [],
        housePlans: state.housePlans ?? [],
      };
    } catch {
      return empty();
    }
  }

  async save(snapshot: CrmSnapshot): Promise<void> {
    // Keep zustand-compatible envelope so older sessions still hydrate.
    localStorage.setItem(KEY, JSON.stringify({ state: snapshot, version: 0 }));
  }
}
