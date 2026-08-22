# IKEA live Room Builder vs Roomcraft — gap analysis

Date: 2026-08-13  
Live reference explored: classic Space bedroom planner (`#/room/bedroom`) plus Kreativ entry landing.  
Note: Do not copy IKEA branding, product data, or assets.

## Verdict

Roomcraft already matches the **macro IA** (full-bleed room, floating chrome, category rail, Top/3D, bag total). The remaining gap is mostly **product-commerce polish and placement choreography**, not another shell rewrite.

## Where Roomcraft is close / ahead

| Area | Roomcraft |
|---|---|
| Floating studio chrome | Menu, bag, category rail, view, undo/redo |
| Top + 3D shared scene | Konva plan + R3F |
| Room geometry tools | Draw/split/offset walls, openings, templates |
| Finishes | Floor / wall / ceiling colors (classic IKEA planner showed little of this) |
| Placement helpers | Wall snap, guides, clearance, in-scene dims |
| Admin inventory | Vendor import at `/admin` |

## Highest-impact misses (classic IKEA planner)

1. **Selection action stack** — IKEA shows a vertical FAB column on the selected product: info, edit, duplicate, rotate dial, share, delete. Roomcraft buries most of this in the inspector.
2. **Ghost placement** — IKEA previews a translucent item, then click-to-confirm. Roomcraft drops immediately at origin/drop point.
3. **Selected-product commerce panel** — Large product image, price, **Modify product**, and “Can be complemented with…” (e.g. mattresses). Roomcraft’s inspector is CAD-like, not retail.
4. **Catalog retail density** — Size filters, variant swatches, sale/last-chance badges, “More options available,” info affordances. Roomcraft cards are thinner.
5. **Summary CTA** — Persistent blue Summary / shopping-list path. Roomcraft bag opens BOM, but lacks the strong primary CTA treatment.
6. **Rotate dial** — Explicit circular rotate control in-scene. Roomcraft uses PivotControls / slider.
7. **Cross-device design codes** — IKEA codes open elsewhere via account/backend. Roomcraft codes are local-only.
8. **Entry landing** — Room-type chooser + “start from scratch / open design.” Roomcraft boots straight into the studio.

## Kreativ (newer) extras not in Roomcraft

Observed on Kreativ landing only (not fully designed in-session):

- Choose a furnished/template room
- Build a room with guided dimensions
- Scan your room (mobile/AR)

## Recommended next implementation order

1. Selection FAB stack + in-scene rotate dial  
2. Ghost place-then-confirm flow  
3. Selected-product retail panel (image, price, complements hook)  
4. Catalog card upgrades (variants/filters/badges)  
5. Entry landing + stronger Summary CTA  
6. Server-backed design codes when API/DB is available  

## Screenshots

Captured during live exploration under `/opt/cursor/artifacts/screenshots/ikea/` (3D chrome, top view, selection, catalog, entry).
