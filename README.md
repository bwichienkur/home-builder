# Roomcraft 3D Home Planner

A React, TypeScript, Konva and React Three Fiber room planner with an IKEA Room Builder–style floating studio chrome. It supports multi-floor plans, exact closed-room floor geometry, wall openings, furniture transforms, collisions, materials, local persistence, JSON exchange, and a PostgreSQL-backed API.

Studio: `/` · Inventory admin: `/admin`

## Run locally

```bash
npm install
npm run dev
```

Run the API and PostgreSQL with `docker compose up`, then set `VITE_API_URL=http://localhost:4000` when starting Vite. Copy `.env.example` to `.env` for server configuration.

## Production assets

Catalog rows hold versioned thumbnail, low-poly and full-detail model URLs. `CatalogModel` loads compressed GLBs through the configured Draco/KTX2 loader, swaps LOD by distance and disposes cloned GPU resources on unmount. Keep source textures in a build pipeline, atlas small swatches before KTX2 conversion, and upload immutable versioned paths to the CDN.

## Authentication

Development accepts `x-user-id` or `DEV_USER_ID`. Replace this middleware with JWT validation from the chosen identity provider before exposing the API publicly.

## Validation

```bash
npm test
npm run build
```
