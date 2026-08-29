/**
 * Auth + admin + API keys — Neon auth_snapshots when DATABASE_URL is set, else data/auth-store.json.
 * Also upserts uuid-compatible rows into the users table for project FKs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getPool } from './dbPool.js';
import { ensureSnapshotTable, loadSnapshot, saveSnapshot } from './snapshotStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '../data/auth-store.json');
const DEMO_EMAIL = 'admin@mahnikka.local';

/** Align with src/lib/platform/roles.ts (+ legacy `user`). */
const ROLES = new Set([
  'user',
  'designer',
  'estimator',
  'pm',
  'client_viewer',
  'admin',
  'system_admin',
]);

const SEED_USERS = [
  {
    email: DEMO_EMAIL,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Studio Admin',
    password: 'admin123',
    role: 'system_admin',
  },
  {
    email: 'designer@mahnikka.local',
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Alex Designer',
    password: 'designer123',
    role: 'designer',
  },
  {
    email: 'estimator@mahnikka.local',
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Sam Estimator',
    password: 'estimator123',
    role: 'estimator',
  },
  {
    email: 'client@mahnikka.local',
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Casey Client',
    password: 'client123',
    role: 'client_viewer',
  },
  {
    email: 'pm@mahnikka.local',
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Pat Manager',
    password: 'pm123',
    role: 'pm',
  },
];

let memoryStore = null;

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRole(value) {
  if (value === 'user') return 'designer';
  return ROLES.has(value) ? value : 'designer';
}

function migrateUser(email, row) {
  const seed = SEED_USERS.find((s) => s.email === email);
  return {
    id: row.id,
    name: row.name,
    passwordHash: row.passwordHash,
    role: email === DEMO_EMAIL ? 'system_admin' : normalizeRole(row.role ?? seed?.role),
    createdAt: row.createdAt ?? new Date().toISOString(),
    apiKeys: Array.isArray(row.apiKeys) ? row.apiKeys : [],
  };
}

function readFileAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    return { users: {}, tokens: {} };
  }
}

function writeFileAuth(data) {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

function seedDemo(users) {
  for (const seed of SEED_USERS) {
    if (!users[seed.email]) {
      users[seed.email] = {
        id: seed.id,
        name: seed.name,
        passwordHash: hash(seed.password),
        role: seed.role,
        createdAt: new Date().toISOString(),
        apiKeys: [],
      };
    } else {
      const row = users[seed.email];
      const id = /^[0-9a-f-]{36}$/i.test(String(row.id)) ? row.id : seed.id;
      users[seed.email] = {
        ...row,
        id,
        role: seed.email === DEMO_EMAIL ? 'system_admin' : normalizeRole(row.role || seed.role),
      };
    }
  }
  return users;
}

function normalizeStore(raw) {
  const users = {};
  for (const [email, row] of Object.entries(raw.users ?? {})) {
    users[email] = migrateUser(email, row);
  }
  seedDemo(users);
  return { users, tokens: raw.tokens ?? {} };
}

async function ensureUsersColumns(db) {
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name text`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS api_keys jsonb NOT NULL DEFAULT '[]'::jsonb`);
}

async function upsertUserRow(db, email, row) {
  if (!/^[0-9a-f-]{36}$/i.test(String(row.id))) return;
  await ensureUsersColumns(db);
  await db.query(
    `INSERT INTO users (id, email, created_at, name, password_hash, role, api_keys)
     VALUES ($1::uuid, $2, COALESCE($3::timestamptz, now()), $4, $5, $6, $7::jsonb)
     ON CONFLICT (email) DO UPDATE SET
       name = excluded.name,
       password_hash = excluded.password_hash,
       role = excluded.role,
       api_keys = excluded.api_keys`,
    [
      row.id,
      email,
      row.createdAt ?? null,
      row.name ?? email,
      row.passwordHash ?? null,
      row.role ?? 'designer',
      JSON.stringify(row.apiKeys ?? []),
    ],
  );
}

async function loadAuthStore() {
  if (memoryStore) return memoryStore;
  const db = getPool();
  if (db) {
    try {
      await ensureSnapshotTable(db, 'auth_snapshots');
      const { payload } = await loadSnapshot('auth_snapshots');
      if (payload?.users) {
        memoryStore = normalizeStore(payload);
        const before = Object.keys(payload.users).length;
        seedDemo(memoryStore.users);
        if (Object.keys(memoryStore.users).length > before) {
          void persistAuthStore(memoryStore).catch(() => {});
        }
        return memoryStore;
      }
    } catch (err) {
      console.warn('auth neon load failed; using local store', err?.message || err);
    }
  }
  memoryStore = normalizeStore(readFileAuth());
  return memoryStore;
}

async function persistAuthStore(store) {
  memoryStore = store;
  const db = getPool();
  if (db) {
    try {
      await saveSnapshot('auth_snapshots', store);
      for (const [email, row] of Object.entries(store.users)) {
        try {
          await upsertUserRow(db, email, row);
        } catch (err) {
          console.warn('users upsert skipped', email, err.message);
        }
      }
      return;
    } catch (err) {
      console.warn('auth neon save failed; using file store', err?.message || err);
    }
  }
  try {
    writeFileAuth(store);
  } catch (err) {
    console.warn('auth file save skipped', err?.message || err);
  }
}

function publicUser(email, row) {
  return { id: row.id, email, name: row.name, role: row.role };
}

function readHeader(headers, name) {
  if (!headers) return '';
  const key = String(name).toLowerCase();
  const raw = headers[key] ?? headers[name];
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
}

function bearerEmailFromAuth(authorization, store) {
  const header = String(authorization ?? '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const email = store.tokens[token];
  if (!email || !store.users[email]) return null;
  return email;
}

function bearerEmail(req, store) {
  const header =
    typeof req.header === 'function' ? req.header('authorization') : readHeader(req.headers, 'authorization');
  return bearerEmailFromAuth(header, store);
}

async function requireSystemAdminCtx(authorization) {
  const store = await loadAuthStore();
  const email = bearerEmailFromAuth(authorization, store);
  if (!email) return { error: { status: 401, body: { error: 'Not signed in' } } };
  const row = store.users[email];
  if (row.role !== 'system_admin') {
    return { error: { status: 403, body: { error: 'System admin role required.' } } };
  }
  return { store, email, user: row };
}

async function requireSignedInCtx(authorization) {
  const store = await loadAuthStore();
  const email = bearerEmailFromAuth(authorization, store);
  if (!email) return { error: { status: 401, body: { error: 'Not signed in' } } };
  return { store, email, user: store.users[email] };
}

function findUserById(store, userId) {
  for (const [email, row] of Object.entries(store.users)) {
    if (row.id === userId) return { email, row };
  }
  return null;
}

function apiKeyMeta(row) {
  return {
    id: row.id,
    label: row.label,
    prefix: row.prefix,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt ?? null,
  };
}

function listUserItems(store, { q = '', role = '' } = {}) {
  const query = String(q).trim().toLowerCase();
  const roleFilter = String(role).trim().toLowerCase();
  return Object.entries(store.users)
    .map(([email, row]) => ({
      id: row.id,
      email,
      name: row.name,
      role: row.role,
      createdAt: row.createdAt,
      apiKeyCount: (row.apiKeys ?? []).filter((k) => !k.revokedAt).length,
    }))
    .filter((row) => {
      if (roleFilter && row.role !== roleFilter) return false;
      if (!query) return true;
      return (
        row.email.includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.role.includes(query) ||
        row.id.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function resolveApiKeyUser(req) {
  const store = await loadAuthStore();
  const authorization =
    typeof req.header === 'function' ? req.header('authorization') : readHeader(req.headers, 'authorization');
  const apiKeyHeader =
    typeof req.header === 'function' ? req.header('x-api-key') : readHeader(req.headers, 'x-api-key');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const raw = String(apiKeyHeader || bearer || '').trim();
  if (!raw.startsWith('mnk_')) return null;
  const keyHash = hash(raw);
  for (const [email, user] of Object.entries(store.users)) {
    const match = (user.apiKeys ?? []).find((k) => k.hash === keyHash && !k.revokedAt);
    if (match) return { email, user, keyId: match.id };
  }
  return null;
}

/**
 * Framework-agnostic auth/admin dispatcher for Express + Vercel.
 * @returns {{ status: number, body: object }}
 */
export async function handleAuthRequest({ method, path, query = {}, body = {}, headers = {} }) {
  const m = String(method || 'GET').toUpperCase();
  const p = String(path || '').split('?')[0];
  const authorization = readHeader(headers, 'authorization');

  if (m === 'POST' && p === '/api/auth/register') {
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body?.password ?? '');
    const name = String(body?.name ?? '').trim() || email;
    if (!email || password.length < 6) {
      return { status: 400, body: { error: 'Valid email and password (6+ chars) required.' } };
    }
    const store = await loadAuthStore();
    if (store.users[email]) return { status: 409, body: { error: 'That email is already registered.' } };
    const id = crypto.randomUUID();
    store.users[email] = {
      id,
      name,
      passwordHash: hash(password),
      role: 'designer',
      createdAt: new Date().toISOString(),
      apiKeys: [],
    };
    const token = crypto.randomUUID();
    store.tokens[token] = email;
    await persistAuthStore(store);
    return { status: 201, body: { user: publicUser(email, store.users[email]), token } };
  }

  if (m === 'POST' && p === '/api/auth/login') {
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body?.password ?? '');
    const store = await loadAuthStore();
    const row = store.users[email];
    if (!row || row.passwordHash !== hash(password)) {
      return { status: 401, body: { error: 'Incorrect email or password.' } };
    }
    const token = crypto.randomUUID();
    store.tokens[token] = email;
    await persistAuthStore(store);
    return { status: 200, body: { user: publicUser(email, row), token } };
  }

  if (m === 'POST' && p === '/api/auth/logout') {
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (token) {
      const store = await loadAuthStore();
      delete store.tokens[token];
      await persistAuthStore(store);
    }
    return { status: 200, body: { ok: true } };
  }

  if (m === 'GET' && p === '/api/auth/me') {
    const store = await loadAuthStore();
    const email = bearerEmailFromAuth(authorization, store);
    if (!email) return { status: 401, body: { error: 'Not signed in' } };
    return { status: 200, body: { user: publicUser(email, store.users[email]) } };
  }

  /** Staff directory for team assignment — any signed-in user. */
  if (m === 'GET' && p === '/api/users') {
    const ctx = await requireSignedInCtx(authorization);
    if (ctx.error) return ctx.error;
    return {
      status: 200,
      body: { items: listUserItems(ctx.store, { q: query.q, role: query.role }) },
    };
  }

  if (m === 'GET' && p === '/api/admin/users') {
    const ctx = await requireSystemAdminCtx(authorization);
    if (ctx.error) return ctx.error;
    return {
      status: 200,
      body: { items: listUserItems(ctx.store, { q: query.q, role: query.role }) },
    };
  }

  const roleMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if (m === 'PATCH' && roleMatch) {
    const ctx = await requireSystemAdminCtx(authorization);
    if (ctx.error) return ctx.error;
    const role = String(body?.role ?? '');
    if (!ROLES.has(role) || role === 'user') return { status: 400, body: { error: 'Invalid role.' } };
    const found = findUserById(ctx.store, decodeURIComponent(roleMatch[1]));
    if (!found) return { status: 404, body: { error: 'User not found.' } };
    if (found.email === DEMO_EMAIL && role !== 'system_admin') {
      return { status: 400, body: { error: 'The demo system admin role cannot be downgraded.' } };
    }
    ctx.store.users[found.email] = { ...found.row, role: normalizeRole(role) };
    await persistAuthStore(ctx.store);
    return { status: 200, body: { ok: true, user: publicUser(found.email, ctx.store.users[found.email]) } };
  }

  const keysMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/api-keys$/);
  if (keysMatch) {
    const userId = decodeURIComponent(keysMatch[1]);
    const ctx = await requireSystemAdminCtx(authorization);
    if (ctx.error) return ctx.error;
    const found = findUserById(ctx.store, userId);
    if (!found) return { status: 404, body: { error: 'User not found.' } };
    if (m === 'GET') return { status: 200, body: { items: (found.row.apiKeys ?? []).map(apiKeyMeta) } };
    if (m === 'POST') {
      const material = crypto.randomBytes(24).toString('hex');
      const key = `mnk_${material}`;
      const meta = {
        id: crypto.randomUUID(),
        label: String(body?.label ?? '').trim() || 'Integration key',
        prefix: `${key.slice(0, 12)}…`,
        hash: hash(key),
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };
      const apiKeys = [...(found.row.apiKeys ?? []), meta];
      ctx.store.users[found.email] = { ...found.row, apiKeys };
      await persistAuthStore(ctx.store);
      return { status: 201, body: { key, meta: apiKeyMeta(meta) } };
    }
  }

  const revokeMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/api-keys\/([^/]+)$/);
  if (m === 'DELETE' && revokeMatch) {
    const ctx = await requireSystemAdminCtx(authorization);
    if (ctx.error) return ctx.error;
    const found = findUserById(ctx.store, decodeURIComponent(revokeMatch[1]));
    if (!found) return { status: 404, body: { error: 'User not found.' } };
    const keyId = decodeURIComponent(revokeMatch[2]);
    const apiKeys = (found.row.apiKeys ?? []).map((k) =>
      k.id === keyId ? { ...k, revokedAt: k.revokedAt ?? new Date().toISOString() } : k,
    );
    if (!apiKeys.some((k) => k.id === keyId)) {
      return { status: 404, body: { error: 'API key not found.' } };
    }
    ctx.store.users[found.email] = { ...found.row, apiKeys };
    await persistAuthStore(ctx.store);
    return { status: 200, body: { ok: true } };
  }

  return { status: 404, body: { error: 'Not found', path: p } };
}

export function mountAuthRoutes(app) {
  app.use(async (req, res, next) => {
    const pathName = String(req.path || '').split('?')[0];
    if (
      !pathName.startsWith('/api/auth') &&
      !pathName.startsWith('/api/admin') &&
      pathName !== '/api/users'
    ) {
      return next();
    }
    try {
      const result = await handleAuthRequest({
        method: req.method,
        path: pathName,
        query: req.query || {},
        body: req.body,
        headers: req.headers || {},
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Auth request failed' });
    }
  });
}

export { SEED_USERS, DEMO_EMAIL };
