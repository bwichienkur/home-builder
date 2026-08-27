/**
 * Platform configuration — $0 local defaults, paid/hosted via env later.
 *
 * Switch without rewriting UI:
 *   VITE_AUTH_PROVIDER=local|remote
 *   VITE_CRM_PROVIDER=local|http
 *   VITE_OPS_PROVIDER=local|http
 *   VITE_API_URL=http://localhost:4000
 */
export type AuthProviderId = 'local' | 'remote';
export type CrmProviderId = 'local' | 'http';
export type OpsProviderId = 'local' | 'http';

function env(name: string, fallback = '') {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return (value ?? fallback).trim();
}

function resolveOpsProvider(): OpsProviderId {
  const explicit = env('VITE_OPS_PROVIDER', '');
  if (explicit === 'http') return 'http';
  if (explicit === 'local') return 'local';
  // Production (Vercel) defaults to shared /api/ops — pairs with Neon DATABASE_URL.
  // Local Vite stays browser-only unless VITE_OPS_PROVIDER=http is set.
  return import.meta.env.PROD ? 'http' : 'local';
}

export const platformConfig = {
  /** local = browser accounts; remote = call API / IdP adapter. */
  authProvider: (env('VITE_AUTH_PROVIDER', 'local') === 'remote' ? 'remote' : 'local') as AuthProviderId,
  /** local = localStorage CRM; http = sync via VITE_API_URL /api/crm. */
  crmProvider: (env('VITE_CRM_PROVIDER', 'local') === 'http' ? 'http' : 'local') as CrmProviderId,
  /** local = localStorage Operations; http = sync via VITE_API_URL /api/ops (Postgres or file). */
  opsProvider: resolveOpsProvider(),
  apiUrl: env('VITE_API_URL', '').replace(/\/$/, ''),
  /** True when a remote API base URL is configured (cloud-capable). */
  cloudConfigured(): boolean {
    return Boolean(this.apiUrl);
  },
  /** Shown in Settings so operators know which path is active. */
  label() {
    const auth = this.authProvider === 'local' ? 'Local auth ($0)' : 'Remote auth (API/IdP)';
    const crm = this.crmProvider === 'local' ? 'Browser CRM ($0)' : 'HTTP CRM (API/DB)';
    const ops = this.opsProvider === 'local' ? 'Browser Ops ($0)' : 'HTTP Ops (API/DB)';
    const cloud = this.cloudConfigured() ? 'Cloud API' : 'Browser save only';
    return `${auth} · ${crm} · ${ops} · ${cloud}`;
  },
};

export function apiHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...extra,
  };
  const devUser = env('VITE_DEV_USER_ID');
  if (devUser) headers['x-user-id'] = devUser;
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('mahnikka-auth-token') : null;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
