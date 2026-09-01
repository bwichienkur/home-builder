import { useMemo, useRef, useState } from 'react';
import {
  buildCadPlateFromDxf,
  demoCadPlate,
  extrudeCadPlate,
  renderCadElevationSvg,
  deleteSelection,
  selectionSummary,
  withLayerVisibility,
  type CadEditTool,
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
        const plate = buildCadPlateFromDxf(result.dxfText, file.name, {
          sheets: result.package.sheets,
          pdfUrl: result.package.pdfUrl,
          sheetSource: result.package.sheetSource === 'pdf' ? 'pdf' : 'dxf_viewport',
        });
        setPlate({
          ...plate,
          warnings: [...result.package.warnings, ...plate.warnings],
        });
      } else {
        throw new Error('Use a .dxf or .dwg file.');
      }
      setView('plate');
      setPlateMode('floor');
      setSheetId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const hasFrontElev = !!plate?.elevationFront?.segments.length;
  const hasSideElev = !!plate?.elevationSide?.segments.length;

  return (
    <div className="cad-studio">
      <header className="cad-studio-top">
        <div className="cad-studio-brand">
          <h1>CAD Studio</h1>
          <p>CAD plate is source of truth — layers, overlay, then extrude. Parallel to Plan Engine.</p>
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
          <section>
            <h2>Layers</h2>
            {plate?.layers.length ? (
              <ul className="cad-layer-list">
                {plate.layers.map((layer) => (
                  <li key={layer.name}>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => toggleLayer(layer.name)}
                      aria-label={`Toggle ${layer.name}`}
                    />
                    <span title={layer.name}>{layer.name}</span>
                    <span className="role">
                      {layer.kind}/{layer.role} · {layer.segmentCount}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cad-empty" style={{ padding: 0, textAlign: 'left' }}>
                No CAD layers yet. Import a DXF or load Demo ranch.
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
              Click a wall to see its length. Drag labels, fixtures, doors, and wall endpoints in Select mode.
              Add-wall and Add-door: click start, then end. Edits update Extrude 3D live.
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
                {plate.warnings.slice(0, 8).map((warning) => (
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
