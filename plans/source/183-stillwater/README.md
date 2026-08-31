# 183 Stillwater source drawings

| File | Description |
|---|---|
| `MODEL.dwg` | AutoCAD source from Olsen (uploaded) |
| `MODEL.dxf` | Generated — full conversion (~130 MB, gitignored) |
| `MODEL.walls.dxf` | Generated — wall/door layers only (~2.4 MB, gitignored) |

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


```bash
npm run plan:import-stillwater
```

This converts DWG → DXF → filtered wall layers → `src/lib/housePlans/stillwater183Plan.json`.

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
- If import footprint looks wrong, export a **simplified DXF** with only interior wall layers.
- Units follow `$INSUNITS` when set (inches/mm/feet); otherwise a magnitude heuristic is used.
- Optional: also drop the architect PDF plan set when creating a project for sharper sheet reading.
- Always review room names/sizes in **Plan verification** after import — messy CAD still needs a human pass.
