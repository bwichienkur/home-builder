/**
 * Public integration API (v1) for vendors / external apps.
 * Auth: X-Api-Key: mnk_… or Authorization: Bearer mnk_…
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveApiKeyUser } from './authRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data/crm-store.json');

const COLLECTIONS = {
  clients: 'clients',
  vendors: 'vendors',
  inventory: 'inventory',
  plans: 'housePlans',
};

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return { clients: [], vendors: [], inventory: [], customFields: [], housePlans: [] };
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

function requireApiKey(req, res) {
  const resolved = resolveApiKeyUser(req);
  if (!resolved) {
    res.status(401).json({
      error: 'API key required. Pass X-Api-Key: mnk_… (create keys in Users → system admin).',
    });
    return null;
  }
  return resolved;
}

function nowIso() {
  return new Date().toISOString();
}

function upsert(list, item, matchFn) {
  const idx = list.findIndex(matchFn);
  if (idx >= 0) {
    const next = { ...list[idx], ...item, id: list[idx].id, createdAt: list[idx].createdAt, updatedAt: nowIso() };
    const copy = list.slice();
    copy[idx] = next;
    return { list: copy, item: next, created: false };
  }
  const created = { ...item, id: item.id || crypto.randomUUID(), createdAt: nowIso(), updatedAt: nowIso() };
  return { list: [...list, created], item: created, created: true };
}

function normalizeClient(body) {
  const name = String(body?.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  return {
    value: {
      id: body.id ? String(body.id) : undefined,
      name,
      email: String(body.email ?? ''),
      phone: String(body.phone ?? ''),
      company: String(body.company ?? ''),
      address: String(body.address ?? ''),
      notes: String(body.notes ?? ''),
      customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : {},
      archived: Boolean(body.archived ?? false),
    },
  };
}

function normalizeVendor(body) {
  const name = String(body?.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  return {
    value: {
      id: body.id ? String(body.id) : undefined,
      name,
      email: String(body.email ?? ''),
      phone: String(body.phone ?? ''),
      website: String(body.website ?? ''),
      contactName: String(body.contactName ?? ''),
      notes: String(body.notes ?? ''),
      customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : {},
      archived: Boolean(body.archived ?? false),
    },
  };
}

function normalizeInventory(body) {
  const sku = String(body?.sku ?? '').trim();
  const name = String(body?.name ?? '').trim();
  const category = String(body?.category ?? '').trim();
  if (!sku || !name || !category) return { error: 'sku, name, and category are required' };
  return {
    value: {
      id: body.id ? String(body.id) : undefined,
      sku,
      name,
      vendorName: String(body.vendorName ?? ''),
      brand: String(body.brand ?? ''),
      model: String(body.model ?? ''),
      category,
      subcategory: String(body.subcategory ?? ''),
      description: String(body.description ?? ''),
      note: String(body.note ?? ''),
      width: Number(body.width ?? 0) || 0,
      depth: Number(body.depth ?? 0) || 0,
      height: Number(body.height ?? 0) || 0,
      unit: String(body.unit ?? 'm'),
      color: String(body.color ?? '#b9b9b2'),
      mountingType: String(body.mountingType ?? 'floor'),
      placementSurfaces: Array.isArray(body.placementSurfaces) ? body.placementSurfaces.map(String) : ['floor'],
      placementMode: body.placementMode,
      roomTypes: Array.isArray(body.roomTypes) ? body.roomTypes.map(String) : [],
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      price: body.price == null || body.price === '' ? undefined : Number(body.price),
      priceUnit: String(body.priceUnit ?? 'each'),
      currency: String(body.currency ?? 'USD'),
      msrp: body.msrp == null || body.msrp === '' ? undefined : Number(body.msrp),
      cost: body.cost == null || body.cost === '' ? undefined : Number(body.cost),
      laborCost: body.laborCost == null || body.laborCost === '' ? undefined : Number(body.laborCost),
      priceVerifiedAt: String(body.priceVerifiedAt ?? ''),
      sellable: body.sellable !== false,
      placeholderOnly: Boolean(body.placeholderOnly),
      active: body.active !== false,
      finish: String(body.finish ?? ''),
      material: String(body.material ?? ''),
      variantGroup: String(body.variantGroup ?? ''),
      variantName: String(body.variantName ?? ''),
      availability: String(body.availability ?? ''),
      leadTimeDays: body.leadTimeDays == null || body.leadTimeDays === '' ? undefined : Number(body.leadTimeDays),
      thumbnailUrl: String(body.thumbnailUrl ?? ''),
      textureUrl: String(body.textureUrl ?? ''),
      textureRepeat: body.textureRepeat == null || body.textureRepeat === '' ? undefined : Number(body.textureRepeat),
      roughness: body.roughness == null || body.roughness === '' ? undefined : Number(body.roughness),
      modelUrl: String(body.modelUrl ?? ''),
      lowPolyModelUrl: String(body.lowPolyModelUrl ?? ''),
      emoji: String(body.emoji ?? '▧'),
      sourceUrl: String(body.sourceUrl ?? ''),
      sourceLabel: String(body.sourceLabel ?? ''),
      customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : {},
      archived: Boolean(body.archived ?? false),
    },
  };
}

function normalizePlan(body) {
  const name = String(body?.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  if (body.planJson == null) return { error: 'planJson is required' };
  return {
    value: {
      id: body.id ? String(body.id) : undefined,
      name,
      source: String(body.source ?? ''),
      license: String(body.license ?? ''),
      format: ['native-json', 'dxf', 'ifc'].includes(body.format) ? body.format : 'native-json',
      beds: Number(body.beds ?? 0) || 0,
      baths: Number(body.baths ?? 0) || 0,
      stories: Math.max(1, Number(body.stories ?? 1) || 1),
      livingSqFt: body.livingSqFt == null || body.livingSqFt === '' ? undefined : Number(body.livingSqFt),
      notes: String(body.notes ?? ''),
      planJson: body.planJson,
    },
  };
}

function filterItems(items, q) {
  const query = String(q ?? '')
    .trim()
    .toLowerCase();
  if (!query) return items;
  return items.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
}

export function mountPublicApiRoutes(app) {
  app.get('/api/v1', (_req, res) => {
    res.json({
      name: 'Olsen Custom Homes Public API',
      version: 'v1',
      auth: 'X-Api-Key: mnk_… (or Authorization: Bearer mnk_…)',
      resources: Object.keys(COLLECTIONS),
      docs: '/docs/api',
    });
  });

  for (const [slug, collection] of Object.entries(COLLECTIONS)) {
    app.get(`/api/v1/${slug}`, (req, res) => {
      if (!requireApiKey(req, res)) return;
      const store = readStore();
      const items = filterItems(store[collection] ?? [], req.query.q);
      res.json({ items, count: items.length });
    });

    app.get(`/api/v1/${slug}/:id`, (req, res) => {
      if (!requireApiKey(req, res)) return;
      const store = readStore();
      const item = (store[collection] ?? []).find((row) => row.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json({ item });
    });

    app.post(`/api/v1/${slug}`, (req, res) => {
      if (!requireApiKey(req, res)) return;
      const parsed =
        slug === 'clients'
          ? normalizeClient(req.body)
          : slug === 'vendors'
            ? normalizeVendor(req.body)
            : slug === 'inventory'
              ? normalizeInventory(req.body)
              : normalizePlan(req.body);
      if (parsed.error) return res.status(400).json({ error: parsed.error });

      const store = readStore();
      const list = store[collection] ?? [];
      const match =
        slug === 'inventory'
          ? (row) =>
              (parsed.value.id && row.id === parsed.value.id) ||
              (row.sku && parsed.value.sku && row.sku === parsed.value.sku)
          : (row) => parsed.value.id && row.id === parsed.value.id;

      const result = upsert(list, parsed.value, match);
      store[collection] = result.list;
      writeStore(store);
      res.status(result.created ? 201 : 200).json({ item: result.item, created: result.created });
    });
  }
}
