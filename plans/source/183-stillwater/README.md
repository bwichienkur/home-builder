# 183 Stillwater source drawings

| File | Description |
|---|---|
| `MODEL.dwg` | AutoCAD source from Olsen (uploaded) |
| `MODEL.dxf` | Generated — full conversion (~130 MB, gitignored) |
| `MODEL.walls.dxf` | Generated — wall/door layers only (~2.4 MB, gitignored) |
| `../../public/plan-sheets/stillwater-183/plan-set.pdf` | Architect plan-set PDF (readable sheets in Build) |

## Reproduce DWG → Build plan (recommended)

1. Start the app (`npm run dev`).
2. Open **Build → Admin → Project setup**.
3. Drop **`MODEL.dwg`** and **`plan-set.pdf`**, then **Import into project** (DWG→DXF via WASM, ~1 min).
4. Stay on **Plan** view:
   - **Layers → CAD overlay** on (auto-enabled after import) — DXF linework under room fills.
   - **Plan sheets → FLOOR** — dimensioned PDF for eye comparison.
5. CLI parity check (same import path as upload, writes overlay SVG):

```bash
npm run plan:compare-stillwater
# → artifacts/plan-fidelity/stillwater-compare-report.json
# → artifacts/plan-fidelity/stillwater-compare-overlay.svg
```

### What “close to the DWG” means today

| Signal | Stillwater baseline (full DXF package) | Notes |
|---|---|---|
| Named rooms | ~21 (Garage, Great, Kitchen, Master, Study, Nook, Lanai, …) | Labels from MTEXT |
| Envelope coverage | ~63% of wall bbox | Morphological seal; large openings/porches limit this |
| Raster floor fill | ~51%+ | Residual Hall fills close blanks; wall thickness + yard bbox remain |
| Geometry | Orthogonal polygons + soft dashed partitions | Not full CAD arcs/ellipses/blocks |

Gaps vs the architect PDF (dimensions, fixtures, CMU callouts) are intentional in the configurator plate — use **Plan sheets** for that fidelity. Closing the ~35–45 pt envelope/raster gap needs richer wall geometry (BLOCKS/ARCs) or a server DWG converter (see spike below).

## Plan fidelity gate

Regression test for import quality (room count, named rooms, floor coverage):

```bash
npm run plan:fidelity
```

Generates `MODEL.dxf` from `MODEL.dwg` when missing. Writes `artifacts/plan-fidelity/stillwater-report.json` and `stillwater-rooms.svg` on each run.

Synthetic open-plan / ranch fixtures also run under `src/lib/housePlans/syntheticFidelity.test.ts` (no second real CAD package in-repo yet).

## Scene modules

Configurator scene is split for maintainability: `CameraRig.tsx`, `WallMeshes.tsx`, `FirstPersonControls.tsx`, `cameraModes.ts`, `sceneWorld.ts` under `src/components/scene3d/` (Plan = source of truth; 3D extrudes from plan).

## Server DWG → JSON spike (deferred)

Native DWG fidelity beyond `dwgdxf` WASM is the next accuracy lever when Stillwater envelope/raster plateaus:

| Option | Notes |
|--------|-------|
| Keep `dwgdxf` WASM | Current path; good enough for iterative flood-fill work |
| LibreDWG / ODA server | Resolve BLOCKs/INSERTs/ARCs; needs a small Node or container service |
| Teigha / commercial | Highest fidelity; licensing |

**Spike exit criteria:** convert Stillwater `MODEL.dwg` server-side to normalized walls+labels JSON that improves fidelity gate envelope coverage by ≥10 pts vs WASM DXF. Only then wire a Vercel/serverless or sidecar converter.

Until then: prefer DXF layer hygiene in AutoCAD (floor viewport, wall/door layers, soft space boundaries) over a new service.

## Curated seed JSON (optional)

```bash
npm run plan:import-stillwater
```

Converts DWG → DXF → filtered wall layers → `src/lib/housePlans/stillwater183Plan.json`. Prefer the **full package import** (UI or `plan:compare-stillwater`) for CAD-faithful rooms; the walls-only filter can under-seal the envelope.

## Sheet reference SVGs

```bash
npm run plan:export-stillwater-sheets
```

Crops each paper-space layout viewport from `MODEL.dxf` into `public/plan-sheets/stillwater-183/` for the in-app Sheets panel.

## Tips for best import quality

- In AutoCAD, confirm **Model Space** floor plan is active (not paperspace sheet).
- The in-app importer crops to the **floor-plan paper viewport** when present, then:
  - keeps wall layers (not doors)
  - keeps dense double-line walls (gap-close + morphological envelope seal)
  - flood-fills the building interior and splits open-plan areas by room labels
  - decodes underlined MTEXT room names (`\LKITCHEN` → `KITCHEN`)
  - paints soft/CENTER partitions as dashed room edges
- Mark open-plan edges (Great/Kitchen/Nook) as **CENTER** or **DASHED** so flood-fill splits labeled spaces.
- If import footprint looks wrong, export a **simplified DXF** with only interior wall layers — but keep enough envelope to seal garage doors (~16 ft).
- Units follow `$INSUNITS` when set (inches/mm/feet); otherwise a magnitude heuristic is used.
- Always attach the **plan-set PDF** for readable elevations/dimensions in **Plan sheets**.
- Always review room names/sizes in **Plan verification** after import — messy CAD still needs a human pass.
