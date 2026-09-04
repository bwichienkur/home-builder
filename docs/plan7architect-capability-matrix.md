# Plan7Architect → Olsen CAD Studio capability matrix

**Status:** living checklist (public sources only)  
**Started:** 2026-09-03  
**Goal:** Mirror Plan7Architect *behavior* in web CAD Studio with Plan7-inspired UX patterns — not a clone of branding, assets, or proprietary code.

## How this matrix was built (and how it grows)

### Legitimate sources (use these)
| Source | What it gives us | URL / notes |
|---|---|---|
| Official tutorials index | Tool-by-tool public curriculum | https://plan7architect.com/tutorials/ |
| Guides & tutorials | Workflow writeups (walls, terrain, etc.) | https://plan7architect.com/guides-tutorials/ |
| Product / Pro pages | Feature claims, export formats, standards | https://plan7architect.com/product/pro/ |
| DE version comparison | BASIC / EXPERT / PRO feature rows | https://plan7architekt.com/versionsvergleich/ |
| YouTube end-to-end demos | Real click order, UX chrome, edge cases | e.g. `V822AazKM-g`, `mF5aFfIrqoE`, `jYPoIS6fm4M` |
| Licensed hands-on (recommended) | Highest fidelity behavior notes | Buy Pro; document each tool; do **not** reverse-engineer |

### Sources we will **not** use
- Decompiling / reverse-engineering the Windows binary
- Scraping private customer areas without access
- Copying icons, catalogs, textures, trademarks, or pixel-perfect chrome
- Any claimed “SDK” — **none is publicly available** (closed desktop app)

### How to deepen fidelity
1. Walk the tutorial index section-by-section; for each video, fill **Inputs / 2D effect / 3D effect / Acceptance**.
2. Prefer a **licensed Pro install** for ambiguous tools (dormers, timber mode, sections, MEP).
3. Update **Olsen status** as CAD Studio ships rows.
4. Keep UI notes under **UX pattern** (catalog left, split 2D|3D, properties on select) — inspired, not copied.

### Status legend
| Tag | Meaning |
|---|---|
| `missing` | Not in Olsen CAD/Build yet |
| `partial` | Exists but weaker / different than Plan7 |
| `exists` | Roughly equivalent for builder use |
| `skip` | Intentionally out of scope (or hand off externally) |
| `own` | We should implement natively |
| `approx` | Good-enough web equivalent |
| `hand-off` | Export / partner tool instead of building |

---

## 0. Product posture (decide once)

| Decision | Recommendation |
|---|---|
| Platform | **Web-first** CAD Studio (+ optional Electron/Tauri shell later) |
| UI/UX | Plan7-like **interaction model** (catalog · 2D · live 3D · stories · properties) |
| Parity target | Tutorial **Tier A+B** fully; selective **Tier C**; skip full Arcon/permit CAD |
| Differentiators to keep | DXF/DWG layer import → classify → plate → extrude → Olsen selections/ops |

---

## 1. Workspace & UX shell

| ID | Plan7 capability | Public evidence | Olsen today | Mirror strategy | Priority |
|---|---|---|---|---|---|
| UX-01 | Parallel 2D + 3D windows | Tutorials: 2D/3D Parallel Mode; all house demos | Partial (mode switch, not split) | Split pane Plate \| Extrude | P0 |
| UX-02 | Catalog / tool browser (folders) | House demos; object catalog | Partial (tools + furniture) | Left catalog: Walls, Openings, Roof, Site, Objects | P0 |
| UX-03 | Properties on selection (2D or 3D) | Window height/sill edits in demos | Partial | Unified inspector | P0 |
| UX-04 | Story / floor manager (active floor marker) | Floor management in demos | Partial | Story strip + active indicator | P0 |
| UX-05 | Layer management (show/hide/assign) | Tutorials: Assign Elements to Layers | Partial (CAD layer panel) | Extend to authored geometry layers | P1 |
| UX-06 | Guidelines / construction aids | Tutorials: Guide Lines | Partial | Guide lines + virtual walls | P1 |
| UX-07 | Snaps / angles / ortho | Tutorials: Snap Points & Angles; demos toggle snap | Partial | Angle/ortho/endpoint snaps + live length | P0 |
| UX-08 | Units metric ↔ imperial anytime | Unit Settings tutorial; Pro page | Exists | Keep; make global toggle obvious | P0 |
| UX-09 | Keyboard shortcuts (e.g. W wall align) | Tutorials tip: Ctrl+W / W | Partial | Document + implement align/escape | P1 |
| UX-10 | Multi-monitor friendly layouts | Pro marketing | Approx | Resizable split + pop-out 3D later | P2 |
| UX-11 | Sketch / presentation display modes | DE comparison: Skizzenmodus | Missing | Wireframe / mapped-2D / realistic toggles | P2 |

**UX pattern to aim for (inspired, not cloned):**
```
┌──────────┬─────────────────────┬─────────────────────┐
│ Catalog  │  2D Floor plan      │  Live 3D            │
│ Walls    │  (dims, snaps)      │  (orbit / walk)     │
│ Openings │                     │                     │
│ Roof     ├─────────────────────┴─────────────────────┤
│ Site     │ Stories | Snaps | Units | Status / dims     │
│ Objects  │ Properties inspector (selected element)     │
└──────────┴─────────────────────────────────────────────┘
```

---

## 2. Walls & structure

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| W-01 | Draw exterior/interior walls from catalog | Drawing Walls; house demos | Partial | Catalog thicknesses + draw tool | P0 |
| W-02 | Live interactive dimensions while drawing | House demos (“interactive dimensions”) | Partial | Rubber-band length + segment dims | P0 |
| W-03 | Wall thickness adjust | Adjusting Wall Thickness | Partial | Inspector + presets | P0 |
| W-04 | Multi-layer / custom wall assemblies | Custom Walls, Wall Layers; Pro wood structures | Partial (assembly presets) | Full layer stack editor | P2 |
| W-05 | Round walls | Round Walls tutorial | Missing | Arc wall tool | P2 |
| W-06 | Virtual walls (non-built room dividers) | Virtual Walls | Approx (soft borders) | Soft partition role | P1 |
| W-07 | Move / split / trim / join walls | Adjusting Rooms section | Partial | Trim/extend/join ops | P1 |
| W-08 | Wall niches | Wall Niche | Missing | Niche opening type | P3 |
| W-09 | Wooden framework for walls | Wooden Framework; Holzkonstruktionsmodus | Missing | Visual stud mode (approx) | P3 |
| W-10 | Variable wall/floor height & slope | Wall/Floor Height, Slope | Partial | Per-wall height; slope later | P2 |
| W-11 | Transparent walls on approach (3D) | Pro 3D viz list | Missing | Near-camera fade | P2 |

---

## 3. Doors, windows & openings

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| O-01 | Place doors from catalog + swing | Windows & Doors; demos | Partial | Catalog + swing while placing | P0 |
| O-02 | Place windows + sill height | demos set sill before place | Partial | Sill + width/height on place | P0 |
| O-03 | Edit openings in 2D or 3D | demos click either view | Partial | Shared selection model | P0 |
| O-04 | Custom door/window editor | Custom Doors & Windows | Missing | Parametric opening editor | P2 |
| O-05 | Corner windows | Corner Windows | Missing | Corner opening | P3 |
| O-06 | Roof windows / skylights | Roof Windows | Missing | Roof host openings | P2 |
| O-07 | Garage doors | Garage Doors | Partial (heuristics) | Garage door type | P1 |
| O-08 | Window grids / muntins | Window Grids | Missing | Grid pattern param | P3 |
| O-09 | Sloped reveals | Sloped Reveals | Missing | skip early | P3 |
| O-10 | Basement windows | Basement Window | Missing | Low-sill preset | P3 |
| O-11 | Passages / openings without door leaf | implied in catalogs | Partial | Opening kind | P1 |

---

## 4. Rooms, labels, dimensions, areas

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| R-01 | Automatic room detection when walls close | demos; automatic Raumerkennung | Partial | Stamp on closed polygons | P0 |
| R-02 | Room area calculation | Floor Areas; WoFlV/DIN (DE) | Partial (takeoff) | On-plan area + schedule | P0 |
| R-03 | Room labels / names | Room Labels | Partial | Editable stamps | P0 |
| R-04 | Room fills / hatch in 2D | Room Fills & Hatch Patterns | Partial | Soft polygon fills (hatch later) | P1 |
| R-05 | Automatic exterior dimensions | Automatic Exterior Dimensions | Partial | Outer dim chains | P1 |
| R-06 | Interior interactive dims | demos | Partial | Toggle dim display | P1 |
| R-07 | Living/usable area standards (WoFlV, DIN 277) | DE comparison | skip / approx | US builder areas first | P3 |
| R-08 | Area/room schedules / lists | Listen Erstellung | Partial | Export room schedule | P1 |

---

## 5. Stairs & railings

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| S-01 | Straight stair with width/rise params | Staircases; demos | Partial | Parametric stair | P1 |
| S-02 | Auto cut opening in floor above | demos | Partial | Keep/improve cutouts | P1 |
| S-03 | Railings (incl. sloped) | Sloped Railings; demos | Partial | Railing presets | P1 |
| S-04 | Spiral stairs | Spiral Staircase | Missing | Later | P3 |
| S-05 | Custom stair editor | Custom Stairs; Advanced Staircase Editors | Missing | Deep editor | P2 |

---

## 6. Floors, stories, buildings, foundations

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| F-01 | Unlimited stories | Create/Show/Hide Floors; demos | Partial | Story manager UX | P0 |
| F-02 | Copy walls/doors/windows to new story | demos; Copy Elements to another Level | Partial | Copy openings with walls | P0 |
| F-03 | Roof as its own story / level | demos create roof floor | Partial | Roof story convention | P1 |
| F-04 | Multiple buildings on site | Multiple Buildings | Missing | Multi-building project | P2 |
| F-05 | Move/copy/mirror building | DE comparison | Missing | Transform building | P2 |
| F-06 | Foundations (auto) | Foundation tutorial; auto Fundament | Missing | Slab/footing massing | P2 |
| F-07 | Split-level rooms | Split-Level Rooms | Missing | Room Z offsets | P2 |
| F-08 | Show/hide stories in 3D | demos | Partial | Story visibility toggles | P1 |

---

## 7. Slabs, site & outdoor

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| T-01 | Plate/slab tool (terrace, driveway, garden) | All three house demos | Partial | Polygon slab + thickness + Z | P0 |
| T-02 | Balcony slab + railing | Balcony & Railing; demos | Partial | Slab + railing combo | P1 |
| T-03 | Garage / carport symbols or editors | Symbol catalog; Carport tutorial | Partial | Placeable massing + carport editor later | P1 |
| T-04 | Terrain modeling (contours, hills, etc.) | Terrain Modeling; Pro Gelände | Missing | Approx heightfield later | P2 |
| T-05 | Site layout / plot boundary | Site Layout; Grundstückmarkierung | Missing | Lot polyline | P2 |
| T-06 | Fences, beds, paths, ponds | DE comparison Gelände | Missing | Prop + path tools | P2 |
| T-07 | Outdoor object catalog (cars, plants) | demos hedges/cars | Partial | Prop packs (GLB) | P1 |

---

## 8. Roofs (Plan7 strongest differentiator)

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| RF-01 | Auto roof from building contour | demos; Drawing a Roof | Partial | Auto roof from exterior contour | P1 |
| RF-02 | Gable / flat / shed / hip styles | Gable, Flat, Staggered Shed tutorials | Partial | Gable/flat/shed picker (hip later) | P1 |
| RF-03 | Pitch, overhang, eave controls | demos roof side settings | Partial | Pitch + overhang controls | P1 |
| RF-04 | Roof intersections / complex roofs | Complex Roofs & Intersections | Missing | Boolean roof faces | P2 |
| RF-05 | Dormers | Dormers; Flat Roof Dormer | Missing | Dormer tool | P2 |
| RF-06 | Rooftop terrace | Rooftop Terrace | Missing | Flat cut + slab | P2 |
| RF-07 | Roof windows | Roof Windows | Missing | Host on roof plane | P2 |
| RF-08 | Timber / wood construction display | Timber Construction; Holzkonstruktionsmodus | Missing | Visual rafters (approx) | P3 |
| RF-09 | Downpipes | Downpipes | skip early | P3 |
| RF-10 | Solar panels on roof | Solar Panels | Missing | Array placer | P3 |
| RF-11 | Negative pitch / special eaves | Negative Pitch; Sloping Eave | Missing | Advanced | P3 |
| RF-12 | Roof extensions | Roof Extension | Missing | P2 |

---

## 9. Materials, textures & 3D objects

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| M-01 | Paint textures on walls/floors/objects | Assign Textures; demos | Partial | Material paint tool | P1 |
| M-02 | Import custom textures | Import Your Own Textures | Missing | Image → material | P1 |
| M-03 | Material pipette / copy | DE: Pipette | Missing | Eyedropper | P2 |
| M-04 | Mapped colored 2D plan | demos “map 2D view” | Missing | Texture preview in 2D | P1 |
| M-05 | Large 3D object catalog | 15k–30k+ objects (tiers) | Partial | Curated packs + CDN | hand-off scale |
| M-06 | Import 3D objects (SketchUp / warehouse) | Importing 3D Objects; demos | Partial (GLB) | GLB/glTF first; SKP convert server-side | P1 |
| M-07 | Object resize/rotate/duplicate | demos Ctrl+D rotate; copy hedges | Partial | Transform + array | P1 |
| M-08 | Built-in object editor | Create 3D Objects | skip / approx | Simple box/prism editor | P3 |
| M-09 | 2D furniture symbols | 2D Furniture | Partial | Plan symbols | P2 |

---

## 10. 3D visualization, light & presentation

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| V-01 | Real-time 3D as you draw | All demos | Partial | Keep Extrude live with split view | P0 |
| V-02 | Orbit / pan / zoom (mouse wheel) | demos | Exists | Polish controls | P0 |
| V-03 | Walkthrough / virtual tour | 3D Walkthrough | Partial | First-person mode | P1 |
| V-04 | Walkthrough video export | DE: Rundgang-Videos | hand-off | Screen record or Twinmotion | P3 |
| V-05 | Daylight / sun path | Lighting & Sun; demos shadow recalc | Missing | Sun direction + time | P1 |
| V-06 | Shadow recalculation | demos | Missing | Bake / realtime shadows toggle | P1 |
| V-07 | Lighting manager (place lights) | Pro Light Sources | Missing | Point/spot lights list | P2 |
| V-08 | Panorama / background images | Background Image; Panorama | Missing | HDRI / plate backdrop | P2 |
| V-09 | 3D sections | 3D Sections | Missing | Clip plane | P2 |
| V-10 | High-res image export | Pro output options | Partial | PNG capture | P1 |

---

## 11. Construction documents (elevations, sections, sheets)

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| D-01 | Elevations | Elevations tutorial; demos | Partial | Auto elev from model | P1 |
| D-02 | 2D sections + edit/dim | 2D Sections; Dimension Sections | Missing | Section cut tool | P2 |
| D-03 | Plan compilation / sheet set | Building Plan Preparation; Planzusammenstellung | Partial (PDF multi-floor) | Title block + sheets | P2 |
| D-04 | Title block | Title Block | Missing | Template | P2 |
| D-05 | Scaled print / PDF | How to print; Print as PDF | Partial | True-scale PDF | P1 |
| D-06 | Electrical planning overlay | Electrical Planning; DE MEP | skip / approx | Simple symbol layer only | P3 |
| D-07 | Heating / sanitary planning | DE comparison | skip | Hand off to MEP tools | skip |
| D-08 | 2D drafting elements / polygons | 2D Elements; 2D Polygons | Missing | Annotate layer | P2 |

---

## 12. Import / export

| ID | Plan7 capability | Public evidence | Olsen today | Strategy | Priority |
|---|---|---|---|---|---|
| X-01 | DWG/DXF import | DWG / DXF Import | Exists (CAD Studio strength) | Keep leading | P0 |
| X-02 | DWG/DXF export | DWG / DXF Export | Partial | Round-trip export | P1 |
| X-03 | Floor plan image import / trace | Import Floor Plan Image | Missing | Underlay + calibrate | P1 |
| X-04 | PDF export | Print as PDF | Partial | Sheet PDF | P1 |
| X-05 | Image export | Pro | Partial | PNG/JPG | P1 |
| X-06 | 3DS / OBJ / STL / glTF for viz | Export Twinmotion/3DS; OBJ/STL | Missing 3DS; IFC partial | **glTF/FBX first**; 3DS if required | P1 |
| X-07 | Twinmotion / Twinmotion-class handoff | Export to Twinmotion | hand-off | Document glTF → Twinmotion | P2 |
| X-08 | SketchUp import | Pro claims SKP | Missing | Server convert | P2 |
| X-09 | IFC (Ultimate / some markets) | Marketing varies | Partial | Improve IFC | P2 |
| X-10 | 3D printer STL | Export 3D Drucker | Approx via STL later | P3 |
| X-11 | Native project format (ANP) | Open ANP Files | n/a | Own `.olsen.json` / IDB | exists path |
| X-12 | Floor-plan recognition from scans | Pro 5 notes (assistant) | Missing | Optional AI later | P3 |

---

## 13. Tutorial corpus checklist (public index)

Track coverage as we watch/annotate. Mark `□` → `▣` when behavior row above is filled from that video.

### First steps
- [ ] First Steps
- [ ] Unit Settings
- [ ] User Interface
- [ ] 2D/3D Parallel Mode
- [ ] Floor Plan Views
- [ ] Guide Lines

### Complete houses (end-to-end)
- [x] Complete House 1 (~25 min) — https://youtu.be/V822AazKM-g (transcript mined)
- [ ] Container House 2
- [x] Complete House 3 (~12 min) — https://youtu.be/mF5aFfIrqoE (transcript mined)
- [x] Complete House 5 (~6 min) — https://youtu.be/jYPoIS6fm4M (transcript mined)
- [ ] Tiny House 6
- [ ] Barndominium 7
- [ ] Bungalow 8
- [ ] Horse Stable
- [ ] Semi-Detached House
- [ ] Atrium House

### Walls / openings / stairs / floors / roofs / terrain / docs / custom
Use https://plan7architect.com/tutorials/ as the master list; tick each titled tutorial after annotation.

---

## 14. Suggested Olsen delivery waves (from this matrix)

### Wave 1 — Plan7 drafting loop (P0)
UX-01..04, UX-07..08, W-01..03, O-01..03, R-01..03, F-01..02, T-01, V-01..02, X-01

### Wave 2 — Site, materials, stories polish (P1)
Slabs/balcony, garage door, stairs/railings, mapped 2D, material paint, sun/shadows, elevations PDF, DXF export, glTF export, prop packs

### Wave 3 — Roof studio + docs (P2)
Auto roof styles, dormers, sections, sheet set, multi-building, foundations, terrain approx

### Wave 4 — Deep / niche (P3) or skip
Spiral stairs, muntins, timber mode, solar, MEP, scan recognition, walkthrough video, 3DS-only pipelines

---

## 15. Maintenance rules
1. **Public-first:** every new row needs a public tutorial/page citation or licensed hands-on note.
2. **No RE:** never attach binary dumps, decompiled code, or cracked installs.
3. **UI inspiration only:** describe patterns; do not paste Plan7 screenshots into product UI.
4. **Update Olsen status** when shipping; link PR numbers in a changelog section below.

### Changelog
| Date | Change |
|---|---|
| 2026-09-04 | Wave 1 next: roof catalog (gable/flat/shed), snaps+guides, wall thickness, passage, interior dims, room fills, balcony railing (#297 slabs/dims merged first) |
| 2026-09-03 | Initial matrix from tutorials index, DE version comparison, Pro page, and 3 YouTube house demos |
