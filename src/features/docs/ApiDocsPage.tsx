import { Link } from 'react-router-dom';
import { BookOpen, KeyRound, Shield } from 'lucide-react';
import { platformConfig } from '../../lib/platform/config';
import './apiDocs.css';

const BASE = platformConfig.apiUrl || 'http://localhost:4000';

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1',
    summary: 'API discovery',
    body: null,
  },
  {
    method: 'GET',
    path: '/api/v1/clients?q=',
    summary: 'List clients (optional search)',
    body: null,
  },
  {
    method: 'POST',
    path: '/api/v1/clients',
    summary: 'Create or upsert a client',
    body: `{
  "name": "Rivera Residence",
  "email": "hello@example.com",
  "phone": "+1 555 0100",
  "company": "",
  "address": "12 Harbor Way",
  "notes": "",
  "customFields": {}
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/vendors',
    summary: 'List vendors',
    body: null,
  },
  {
    method: 'POST',
    path: '/api/v1/vendors',
    summary: 'Create or upsert a vendor',
    body: `{
  "name": "Nordic Surfaces",
  "email": "sales@nordic.example",
  "website": "https://nordic.example",
  "contactName": "Alex",
  "phone": "",
  "notes": "",
  "customFields": {}
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/inventory',
    summary: 'List inventory SKUs',
    body: null,
  },
  {
    method: 'POST',
    path: '/api/v1/inventory',
    summary: 'Create or upsert inventory by sku',
    body: `{
  "sku": "NORD-CHAIR-01",
  "name": "Nord Dining Chair",
  "category": "Seating",
  "vendorName": "Nordic Surfaces",
  "width": 0.52,
  "depth": 0.56,
  "height": 0.82,
  "unit": "m",
  "price": 129,
  "priceUnit": "each",
  "currency": "USD",
  "roomTypes": ["Dining room"],
  "tags": ["chair"]
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/plans',
    summary: 'List house plans',
    body: null,
  },
  {
    method: 'POST',
    path: '/api/v1/plans',
    summary: 'Create or upsert a house plan',
    body: `{
  "name": "Coastal Cottage",
  "source": "partner-feed",
  "format": "native-json",
  "beds": 3,
  "baths": 2,
  "stories": 1,
  "livingSqFt": 1680,
  "notes": "",
  "planJson": { "id": "coastal", "name": "Coastal Cottage", "floors": [] }
}`,
  },
] as const;

export function ApiDocsPage() {
  return (
    <div className="api-docs">
      <header className="api-docs-hero">
        <p className="eyebrow">Developers</p>
        <h1>
          <BookOpen size={28} aria-hidden /> Public API
        </h1>
        <p>
          Vendors and external apps can push <strong>clients</strong>, <strong>vendors</strong>,{' '}
          <strong>inventory</strong>, and <strong>house plans</strong> into Olsen Custom Homes with an API key.
        </p>
        <div className="api-docs-actions">
          <Link to="/login">Sign in</Link>
          <Link to="/users">Manage users &amp; keys</Link>
        </div>
      </header>

      <section className="api-docs-card">
        <h2>
          <KeyRound size={18} aria-hidden /> Authentication
        </h2>
        <p>
          Create a key in <Link to="/users">Users</Link> (system admin). Send it on every request:
        </p>
        <pre>{`X-Api-Key: mnk_your_key_here
# or
Authorization: Bearer mnk_your_key_here`}</pre>
        <p className="muted">
          Keys are shown once at creation. Revoke unused keys from the Users page. The demo account{' '}
          <code>admin@mahnikka.local</code> is a system admin.
        </p>
      </section>

      <section className="api-docs-card">
        <h2>
          <Shield size={18} aria-hidden /> Base URL
        </h2>
        <pre>{BASE}</pre>
        <p className="muted">
          Run <code>npm run server</code> locally, or point <code>VITE_API_URL</code> at your hosted API. Browser-only
          mode stores CRM in localStorage; the public API writes to the server CRM file/database.
        </p>
      </section>

      <section className="api-docs-card">
        <h2>Quick start</h2>
        <pre>{`curl -X POST ${BASE}/api/v1/clients \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: mnk_…" \\
  -d '{"name":"Rivera Residence","email":"hello@example.com"}'`}</pre>
      </section>

      <section className="api-docs-endpoints">
        <h2>Endpoints</h2>
        {ENDPOINTS.map((ep) => (
          <article key={`${ep.method}-${ep.path}`} className="api-docs-endpoint">
            <header>
              <span className={`api-method method-${ep.method.toLowerCase()}`}>{ep.method}</span>
              <code>{ep.path}</code>
            </header>
            <p>{ep.summary}</p>
            {ep.body && (
              <>
                <p className="muted">Example body</p>
                <pre>{ep.body}</pre>
              </>
            )}
          </article>
        ))}
      </section>

      <section className="api-docs-card">
        <h2>Responses</h2>
        <ul>
          <li>
            <code>GET</code> list → <code>{`{ "items": [...], "count": n }`}</code>
          </li>
          <li>
            <code>GET</code> by id → <code>{`{ "item": { … } }`}</code>
          </li>
          <li>
            <code>POST</code> → <code>{`{ "item": { … }, "created": true|false }`}</code> (upsert by <code>id</code>;
            inventory also matches on <code>sku</code>)
          </li>
          <li>
            <code>401</code> missing/invalid API key · <code>400</code> validation · <code>404</code> unknown id
          </li>
        </ul>
      </section>
    </div>
  );
}
