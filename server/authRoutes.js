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
const ROLES = new Set(['user', 'admin', 'system_admin']);

let memoryStore = null;

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRole(value) {
  return ROLES.has(value) ? value : 'user';
}

function migrateUser(email, row) {
  return {
    id: row.id,
    name: row.name,
    passwordHash: row.passwordHash,
    role: email === DEMO_EMAIL ? 'system_admin' : normalizeRole(row.role),
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

/** Stable UUID so demo admin can FK into projects when synced to users. */
const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

function seedDemo(users) {
  if (!users[DEMO_EMAIL]) {
    users[DEMO_EMAIL] = {
      id: DEMO_USER_ID,
      name: 'Studio Admin',
      passwordHash: hash('admin123'),
      role: 'system_admin',
      createdAt: new Date().toISOString(),
      apiKeys: [],
    };
  } else {
    const row = users[DEMO_EMAIL];
    const id = /^[0-9a-f-]{36}$/i.test(String(row.id)) ? row.id : DEMO_USER_ID;
    users[DEMO_EMAIL] = { ...row, id, role: 'system_admin' };
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
  // Only sync when id is a uuid so we don't break the users PK.
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
      row.role ?? 'user',
      JSON.stringify(row.apiKeys ?? []),
    ],
  );
}

async function loadAuthStore() {
  if (memoryStore) return memoryStore;
  const db = getPool();
  if (db) {
    await ensureSnapshotTable(db, 'auth_snapshots');
    const { payload } = await loadSnapshot('auth_snapshots');
    if (payload?.users) {
      memoryStore = normalizeStore(payload);
      return memoryStore;
    }
  }
  memoryStore = normalizeStore(readFileAuth());
  return memoryStore;
}

async function persistAuthStore(store) {
  memoryStore = store;
  const db = getPool();
  if (db) {
    await saveSnapshot('auth_snapshots', store);
    for (const [email, row] of Object.entries(store.users)) {
      try {
        await upsertUserRow(db, email, row);
      } catch (err) {
        console.warn('users upsert skipped', email, err.message);
      }
    }
    return;
  }
  writeFileAuth(store);
}

function publicUser(email, row) {
  return { id: row.id, email, name: row.name, role: row.role };
}

function bearerEmail(req, store) {
  const header = String(req.header('authorization') ?? '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const email = store.tokens[token];
  if (!email || !store.users[email]) return null;
  return email;
}

async function requireSystemAdmin(req, res) {
  const store = await loadAuthStore();
  const email = bearerEmail(req, store);
  if (!email) {
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  const row = store.users[email];
  if (row.role !== 'system_admin') {
    res.status(403).json({ error: 'System admin role required.' });
    return null;
  }
  return { store, email, user: row };
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

export async function resolveApiKeyUser(req) {
  const store = await loadAuthStore();
  const header = String(req.header('authorization') ?? '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const raw = String(req.header('x-api-key') ?? bearer ?? '').trim();
  if (!raw.startsWith('mnk_')) return null;
  const keyHash = hash(raw);
  for (const [email, user] of Object.entries(store.users)) {
    const match = (user.apiKeys ?? []).find((k) => k.hash === keyHash && !k.revokedAt);
    if (match) return { email, user, keyId: match.id };
  }
  return null;
}

export function mountAuthRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const email = String(req.body?.email ?? '')
        .trim()
        .toLowerCase();
      const password = String(req.body?.password ?? '');
      const name = String(req.body?.name ?? '').trim() || email;
      if (!email || password.length < 6) {
        return res.status(400).json({ error: 'Valid email and password (6+ chars) required.' });
      }
      const store = await loadAuthStore();
      if (store.users[email]) return res.status(409).json({ error: 'That email is already registered.' });
      const id = crypto.randomUUID();
      store.users[email] = {
        id,
        name,
        passwordHash: hash(password),
        role: 'user',
        createdAt: new Date().toISOString(),
        apiKeys: [],
      };
      const token = crypto.randomUUID();
      store.tokens[token] = email;
      await persistAuthStore(store);
      res.status(201).json({ user: publicUser(email, store.users[email]), token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email ?? '')
        .trim()
        .toLowerCase();
      const password = String(req.body?.password ?? '');
      const store = await loadAuthStore();
      const row = store.users[email];
      if (!row || row.passwordHash !== hash(password)) {
        return res.status(401).json({ error: 'Incorrect email or password.' });
      }
      const token = crypto.randomUUID();
      store.tokens[token] = email;
      await persistAuthStore(store);
      res.json({ user: publicUser(email, row), token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const header = String(req.header('authorization') ?? '');
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (token) {
        const store = await loadAuthStore();
        delete store.tokens[token];
        await persistAuthStore(store);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const store = await loadAuthStore();
      const email = bearerEmail(req, store);
      if (!email) return res.status(401).json({ error: 'Not signed in' });
      res.json({ user: publicUser(email, store.users[email]) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Auth check failed' });
    }
  });

  app.get('/api/admin/users', async (req, res) => {
    try {
      const ctx = await requireSystemAdmin(req, res);
      if (!ctx) return;
      const q = String(req.query.q ?? '')
        .trim()
        .toLowerCase();
      const items = Object.entries(ctx.store.users)
        .map(([email, row]) => ({
          id: row.id,
          email,
          name: row.name,
          role: row.role,
          createdAt: row.createdAt,
          apiKeyCount: (row.apiKeys ?? []).filter((k) => !k.revokedAt).length,
        }))
        .filter((row) => {
          if (!q) return true;
          return (
            row.email.includes(q) ||
            row.name.toLowerCase().includes(q) ||
            row.role.includes(q) ||
            row.id.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => a.email.localeCompare(b.email));
      res.json({ items });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list users' });
    }
  });

  app.patch('/api/admin/users/:userId/role', async (req, res) => {
    try {
      const ctx = await requireSystemAdmin(req, res);
      if (!ctx) return;
      const role = String(req.body?.role ?? '');
      if (!ROLES.has(role)) return res.status(400).json({ error: 'Invalid role.' });
      const found = findUserById(ctx.store, req.params.userId);
      if (!found) return res.status(404).json({ error: 'User not found.' });
      if (found.email === DEMO_EMAIL && role !== 'system_admin') {
        return res.status(400).json({ error: 'The demo system admin role cannot be downgraded.' });
      }
      ctx.store.users[found.email] = { ...found.row, role };
      await persistAuthStore(ctx.store);
      res.json({ ok: true, user: publicUser(found.email, ctx.store.users[found.email]) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update role' });
    }
  });

  app.get('/api/admin/users/:userId/api-keys', async (req, res) => {
    try {
      const ctx = await requireSystemAdmin(req, res);
      if (!ctx) return;
      const found = findUserById(ctx.store, req.params.userId);
      if (!found) return res.status(404).json({ error: 'User not found.' });
      res.json({ items: (found.row.apiKeys ?? []).map(apiKeyMeta) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list API keys' });
    }
  });

  app.post('/api/admin/users/:userId/api-keys', async (req, res) => {
    try {
      const ctx = await requireSystemAdmin(req, res);
      if (!ctx) return;
      const found = findUserById(ctx.store, req.params.userId);
      if (!found) return res.status(404).json({ error: 'User not found.' });
      const material = crypto.randomBytes(24).toString('hex');
      const key = `mnk_${material}`;
      const meta = {
        id: crypto.randomUUID(),
        label: String(req.body?.label ?? '').trim() || 'Integration key',
        prefix: `${key.slice(0, 12)}…`,
        hash: hash(key),
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };
      const apiKeys = [...(found.row.apiKeys ?? []), meta];
      ctx.store.users[found.email] = { ...found.row, apiKeys };
      await persistAuthStore(ctx.store);
      res.status(201).json({ key, meta: apiKeyMeta(meta) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  app.delete('/api/admin/users/:userId/api-keys/:keyId', async (req, res) => {
    try {
      const ctx = await requireSystemAdmin(req, res);
      if (!ctx) return;
      const found = findUserById(ctx.store, req.params.userId);
      if (!found) return res.status(404).json({ error: 'User not found.' });
      const apiKeys = (found.row.apiKeys ?? []).map((k) =>
        k.id === req.params.keyId ? { ...k, revokedAt: k.revokedAt ?? new Date().toISOString() } : k,
      );
      if (!apiKeys.some((k) => k.id === req.params.keyId)) {
        return res.status(404).json({ error: 'API key not found.' });
      }
      ctx.store.users[found.email] = { ...found.row, apiKeys };
      await persistAuthStore(ctx.store);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to revoke API key' });
    }
  });
}
