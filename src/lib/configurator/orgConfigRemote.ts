import { apiBaseUrl, apiHeaders, isCloudPersistHttp } from '../platform/config';
import type { OrgConfig } from '../configurator/orgConfig';

export function isOrgConfigHttp(): boolean {
  return isCloudPersistHttp();
}

export async function pullOrgConfigFromServer(): Promise<{ config: OrgConfig; empty: boolean } | null> {
  if (!isOrgConfigHttp()) return null;
  const res = await fetch(`${apiBaseUrl()}/api/org-config`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Org config load failed (${res.status})`);
  const body = (await res.json()) as { config?: OrgConfig; empty?: boolean };
  if (!body.config || typeof body.config !== 'object') return null;
  return { config: body.config, empty: Boolean(body.empty) };
}

export async function pushOrgConfigToServer(config: OrgConfig): Promise<void> {
  if (!isOrgConfigHttp()) return;
  const res = await fetch(`${apiBaseUrl()}/api/org-config`, {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Org config save failed (${res.status})`);
  }
}
