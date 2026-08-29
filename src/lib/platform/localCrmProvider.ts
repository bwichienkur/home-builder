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
      let snapshot = empty();
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CrmSnapshot> & { state?: CrmSnapshot };
        const state = parsed.state ?? parsed;
        snapshot = {
          clients: state.clients ?? [],
          vendors: state.vendors ?? [],
          inventory: state.inventory ?? [],
          customFields: state.customFields ?? [],
          housePlans: state.housePlans ?? [],
        };
      }
      if (!snapshot.clients.some((c) => !c.archived)) {
        const now = new Date().toISOString();
        snapshot = {
          ...snapshot,
          clients: [
            {
              id: 'client-demo-casey',
              name: 'Casey Client',
              email: 'client@mahnikka.local',
              phone: '',
              company: '',
              address: '',
              notes: 'Demo CRM client',
              customFields: {},
              createdAt: now,
              updatedAt: now,
              archived: false,
            },
            ...snapshot.clients,
          ],
        };
        await this.save(snapshot);
      }
      return snapshot;
    } catch {
      return empty();
    }
  }

  async save(snapshot: CrmSnapshot): Promise<void> {
    // Keep zustand-compatible envelope so older sessions still hydrate.
    localStorage.setItem(KEY, JSON.stringify({ state: snapshot, version: 0 }));
  }
}
