/**
 * Platform configuration — $0 local defaults, paid/hosted via env later.
 *
 * Switch without rewriting UI:
 *   VITE_AUTH_PROVIDER=local|remote
 *   VITE_CRM_PROVIDER=local|http
 *   VITE_OPS_PROVIDER=local|http
 *   VITE_CLOUD_PERSIST=local|http  (org config, trade rates, designs, drawings)
 *   VITE_API_URL=http://localhost:4000
 */
export type AuthProviderId = 'local' | 'remote';
export type CrmProviderId = 'local' | 'http';
export type OpsProviderId = 'local' | 'http';
export type CloudPersistId = 'local' | 'http';

function env(name: string, fallback = '') {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return (value ?? fallback).trim();
}

/** Production (Vercel) defaults to shared HTTP APIs — pairs with Neon DATABASE_URL. */
function resolveHttpDefault(explicitEnv: string): 'local' | 'http' {
  const explicit = env(explicitEnv, '');
  if (explicit === 'http' || explicit === 'remote') return 'http';
  if (explicit === 'local') return 'local';
  return import.meta.env.PROD ? 'http' : 'local';
}

function resolveAuthProvider(): AuthProviderId {
  const explicit = env('VITE_AUTH_PROVIDER', '');
  if (explicit === 'remote') return 'remote';
  if (explicit === 'local') return 'local';
  // Production uses Neon-backed /api/auth; local Vite stays browser-only.
  return import.meta.env.PROD ? 'remote' : 'local';
}

function resolveCrmProvider(): CrmProviderId {
  return resolveHttpDefault('VITE_CRM_PROVIDER');
}

function resolveOpsProvider(): OpsProviderId {
  return resolveHttpDefault('VITE_OPS_PROVIDER');
}

function resolveCloudPersist(): CloudPersistId {
  return resolveHttpDefault('VITE_CLOUD_PERSIST');
}

export const platformConfig = {
  /** local = browser accounts; remote = call API / IdP adapter. */
  authProvider: resolveAuthProvider(),
  /** local = localStorage CRM; http = sync via /api/crm (Neon on prod). */
  crmProvider: resolveCrmProvider(),
  /** local = localStorage Operations; http = sync via /api/ops (Postgres or file). */
  opsProvider: resolveOpsProvider(),
  /**
   * Org config, trade rates, design library, drawing packages.
   * http = same-origin /api/* (Neon) in production; local = browser only.
   */
  cloudPersist: resolveCloudPersist(),
  apiUrl: env('VITE_API_URL', '').replace(/\/$/, ''),
  /** True when a remote API base URL is configured (cloud-capable). */
  cloudConfigured(): boolean {
    return Boolean(this.apiUrl) || this.opsProvider === 'http' || this.cloudPersist === 'http';
  },
  /** Shown in Settings so operators know which path is active. */
  label() {
    const auth = this.authProvider === 'local' ? 'Local auth ($0)' : 'Remote auth (API/DB)';
    const crm = this.crmProvider === 'local' ? 'Browser CRM ($0)' : 'HTTP CRM (API/DB)';
    const ops = this.opsProvider === 'local' ? 'Browser Ops ($0)' : 'HTTP Ops (API/DB)';
    const persist = this.cloudPersist === 'local' ? 'Browser persist ($0)' : 'Neon persist (API/DB)';
    const cloud = this.cloudConfigured() ? 'Cloud API' : 'Browser save only';
    return `${auth} · ${crm} · ${ops} · ${persist} · ${cloud}`;
  },
};

/** Base URL for fetch — empty string means same-origin (Vercel / Vite proxy). */
export function apiBaseUrl(): string {
  return platformConfig.apiUrl;
}

export function isCloudPersistHttp(): boolean {
  return platformConfig.cloudPersist === 'http';
}

export function apiHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...extra,
  };
  const devUser = env('VITE_DEV_USER_ID');
  if (devUser) headers['x-user-id'] = devUser;
  if (!headers['x-user-id'] && typeof localStorage !== 'undefined') {
    try {
      const sessionRaw = localStorage.getItem('mahnikka-auth-session-v1');
      if (sessionRaw) {
        const parsed = JSON.parse(sessionRaw) as { state?: { user?: { id?: string }; token?: string } };
        const id = parsed?.state?.user?.id;
        if (id) headers['x-user-id'] = id;
        const token = parsed?.state?.token;
        if (token && !headers.authorization) headers.authorization = `Bearer ${token}`;
      }
    } catch {
      /* ignore */
    }
  }
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('mahnikka-auth-token') : null;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
