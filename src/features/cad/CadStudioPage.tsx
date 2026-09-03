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

type ViewMode = 'plate' | 'extrude' | 'massing' | 'sheets';
type PlateMode = 'floor' | 'front' | 'side';

const CLASSIFY_OPTIONS: { id: CadLayerClassify; label: string }[] = [
  { id: 'wall', label: 'Wall' },
  { id: 'door', label: 'Door' },
  { id: 'fixture', label: 'Fixture' },
  { id: 'soft', label: 'Soft' },
  { id: 'dim', label: 'Dim' },
  { id: 'ignore', label: 'Ignore' },
  { id: 'other', label: 'Other' },
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
  const [view, setView] = useState<ViewMode>('plate');
  const [plateMode, setPlateMode] = useState<PlateMode>('floor');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DrawingImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [editTool, setEditTool] = useState<CadEditTool>('select');
  const [fixtureKind, setFixtureKind] = useState<CadFixtureKind>('sink');
  const [selection, setSelection] = useState<CadPlateSelection | null>(null);
  const [layerFilter, setLayerFilter] = useState('');
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
      setView('plate');
      setPlateMode('floor');
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

  return (
    <div className="cad-studio">
      <header className="cad-studio-top">
        <div className="cad-studio-brand">
          <h1>CAD Studio</h1>
          <p>
            Import every DXF/DWG layer — hide, remove, or classify — then rebuild the floor plate and
            3D.
          </p>
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
              setView('plate');
              setPlateMode('floor');
              setSelection(null);
            }}
          >
            Demo ranch
          </button>
          <button
            type="button"
            onClick={() => {
              setPlate(stillwaterCadSheetPlate());
              setView('sheets');
            }}
          >
            Stillwater sheets
          </button>
          <button type="button" className={view === 'plate' ? 'is-active' : ''} onClick={() => setView('plate')}>
            Plate
          </button>
          <button
            type="button"
            className={view === 'extrude' ? 'is-active' : ''}
            onClick={() => setView('extrude')}
            disabled={!plate?.wallCenterlines.length}
          >
            Extrude 3D
          </button>
          <button
            type="button"
            className={view === 'massing' ? 'is-active' : ''}
            onClick={() => setView('massing')}
            disabled={!plate?.wallCenterlines.length}
          >
            Massing
          </button>
          <button
            type="button"
            className={view === 'sheets' ? 'is-active' : ''}
            onClick={() => setView('sheets')}
            disabled={!plate?.sheets.length}
          >
            Sheets
          </button>
        </div>
        <div className="cad-status">{error ? <span className="cad-error">{error}</span> : progressLabel(progress)}</div>
      </header>

      <div className="cad-studio-body">
        <aside className="cad-side">
          <section className="cad-layer-panel">
            <h2>Layers</h2>
            <p className="cad-layer-summary">
              {visibleCount} visible · {layerCount} total · walls rebuild when you change layers
            </p>
            <div className="cad-layer-presets">
              <button
                type="button"
                disabled={!plate}
                onClick={() => plate && setPlate(hideNonFloorPreset(plate))}
              >
                Hide dims / roof / noise
              </button>
              <button
                type="button"
                disabled={!plate}
                onClick={() => plate && setPlate(showWallsAndDoorsPreset(plate))}
              >
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

          <section>
            <h2>Edit plan</h2>
            <div className="cad-edit-tools">
              {(
                [
                  ['select', 'Select / move'],
                  ['wall', 'Add wall'],
                  ['opening', 'Add door'],
                  ['fixture', 'Add fixture'],
                  ['delete', 'Delete'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={editTool === id ? 'is-active' : ''}
                  onClick={() => {
                    setEditTool(id);
                    setSelection(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {editTool === 'fixture' && (
              <label className="cad-fixture-pick">
                Fixture type
                <select
                  value={fixtureKind}
                  onChange={(e) => setFixtureKind(e.target.value as CadFixtureKind)}
                >
                  <option value="sink">Sink</option>
                  <option value="toilet">Toilet</option>
                  <option value="tub">Tub</option>
                  <option value="appliance">Stove / appliance</option>
                  <option value="counter">Counter</option>
                  <option value="island">Island</option>
                </select>
              </label>
            )}
            {selection && plate && (
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
            )}
            <p className="cad-edit-hint">
              Classify layers as Wall or Door to rebuild the plate and Extrude 3D. Dim / Ignore stay
              out of the model.
            </p>
          </section>

          <section>
            <h2>Plate</h2>
            <div className="cad-stats">
              <div>File: {plate?.sourceFileName ?? '—'}</div>
              <div>Walls: {plate?.wallCenterlines.length ?? 0}</div>
              <div>Openings: {plate?.openingHints.length ?? 0}</div>
              <div>Fixtures: {plate?.segments.filter((s) => s.role === 'fixture').length ?? 0}</div>
              <div>3D fixtures: {extrusion?.fixtures.length ?? 0}</div>
              <div>Front elev: {plate?.elevationFront?.segments.length ?? 0} segs</div>
              <div>Side elev: {plate?.elevationSide?.segments.length ?? 0} segs</div>
              <div>Roof: {extrusion?.massing.roof.style ?? '—'}</div>
              <div>Ridge: {extrusion ? `${extrusion.massing.roof.ridgeHeightM.toFixed(1)} m` : '—'}</div>
              <div>Soft borders: {plate?.segments.filter((s) => s.role === 'soft').length ?? 0}</div>
              <div>Labels: {plate?.labels?.length ?? 0}</div>
              <div>Vectors: {plate?.segments.length ?? 0}</div>
              <div>Sheets: {plate?.sheets.length ?? 0}</div>
            </div>
            {!!plate?.warnings.length && (
              <ul className="cad-warnings">
                {plate.warnings.slice(0, 10).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <main className="cad-main">
          {view === 'plate' && (
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
              {plateMode === 'floor' && plate?.segments.length ? (
                <CadPlateEditor
                  plate={plate}
                  tool={editTool}
                  fixtureKind={fixtureKind}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onPlateChange={setPlate}
                />
              ) : plateSvg ? (
                <div className="cad-plate-svg" dangerouslySetInnerHTML={{ __html: plateSvg }} />
              ) : (
                <div className="cad-empty">
                  {plateMode === 'floor'
                    ? 'Import a DXF/DWG to see the exact floor plate overlay, or load Demo ranch.'
                    : 'No elevation viewport detected for this drawing.'}
                </div>
              )}
            </div>
          )}

          {view === 'extrude' && extrusion && (
            <div className="cad-extrude-host">
              <CadExtrudeView extrusion={extrusion} />
            </div>
          )}

          {view === 'massing' && extrusion && (
            <div className="cad-extrude-host">
              <CadMassingView extrusion={extrusion} />
            </div>
          )}

          {view === 'sheets' && plate && (
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
  );
}
