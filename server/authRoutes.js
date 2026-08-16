import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '../../data/auth-store.json');

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

function hash(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function publicUser(email, row) {
  return { id: row.id, email, name: row.name };
}

/**
 * $0 file-backed auth API. Same routes you can later back with Postgres + IdP.
 * Mount BEFORE the x-user-id gate so login/register are public.
 */
export function mountAuthRoutes(app) {
  // Seed demo on first touch
  app.post('/api/auth/register', (req, res) => {
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? '');
    const name = String(req.body?.name ?? '').trim() || email;
    if (!email || password.length < 6) {
      return res.status(400).json({ error: 'Valid email and password (6+ chars) required.' });
    }
    const store = readAuth();
    if (store.users[email]) return res.status(409).json({ error: 'That email is already registered.' });
    const id = crypto.randomUUID();
    store.users[email] = { id, name, passwordHash: hash(password) };
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
    const store = readAuth();
    // demo seed
    if (!store.users['admin@mahnikka.local']) {
      store.users['admin@mahnikka.local'] = {
        id: 'user-demo',
        name: 'Studio Admin',
        passwordHash: hash('admin123'),
      };
      writeAuth(store);
    }
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
      const store = readAuth();
      delete store.tokens[token];
      writeAuth(store);
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const header = String(req.header('authorization') ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const store = readAuth();
    const email = store.tokens[token];
    if (!email || !store.users[email]) return res.status(401).json({ error: 'Not signed in' });
    res.json({ user: publicUser(email, store.users[email]) });
  });
}
