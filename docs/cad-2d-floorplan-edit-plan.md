# Full 2D house model — industry gap analysis & delivery plan

**Goal:** Make CAD Studio capable of authoring and editing a complete residential floor plan the way drafters and residential architects do in industry-leading tools — especially **wall length, orientation, joins, and dimension-driven adjust**.

**Status:** Research + plan (no implementation in this PR).  
**Baseline:** CAD Studio after Wave 3 (#301) — strong create/import/export; thin wall **modify** loop.  
**PR #301:** merged to `main` (2026-09-04).

**Comparators (public product docs / help only — no reverse engineering):**

| Product | Role | Why it matters for Olsen |
|---|---|---|
| **Chief Architect Premier** | Residential CAD/BIM leader | Wall editing with dimensions, Tab-to-type length while drawing, trim/extend/break, auto exterior dims, CAD modify set |
| **Autodesk Revit** | Professional BIM | Temporary + permanent dimensions drive geometry; Align/Lock; Trim/Extend to corner; constraints |
| **AutoCAD Architecture** | Object-based CAD | Wall grips (lengthen, move, width, reverse); dynamic input for exact distance/angle |
| **SoftPlan / Archicad / Plan7** | Residential / mid-market | Same core: walls as smart objects, openings host on walls, dim-driven edit |

Olsen target is **not** full Revit parity. Target is **Chief Architect / SoftPlan–class floor-plan modify** for custom homes: walls, openings, rooms, dims — web-first on `CadPlate`.

---

## 1. What industry apps expect for floor-plan edit

### 1.1 Wall authoring & modify (must-have)

| Capability | Chief / ACA / Revit pattern | Olsen today |
|---|---|---|
| Draw exterior/interior walls | Continuous or click–click; wall types | ✅ Click–click EXT/INT |
| **Type exact length while drawing** | Chief: Tab → enter length; ACA: dynamic input | ❌ Live length label only |
| **Numeric length edit after place** | Dim or property → wall resizes | ❌ Length read-only in inspector |
| **Endpoint grips** | Explicit start/end grips | ⚠️ Nearer-end drag heuristic |
| **Whole-wall move** | Location grip / Move | ❌ Endpoint-only |
| **Rotate / change orientation** | Rotate tool or angle input | ❌ |
| **Reverse wall direction** | Direction grip | ❌ (matters for openings later) |
| **Trim / Extend** | Trim to boundary; Extend to wall | ❌ |
| **Join / miter corners** | Auto-join on draw; join tool | ⚠️ 3D miter only (`cadWallJoin`) |
| **Break / Split** | Break at point → two segments | ❌ |
| **Offset** | Parallel copy at distance | ❌ |
| **Copy / Mirror / Array** | Standard modify | ❌ |
| Wall thickness / type | Dialog + grips | ✅ Thickness + material presets |
| Arc / curved walls | Arc wall tools | ❌ (P2 later) |
| Multi-select walls | Fence / Ctrl-click | ❌ |
| **Undo / Redo** | Ubiquitous | ❌ |

### 1.2 Dimension-driven editing (the core “drafter” loop)

Industry pattern (Chief “Wall Editing with Dimensions”, Revit temporary dims, ACA dynamic dims):

1. Select wall (or opening).  
2. Temporary / parallel dimension appears.  
3. **Click the dimension value → type new length → wall (or adjacent segment) moves.**  
4. Optional: lock dimension as constraint (Revit); Olsen can defer locks.

| Capability | Industry | Olsen today |
|---|---|---|
| Auto exterior dimension chains | Chief One-Click Auto Dim | ✅ Display chains (`computeExteriorDims`) — **not editable** |
| Interior / room dims | Yes | ✅ Display toggle — **not editable** |
| Edit dim → move geometry | **Required** | ❌ |
| Temporary dims on selection | Yes | ❌ |
| Type length while drawing (Tab) | Yes | ❌ |
| Angle input while drawing | Yes | ⚠️ Shift ortho + soft ortho only |

### 1.3 Openings hosted on walls

| Capability | Industry | Olsen today |
|---|---|---|
| Place door/window on wall | Host + width | ⚠️ Free click–click span (not truly hosted) |
| Edit width / height / sill after place | Spec dialog | ❌ Sill only at place time |
| Slide along wall | Grip | ⚠️ Translate preserves length, not wall-locked |
| Flip swing / hand | Flip tool | ❌ |
| Opening marks + schedule | Automatic | ❌ Marks; CSV room areas only |

### 1.4 Rooms / spaces

| Capability | Industry | Olsen today |
|---|---|---|
| Auto-detect closed rooms | From wall network | ⚠️ Label + stamp heuristics |
| Rename room / area updates | Yes | Partial labels |
| Edit room by moving enclosing walls | Yes (if walls join) | Depends on wall edit gaps |
| Space planner / room boxes | Chief Space Planner | ❌ |

### 1.5 General CAD modify & session

| Capability | Industry | Olsen today |
|---|---|---|
| Midpoint / intersection / distance snaps | Yes | ❌ Endpoint + guide + ortho |
| Angle snaps (15°/45°) | Yes | ❌ |
| Guides selectable/deletable | Yes | ⚠️ Draw yes; pick/delete broken |
| Multi-select + group transform | Yes | ❌ |
| Undo stack | Yes | ❌ |
| Stories / levels | Yes | Partial sheet tabs; not full story manager |

---

## 2. Gap severity (for “full 2D house model”)

### Blockers (cannot claim full 2D authoring without these)

1. **Numeric wall length** (draw-time Tab + post-place inspector / dim edit)  
2. **Whole-wall move + rotate / angle**  
3. **Trim / Extend / Break + corner join** so rooms stay closed when adjusting  
4. **Dimension-driven edit** (click dim value → geometry moves)  
5. **Undo / Redo**  
6. **Opening host + width/sill edit after place**

### High priority (parity with Chief/SoftPlan day-to-day)

7. Explicit endpoint grips + mid-grip move  
8. Offset, Copy, Mirror  
9. Multi-select  
10. Midpoint / intersection / angle snaps  
11. Temporary dims on selection  
12. Room rename + reliable closed-space detection from joined walls  

### Medium (complete house model polish)

13. Arc walls  
14. Align / Distribute  
15. Dimension constraints (lock) — Revit-class, optional  
16. Door swing flip / window sill in 3D sync  
17. Story manager (multi-floor 2D)  

### Out of scope for this track (already decided Wave 4 / docs)

- Full MEP, timber mode, spiral stairs, scan AI, 3DS  
- Photoreal object catalogs at Chief scale  

---

## 3. Delivery plan — “2D Edit Studio” waves

### Wave E0 — Wall adjust fundamentals (P0)

**User story:** “I can change a wall’s length and angle precisely, move it, and undo mistakes.”

| ID | Work | Acceptance |
|---|---|---|
| E0-01 | Inspector: **Length (ft-in)** field → resize from fixed end (default start fixed) | Type `12'-6"` updates endpoint |
| E0-02 | Inspector: **Angle / Orientation** (deg or bearing) + Flip 180° | Wall rotates about midpoint or start |
| E0-03 | Explicit **Start / End grips** (hit-test circles) + mid **Move** grip | Drag end = lengthen; drag mid = translate |
| E0-04 | Draw-time **Tab / Enter length** + optional angle | After first click, type length confirms second point |
| E0-05 | **Undo / Redo** stack on `CadPlate` (Ctrl+Z / Ctrl+Y) | ≥50 steps; clears on import |
| E0-06 | Fix guide hit-test / select / delete | Guides pickable |

**Primary files:** `editCadPlate.ts` (`setWallLength`, `setWallAngle`, `moveWall`), `CadPlateEditor.tsx`, `CadStudioPage.tsx` inspector, new `cadHistory.ts`.

### Wave E1 — Join network + trim/extend/break (P0)

**User story:** “Adjusting one wall keeps the floor plan connected like Chief/Revit.”

| ID | Work | Acceptance |
|---|---|---|
| E1-01 | **Auto-join** on wall draw when endpoint near existing wall (tol ~0.5') | T-junctions / L-corners snap |
| E1-02 | **Trim** tool: pick cutting edge then wall to shorten | Wall ends at intersection |
| E1-03 | **Extend** tool: pick boundary then wall to lengthen | Wall meets target |
| E1-04 | **Break** tool: click point on wall → two centerlines | Openings stay on correct segment when possible |
| E1-05 | Corner cleanup / coplanar merge | Collinear abutting walls merge optional |
| E1-06 | Connected move (stretch neighbors) v1 | Moving a wall endpoint updates walls that shared that node (graph) |

**New module:** `cadWallGraph.ts` — node/edge model over `wallCenterlines`.

### Wave E2 — Dimension-driven editing (P0)

**User story:** “I click a dimension, type a number, the wall moves — like Chief/Revit.”

| ID | Work | Acceptance |
|---|---|---|
| E2-01 | Temporary dims on wall select (length + distance to nearest parallel) | Appear in plan |
| E2-02 | Click dim value → input → **drive geometry** | Parallel wall or endpoint moves |
| E2-03 | Make exterior/interior dim chains **editable** | Same input path |
| E2-04 | Draw feedback: live length + Tab to commit | Matches E0-04 UX |
| E2-05 | Opening width as editable dim when selected | Hosted opening resizes |

### Wave E3 — Openings, rooms, modify toolbox (P1)

| ID | Work | Acceptance |
|---|---|---|
| E3-01 | Host openings on nearest wall; store `t` along wall + width | Move wall → opening follows |
| E3-02 | Inspector: width, sill, kind, flip swing | Post-place edit |
| E3-03 | Offset / Copy / Mirror tools | Works on walls + openings |
| E3-04 | Multi-select (Shift) + group move | N walls |
| E3-05 | Midpoint + intersection + 15°/45° snaps | Snap badge in status |
| E3-06 | Reliable room polygons from wall graph + rename | Areas update when walls move |
| E3-07 | Door/window marks (A1, W1…) + schedule CSV columns | Export includes marks |

### Wave E4 — Full-house 2D completeness (P1/P2)

| ID | Work | Acceptance |
|---|---|---|
| E4-01 | Story / floor manager (active floor, FF elev) | Multi-story plate or plate-per-story |
| E4-02 | Align / Distribute | Selection ≥2 |
| E4-03 | Arc walls (optional) | Draw + grip |
| E4-04 | PDF/image underlay calibrate + trace | Lock scale |
| E4-05 | Associative dims on sheet set export | Sheet dims match model |

---

## 4. Suggested implementation order (first 3 ship units)

```
E0 (length/angle/grips/undo)
    → E1 (trim/extend/break + wall graph)
        → E2 (edit-by-dimension)
            → E3 (hosted openings + copy/mirror + rooms)
```

**First vertical slice to ship next (recommended):** E0-01..E0-05 only — unlocks “adjust wall length and orientation” immediately, which is the explicit user ask.

### Concrete API sketch (E0)

```ts
setWallLength(plate, index, lengthFt, anchor: 'start' | 'end' | 'mid'): CadPlate
setWallAngle(plate, index, angleDeg, pivot: 'start' | 'mid'): CadPlate
moveWall(plate, index, dxFt, dyFt): CadPlate
parseArchitecturalLength(input: string): number // 12'-6" | 12.5 | 12 6
```

Inspector UX:

- Length: `[ 40'-0" ]`  Anchor: Start ▾  
- Angle:  `[ 0.0°  ]`  [Flip 180°]  
- Grips on plan always when selected  

---

## 5. Success criteria — “full 2D model of a house”

A drafter can, without re-importing DXF:

1. Draw a closed exterior + interiors with typed lengths  
2. Change any wall length/angle from inspector or grips  
3. Trim/extend to clean corners; break walls for openings  
4. Place/edit doors & windows on walls (width/sill/swing)  
5. Adjust layout by editing dimensions  
6. Undo mistakes; rooms/areas stay consistent  
7. Export DXF + sheet set that reflects the edited plan  

When 1–7 are true, Olsen matches the **daily floor-plan edit loop** of Chief Architect / SoftPlan for custom residential (not full BIM/framing).

---

## 6. Relation to existing docs

- Capability matrix: `docs/plan7architect-capability-matrix.md` (Plan7-inspired waves 1–4)  
- Architect export research: `docs/architect-plan-studio-features.md`  
- **This doc** owns the **2D modify / wall-edit** gap track (Waves E0–E4)

### Matrix rows to update as E-waves ship

| Matrix ID | Maps to |
|---|---|
| W-02 Live interactive dimensions | E0-04, E2 |
| W-07 Move / split / trim / join | E0-03, E1 |
| UX-07 Snaps / angles / ortho | E3-05 |
| O-03 Edit openings 2D/3D | E3-01..02 |
| R-01.. rooms | E3-06 |

---

## 7. Risks & decisions

| Risk | Mitigation |
|---|---|
| Wall graph stretch breaks DXF-imported messy geometry | Join only user-authored walls first; import remains “centerline soup” until cleanup tool |
| Dim-driven edit ambiguity (which wall moves?) | Always move the **selected** element; dim shows direction arrow |
| Undo memory on large plates | Store patches / structural clones; cap stack |
| Scope creep into Revit constraints | Ship editable dims first; locks later |

**Product decision:** Prefer **Chief-like** (fast residential wall edit + dims) over **Revit-like** (full constraint solver) for E0–E2.
