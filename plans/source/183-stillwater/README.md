# 183 Stillwater source drawings

| File | Description |
|---|---|
| `MODEL.dwg` | AutoCAD source from Olsen (uploaded) |
| `MODEL.dxf` | Generated — full conversion (~130 MB, gitignored) |
| `MODEL.walls.dxf` | Generated — wall/door layers only (~2.4 MB, gitignored) |

## Regenerate plan seed

```bash
npm run plan:import-stillwater
```

This converts DWG → DXF → filtered wall layers → `src/lib/housePlans/stillwater183Plan.json`.

## Tips for best import quality

- In AutoCAD, confirm **Model Space** floor plan is active (not paperspace sheet).
- If import footprint looks wrong, export a **simplified DXF** with only interior wall layers.
- Our importer expects **feet**; mm coordinates are auto-converted.
