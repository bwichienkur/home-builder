# Match IKEA Room Builder — evaluation & rebuild prompt

**Reference:** [IKEA Space / Room Builder — Bedroom](https://www.ikea.com/addon-app/space/platform/latest/us/en/#/room/bedroom)  
**Product family:** IKEA Kreativ / Space platform (web Room Builder)  
**This repo:** Roomcraft (`roomcraft-planner`)  
**Scope note:** Match *interaction model, information architecture, and visual language patterns* — do not copy IKEA branding, yellow wordmark, product photography, SKUs, or proprietary assets.

---

## Verdict

**2026-08-13 implementation:** Studio shell + mounting/guides/openings/share shipped. Polish pass: selectable ceiling finishes, in-scene product dimensions, design library UI, collision worker wiring, imperial/metric length fields, passage markers, BOM CSV/vendor grouping. Remaining larger gaps: sloped ceilings, PBR textures, variants, server remix, 5k-SKU windowing.

---

## What IKEA Room Builder actually is

From the live Space URL + IKEA Kreativ product docs, the bedroom Room Builder experience is:

| Layer | Behavior |
|---|---|
| **Entry** | Room-type journey (Bedroom, etc.), then an empty or template room — not a SaaS dashboard |
| **Canvas** | Full-bleed 3D room as the only hero surface |
| **Chrome** | Sparse floating controls: view switch (Top / 3D), undo/redo, cart/total, category rail |
| **Catalog** | Side sheet / rail of *real product cards* (photo, name, price), room-filtered |
| **Placement** | Tap/drag real furniture models into the room; select → move/rotate; contextual actions |
| **Room build** | Configure dimensions (web Room Builder); edit walls with measurements |
| **Camera** | Top plan + orbit 3D (+ walk/eye-level in studio variants); refocus room |
| **Commerce** | Persistent item count + running total; path to bag / product details |
| **Share** | Remix-style design link (web), not “copy this page URL” |

It reads as a **retail design studio**, not a CAD tool with admin panels.

---

## Current Roomcraft evaluation

### What is solid (keep)

- Shared scene state in `src/store/plannerStore.ts` (walls, openings, furniture, history, floors).
- Room templates, closed-room validation, area, wall length/split/offset.
- Opening cutouts in 3D; property editors for wall / opening / furniture.
- Catalog filters by room type, search, vendor, sort (`CatalogPanel`).
- Inventory XLSX/CSV/JSON import; BOM dialog.
- Local autosave / export JSON; undo/redo; collision tint.
- Mobile chrome *shape* already mimics Kreativ (menu pill, cart pill, dark category rail, bottom view/history) in `mobile.css`.

### What breaks the IKEA match

| Issue | Evidence | Impact |
|---|---|---|
| **Desktop is a 3-panel SaaS app** | `App.tsx` + `styles.css`: header with Inventory/Import/BOM/Load/Export/Share/Save, left “ROOM DESIGNER” stats card, right properties, footer status | Looks like an internal tool, not Room Builder |
| **Top editor orphaned** | `FloorPlanEditor` + `Toolbar` exist; `App` forces `view === '3d'` and never mounts Konva | “Top view” is only an overhead camera — not IKEA’s plan editor |
| **Furniture = colored boxes** | `Scene3D` instances boxes; `CatalogModel` GLB LOD unused | Scene never looks like a furnished showroom |
| **Wrong visual system** | Forest `#26342e` + terracotta `#d56d3b` + cream panels + DM Sans/Manrope | Not IKEA’s light, airy, blue-accent retail chrome |
| **Duplicate / dense controls** | Camera in nav + left panel + mobile menu; tips, eyebrows, stat cards | Clutter vs IKEA’s sparse floating UI |
| **Admin mixed into studio** | Inventory import in header / finish panel | Room Builder hides ops tools |
| **Parity doc overstates completeness** | `docs/ikea-feature-parity.md` marks Top/Konva Complete | Misleading release gate |
| **No wall-mount / guides / variants** | Placement snaps to floor grid only | Cabinets, lighting, art feel wrong |
| **Share/cloud weak** | Clipboard URL / localStorage | No remixable design code |

### Architecture recommendation

```
KEEP                          REDO                              DEFER
─────────────────────         ──────────────────────────        ────────────────
plannerStore + history        App shell / IA                    Room scan / LiDAR
geometry (rooms, snap)        Visual design tokens              AI smart placement
Scene3D wall/floor meshes     Catalog UI (product cards)        Sloped ceilings
opening cutout logic          Wire FloorPlanEditor as Top       Full PBR material lib
inventory + BOM backends      CatalogModel in scene path        Multi-home collaboration
unit conversion hooks         Floating chrome (desktop=mobile)  
```

**Do not** start a second Three.js app. **Do** replace the shell and finish the product-rendering path.

---

## Target UX (exact match goals)

### Information architecture

1. **Fullscreen canvas** — 3D or Top, edge to edge.
2. **No persistent left “designer” column** on the design surface.
3. **Floating chrome only:**
   - Top-left: menu (project / room setup / units)
   - Top-right: bag count + price → shopping list
   - Right: category rail (Beds, Storage, Lighting, …)
   - Bottom-left: view menu (Top / 3D / Refocus)
   - Bottom-right: undo / redo
4. **Catalog** as overlay sheet from category rail, not a permanent third column.
5. **Selection inspector** as bottom sheet / compact drawer — only when something is selected.
6. **Room setup** (type, template, ceiling, units) behind menu — not always-visible cards.
7. **Inventory admin** on a separate route or hidden “Advanced” entry — never in the hero chrome.

### Visual language (inspired by, not cloned)

- Near-white / soft gray room void; minimal chrome contrast.
- Primary interactive accent: clear retail blue (e.g. `#0058A3`-family), not terracotta forest SaaS.
- Typography: one strong geometric sans for UI (avoid Inter/Roboto defaults; also avoid current Manrope+terracotta cluster).
- Product cards: large photo, product name, price; generous tap targets.
- No eyebrow labels, tip callouts, or stats cards on the first viewport.
- Motion: camera refocus ease, catalog sheet slide, selection highlight fade (2–3 intentional motions).

### Scene fidelity checklist

- [ ] Every catalog item with a model URL renders via `CatalogModel` (proxy → full LOD).
- [ ] Missing model → dimensionally correct placeholder *styled* like a soft mannequin box, not random finish colors.
- [ ] Top view = real plan editor (Konva) sharing the same store — wall draw, measure tap-to-edit, openings drag.
- [ ] 3D view = orbit + optional walk; same furniture transforms.
- [ ] Selection gizmo: move on floor plane, rotate handle, delete/duplicate.
- [ ] Measurements visible on selected wall / product.
- [ ] Running total updates live; BOM/shopping list matches IKEA bag mental model.

---

## Phased work plan

### Phase 0 — Decision (done by this doc)

Redo shell + wire existing engines. No greenfield R3F rewrite.

### Phase 1 — Shell parity (highest visual impact)

1. Replace `App.tsx` layout with floating-chrome studio (desktop uses same IA as mobile).
2. New design tokens in CSS; delete left stats column and dense header from the design surface.
3. Move Inventory / Import to `/admin` or menu → Advanced.
4. Catalog opens from category rail only.
5. Update `ikea-feature-parity.md` so Top view is Partial until Konva is mounted.

### Phase 2 — Top view truthfulness

1. Mount `FloorPlanEditor` when `cameraMode === 'top'` (or restore a real `view === '2d'`).
2. Remove the `useEffect` that forces `view` to `3d`.
3. Ship `Toolbar` tools: select, wall, door, window.
4. Tap measurement labels to edit length.

### Phase 3 — Showroom fidelity

1. Route furniture through `CatalogModel`.
2. Thumbnail quality and card layout to match retail planner density.
3. Wall/surface snap for applicable categories.
4. Door swing visuals; opening drag on plan.

### Phase 4 — Commerce & projects

1. Shopping-list sheet (grouped SKUs) as primary “bag.”
2. Design code / share link backed by API `saveProject`.
3. Autosave recovery banner.

---

## Ready-to-use implementation prompt

Copy this into a coding agent or ticket:

```text
You are rebuilding Roomcraft’s UI/UX to match the interaction model of IKEA’s web Room Builder
(https://www.ikea.com/addon-app/space/platform/latest/us/en/#/room/bedroom) without copying
IKEA branding, trademarks, product data, or assets.

## Non-negotiables
- Keep: plannerStore, geometry libs, Scene3D wall/floor/opening meshes, inventory import, BOM logic,
  CatalogModel loader, existing tests where still valid.
- Do not ship a dense SaaS header or persistent left “ROOM DESIGNER” stats column on the studio surface.
- Desktop and mobile must share the same floating-chrome IA (menu, bag/total, category rail,
  view controls, undo/redo).
- Top view must mount the existing Konva FloorPlanEditor + Toolbar (shared Zustand scene).
  Remove any effect that forces view/camera to 3D-only.
- Furniture with model URLs must render through CatalogModel (LOD), not colored boxes.
- Inventory admin must not live in the primary chrome; put it behind Advanced /admin.
- Do not claim IKEA feature parity in docs until Top editor is actually mounted and GLBs render.

## Visual direction
- Full-bleed room canvas as the only hero.
- Light, airy retail studio: soft gray void, white floating controls, blue accent for selection/active
  (not forest+terracotta SaaS, not purple gradients, not cream+serif brochure).
- Category rail: dark compact icons + short labels (IKEA Kreativ pattern).
- Catalog: overlay sheet with large product photos, name, price; room-type filtered.
- Selection: compact bottom/side inspector only when something is selected.
- Motion: eased camera refocus, catalog sheet transition, selection highlight — at least 2–3 intentional motions.
- Touch targets ≥ 44px; safe-area aware.

## Acceptance tests
1. Load bedroom template → fullscreen room, floating chrome only, no stats card column.
2. Open Beds from category rail → catalog sheet → add item → real/proxy model appears; bag count + total update.
3. Switch Top → Konva plan editor with wall tools; edit wall length; switch 3D → same geometry.
4. Undo/redo from floating controls works for place/move/wall edit.
5. Shopping list / BOM groups duplicate SKUs; Export still works.
6. Inventory import reachable only via Advanced; does not appear as a primary header button.
7. Mobile 390×844 and desktop 1440×900 both readable; no horizontal page scroll.

## Out of scope for this pass
Room scanning, AI placement, sloped ceilings, copying IKEA SKUs/images, pixel-perfect trademark yellow logo.
```

---

## Suggested first PR slice

If implementing next, start with **Phase 1 only**:

- New `StudioChrome` component (extract from `MobilePlannerChrome`, use on all breakpoints).
- Strip `App.tsx` header/nav/left panel from the design surface.
- Token pass in CSS.
- Hide Inventory behind menu.
- Leave Konva + GLB wiring for Phase 2/3 so the first PR is reviewable and visually decisive.

---

## Related docs

- Behavioral matrix: [`ikea-feature-parity.md`](./ikea-feature-parity.md) — useful checklist; treat several “Complete” Top-view rows as **aspirational** until Konva is mounted in `App`.
- Inventory ops: [`inventory-import-guide.md`](./inventory-import-guide.md)
