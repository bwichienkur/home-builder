import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfiguratorStore } from '../../store/configuratorStore';
import {
  pdfViewerSrc,
  stillwaterDrawingPackage,
  type DrawingSheet,
} from '../../lib/housePlans/drawingPackage';

function resolvePackage(project: NonNullable<ReturnType<typeof useConfiguratorStore.getState>['project']>) {
  // Prefer an attached PDF plan set — DXF viewport SVGs jumble text.
  if (project.drawingPackage?.pdfUrl) return project.drawingPackage;
  const hay = `${project.id} ${project.planRef ?? ''} ${project.name ?? ''} ${project.housePlanId ?? ''}`;
  if (/stillwater/i.test(hay) || project.housePlanId === 'stillwater-183') {
    return stillwaterDrawingPackage();
  }
  if (project.drawingPackage?.sheets?.length) return project.drawingPackage;
  return project.drawingPackage ?? null;
}

/**
 * Fullscreen plan-set reference. Prefers the architect PDF (readable text/elevations).
 * Mouse: drag to pan, wheel to zoom. Falls back to SVG only when no PDF is attached.
 */
export function DrawingSheetsPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const pkg = project ? resolvePackage(project) : null;
  const sheets = useMemo(
    () => [...(pkg?.sheets ?? [])].sort((a, b) => a.order - b.order),
    [pkg?.sheets],
  );
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheets.length) return;
    if (!activeId || !sheets.some((s) => s.id === activeId)) {
      setActiveId(sheets.find((s) => s.kind === 'floor')?.id ?? sheets[0]!.id);
    }
  }, [sheets, activeId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!pkg || (!pkg.pdfUrl && sheets.length === 0)) return null;

  const active: DrawingSheet = sheets.find((s) => s.id === activeId) ?? sheets[0]!;
  const preferPdf = Boolean(pkg.pdfUrl);
  const pageIndex = active?.pdfPageIndex ?? active?.order ?? 0;
  const pdfSrc = preferPdf && pkg.pdfUrl ? pdfViewerSrc(pkg.pdfUrl, pageIndex) : null;
  const fallbackSrc =
    active?.imageUrl ||
    (active?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(active.svg)}` : null);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (preferPdf) return; // native PDF viewer handles interaction
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.x),
      y: dragRef.current.panY + (e.clientY - dragRef.current.y),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (preferPdf) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(4, Math.max(0.4, z + delta)));
  };

  return (
    <>
      <button
        type="button"
        className="drawing-sheets-toggle drawing-sheets-toggle-fab"
        onClick={() => {
          setOpen(true);
          resetView();
        }}
        aria-expanded={open}
      >
        Plan sheets
        <span className="drawing-sheets-toggle-count">{sheets.length || 'PDF'}</span>
      </button>

      {open && (
        <div className="drawing-sheets-lightbox" role="dialog" aria-modal="true" aria-label="Plan set reference">
          <header className="drawing-sheets-lightbox-header">
            <div>
              <p className="configurator-eyebrow">Reference · PDF plan set</p>
              <strong>{pkg.pdfFileName || pkg.sourceFileName}</strong>
            </div>
            <div className="drawing-sheets-lightbox-actions">
              {!preferPdf && (
                <div className="drawing-sheets-zoom">
                  <button type="button" className="configurator-btn" onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))} aria-label="Zoom out">
                    −
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button type="button" className="configurator-btn" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in">
                    +
                  </button>
                  <button type="button" className="configurator-btn" onClick={resetView}>
                    Fit
                  </button>
                </div>
              )}
              {preferPdf && (
                <p className="muted drawing-sheets-hint">Use the PDF viewer controls — scroll, pinch, or drag to navigate.</p>
              )}
              <button type="button" className="configurator-btn primary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </header>

          <div className="drawing-sheets-tabs drawing-sheets-lightbox-tabs" role="tablist" aria-label="Sheet tabs">
            {sheets.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                role="tab"
                aria-selected={sheet.id === active.id}
                className={sheet.id === active.id ? 'active' : ''}
                onClick={() => {
                  setActiveId(sheet.id);
                  resetView();
                }}
              >
                {sheet.name.replace(/^SHT\.\s*/i, '')}
              </button>
            ))}
          </div>

          <div
            className={`drawing-sheets-lightbox-stage ${preferPdf ? 'is-pdf' : 'is-raster'}`}
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {pdfSrc ? (
              <iframe key={pdfSrc} title={active.name} src={pdfSrc} className="drawing-sheets-pdf-full" />
            ) : fallbackSrc ? (
              <img
                src={fallbackSrc}
                alt={active.name}
                className="drawing-sheets-image"
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  cursor: dragRef.current ? 'grabbing' : 'grab',
                }}
              />
            ) : (
              <p className="muted">Upload the plan-set PDF to view readable sheets.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
