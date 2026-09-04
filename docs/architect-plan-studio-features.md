# Architect research: plan create / adjust / export features

What a practicing residential architect (custom homes, permit sets, client design iterations) needs from a web CAD studio like Olsen’s — beyond mirroring Plan7 interaction patterns.

Sources informing this note: AIA / NCS sheet conventions, common permit-submittal checklists, IFC/BIM handoff practice, and gaps observed against our Plan7-inspired capability matrix. No reverse-engineering of proprietary software.

---

## 1. Create (author a plan from scratch or underlay)

| Need | Why it matters | Olsen implication |
|---|---|---|
| **True scale + units** | Permit plans are dimensioned in ft-in or metric; wrong scale = rejected sheets | Global units, scale bar on every sheet, true-scale PDF |
| **Walls as assemblies** | Framing / finish layers drive energy code and specs | Wall types with thickness, fire rating, R-value metadata (not just stroke) |
| **Levels / stories** | Multi-story homes, basements, split levels | Story manager with FF elevations, linked stairs |
| **Rooms as spaces** | Area schedules, HVAC, egress | Closed room polygons + names + finish tags |
| **Openings with hardware/swing** | Door schedule, egress, accessibility | Catalog + schedule fields (mark, width, fire rating) |
| **Roof as system** | Pitch, ridges, valleys, dormers, overhangs for elevations & structure | Roof editor + dormers (shipped Wave 3) + valleys later |
| **Site / plot** | Setbacks, grading, drainage | Plot boundary, terrain grade, north arrow, setback offsets |
| **Underlay import** | Trace existing CAD/PDF/survey | Calibrated PDF/image underlay + DXF/DWG (strength today) |
| **Constraints / snaps** | Speed and accuracy | Ortho, endpoint, midpoint, angle, guide lines |

## 2. Adjust (iterate with client and consultants)

| Need | Why it matters | Olsen implication |
|---|---|---|
| **Live 2D ↔ 3D** | Clients decide from massing; architects edit plan | Split view already; keep Extrude live |
| **Dimensions that update** | Moving a wall must update strings | Associative dims (exterior + interior) |
| **Section & elevation sync** | Cut plane must match model | Section cuts + elev from model (Wave 3 start) |
| **Options / variants** | Scheme A vs B without forking files | Design options or branchable plate snapshots |
| **Annotations & revisions** | Clouds, delta notes, revision history | Rev clouds, issue date, revision table on title block |
| **Layers / worksets** | Consultant coordination | Layer visibility + discipline filters |
| **Multi-building** | House + garage + ADU | Named buildings with visibility (shipped) |
| **Materials / finishes** | Selections → lookbook / COF | Wall paint + mapped 2D + Olsen catalog link |
| **Clash / clearance aids** | Stairs headroom, door swings | Soft checks before export |

## 3. Export (hand off to permit, builder, viz, ops)

### Construction documents (architect’s primary deliverable)

1. **Sheet set** with title block (project, sheet no., scale, rev, drawn/checked) — HTML/SVG print path shipped.
2. **Floor plans** at stated scale with dims, room tags, door/window marks, north arrow.
3. **Elevations** (all sides) with grade line, floor lines, roof pitches labeled.
4. **Building sections** through critical cuts (stairs, volume changes).
5. **Schedules** — rooms (area), doors, windows, finishes (CSV today; expand marks).
6. **Foundation / site plan** — footing/slab notes, plot, utilities stubs.
7. **Details / notes** sheets — typical wall section, stair detail (can start as templates).
8. **True-scale PDF** (vector) + **DWG/DXF** for consultants.

### Digital / BIM / viz handoff

| Format | Audience |
|---|---|
| **DXF/DWG** | Structural / MEP CAD |
| **glTF / FBX** | Twinmotion, client viz (glTF shipped) |
| **IFC** | BIM coordination (improve later) |
| **PNG/SVG** | Marketing, email markups |
| **CSV / JSON schedules** | Estimating, Buildertrend, selections |

### Operational (Olsen-specific differentiator)

- Push room areas / openings into **estimating & selections**.
- Link plate → **COF / lookbook** finishes.
- Preserve **layer classification** from import so DXF → plate → Extrude stays faithful.

---

## 4. Priority stack for Olsen (architect lens)

### Must-have for credible plan export (near-term)

1. Associative dimensions + door/window marks on sheets  
2. True-scale multi-sheet PDF (print CSS → PDF) with title block (started)  
3. Section + four elevations consistent with the model (started)  
4. Room / door / window schedules with marks  
5. North arrow, scale bar, revision block  
6. DXF round-trip fidelity + glTF for viz (glTF shipped)

### Should-have for custom-home practice

7. Multi-story story manager with linked stairs  
8. Roof valleys / hips / dormers refinement  
9. Site setbacks + simple grading  
10. Revision clouds + issue history  
11. PDF underlay calibrate/trace  
12. Wall type library tied to assemblies

### Nice / later (Wave 4 / skip unless client-driven)

- Full MEP overlays, timber framing mode, scan-to-plan AI, spiral stairs, 3DS-only pipelines  
- Photoreal materials catalog at Plan7 object-pack scale  

---

## 5. Decision: Wave 4 items

| Item | Decision | Rationale |
|---|---|---|
| Spiral stairs | **Skip** | Rare in Olsen ranch/custom; straight + L later |
| Window muntins | **Defer** | Cosmetic; schedules matter more |
| Timber / Holzkonstruktion | **Skip** | Viz niche; not permit-critical |
| Solar arrays | **Defer** | Add as roof host props when energy packages need it |
| MEP planning | **Skip** | Hand off to consultant tools; symbol layer only if needed |
| Scan recognition AI | **Research spike** | High value for remodel; not Wave 4 ship |
| Walkthrough video | **Hand-off** | Screen record / Twinmotion via glTF |
| 3DS export | **Skip** | glTF covers viz |

---

## 6. What we shipped in this phase (Wave 3 finish)

- Dormers (place + 3D massing)  
- Section cut tool + 2D section SVG + sheet inclusion  
- Title block + multi-sheet HTML set (plan / elev / section)  
- Multi-building (main + detached garage) with visibility  
- Approx terrain grade mesh  
- glTF export for viz handoff  
- Docs catalog tab + section PNG export  

Next architect-facing increments: door/window marks + schedules on sheets, scale bar/north arrow, true PDF print pipeline, associative dim polish.
