# Mahnikka 3D Home Planner

React + TypeScript + React Three Fiber home planning studio with an authenticated app shell for **Build**, **Clients**, **Vendors**, **Inventory**, **House plans**, and **Settings**.

## Routes

| Path | Purpose |
|------|---------|
| `/login` | Sign in / register (start page) |
| `/` | Owner dashboard (mock Olsen ops) + Build files |
| `/build` | Plan / room 3D studio |
| `/clients` | Client CRM + CSV import/export |
| `/vendors` | Vendor CRM + CSV import/export |
| `/inventory` | Inventory SKUs + CSV import/export |
| `/plans` | House plan library, DXF/JSON import, open in Build |
| `/settings` | Custom fields for client / vendor / inventory |
| `/admin` | Legacy vendor inventory XLSX importer |

## Auth (MVP)

**Default = $0 local auth** (browser). Demo: `admin@mahnikka.local` / `admin123`.

Platform switches (see [docs/ZERO_COST_TO_PAID.md](docs/ZERO_COST_TO_PAID.md)):

| Env | Default | Later |
|-----|---------|-------|
| `VITE_AUTH_PROVIDER` | `local` | `remote` (+ IdP behind `/api/auth`) |
| `VITE_CRM_PROVIDER` | `local` | `http` (+ Postgres behind `/api/crm`) |
| `VITE_API_URL` | empty | `http://localhost:4000` or your host |

## CRM + CSV

Clients, vendors, and inventory support template/import/export CSV and manual entry. Custom fields come from Settings.

Persistence goes through a **CrmProvider** (`local` browser or `http` API) so you can move to Postgres later without rewriting pages.

## House plans

Built-in plans include Olsen Custom Homes flyer-derived layouts (polygon footprints from published PDFs) plus measured orthogonal samples in `src/lib/housePlans/samplePlans.ts`.

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
