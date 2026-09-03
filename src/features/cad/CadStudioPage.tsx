import { useMemo, useRef, useState } from 'react';
import {
  buildCadPlateFromDxf,
  demoCadPlate,
  deleteSelection,
  extrudeCadPlate,
  hideNonFloorPreset,
  removeLayer,
  renderCadElevationSvg,
  roleToClassify,
  selectionSummary,
  setLayerClassify,
  showWallsAndDoorsPreset,
  withLayerVisibility,
  type CadEditTool,
  type CadLayerClassify,
  type CadPlateSelection,
} from '../../lib/cadStudio';
import type { CadFixtureKind, CadPlate } from '../../lib/cadStudio/types';
import { CadPlateEditor } from './CadPlateEditor';
import { importDrawingFiles, type DrawingImportProgress } from '../../lib/housePlans/importDrawingFile';
import { CadExtrudeView } from './CadExtrudeView';
import { CadMassingView } from './CadMassingView';
import { pdfViewerSrc, stillwaterCadSheetPlate } from './stillwaterCad';
import './cadStudio.css';

type LayoutMode = 'split' | 'plate' | 'extrude' | 'massing' | 'sheets';
type PlateMode = 'floor' | 'front' | 'side';
type CatalogTab = 'walls' | 'openings' | 'fixtures' | 'layers' | 'site' | 'roof';
type OpeningKind = 'door' | 'window';

const CLASSIFY_OPTIONS: { id: CadLayerClassify; label: string }[] = [
  { id: 'wall', label: 'Wall' },
  { id: 'door', label: 'Door' },
  { id: 'fixture', label: 'Fixture' },
  { id: 'soft', label: 'Soft' },
  { id: 'dim', label: 'Dim' },
  { id: 'ignore', label: 'Ignore' },
  { id: 'other', label: 'Other' },
];

const CATALOG_TABS: { id: CatalogTab; label: string }[] = [
  { id: 'walls', label: 'Walls' },
  { id: 'openings', label: 'Openings' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'layers', label: 'Layers' },
  { id: 'site', label: 'Site' },
  { id: 'roof', label: 'Roof' },
];

function progressLabel(p: DrawingImportProgress | null): string {
  if (!p) return '';
  if (p.stage === 'reading') return `Reading ${p.detail ?? 'file'}…`;
  if (p.stage === 'converting') return 'Converting DWG → DXF…';
  if (p.stage === 'parsing') return 'Building CAD plate…';
  return 'Done';
}

export function CadStudioPage() {
  const [plate, setPlate] = useState<CadPlate | null>(() => demoCadPlate());
  const [layout, setLayout] = useState<LayoutMode>('split');
  const [plateMode, setPlateMode] = useState<PlateMode>('floor');
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('walls');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DrawingImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [editTool, setEditTool] = useState<CadEditTool>('select');
  const [fixtureKind, setFixtureKind] = useState<CadFixtureKind>('sink');
  const [openingKind, setOpeningKind] = useState<OpeningKind>('door');
  const [wallLayer, setWallLayer] = useState('WALLS EXT');
  const [selection, setSelection] = useState<CadPlateSelection | null>(null);
  const [layerFilter, setLayerFilter] = useState('');
  const [snapOn, setSnapOn] = useState(true);
  const [unitLabel] = useState<'ft-in' | 'm'>('ft-in');
  const fileRef = useRef<HTMLInputElement>(null);

  const visibility = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const layer of plate?.layers ?? []) map[layer.name] = layer.visible;
    return map;
  }, [plate]);

  const visibleLayerSet = useMemo(
    () => new Set(plate?.layers.filter((l) => l.visible).map((l) => l.name) ?? []),
    [plate],
  );

  const plateSvg = useMemo(() => {
    if (!plate) return null;
    if (plateMode === 'front' && plate.elevationFront) {
      return renderCadElevationSvg(plate.elevationFront, {
        title: plate.elevationFront.name,
        visibleLayers: visibleLayerSet,
      });
    }
    if (plateMode === 'side' && plate.elevationSide) {
      return renderCadElevationSvg(plate.elevationSide, {
        title: plate.elevationSide.name,
        visibleLayers: visibleLayerSet,
      });
    }
    return null;
  }, [plate, plateMode, visibleLayerSet]);

  const extrusion = useMemo(() => (plate ? extrudeCadPlate(plate) : null), [plate]);

  const storySheets = useMemo(
    () => plate?.sheets.filter((s) => s.kind === 'floor' || s.kind === 'elevation') ?? [],
    [plate],
  );

  const activeSheet =
    plate?.sheets.find((s) => s.id === sheetId) ??
    plate?.sheets.find((s) => s.kind === 'floor') ??
    plate?.sheets[0] ??
    null;

  const filteredLayers = useMemo(() => {
    const q = layerFilter.trim().toLowerCase();
    const list = plate?.layers ?? [];
    if (!q) return list;
    return list.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.role.includes(q) ||
        l.kind.includes(q) ||
        roleToClassify(l.role, l.kind, l.name).includes(q),
    );
  }, [plate, layerFilter]);

  const toggleLayer = (name: string) => {
    if (!plate) return;
    setPlate(withLayerVisibility(plate, { ...visibility, [name]: !visibility[name] }));
  };

  const pickTool = (tool: CadEditTool, opts?: { wallLayer?: string; opening?: OpeningKind; fixture?: CadFixtureKind }) => {
    setEditTool(tool);
    setSelection(null);
    if (opts?.wallLayer) setWallLayer(opts.wallLayer);
    if (opts?.opening) setOpeningKind(opts.opening);
    if (opts?.fixture) setFixtureKind(opts.fixture);
    if (layout === 'massing' || layout === 'sheets') setLayout('split');
  };

  const onImportFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.dxf')) {
        setProgress({ stage: 'parsing', detail: file.name });
        const text = await file.text();
        setPlate(buildCadPlateFromDxf(text, file.name));
      } else if (lower.endsWith('.dwg')) {
        const result = await importDrawingFiles(
          { drawing: file },
          { planName: file.name.replace(/\.dwg$/i, ''), onProgress: setProgress },
        );
        const next = buildCadPlateFromDxf(result.dxfText, file.name, {
          sheets: result.package.sheets,
          pdfUrl: result.package.pdfUrl,
          sheetSource: result.package.sheetSource === 'pdf' ? 'pdf' : 'dxf_viewport',
        });
        setPlate({
          ...next,
          warnings: [...result.package.warnings, ...next.warnings],
        });
      } else {
        throw new Error('Use a .dxf or .dwg file.');
      }
      setLayout('split');
      setPlateMode('floor');
      setCatalogTab('layers');
      setSheetId(null);
      setSelection(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const hasFrontElev = !!plate?.elevationFront?.segments.length;
  const hasSideElev = !!plate?.elevationSide?.segments.length;
  const visibleCount = plate?.layers.filter((l) => l.visible).length ?? 0;
  const layerCount = plate?.layers.length ?? 0;
  const show2d = layout === 'split' || layout === 'plate';
  const show3d = (layout === 'split' || layout === 'extrude') && !!extrusion;
  const can3d = !!plate?.wallCenterlines.length;

  const renderFloorPane = () => {
    if (plateMode === 'floor' && plate?.segments.length) {
      return (
        <CadPlateEditor
          plate={plate}
          tool={editTool}
          fixtureKind={fixtureKind}
          openingKind={openingKind}
          wallLayer={wallLayer}
          selection={selection}
          onSelectionChange={setSelection}
          onPlateChange={setPlate}
        />
      );
    }
    if (plateSvg) {
      return <div className="cad-plate-svg" dangerouslySetInnerHTML={{ __html: plateSvg }} />;
    }
    return (
      <div className="cad-empty">
        {plateMode === 'floor'
          ? 'Import a DXF/DWG to see the exact floor plate overlay, or load Demo ranch.'
          : 'No elevation viewport detected for this drawing.'}
      </div>
    );
  };

  return (
    <div className="cad-studio">
      <header className="cad-studio-top">
        <div className="cad-studio-brand">
          <h1>CAD Studio</h1>
          <p>Catalog · 2D plan · live 3D — import DXF layers, draw, rebuild.</p>
        </div>
        <div className="cad-studio-actions">
          <label className="cad-file-btn">
            {busy ? 'Importing…' : 'Import DXF / DWG'}
            <input
              ref={fileRef}
              type="file"
              accept=".dxf,.dwg"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setPlate(demoCadPlate());
              setLayout('split');
              setPlateMode('floor');
              setCatalogTab('walls');
              setSelection(null);
            }}
          >
            Demo ranch
          </button>
          <button
            type="button"
            onClick={() => {
              setPlate(stillwaterCadSheetPlate());
              setLayout('sheets');
            }}
          >
            Stillwater sheets
          </button>
          <span className="cad-action-sep" aria-hidden />
          <button type="button" className={layout === 'split' ? 'is-active' : ''} onClick={() => setLayout('split')}>
            2D + 3D
          </button>
          <button type="button" className={layout === 'plate' ? 'is-active' : ''} onClick={() => setLayout('plate')}>
            2D only
          </button>
          <button
            type="button"
            className={layout === 'extrude' ? 'is-active' : ''}
            onClick={() => setLayout('extrude')}
            disabled={!can3d}
          >
            3D only
          </button>
          <button
            type="button"
            className={layout === 'massing' ? 'is-active' : ''}
            onClick={() => setLayout('massing')}
            disabled={!can3d}
          >
            Massing
          </button>
          <button
            type="button"
            className={layout === 'sheets' ? 'is-active' : ''}
            onClick={() => setLayout('sheets')}
            disabled={!plate?.sheets.length}
          >
            Sheets
          </button>
        </div>
        <div className="cad-status">{error ? <span className="cad-error">{error}</span> : progressLabel(progress)}</div>
      </header>

      <div className="cad-studio-body cad-studio-body-shell">
        <aside className="cad-catalog" aria-label="Catalog">
          <div className="cad-catalog-tabs" role="tablist">
            {CATALOG_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={catalogTab === tab.id}
                className={catalogTab === tab.id ? 'is-active' : ''}
                onClick={() => setCatalogTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="cad-catalog-body">
            {catalogTab === 'walls' && (
              <section>
                <h2>Wall catalog</h2>
                <div className="cad-catalog-items">
                  <button
                    type="button"
                    className={editTool === 'wall' && wallLayer === 'WALLS EXT' ? 'is-active' : ''}
                    onClick={() => pickTool('wall', { wallLayer: 'WALLS EXT' })}
                  >
                    <strong>Exterior wall</strong>
                    <span>Thick · WALLS EXT</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'wall' && wallLayer === 'WALLS INT' ? 'is-active' : ''}
                    onClick={() => pickTool('wall', { wallLayer: 'WALLS INT' })}
                  >
                    <strong>Interior wall</strong>
                    <span>Thin · WALLS INT</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'select' ? 'is-active' : ''}
                    onClick={() => pickTool('select')}
                  >
                    <strong>Select / move</strong>
                    <span>Edit endpoints & length</span>
                  </button>
                  <button type="button" className={editTool === 'delete' ? 'is-active' : ''} onClick={() => pickTool('delete')}>
                    <strong>Delete</strong>
                    <span>Remove selected geometry</span>
                  </button>
                </div>
                <p className="cad-edit-hint">Click start, then end on the 2D plan. Escape cancels a draft line.</p>
              </section>
            )}

            {catalogTab === 'openings' && (
              <section>
                <h2>Openings</h2>
                <div className="cad-catalog-items">
                  <button
                    type="button"
                    className={editTool === 'opening' && openingKind === 'door' ? 'is-active' : ''}
                    onClick={() => pickTool('opening', { opening: 'door' })}
                  >
                    <strong>Door</strong>
                    <span>Place on a wall span</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'opening' && openingKind === 'window' ? 'is-active' : ''}
                    onClick={() => pickTool('opening', { opening: 'window' })}
                  >
                    <strong>Window</strong>
                    <span>Sill editable later · place span</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'select' ? 'is-active' : ''}
                    onClick={() => pickTool('select')}
                  >
                    <strong>Select / move</strong>
                    <span>Drag opening center</span>
                  </button>
                </div>
              </section>
            )}

            {catalogTab === 'fixtures' && (
              <section>
                <h2>Fixtures</h2>
                <div className="cad-catalog-items">
                  {(
                    [
                      ['sink', 'Sink'],
                      ['toilet', 'Toilet'],
                      ['tub', 'Tub'],
                      ['appliance', 'Appliance'],
                      ['counter', 'Counter'],
                      ['island', 'Island'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={editTool === 'fixture' && fixtureKind === id ? 'is-active' : ''}
                      onClick={() => pickTool('fixture', { fixture: id })}
                    >
                      <strong>{label}</strong>
                      <span>Click to place on plan</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {catalogTab === 'layers' && (
              <section className="cad-layer-panel">
                <h2>Layers</h2>
                <p className="cad-layer-summary">
                  {visibleCount} visible · {layerCount} total · rebuilds walls on change
                </p>
                <div className="cad-layer-presets">
                  <button type="button" disabled={!plate} onClick={() => plate && setPlate(hideNonFloorPreset(plate))}>
                    Hide dims / roof / noise
                  </button>
                  <button type="button" disabled={!plate} onClick={() => plate && setPlate(showWallsAndDoorsPreset(plate))}>
                    Walls + doors only
                  </button>
                  <button
                    type="button"
                    disabled={!plate}
                    onClick={() => {
                      if (!plate) return;
                      const allOn: Record<string, boolean> = {};
                      for (const l of plate.layers) allOn[l.name] = true;
                      setPlate(withLayerVisibility(plate, allOn));
                    }}
                  >
                    Show all
                  </button>
                </div>
                <label className="cad-layer-filter">
                  <span className="sr-only">Filter layers</span>
                  <input
                    type="search"
                    placeholder="Filter layers…"
                    value={layerFilter}
                    onChange={(e) => setLayerFilter(e.target.value)}
                  />
                </label>
                {filteredLayers.length ? (
                  <ul className="cad-layer-list">
                    {filteredLayers.map((layer) => {
                      const classify = roleToClassify(layer.role, layer.kind, layer.name);
                      return (
                        <li key={layer.name} className={layer.visible ? '' : 'is-off'}>
                          <input
                            type="checkbox"
                            checked={layer.visible}
                            onChange={() => toggleLayer(layer.name)}
                            aria-label={`Toggle ${layer.name}`}
                          />
                          <div className="cad-layer-meta">
                            <span className="cad-layer-name" title={layer.name}>
                              {layer.name}
                            </span>
                            <span className="role">
                              {layer.kind} · {layer.segmentCount}
                            </span>
                          </div>
                          <select
                            className="cad-layer-classify"
                            value={classify}
                            aria-label={`Classify ${layer.name}`}
                            onChange={(e) => {
                              if (!plate) return;
                              setPlate(setLayerClassify(plate, layer.name, e.target.value as CadLayerClassify));
                            }}
                          >
                            {CLASSIFY_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="cad-layer-remove"
                            title={`Remove ${layer.name}`}
                            aria-label={`Remove ${layer.name}`}
                            onClick={() => {
                              if (!plate) return;
                              setPlate(removeLayer(plate, layer.name));
                            }}
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="cad-empty" style={{ padding: 0, textAlign: 'left' }}>
                    {plate ? 'No layers match this filter.' : 'Import a DXF or load Demo ranch.'}
                  </p>
                )}
              </section>
            )}

            {catalogTab === 'site' && (
              <section>
                <h2>Site</h2>
                <p className="cad-edit-hint">
                  Terrace, driveway, garden, and balcony slabs are on the Wave 1–2 roadmap (Plan7 plate
                  tool). Use Layers for now to hide site noise from DXF imports.
                </p>
                <button type="button" className="cad-catalog-soon" disabled>
                  Slab / terrace (coming soon)
                </button>
              </section>
            )}

            {catalogTab === 'roof' && (
              <section>
                <h2>Roof</h2>
                <p className="cad-edit-hint">
                  Auto roof from contour, gables, overhang, and dormers are Wave 2–3. Massing view uses
                  the current elevation-driven roof today.
                </p>
                <button type="button" onClick={() => setLayout('massing')} disabled={!can3d}>
                  Open massing roof view
                </button>
              </section>
            )}

            <section className="cad-inspector">
              <h2>Properties</h2>
              {selection && plate ? (
                <div className="cad-selection-inspector">
                  <div className="cad-selection-title">{selectionSummary(plate, selection)}</div>
                  <button
                    type="button"
                    className="cad-delete-btn"
                    onClick={() => {
                      setPlate(deleteSelection(plate, selection));
                      setSelection(null);
                    }}
                  >
                    Delete selected
                  </button>
                </div>
              ) : (
                <p className="cad-edit-hint">Select a wall, door, fixture, or label on the 2D plan.</p>
              )}
              <div className="cad-stats">
                <div>File: {plate?.sourceFileName ?? '—'}</div>
                <div>Walls: {plate?.wallCenterlines.length ?? 0}</div>
                <div>Openings: {plate?.openingHints.length ?? 0}</div>
                <div>Fixtures: {plate?.segments.filter((s) => s.role === 'fixture').length ?? 0}</div>
                <div>3D fixtures: {extrusion?.fixtures.length ?? 0}</div>
                <div>Tool: {editTool}{editTool === 'wall' ? ` · ${wallLayer}` : ''}{editTool === 'opening' ? ` · ${openingKind}` : ''}</div>
              </div>
              {!!plate?.warnings.length && (
                <ul className="cad-warnings">
                  {plate.warnings.slice(0, 6).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </aside>

        <div className="cad-workspace">
          {(show2d || show3d || layout === 'massing') && (
            <div className="cad-story-bar" aria-label="Stories and aids">
              <div className="cad-story-list">
                <span className="cad-story-label">Stories</span>
                {storySheets.length ? (
                  storySheets.map((sheet) => (
                    <button
                      key={sheet.id}
                      type="button"
                      className={activeSheet?.id === sheet.id ? 'is-active' : ''}
                      onClick={() => {
                        setSheetId(sheet.id);
                        if (sheet.kind === 'elevation') {
                          setPlateMode(/side|left|right/i.test(sheet.name) ? 'side' : 'front');
                          setLayout(layout === 'extrude' ? 'split' : layout === 'massing' ? 'split' : layout);
                        } else {
                          setPlateMode('floor');
                        }
                      }}
                    >
                      {sheet.name}
                    </button>
                  ))
                ) : (
                  <span className="cad-story-empty">Floor 1 (active)</span>
                )}
              </div>
              <div className="cad-aid-toggles">
                <button
                  type="button"
                  className={snapOn ? 'is-active' : ''}
                  onClick={() => setSnapOn((v) => !v)}
                  title="Snap preference (endpoint snap in editor follows selection)"
                >
                  Snap {snapOn ? 'on' : 'off'}
                </button>
                <span className="cad-unit-pill">{unitLabel === 'ft-in' ? 'ft / in' : 'm'}</span>
                <span className="cad-aid-hint">W · wall align · Esc cancel</span>
              </div>
            </div>
          )}

          <main
            className={`cad-main ${layout === 'split' ? 'cad-main-split' : ''} ${layout === 'sheets' ? 'cad-main-sheets' : ''}`}
          >
            {show2d && (
              <div className="cad-plate-host">
                <div className="cad-plate-tabs">
                  <button
                    type="button"
                    className={plateMode === 'floor' ? 'is-active' : ''}
                    onClick={() => setPlateMode('floor')}
                  >
                    Floor plan
                  </button>
                  <button
                    type="button"
                    className={plateMode === 'front' ? 'is-active' : ''}
                    onClick={() => setPlateMode('front')}
                    disabled={!hasFrontElev}
                  >
                    Front elevation
                  </button>
                  <button
                    type="button"
                    className={plateMode === 'side' ? 'is-active' : ''}
                    onClick={() => setPlateMode('side')}
                    disabled={!hasSideElev}
                  >
                    Side elevation
                  </button>
                </div>
                <div className="cad-pane-scroll">{renderFloorPane()}</div>
              </div>
            )}

            {show3d && extrusion && (
              <div className="cad-extrude-host" aria-label="Live 3D">
                <div className="cad-pane-label">3D</div>
                <CadExtrudeView extrusion={extrusion} />
              </div>
            )}

            {layout === 'massing' && extrusion && (
              <div className="cad-extrude-host">
                <CadMassingView extrusion={extrusion} />
              </div>
            )}

            {layout === 'sheets' && plate && (
              <div className="cad-sheets-host">
                <div className="cad-sheet-list">
                  {plate.sheets.map((sheet) => (
                    <button
                      key={sheet.id}
                      type="button"
                      className={activeSheet?.id === sheet.id ? 'is-active' : ''}
                      onClick={() => setSheetId(sheet.id)}
                    >
                      {sheet.name}
                      <div className="cad-status">{sheet.kind}</div>
                    </button>
                  ))}
                </div>
                <div className="cad-sheet-view">
                  {activeSheet && plate.pdfUrl && activeSheet.pdfPageIndex != null ? (
                    <iframe title={activeSheet.name} src={pdfViewerSrc(plate.pdfUrl, activeSheet.pdfPageIndex)} />
                  ) : activeSheet?.imageUrl ? (
                    <img src={activeSheet.imageUrl} alt={activeSheet.name} />
                  ) : activeSheet?.svg ? (
                    <div dangerouslySetInnerHTML={{ __html: activeSheet.svg }} />
                  ) : (
                    <div className="cad-empty">No preview for this sheet.</div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
