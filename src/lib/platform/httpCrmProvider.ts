import { apiBaseUrl, apiHeaders } from './config';
import type { CrmProvider, CrmSnapshot } from './crmProvider';

const COLLECTIONS = ['clients', 'vendors', 'inventory', 'customFields', 'housePlans'] as const;

/**
 * HTTP CRM adapter — uses /api/crm/* (Neon crm_snapshots when DATABASE_URL is set).
 * Empty VITE_API_URL → same-origin (Vercel or Vite proxy).
 */
export class HttpCrmProvider implements CrmProvider {
  readonly id = 'http' as const;

  private base() {
    return apiBaseUrl();
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
