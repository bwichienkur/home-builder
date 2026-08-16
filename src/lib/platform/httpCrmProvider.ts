import { apiHeaders, platformConfig } from './config';
import type { CrmProvider, CrmSnapshot } from './crmProvider';

const COLLECTIONS = ['clients', 'vendors', 'inventory', 'customFields', 'housePlans'] as const;

/**
 * HTTP CRM adapter — uses /api/crm/* (file store $0 today, Postgres later).
 * When you add DATABASE_URL-backed tables, keep these routes and the UI stays put.
 */
export class HttpCrmProvider implements CrmProvider {
  readonly id = 'http' as const;

  private base() {
    if (!platformConfig.apiUrl) {
      throw new Error('VITE_API_URL is required when VITE_CRM_PROVIDER=http');
    }
    return platformConfig.apiUrl;
  }

  async load(): Promise<CrmSnapshot> {
    const out: CrmSnapshot = {
      clients: [],
      vendors: [],
      inventory: [],
      customFields: [],
      housePlans: [],
    };
    await Promise.all(
      COLLECTIONS.map(async (key) => {
        const res = await fetch(`${this.base()}/api/crm/${key}`, { headers: apiHeaders() });
        if (!res.ok) throw new Error(`CRM load failed for ${key}`);
        const body = await res.json();
        out[key] = Array.isArray(body.items) ? body.items : [];
      }),
    );
    return out;
  }

  async save(snapshot: CrmSnapshot): Promise<void> {
    await Promise.all(
      COLLECTIONS.map(async (key) => {
        const res = await fetch(`${this.base()}/api/crm/${key}`, {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({ items: snapshot[key] }),
        });
        if (!res.ok) throw new Error(`CRM save failed for ${key}`);
      }),
    );
  }
}
