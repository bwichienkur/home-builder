# CAD Studio edit UX roadmap — industry standards, gaps, phases

**Purpose:** Research-backed plan to close floor-plan editing and UX gaps versus Revit / AutoCAD Architecture / Chief Architect / SoftPlan — specifically for **2D plan design + live 3D extrusion**. Includes a proposal to reorganize tools/buttons.

**Scope:** Residential custom-home drafting (Olsen), web-first. Not full BIM/MEP parity.  
**Baseline:** `main` (through Wave 3 docs/export) + pending PR **#303** (2D wall modify suite + soft layer toggles).  
**Related docs:** `docs/cad-2d-floorplan-edit-plan.md`, `docs/architect-plan-studio-features.md`, `docs/plan7architect-capability-matrix.md`.

**Sources (public only):** Autodesk Revit help (constraints, walls, temporary dims), AutoCAD Architecture grip/dynamic dim help, SoftPlan 2026 feature notes, U.S. National CAD Standard / AIA CAD Layer Guidelines, Autodesk ribbon UX guidance. No reverse engineering of proprietary binaries.

---

## 1. Industry standards that matter for 2D plan + 3D extrude

### 1.1 Drawing organization (NCS / AIA)

| Standard | Implication for Olsen |
|---|---|
| **AIA CAD Layer Guidelines** (`Discipline-Major-Minor`) e.g. `A-WALL`, `A-DOOR`, `A-ANNO-DIMS` | Imported DWG layers should map to stable discipline groups; visibility toggles must stay aligned with 2D + 3D (started in #303 soft layers) |
| **Uniform Drawing System (UDS)** — orientation, scale, dims, cross-refs | Sheet set needs north arrow, scale bar, consistent dim styles, sheet naming |
| **Plotting / sheet discipline** | Floor plans, elevations, sections as linked views of one model — not disconnected drawings |

### 1.2 The “drafter edit loop” (Revit + AutoCAD Architecture + Chief)

Industry consensus for day-to-day plan editing:

1. **Select object** → temporary dimensions appear  
2. **Click dim value or grip** → type exact length / drag  
3. **Modify tools** (trim / extend / split / align / offset / copy / mirror) stay one click away  
4. **Properties palette** always shows type + instance parameters for the selection  
5. **3D updates live** from the same model (Revit / Chief / SoftPlan / ACA)

Key Autodesk patterns:

| Pattern | Product | Why users expect it |
|---|---|---|
| Temporary dimensions on select | Revit | Fast numeric adjust without hunting a dialog |
| Lock permanent dims → constraints | Revit | Preserve design intent (corridor width, bay spacing) — use sparingly |
| Grips + dynamic input | AutoCAD Architecture | Lengthen / move / width / reverse without dialogs |
| Contextual **Modify \| Walls** ribbon | Revit | Tools appear only when relevant — reduces clutter |
| Ribbon: Draw vs Modify vs Annotate tabs | AutoCAD / Revit | Separate *create* from *edit* from *document* |
| Auto Dimension that **preserves manual dims** | SoftPlan 2026 | Users hated auto-dim wiping hand edits — now a selling point |
| Combine like walls / hosted openings | SoftPlan / Chief | Keep plan topology clean after breaks |

### 1.3 Residential-specific (Chief / SoftPlan user demand)

From public feature updates and residential CAD marketing, users repeatedly ask for:

- **Dimension-driven wall moves** (type a number → wall moves)  
- **Auto dims that don’t destroy manual dims**  
- **Reliable undo** across complex edits  
- **Openings that stick to walls** when walls move  
- **Combine / clean walls** after break or import  
- **Live 3D** while drafting in 2D  
- **Materials lists / schedules** from the model  
- **Import cleanup** (CAD-to-walls, layer mapping)  
- **Fast copy / mirror / flip plan** for schemes  

What they do *not* usually want in a residential web app first: full Revit constraint solvers, MEP systems, structural analytical models.

---

## 2. What people want (ranked for Olsen)

### Tier A — “I can’t edit a real house plan without this”

1. Click dimension → wall moves (true dim-driven edit)  
2. Stable grips + typed length/angle (partially in #303)  
3. Trim / extend / break / join that keep rooms closed (#303 tools; join graph still thin)  
4. Hosted doors/windows that follow walls (#303 start)  
5. Undo that doesn’t explode after drags (stack exists; needs coalesce)  
6. Layer visibility = same truth in 2D and 3D (#303 soft layers)  
7. Clean UX: create tools ≠ modify tools ≠ annotate tools  

### Tier B — “Feels like Chief / SoftPlan”

8. Temporary dims on every selection (walls, openings, slabs)  
9. Align / distribute / set distance between  
10. Combine collinear walls; cleanup imported centerline soup  
11. Auto exterior dims that fill gaps without wiping manual dims  
12. Room rename + reliable closed polygons from wall network  
13. Door/window marks + schedules  
14. Sticky properties palette (always visible, contextual)  

### Tier C — “Permit / client polish”

15. In-canvas length overlay (no `window.prompt`)  
16. PDF underlay calibrate + trace  
17. Story / level manager  
18. North arrow, scale bar, revision clouds  
19. Constraint locks (optional, Revit-lite)  
20. Design options / flip plan  

---

## 3. Gap analysis — Olsen today vs industry

### Legend
- ✅ Shipped on `main` or clearly present  
- 🟡 In PR #303 / partial  
- ❌ Missing  

### 3.1 Editing abilities

| Capability | Industry bar | Olsen | Gap severity |
|---|---|---|---|
| Draw walls / openings / slabs | Create catalog | ✅ | — |
| Typed length while drawing | Tab / dynamic input | 🟡 (#303 Tab+prompt) | Medium — replace prompt with HUD |
| Length/angle in properties | Always | 🟡 (#303) | Low once merged |
| Endpoint + mid grips | ACA / Chief | 🟡 (#303) | Low |
| Dim click → move geometry | Revit/Chief core | ❌ | **Critical** |
| Temporary dims on select | Revit | ❌ | **Critical** |
| Trim / extend / break / offset | AutoCAD Modify | 🟡 (#303) | Medium — needs wall graph stretch |
| Copy / mirror | Standard | 🟡 (#303) | Low |
| Multi-select + group move | Standard | 🟡 Shift walls | Medium — extend to openings |
| Hosted openings | Chief/SoftPlan | 🟡 | Medium — auto-host on import |
| Undo / redo | Ubiquitous | 🟡 | Medium — coalesce drag frames |
| Soft layer 2D+3D | Expected | 🟡 | Low once merged |
| Align / set-distance | SoftPlan “Set Distance Between” | ❌ | High |
| Combine collinear walls | SoftPlan 2026 | ❌ | High for imports |
| Auto dims preserve manual | SoftPlan 2026 | ❌ | High |
| Constraints / EQ spacing | Revit | ❌ | Later (Tier C) |
| Arc walls | ACA / Chief | ❌ | Later |
| Stories / levels | All | Partial sheets | High for multi-floor |
| Underlay calibrate | SoftPlan / Chief | ❌ | High for remodel |

### 3.2 UX / button organization (current pain)

**Today’s structure (catalog tabs):**  
`Walls | Openings | Fixtures | Layers | Site | Roof | Docs`

Problems vs Revit/AutoCAD ribbon norms:

| Issue | Why it hurts |
|---|---|
| **Create and Modify mixed** under Walls | Trim/Extend/Copy sit next to “draw exterior wall” — cognitive clash |
| **Select / Delete / Guide / Stair** scattered | Select is a mode, not a wall type; Delete is global |
| **No persistent Modify toolbar** near canvas | Industry keeps Modify on ribbon or contextual bar above the view |
| **Properties buried under catalog scroll** | Revit keeps Properties always docked and sticky |
| **Docs / export mixed with drawing tools** | Annotate/Export belong elsewhere |
| **Status hints easy to miss** | Trim workflow needs a stronger mode banner |
| **Too many equal-weight catalog buttons** | Ribbon panels use size hierarchy (primary large, secondary small) |

---

## 4. Proposed UI reorganization

### 4.1 Information architecture (Revit/AutoCAD-inspired, web-sized)

```
┌─ Quick access ──────────────────────────────────────────────┐
│ Undo Redo | Import | Demo | Units | Snap | Dims            │
├─ Mode ribbon (primary) ─────────────────────────────────────┤
│ [Draw] [Modify] [Annotate] [Site] [Roof] [Layers] [Sheets] │
├─ Context strip (changes with mode / selection) ─────────────┤
│ Draw: Wall Ext · Wall Int · Door · Window · Slab · Stair   │
│ Modify: Trim · Extend · Break · Offset · Align · Copy …    │
│ Annotate: Dim · Text · Room tag · Section · Title fields  │
├──────────────┬──────────────────────────┬───────────────────┤
│ Properties   │  2D plan (+ grips/dims)  │  Live 3D          │
│ (sticky)     │                          │                   │
│ Always shows │  Mode banner when Trim…  │                   │
│ selection    │                          │                   │
└──────────────┴──────────────────────────┴───────────────────┘
```

### 4.2 Button grouping rules

1. **Modes, not mega-menus:** one active ribbon mode (`Draw` / `Modify` / `Annotate`…).  
2. **Contextual tools:** when a wall is selected, show wall actions (length, flip, offset) in Properties + a thin selection toolbar.  
3. **Create catalog = types only:** Exterior wall, Interior wall, Door types — not Trim.  
4. **Modify = verbs only:** Trim, Extend, Break, Offset, Align, Copy, Mirror, Delete.  
5. **Layers stay first-class** (imported DWG truth) but not mixed into Draw.  
6. **Primary vs secondary:** Draw Wall / Select large; Break / Mirror compact.  
7. **Mode banner:** e.g. amber “TRIM: click cutter, then wall · Esc cancel”.  
8. **Keyboard cheat sheet** collapsed by default; shortcuts on tooltips.

### 4.3 Suggested control map

| Ribbon | Panels | Tools |
|---|---|---|
| **Draw** | Walls, Openings, Circulation, Site slabs | Wall Ext/Int, Door/Window/Passage/Garage, Stair, Guide, Terrace/… |
| **Modify** | Edit, Transform, Cleanup | Select, Trim, Extend, Break, Offset, Align, Copy, Mirror, Combine, Delete |
| **Annotate** | Dimensions, Text, Views | Auto dim, Manual dim, Room tag, Section cut, Notes |
| **Site** | Lot, Terrain, Foundation | Plot, Terrain grade, Auto foundation |
| **Roof** | Style, Special | Gable/Flat/Shed, Pitch, Dormer |
| **Layers** | Visibility, Classify | Soft toggles 2D+3D, classify, presets |
| **Sheets** | Set, Export | Title block, sheet set, DXF/glTF/PNG/CSV |

### 4.4 Properties palette (always visible)

When wall selected: Length, Angle, Thickness, Material, Exterior, Flip, Delete.  
When opening selected: Width, Height/Sill, Kind, Mark, Flip hand, Host wall.  
When nothing selected: plate stats + last tool tip.

---

## 5. Phased plan to close gaps

### Phase U0 — Merge & stabilize (#303) *(prerequisite)*

- Merge PR #303 (wall modify + soft layers + history).  
- Coalesce undo during grip drag (one history entry per gesture).  
- Replace `window.prompt` Tab-length with an inline HUD near the cursor.  
- **Acceptance:** Imported Stillwater/demo walls editable by length/angle; layer off → gone in 2D and 3D.

### Phase U1 — Ribbon reorganization (UX) *(1 ship unit)*

- Implement Draw / Modify / Annotate / … mode ribbon + context strip.  
- Sticky Properties column.  
- Mode banners for Trim/Extend/Break.  
- Move export/docs under Sheets.  
- **Acceptance:** New users can find Trim without opening Walls catalog; Properties always on screen.

### Phase U2 — Dimension-driven editing *(critical product)*

- Temporary dims on wall/opening select.  
- Click value → type → geometry moves (selected element).  
- Optional: convert temp → permanent annotative dim.  
- Auto exterior dims: fill missing only (SoftPlan lesson — don’t wipe manuals).  
- **Acceptance:** Change a corridor to 4'-0" by editing a dim, 3D updates.

### Phase U3 — Topology & import cleanup

- Wall graph: stretch connected endpoints when moving a shared node.  
- Combine collinear same-type walls.  
- Align / Set distance between two walls.  
- Auto-host openings from imported door/window segments onto nearest wall.  
- **Acceptance:** Trim a T-junction; both walls stay joined; rooms still close.

### Phase U4 — Rooms, marks, schedules

- Closed-room detection from wall graph.  
- Room rename; door/window marks (D1, W1).  
- Schedule CSV + sheet schedule block.  
- **Acceptance:** Room schedule updates when walls move.

### Phase U5 — Stories, underlay, constraints-lite

- Story manager (active floor, FF elevation).  
- PDF/image underlay calibrate.  
- Optional lock on key dims (Revit-lite, few constraints).  
- Flip plan / design option snapshot.  
- **Acceptance:** Trace a survey PDF; lock overall width; flip scheme B.

---

## 6. Recommended near-term sequence

```
U0 merge #303 + undo/HUD polish
  → U1 ribbon reorganization (biggest UX win for “buttons everywhere”)
    → U2 dim-driven edit (biggest editing win)
      → U3 topology/import cleanup
        → U4 rooms/marks
          → U5 stories/underlay
```

**Product decision:** Prefer **Chief/SoftPlan-class** residential edit (dims, grips, modify verbs, live 3D) over **full Revit constraints**. Add locks only in U5.

---

## 7. Success metrics

| Metric | Target |
|---|---|
| Time to change one wall to an exact length | &lt; 5 seconds (dim or properties) |
| New-user finds Trim without hunting | ≤ 2 clicks from idle |
| Layer toggle affects Extrude | 100% of floor layers |
| Undo after grip edit | Exactly one undo step |
| Closed room count stable after trim/extend | No silent room loss on demo ranch |

---

## 8. Out of scope (keep deferred)

- Full MEP / timber framing / spiral stairs / scan-to-plan AI / 3DS-only pipelines (Wave 4 skip list).  
- Photoreal object catalogs at Chief scale.  
- Over-constrained parametric models.

---

## 9. Changelog

| Date | Note |
|---|---|
| 2026-09-04 | Initial research roadmap: standards, user wants, gaps, U0–U5 phases, ribbon reorganization |
