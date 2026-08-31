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
