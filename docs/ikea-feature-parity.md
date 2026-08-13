# Roomcraft / IKEA Studio feature-parity audit

Audit date: 2026-08-09 · shell/UI re-audit: 2026-08-13  
Reference: `https://www.ikea.com/addon-app/space/platform/latest/us/en/#/room/bedroom`  
Match plan + rebuild prompt: [`ikea-room-builder-match-plan.md`](./ikea-room-builder-match-plan.md)

This is a behavioral audit, not permission to copy IKEA branding, product data, imagery, source code, or proprietary assets. The reference is a client-rendered application; the matrix combines workflows observed in the supplied mobile captures with accessible live application states. **Complete** means the behavior is connected and tested in Roomcraft. **Partial** means useful behavior exists but is not yet equivalent. **Planned** is deliberately not represented as complete.

**2026-08-13 note:** Studio shell, mounting/guides/openings/share, and polish (ceiling finishes, in-scene dims, design library, collision worker, imperial length fields) are mounted. Do not claim full IKEA parity while Planned/Partial rows remain.

| Area | Reference behavior | Room types | Roomcraft status | Required acceptance test | Status |
|---|---|---|---|---|---|
| Studio | One room shared by Top and 3D views | All | Shared Zustand scene | Edit in Top, switch to 3D, confirm identical state | Complete |
| Camera | Top view | All | Flat bird’s-eye WebGL only (no Konva 2D plan); ceiling hidden | Top is 3D looking down; Edit room size opens inspector in Top | Complete |
| Products | Placement constraints | All | wall / wall-prefer / free via constrainPlacement | Mirrors slide on walls; storage docks near walls; beds move freely | Complete |
| Camera | Orbit 3D view | All | R3F orbit controls | Orbit, pan, pinch/scroll zoom | Complete |
| Camera | Eye-level/walkthrough | All | Walk camera mode | Enter walk mode and preserve room | Complete |
| Camera | Refocus room | All | View menu event | Move camera, Refocus restores room framing | Complete |
| Camera | Focus selected wall/floor | All | Raycast focus event | Tap surface and confirm camera target changes | Complete |
| Camera | Smooth animated focus transition | All | Eased CameraRig refocus | Camera interpolates rather than jumps | Complete |
| Layout | Rectangular room template | All | Rectangle/wide templates | Apply template and detect one room | Complete |
| Layout | L-shaped room | All | L-shape template | Apply and detect non-rectangular polygon | Complete |
| Layout | Free irregular room | All | Connected wall drawing | Draw six-segment closed room | Complete |
| Layout | Exact wall measurement entry | All | Numeric wall editor | Enter length and verify geometry | Complete |
| Layout | Imperial and metric units | All | unitSystem + formatLength/parseLength | Toggle units and round-trip equivalent lengths | Complete |
| Layout | Tap measurement to edit | All | Label select + autofocus WallQuickEditor | Tap label directly and focus input | Complete |
| Layout | Split wall/add corner | All | Split action | Split preserves openings and history | Complete |
| Layout | Move wall section perpendicular | All | 25 cm actions | Move segment and preserve attached corners | Complete |
| Layout | Drag connected corner | All | Endpoint handles | Drag corner and keep connected walls attached | Complete |
| Layout | Magnetic endpoint snapping | All | Grid/wall snap | Release near point and confirm exact connection | Complete |
| Layout | Auto-close room | All | Magnetic closing | Last endpoint near first closes exactly | Complete |
| Layout | Invalid/unclosed room feedback | All | Validation warning | Leave gap and see non-blocking warning | Complete |
| Layout | Room area | All | Polygon area | Known rectangle returns expected area | Complete |
| Layout | Wall thickness and height | All | Property inputs | Modify and verify 3D mesh | Complete |
| Layout | Ceiling height | All | Room designer | Change once and update all room walls | Complete |
| Layout | Sloped ceiling feature | Applicable rooms | No sloped mesh model | Add slope and verify height/depth/length | Planned |
| Layout | Multiple rooms | All | Geometry supports polygons | Detect and render two closed rooms | Partial |
| Layout | Multiple floors | All | Floor records | Switch floors without losing each scene | Complete |
| Openings | Door placement on wall | All | Door tool | Add door and verify 3D cutout | Complete |
| Openings | Window placement on wall | All | Window tool | Add window, sill, and glass | Complete |
| Openings | Open passage | All | Passage cutout + floor marker | Place passage with no door leaf | Complete |
| Openings | Drag opening along wall | All | WallShape drag in Top view | Drag directly in Top view | Complete |
| Openings | Exact width/height/sill | All | LengthField in inspector + quick editor | Edit all values from contextual panel | Complete |
| Openings | Door swing direction | All | 2D arc + 3D door leaf | Toggle left/right and render arc/leaf | Complete |
| Openings | Invalid overlap feedback | All | Conflict guard + notice | Prevent overlapping openings | Complete |
| Surfaces | Select wall in 3D | All | Highlight + drawer | Tap wall on mobile; no blank screen | Complete |
| Surfaces | Select floor in 3D | All | Focus + finishes | Tap floor and change finish | Complete |
| Surfaces | Select ceiling | All | Ceiling mesh + ceilingColor finish | Select ceiling and edit applicable finish | Complete |
| Finishes | Wall colors/materials | All | Swatches | Change and undo | Complete |
| Finishes | Floor colors/materials | All | Swatches | Change and undo | Complete |
| Finishes | Texture/material library | All | Solid colors | Apply scalable PBR texture | Planned |
| Catalog | Room-specific categories | All | Room-category mapping | Change room and exclude unrelated products | Complete |
| Catalog | Vendor filter | All | Vendor dropdown | Filter imported and built-in products | Complete |
| Catalog | Category filter | All | Category chips | Apply category and room filter together | Complete |
| Catalog | Search name/brand/SKU/tags | All | Search index in UI | Search imported SKU | Complete |
| Catalog | Sort name/price | All | Sort control | Verify missing prices sort safely | Complete |
| Catalog | Product counts | All | Result count | Count matches filtered cards | Complete |
| Catalog | Product images | All | Lazy external thumbnails | Image loads only when card enters list | Complete |
| Catalog | Product variants/options | All | Schema only | Change variant and update price/model | Planned |
| Catalog | Product information/source | All | Vendor link/note | Open official source in new tab | Complete |
| Catalog | Sellable/design-extra distinction | All | Import fields/badge | Placeholder clearly not represented as purchasable | Complete |
| Catalog | Virtualized large catalog | All | Progressive window (36+) + load more | 5,000 SKUs without rendering every card | Partial |
| Placement | Desktop drag/drop | All | HTML drag into 3D | Drop at cursor floor point | Complete |
| Placement | Ghost place → commit | All | pendingPlacement + translucent preview | Add from catalog, move ghost, click/Place to commit | Complete |
| Placement | Selection FABs | All | Rotate / info / edit / duplicate / delete | Select product and use floating action buttons | Complete |
| Catalog | Selected product card | All | Retail card with price, Modify, complements | Select product → see price and place related items | Complete |
| Camera | Animated Top ↔ 3D | All | Eased CameraRig pose lerp on mode change | Switch Top/3D and see smooth transition | Complete |
| Placement | Mobile tap-to-add | All | Begin ghost placement and switch to 3D | Add then position by touch | Complete |
| Placement | Touch drag | All | Floor-plane drag | Drag without moving camera/page | Complete |
| Placement | Grid snap | All | 25 cm commit snap | Release product and verify coordinates | Complete |
| Placement | Wall/surface snap | Applicable items | mountingType snap in placeFurniture | Wall product aligns and mounts | Complete |
| Placement | Object smart guides | All | alignmentGuides while selected/dragging | Show alignment and distance guides | Complete |
| Placement | Rotate | All | Pivot/range control | Rotate and undo | Complete |
| Placement | Exact position | All | Numeric properties | Enter X/Z and verify | Complete |
| Placement | Duplicate/delete | All | Commands | Duplicate/delete and undo | Complete |
| Placement | Collision feedback | All | Red overlap color | Overlap two products | Complete |
| Placement | Clearance visualization | All | showClearance plane in 3D | Toggle required clearance volume | Complete |
| Placement | Measurements around product | All | DimensionLabels in 3D on selection | Show in-scene measurements on selection | Complete |
| Pricing | Running product total | All | Header summary | Add priced item and update total | Complete |
| Pricing | Itemized list / quantities | All | BomDialog shopping list | Group repeated SKUs and total quantities | Complete |
| Pricing | Price units and verification date | All | Import/catalog metadata | Display unit/date and warning | Complete |
| Pricing | Cost/labor/waste/tax/markup | All | Import metadata only | Calculate estimate assumptions visibly | Planned |
| Pricing | Missing-price warning | All | BOM warning + menu quote count | Missing price never counts as zero without warning | Complete |
| Pricing | Export bill of materials | All | Vendor-grouped CSV from BomDialog | Export vendor/room grouped CSV/XLSX | Complete |
| Inventory | XLSX/CSV/JSON upload | Admin | Browser importer | Parse each format into same normalized preview | Partial |
| Inventory | Download template/example | Admin | Public XLSX files | Download and open both templates | Complete |
| Inventory | Header aliases/mapping | Admin | Common alias normalization | Import alternate common headers | Partial |
| Inventory | Row validation | Admin | Required-field validation | Invalid rows do not import | Complete |
| Inventory | Duplicate vendor + SKU | Admin | In-file and stored detection | No duplicate after re-import | Complete |
| Inventory | Create/update/replace modes | Admin | Three modes | Verify counts and results | Complete |
| Inventory | Dry-run preview | Admin | Preview before commit | No catalog change before Import | Complete |
| Inventory | Error report | Admin | CSV download | Errors contain source row and reasons | Complete |
| Inventory | Transactional server import | Admin | Normalized schema; endpoint pending | Roll back entire failed server batch | Planned |
| Inventory | Import history/rollback/audit | Admin | Database tables only | Restore previous vendor version | Planned |
| Assets | Placeholder from dimensions | All | ProxyFurniture via FurnitureVisual | Missing model still places exact dimensions | Complete |
| Assets | GLB/Draco/KTX2 | All | Loader + CatalogModel path | Load compressed test asset when URL present | Complete |
| Assets | Low-poly/full LOD | All | CatalogModel Detailed distances | Drag proxy, then full model when URLs present | Complete |
| Assets | Repeated SKU instancing | All | Per-item meshes (Instances removed for model path) | Six repeated SKUs share draw resources | Partial |
| Projects | Local save/load | All | Local storage | Save, refresh, load | Complete |
| Projects | Autosave/recovery | All | Recovery banner from roomcraft-recovery-v1 | Recover latest edits after refresh | Complete |
| Projects | Save as / design library | All | Design library list in project menu | Create two named versions | Complete |
| Projects | Share link/design code | All | Local design codes via ?design= | Open code on second device | Partial |
| Projects | JSON export/import | All | Export + Import file in menu | Export then import identical scene | Complete |
| Projects | Undo/redo everywhere | All | Scene history | Geometry/product/finish operations undo | Complete |
| Mobile | 44 px targets | All | Major controls enlarged | Touch audit at 390×844 | Complete |
| Mobile | Tap versus drag distinction | All | Gesture threshold | Tap creates no dragged wall | Complete |
| Mobile | Pinch does not create walls | All | Primary tap guard | Pinch leaves geometry unchanged | Complete |
| Mobile | Safe areas/no initial zoom | All | Mobile CSS/viewport | iPhone portrait load | Complete |
| Mobile | No blank screen after selections | All | Error boundary/selection fixes | Repeat 50 wall selections | Complete |
| Mobile | One panel at a time | All | Product card XOR inspector; catalog bottom sheet | Select product on 390px without dual side panels | Complete |
| Mobile | Selection affordance | All | Blue selection halo; red only for collisions | Selected item reads as selected, not error | Complete |
| Mobile | Gesture hint | All | First-session tip on coarse pointers | First load shows orbit/pinch/pan hint once | Complete |
| Performance | Demand rendering | All | R3F demand loop | Idle scene stops rendering | Complete |
| Performance | Lazy 3D assets | All | Scene-only models | Catalog thumbnails never mount WebGL | Complete |
| Performance | BVH/frustum culling | All | BVH/default culling | Raycast dense scene | Complete |
| Performance | Worker geometry/collisions | All | geometry.worker via collisionsAsync | Heavy polygon ops run off-main-thread | Complete |
| Performance | Throttled live drag/place | All | rafThrottle on updateLive + ghost move | Drag/place stays smooth on mobile | Complete |
| Performance | Mobile render budget | All | Lower DPR, no env map/shadows on coarse pointers | Phone orbit stays responsive | Complete |

## Release gate

Roomcraft must not be described as having full IKEA functional parity while rows remain **Partial** or **Planned**. Remaining highest-risk / larger gaps: sloped ceilings, PBR texture library, product variants, cost/labor estimating, multi-room UX, server-backed remix/import history, and true 5k-SKU windowed virtualization.
