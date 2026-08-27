import { apiHeaders, platformConfig } from '../platform/config';
import type { OpsSnapshot } from './types';

export function isOpsHttpProvider(): boolean {
  return platformConfig.opsProvider === 'http';
}

function baseUrl() {
  // Empty apiUrl → same-origin (Vercel /api/ops or Vite proxy).
  return platformConfig.apiUrl;
}

/** GET /api/ops — returns null when empty / unreachable. */
export async function pullOpsFromServer(): Promise<{ snapshot: OpsSnapshot; empty: boolean } | null> {
  if (!isOpsHttpProvider()) return null;
  const res = await fetch(`${baseUrl()}/api/ops`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Operations load failed (${res.status})`);
  const body = (await res.json()) as { snapshot?: OpsSnapshot; empty?: boolean };
  if (!body.snapshot || body.snapshot.version !== 1) return null;
  return { snapshot: body.snapshot, empty: Boolean(body.empty) };
}

/** PUT /api/ops — shared store for all clients using HTTP provider. */
export async function pushOpsToServer(snapshot: OpsSnapshot): Promise<void> {
  if (!isOpsHttpProvider()) return;
  const res = await fetch(`${baseUrl()}/api/ops`, {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify({ snapshot }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Operations save failed (${res.status})`);
  }
}
