import { useMemo, useRef, useState } from 'react';
import {
  buildCadPlateFromDxf,
  demoCadPlate,
  extrudeCadPlate,
  renderCadPlateSvg,
  withLayerVisibility,
  type CadPlate,
} from '../../lib/cadStudio';
import { importDrawingFiles, type DrawingImportProgress } from '../../lib/housePlans/importDrawingFile';
import { CadExtrudeView } from './CadExtrudeView';
import { pdfViewerSrc, stillwaterCadSheetPlate } from './stillwaterCad';
import './cadStudio.css';

type ViewMode = 'plate' | 'extrude' | 'sheets';

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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DrawingImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const visibility = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const layer of plate?.layers ?? []) map[layer.name] = layer.visible;
    return map;
  }, [plate]);

  const plateSvg = useMemo(() => {
    if (!plate?.segments.length) return null;
    return renderCadPlateSvg(plate, { title: plate.sourceFileName });
  }, [plate]);

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
        const floor = result.plan.floors[0];
        const segs = floor?.wallSegmentsFt ?? [];
        const hints = floor?.openingHintsFt ?? [];
        const vectors = floor?.cadPlanVectorsFt ?? [];
        if (!segs.length) {
          throw new Error('DWG import produced no wall segments. Try exporting DXF from CAD.');
        }
        setPlate({
          id: `cad-from-dwg-${result.plan.id}`,
          sourceFileName: file.name,
          importedAt: new Date().toISOString(),
          warnings: [...result.package.warnings, 'Plate built from DWG→DXF import wall segments.'],
          layers: [
            {
              name: 'WALLS',
              kind: 'floor',
              role: 'wall',
              visible: true,
              segmentCount: segs.length,
            },
          ],
          segments: [
            // Wall centerlines only — skip raw wall-role vectors (often unpaired
            // measurement / witness lines left on wall layers after DWG→DXF).
            ...segs.map((s) => ({
              x1: s.x1,
              y1: s.y1,
              x2: s.x2,
              y2: s.y2,
              layer: s.layer ?? 'WALLS',
              role: 'wall' as const,
            })),
            ...vectors
              .filter((v) => v.role !== 'wall')
              .map((v) => ({
                x1: v.x1,
                y1: v.y1,
                x2: v.x2,
                y2: v.y2,
                layer: v.layer ?? 'CAD',
                role:
                  v.role === 'opening' || v.role === 'fixture' || v.role === 'soft'
                    ? v.role
                    : ('other' as const),
              })),
          ],
          wallCenterlines: segs.map((s) => ({
            x1: s.x1,
            y1: s.y1,
            x2: s.x2,
            y2: s.y2,
            layer: s.layer,
            exterior: s.exterior,
          })),
          openingHints: hints.map((h) => ({
            x1: h.x1,
            y1: h.y1,
            x2: h.x2,
            y2: h.y2,
            kind: h.kind,
            layer: h.layer,
          })),
          sheets: result.package.sheets,
          bounds: {
            minX: Math.min(...segs.flatMap((s) => [s.x1, s.x2])),
            minY: Math.min(...segs.flatMap((s) => [s.y1, s.y2])),
            maxX: Math.max(...segs.flatMap((s) => [s.x1, s.x2])),
            maxY: Math.max(...segs.flatMap((s) => [s.y1, s.y2])),
          },
          sheetSource: result.package.sheetSource === 'pdf' ? 'pdf' : 'dxf_viewport',
          pdfUrl: result.package.pdfUrl,
        });
      } else {
        throw new Error('Use a .dxf or .dwg file.');
      }
      setView('plate');
      setSheetId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

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
            <h2>Plate</h2>
            <div className="cad-stats">
              <div>File: {plate?.sourceFileName ?? '—'}</div>
              <div>Walls: {plate?.wallCenterlines.length ?? 0}</div>
              <div>Openings: {plate?.openingHints.length ?? 0}</div>
              <div>Vectors: {plate?.segments.length ?? 0}</div>
              <div>Sheets: {plate?.sheets.length ?? 0}</div>
            </div>
            {!!plate?.warnings.length && (
              <ul className="cad-warnings">
                {plate.warnings.slice(0, 6).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <main className="cad-main">
          {view === 'plate' && (
            <div className="cad-plate-host">
              {plateSvg ? (
                <div className="cad-plate-svg" dangerouslySetInnerHTML={{ __html: plateSvg }} />
              ) : (
                <div className="cad-empty">
                  Import a DXF/DWG to see the exact floor plate overlay, or load Demo ranch.
                </div>
              )}
            </div>
          )}

          {view === 'extrude' && extrusion && (
            <div className="cad-extrude-host">
              <CadExtrudeView extrusion={extrusion} />
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
