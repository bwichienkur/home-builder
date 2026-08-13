# Roomcraft / IKEA Studio feature-parity audit

Audit date: 2026-08-09 · shell/UI re-audit: 2026-08-13  
Reference: `https://www.ikea.com/addon-app/space/platform/latest/us/en/#/room/bedroom`  
Match plan + rebuild prompt: [`ikea-room-builder-match-plan.md`](./ikea-room-builder-match-plan.md)

This is a behavioral audit, not permission to copy IKEA branding, product data, imagery, source code, or proprietary assets. The reference is a client-rendered application; the matrix combines workflows observed in the supplied mobile captures with accessible live application states. **Complete** means the behavior is connected and tested in Roomcraft. **Partial** means useful behavior exists but is not yet equivalent. **Planned** is deliberately not represented as complete.

**2026-08-13 note:** Studio shell rebuilt to floating-chrome IA. Top view mounts Konva `FloorPlanEditor` + `Toolbar`. Furniture renders through `FurnitureVisual` → `CatalogModel` when `modelUrl` / `lowPolyModelUrl` exist, otherwise dimensional proxy. Inventory lives at `/admin`. Do not claim full IKEA parity while Planned/Partial rows remain.

| Area | Reference behavior | Room types | Roomcraft status | Required acceptance test | Status |
|---|---|---|---|---|---|
| Studio | One room shared by Top and 3D views | All | Shared Zustand scene | Edit in Top, switch to 3D, confirm identical state | Complete |
| Camera | Top view | All | Konva FloorPlanEditor mounted for view=2d | Top view opens Konva plan editor without resetting scene | Complete |
| Camera | Orbit 3D view | All | R3F orbit controls | Orbit, pan, pinch/scroll zoom | Complete |
| Camera | Eye-level/walkthrough | All | Walk camera mode | Enter walk mode and preserve room | Complete |
| Camera | Refocus room | All | View menu event | Move camera, Refocus restores room framing | Complete |
| Camera | Focus selected wall/floor | All | Raycast focus event | Tap surface and confirm camera target changes | Complete |
| Camera | Smooth animated focus transition | All | Immediate focus | Camera interpolates rather than jumps | Partial |
| Layout | Rectangular room template | All | Rectangle/wide templates | Apply template and detect one room | Complete |
| Layout | L-shaped room | All | L-shape template | Apply and detect non-rectangular polygon | Complete |
| Layout | Free irregular room | All | Connected wall drawing | Draw six-segment closed room | Complete |
| Layout | Exact wall measurement entry | All | Numeric wall editor | Enter length and verify geometry | Complete |
| Layout | Imperial and metric units | All | Metric only | Toggle units and round-trip equivalent lengths | Planned |
| Layout | Tap measurement to edit | All | Wall selection opens editor | Tap label directly and focus input | Partial |
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
| Openings | Open passage | All | Data type reserved | Place passage with no door leaf | Planned |
| Openings | Drag opening along wall | All | Range/property control | Drag directly in Top view | Partial |
| Openings | Exact width/height/sill | All | Width; height/sill stored | Edit all values from contextual panel | Partial |
| Openings | Door swing direction | All | Data type reserved | Toggle left/right and render arc/leaf | Planned |
| Openings | Invalid overlap feedback | All | Not implemented | Prevent overlapping openings | Planned |
| Surfaces | Select wall in 3D | All | Highlight + drawer | Tap wall on mobile; no blank screen | Complete |
| Surfaces | Select floor in 3D | All | Focus + finishes | Tap floor and change finish | Complete |
| Surfaces | Select ceiling | All | No selectable ceiling | Select ceiling and edit applicable finish | Planned |
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
| Catalog | Virtualized large catalog | All | DOM list | 5,000 SKUs without rendering every card | Planned |
| Placement | Desktop drag/drop | All | HTML drag into 3D | Drop at cursor floor point | Complete |
| Placement | Mobile tap-to-add | All | Add and switch to 3D | Add then position by touch | Complete |
| Placement | Touch drag | All | Floor-plane drag | Drag without moving camera/page | Complete |
| Placement | Grid snap | All | 25 cm commit snap | Release product and verify coordinates | Complete |
| Placement | Wall/surface snap | Applicable items | Not implemented | Wall product aligns and mounts | Planned |
| Placement | Object smart guides | All | Not implemented | Show alignment and distance guides | Planned |
| Placement | Rotate | All | Pivot/range control | Rotate and undo | Complete |
| Placement | Exact position | All | Numeric properties | Enter X/Z and verify | Complete |
| Placement | Duplicate/delete | All | Commands | Duplicate/delete and undo | Complete |
| Placement | Collision feedback | All | Red overlap color | Overlap two products | Complete |
| Placement | Clearance visualization | All | Schema only | Toggle required clearance volume | Planned |
| Placement | Measurements around product | All | Dimensions in catalog | Show in-scene measurements on selection | Partial |
| Pricing | Running product total | All | Header summary | Add priced item and update total | Complete |
| Pricing | Itemized list / quantities | All | No dedicated BOM UI | Group repeated SKUs and total quantities | Planned |
| Pricing | Price units and verification date | All | Import/catalog metadata | Display unit/date and warning | Complete |
| Pricing | Cost/labor/waste/tax/markup | All | Import metadata only | Calculate estimate assumptions visibly | Planned |
| Pricing | Missing-price warning | All | Dealer/design text | Missing price never counts as zero without warning | Partial |
| Pricing | Export bill of materials | All | Project JSON only | Export vendor/room grouped CSV/XLSX | Planned |
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
| Projects | Autosave/recovery | All | Manual save | Recover latest edits after refresh | Planned |
| Projects | Save as / design library | All | API primitives | Create two named versions | Planned |
| Projects | Share link/design code | All | Web Share URL only | Open code on second device | Planned |
| Projects | JSON export/import | All | Export only | Export then import identical scene | Partial |
| Projects | Undo/redo everywhere | All | Scene history | Geometry/product/finish operations undo | Complete |
| Mobile | 44 px targets | All | Major controls enlarged | Touch audit at 390×844 | Complete |
| Mobile | Tap versus drag distinction | All | Gesture threshold | Tap creates no dragged wall | Complete |
| Mobile | Pinch does not create walls | All | Primary tap guard | Pinch leaves geometry unchanged | Complete |
| Mobile | Safe areas/no initial zoom | All | Mobile CSS/viewport | iPhone portrait load | Complete |
| Mobile | No blank screen after selections | All | Error boundary/selection fixes | Repeat 50 wall selections | Complete |
| Performance | Demand rendering | All | R3F demand loop | Idle scene stops rendering | Complete |
| Performance | Lazy 3D assets | All | Scene-only models | Catalog thumbnails never mount WebGL | Complete |
| Performance | BVH/frustum culling | All | BVH/default culling | Raycast dense scene | Complete |
| Performance | Worker geometry/collisions | All | Worker scaffold | Heavy polygon ops run off-main-thread | Partial |

## Release gate

Roomcraft must not be described as having full IKEA functional parity while rows remain **Partial** or **Planned**. The current release provides a strong room-layout and product-placement core plus the first operational vendor inventory import. The remaining highest-risk work is sloped ceilings, opening manipulation, mounted/surface products, product variants, BOM estimating, project collaboration, and server-side import history/rollback.
