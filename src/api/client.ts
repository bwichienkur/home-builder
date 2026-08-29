export type CatalogPage<T> = { items: T[]; nextCursor: string | null };

const API_URL = import.meta.env.VITE_API_URL ?? '';
const headers = () => ({
  'content-type': 'application/json',
  ...(import.meta.env.VITE_DEV_USER_ID ? { 'x-user-id': String(import.meta.env.VITE_DEV_USER_ID) } : {}),
});

export async function getCatalog<T>(q = '', cursor?: string): Promise<CatalogPage<T>> {
  const params = new URLSearchParams({ q, limit: '24' });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`${API_URL}/api/catalog?${params}`, { headers: headers() });
  if (!response.ok) throw new Error('Catalog could not be loaded');
  return response.json();
}

export type CloudProjectSummary = {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  role?: string;
};

export async function listProjects(): Promise<CloudProjectSummary[]> {
  const response = await fetch(`${API_URL}/api/projects`, { headers: headers() });
  if (!response.ok) throw new Error('Projects could not be listed');
  const data = await response.json();
  return data.items ?? data;
}

export async function getProject(id: string) {
  const response = await fetch(`${API_URL}/api/projects/${id}`, { headers: headers() });
  if (!response.ok) throw new Error('Project could not be loaded');
  return response.json() as Promise<{
    id: string;
    name: string;
    scene: unknown;
    version: number;
    updatedAt: string;
  }>;
}

export async function saveProject(id: string | undefined, name: string, scene: unknown, version = 1) {
  const response = await fetch(`${API_URL}/api/projects${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: headers(),
    body: JSON.stringify({ name, scene, version }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 409
        ? 'This project changed in another session. Reload before saving.'
        : 'Project could not be saved',
    );
  }
  return response.json() as Promise<{ id: string; name?: string; version: number; updatedAt?: string }>;
}

export async function getProjectVersions(id: string) {
  const response = await fetch(`${API_URL}/api/projects/${id}/versions`, { headers: headers() });
  if (!response.ok) throw new Error('Version history could not be loaded');
  return response.json() as Promise<{ items: { version: number; createdAt: string; note?: string }[] }>;
}

export type ApiSelectionProject = {
  id: string;
  name: string;
  planRef: string;
  lotRef?: string;
  contract: import('../lib/configurator/contractTypes').ContractSnapshot;
  sceneProjectId?: string;
  extended?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export async function listSelectionProjects(): Promise<ApiSelectionProject[]> {
  const response = await fetch(`${API_URL}/api/selection-projects`, { headers: headers() });
  if (!response.ok) throw new Error('Selection projects could not be listed');
  const data = await response.json();
  return data.items ?? [];
}

export async function getSelectionProject(id: string): Promise<ApiSelectionProject> {
  const response = await fetch(`${API_URL}/api/selection-projects/${id}`, { headers: headers() });
  if (!response.ok) throw new Error('Selection project could not be loaded');
  return response.json();
}

export async function createSelectionProject(body: {
  name: string;
  planRef?: string;
  lotRef?: string;
  contract: ApiSelectionProject['contract'];
  sceneProjectId?: string | null;
  extended?: Record<string, unknown>;
}): Promise<ApiSelectionProject> {
  const response = await fetch(`${API_URL}/api/selection-projects`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Selection project could not be created');
  return response.json();
}

export async function updateSelectionProject(
  id: string,
  body: Partial<{
    name: string;
    planRef: string;
    lotRef: string;
    contract: ApiSelectionProject['contract'];
    sceneProjectId: string | null;
    extended: Record<string, unknown>;
  }>,
): Promise<ApiSelectionProject> {
  const response = await fetch(`${API_URL}/api/selection-projects/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Selection project could not be saved');
  return response.json();
}

export async function inviteSelectionProjectClient(
  id: string,
  body?: { clientEmail?: string; expiresInDays?: number },
): Promise<{ shareToken: string; shareUrl: string; shareExpiresAt?: string; clientEmail?: string; note?: string }> {
  const response = await fetch(`${API_URL}/api/selection-projects/${id}/invite`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error('Client invite could not be created');
  return response.json();
}

export async function getSharedSelectionProject(token: string): Promise<ApiSelectionProject & { shareToken?: string }> {
  const response = await fetch(`${API_URL}/api/selection-projects/shared/${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error('Shared selection project not found or expired');
  return response.json();
}

export async function updateSharedSelectionProject(
  token: string,
  extended: Record<string, unknown>,
): Promise<ApiSelectionProject> {
  const response = await fetch(`${API_URL}/api/selection-projects/shared/${encodeURIComponent(token)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extended }),
  });
  if (!response.ok) throw new Error('Shared selection project could not be saved');
  return response.json();
}
