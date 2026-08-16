# Mahnikka 3D Home Planner

React + TypeScript + React Three Fiber home planning studio with an authenticated app shell for **Build**, **Clients**, **Vendors**, **Inventory**, **House plans**, and **Settings**.

## Routes

| Path | Purpose |
|------|---------|
| `/login` | Sign in / register (start page) |
| `/` | Home navigation hub |
| `/build` | Plan / room 3D studio |
| `/clients` | Client CRM + CSV import/export |
| `/vendors` | Vendor CRM + CSV import/export |
| `/inventory` | Inventory SKUs + CSV import/export |
| `/plans` | House plan library, DXF/JSON import, open in Build |
| `/settings` | Custom fields for client / vendor / inventory |
| `/admin` | Legacy vendor inventory XLSX importer |

## Auth (MVP)

Local session auth (SHA-256 password hashes in `localStorage` via Zustand persist).

Demo account:

- Email: `admin@mahnikka.local`
- Password: `admin123`

Replace with your identity provider before a public deploy. The API still accepts `x-user-id` / `DEV_USER_ID` for catalog/project routes.

## CRM + CSV

Clients, vendors, and inventory support:

1. **Template CSV** — core columns + active custom fields (`custom.<key>`)
2. **Import CSV** — row validation with partial import
3. **Export CSV** — current records
4. **Manual add/edit** drawers

Data persists in the browser (`mahnikka-crm-v1`). Optional API mirror: `GET/PUT /api/crm/:collection` (file store under `data/crm-store.json`).

## House plans

Proprietary Olsen brochure approximations were **removed**.

Built-in samples are measured orthogonal footprints (ranch, cottage, townhouse) documented in `src/lib/housePlans/samplePlans.ts`.

### Import formats

| Format | Support |
|--------|---------|
| **DXF** | LINE / LWPOLYLINE → orthogonal room cells (industry CAD exchange) |
| **Native JSON** | App `HousePlan` schema |
| **IFC** | Detected; full IFC→walls mapping is a follow-up (use DXF/JSON for MVP) |

Sample DXF: `/samples/sample-rect-house.dxf`

Open a plan with **Open in Build** from `/plans`.

## Run locally

```bash
npm install
npm run dev
```

API (optional):

```bash
npm run server
```

Set `VITE_API_URL=http://localhost:4000` when using the API. Copy `.env.example` to `.env` for server configuration. PostgreSQL powers catalog/projects when `DATABASE_URL` is set.

## Validation

```bash
npm test
npm run build
```

## Production assets

Catalog rows hold versioned thumbnail, low-poly and full-detail model URLs. `CatalogModel` loads compressed GLBs through the configured Draco/KTX2 loader, swaps LOD by distance and disposes cloned GPU resources on unmount.
