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
