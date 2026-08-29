/**
 * Self-contained Vercel auth — no imports from ../server (those crash the isolate).
 * Neon HTTP for auth_snapshots; seeds demo users on first load.
 */
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';

const DEMO_EMAIL = 'admin@mahnikka.local';
const SEED_USERS = [
  { email: DEMO_EMAIL, id: '00000000-0000-4000-8000-000000000001', name: 'Studio Admin', password: 'admin123', role: 'system_admin' },
  { email: 'designer@mahnikka.local', id: '00000000-0000-4000-8000-000000000002', name: 'Alex Designer', password: 'designer123', role: 'designer' },
  { email: 'estimator@mahnikka.local', id: '00000000-0000-4000-8000-000000000003', name: 'Sam Estimator', password: 'estimator123', role: 'estimator' },
  { email: 'client@mahnikka.local', id: '00000000-0000-4000-8000-000000000004', name: 'Casey Client', password: 'client123', role: 'client_viewer' },
  { email: 'pm@mahnikka.local', id: '00000000-0000-4000-8000-000000000005', name: 'Pat Manager', password: 'pm123', role: 'pm' },
];

let memoryStore = null;

function dbUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ''
  );
}

function sql() {
  const url = dbUrl();
  if (!url) return null;
  return neon(url, { fullResults: true });
}

async function query(text, params = []) {
  const client = sql();
  if (!client) throw Object.assign(new Error('DATABASE_URL is not configured'), { status: 503 });
  const result = await client.query(text, params);
  if (Array.isArray(result)) return { rows: result };
  return { rows: result.rows ?? [] };
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
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
    }
  }
  return users;
}

function publicUser(email, row) {
  return { id: row.id, email, name: row.name, role: row.role };
}

async function ensureAuthTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS auth_snapshots (
      id text PRIMARY KEY DEFAULT 'default',
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadStore() {
  if (memoryStore) return memoryStore;
  await ensureAuthTable();
  const { rows } = await query(`SELECT payload FROM auth_snapshots WHERE id = $1`, ['default']);
  const payload = rows[0]?.payload ?? { users: {}, tokens: {} };
  const users = { ...(payload.users || {}) };
  seedDemo(users);
  memoryStore = { users, tokens: { ...(payload.tokens || {}) } };
  if (!rows[0]?.payload) await saveStore(memoryStore);
  return memoryStore;
}

async function saveStore(store) {
  memoryStore = store;
  await ensureAuthTable();
  await query(
    `INSERT INTO auth_snapshots (id, payload, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = now()`,
    ['default', JSON.stringify(store)],
  );
}

function resolvePath(req) {
  const q = req.query || {};
  if (q.__path != null && q.__path !== '') {
    const segments = Array.isArray(q.__path) ? q.__path.join('/') : String(q.__path);
    if (q.__users) return '/api/users';
    return q.__admin ? `/api/admin/${segments}` : `/api/auth/${segments}`;
  }
  const raw = String(req.url || '').split('?')[0];
  if (raw.startsWith('/api/auth') || raw.startsWith('/api/admin') || raw === '/api/users') return raw;
  return raw || '/api/auth';
}

function readAuth(headers) {
  const raw = headers?.authorization ?? headers?.Authorization ?? '';
  const header = Array.isArray(raw) ? raw[0] : String(raw || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-api-key');
}

export default async function authHandler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (!dbUrl()) {
      return res.status(503).json({
        error: 'Auth API needs DATABASE_URL (Neon). Link the integration and redeploy.',
      });
    }

    const method = String(req.method || 'GET').toUpperCase();
    const path = resolvePath(req);
    const body = req.body || {};

    if (method === 'POST' && path === '/api/auth/login') {
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase();
      const password = String(body.password ?? '');
      const store = await loadStore();
      const row = store.users[email];
      if (!row || row.passwordHash !== hash(password)) {
        return res.status(401).json({ error: 'Incorrect email or password.' });
      }
      const token = crypto.randomUUID();
      store.tokens[token] = email;
      await saveStore(store);
      return res.status(200).json({ user: publicUser(email, row), token });
    }

    if (method === 'POST' && path === '/api/auth/register') {
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase();
      const password = String(body.password ?? '');
      const name = String(body.name ?? '').trim() || email;
      if (!email || password.length < 6) {
        return res.status(400).json({ error: 'Valid email and password (6+ chars) required.' });
      }
      const store = await loadStore();
      if (store.users[email]) return res.status(409).json({ error: 'That email is already registered.' });
      store.users[email] = {
        id: crypto.randomUUID(),
        name,
        passwordHash: hash(password),
        role: 'designer',
        createdAt: new Date().toISOString(),
        apiKeys: [],
      };
      const token = crypto.randomUUID();
      store.tokens[token] = email;
      await saveStore(store);
      return res.status(201).json({ user: publicUser(email, store.users[email]), token });
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      const token = readAuth(req.headers);
      if (token) {
        const store = await loadStore();
        delete store.tokens[token];
        await saveStore(store);
      }
      return res.status(200).json({ ok: true });
    }

    if (method === 'GET' && path === '/api/auth/me') {
      const store = await loadStore();
      const email = store.tokens[readAuth(req.headers)];
      if (!email || !store.users[email]) return res.status(401).json({ error: 'Not signed in' });
      return res.status(200).json({ user: publicUser(email, store.users[email]) });
    }

    if (method === 'GET' && (path === '/api/users' || path === '/api/admin/users')) {
      const store = await loadStore();
      const email = store.tokens[readAuth(req.headers)];
      if (!email || !store.users[email]) return res.status(401).json({ error: 'Not signed in' });
      if (path === '/api/admin/users' && store.users[email].role !== 'system_admin') {
        return res.status(403).json({ error: 'System admin role required.' });
      }
      const role = String(req.query?.role || '').trim();
      const q = String(req.query?.q || '')
        .trim()
        .toLowerCase();
      const items = Object.entries(store.users)
        .filter(([e, u]) => {
          if (role && u.role !== role) return false;
          if (q && !`${e} ${u.name}`.toLowerCase().includes(q)) return false;
          return true;
        })
        .map(([e, u]) => ({ id: u.id, email: e, name: u.name, role: u.role }));
      return res.status(200).json({ items });
    }

    return res.status(404).json({ error: 'Not found', path, method });
  } catch (err) {
    console.error('auth handler', err);
    return res.status(err.status || 500).json({
      error: err.message || 'Auth API error',
      name: err.name,
    });
  }
}
