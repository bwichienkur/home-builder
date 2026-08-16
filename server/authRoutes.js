/**
 * File-backed auth + admin + API keys.
 * Same routes can later sit in front of Postgres / IdP without UI changes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '../data/auth-store.json');
const DEMO_EMAIL = 'admin@mahnikka.local';
const ROLES = new Set(['user', 'admin', 'system_admin']);

function readAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    return { users: {}, tokens: {} };
  }
}

function writeAuth(data) {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

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

function ensureStore() {
  const store = readAuth();
  const users = {};
  for (const [email, row] of Object.entries(store.users ?? {})) {
    users[email] = migrateUser(email, row);
  }
  if (!users[DEMO_EMAIL]) {
    users[DEMO_EMAIL] = {
      id: 'user-demo',
      name: 'Studio Admin',
      passwordHash: hash('admin123'),
      role: 'system_admin',
      createdAt: new Date().toISOString(),
      apiKeys: [],
    };
  } else {
    users[DEMO_EMAIL] = { ...users[DEMO_EMAIL], role: 'system_admin' };
  }
  store.users = users;
  store.tokens = store.tokens ?? {};
  writeAuth(store);
  return store;
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

function requireSystemAdmin(req, res) {
  const store = ensureStore();
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

/**
 * Resolve API key from Authorization: Bearer mnk_… or X-Api-Key.
 * Returns { email, user } or null.
 */
export function resolveApiKeyUser(req) {
  const store = ensureStore();
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
  app.post('/api/auth/register', (req, res) => {
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? '');
    const name = String(req.body?.name ?? '').trim() || email;
    if (!email || password.length < 6) {
      return res.status(400).json({ error: 'Valid email and password (6+ chars) required.' });
    }
    const store = ensureStore();
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
    writeAuth(store);
    res.status(201).json({ user: publicUser(email, store.users[email]), token });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? '');
    const store = ensureStore();
    const row = store.users[email];
    if (!row || row.passwordHash !== hash(password)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    const token = crypto.randomUUID();
    store.tokens[token] = email;
    writeAuth(store);
    res.json({ user: publicUser(email, row), token });
  });

  app.post('/api/auth/logout', (req, res) => {
    const header = String(req.header('authorization') ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) {
      const store = ensureStore();
      delete store.tokens[token];
      writeAuth(store);
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const store = ensureStore();
    const email = bearerEmail(req, store);
    if (!email) return res.status(401).json({ error: 'Not signed in' });
    res.json({ user: publicUser(email, store.users[email]) });
  });

  app.get('/api/admin/users', (req, res) => {
    const ctx = requireSystemAdmin(req, res);
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
  });

  app.patch('/api/admin/users/:userId/role', (req, res) => {
    const ctx = requireSystemAdmin(req, res);
    if (!ctx) return;
    const role = String(req.body?.role ?? '');
    if (!ROLES.has(role)) return res.status(400).json({ error: 'Invalid role.' });
    const found = findUserById(ctx.store, req.params.userId);
    if (!found) return res.status(404).json({ error: 'User not found.' });
    if (found.email === DEMO_EMAIL && role !== 'system_admin') {
      return res.status(400).json({ error: 'The demo system admin role cannot be downgraded.' });
    }
    ctx.store.users[found.email] = { ...found.row, role };
    writeAuth(ctx.store);
    res.json({ ok: true, user: publicUser(found.email, ctx.store.users[found.email]) });
  });

  app.get('/api/admin/users/:userId/api-keys', (req, res) => {
    const ctx = requireSystemAdmin(req, res);
    if (!ctx) return;
    const found = findUserById(ctx.store, req.params.userId);
    if (!found) return res.status(404).json({ error: 'User not found.' });
    res.json({ items: (found.row.apiKeys ?? []).map(apiKeyMeta) });
  });

  app.post('/api/admin/users/:userId/api-keys', (req, res) => {
    const ctx = requireSystemAdmin(req, res);
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
    writeAuth(ctx.store);
    res.status(201).json({ key, meta: apiKeyMeta(meta) });
  });

  app.delete('/api/admin/users/:userId/api-keys/:keyId', (req, res) => {
    const ctx = requireSystemAdmin(req, res);
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
    writeAuth(ctx.store);
    res.json({ ok: true });
  });
}
