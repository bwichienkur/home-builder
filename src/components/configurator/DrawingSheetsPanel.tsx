import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfiguratorStore } from '../../store/configuratorStore';
import { stillwaterDrawingPackage, type DrawingSheet } from '../../lib/housePlans/drawingPackage';

function sheetSrc(sheet: DrawingSheet): string | null {
  if (sheet.imageUrl) return sheet.imageUrl;
  if (sheet.svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheet.svg)}`;
  }
  return null;
}

function resolvePackage(project: NonNullable<ReturnType<typeof useConfiguratorStore.getState>['project']>) {
  if (project.drawingPackage?.sheets?.length) return project.drawingPackage;
  const hay = `${project.id} ${project.planRef ?? ''} ${project.name ?? ''} ${project.housePlanId ?? ''}`;
  if (/stillwater/i.test(hay)) return stillwaterDrawingPackage();
  return project.drawingPackage ?? null;
}

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
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheets.length) return;
    if (!activeId || !sheets.some((s) => s.id === activeId)) {
      setActiveId(sheets.find((s) => s.kind === 'floor')?.id ?? sheets[0]!.id);
    }
  }, [sheets, activeId]);

  if (!pkg || sheets.length === 0) return null;

  const active = sheets.find((s) => s.id === activeId) ?? sheets[0]!;
  const src = sheetSrc(active);
  const showPdf = Boolean(pkg.pdfUrl) && (active.pdfPageIndex != null || pkg.sheetSource === 'pdf');

  return (
    <aside className={`drawing-sheets-panel ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Drawing sheets">
      <button
        type="button"
        className="drawing-sheets-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide sheets' : 'Sheets'}
        <span className="drawing-sheets-toggle-count">{sheets.length}</span>
      </button>

      {open && (
        <div className="drawing-sheets-body">
          <header className="drawing-sheets-header">
            <div>
              <p className="configurator-eyebrow">Reference</p>
              <strong>{pkg.sourceFileName}</strong>
            </div>
            <div className="drawing-sheets-zoom">
              <button type="button" className="configurator-btn" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="configurator-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">
                +
              </button>
              <button type="button" className="configurator-btn" onClick={() => setZoom(1)}>
                Fit
              </button>
            </div>
          </header>

          <div className="drawing-sheets-tabs" role="tablist" aria-label="Sheet tabs">
            {sheets.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                role="tab"
                aria-selected={sheet.id === active.id}
                className={sheet.id === active.id ? 'active' : ''}
                onClick={() => {
                  setActiveId(sheet.id);
                  setZoom(1);
                  stageRef.current?.scrollTo({ top: 0, left: 0 });
                }}
              >
                {sheet.name.replace(/^SHT\.\s*/i, '')}
              </button>
            ))}
          </div>

          <div className="drawing-sheets-stage" ref={stageRef}>
            {showPdf && pkg.pdfUrl ? (
              <iframe title={active.name} src={pkg.pdfUrl} className="drawing-sheets-pdf" />
            ) : src ? (
              <img
                src={src}
                alt={active.name}
                className="drawing-sheets-image"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
              />
            ) : (
              <p className="muted">No preview for this sheet.</p>
            )}
          </div>

          {pkg.warnings.length > 0 && (
            <p className="drawing-sheets-note muted">
              {pkg.warnings[0]}
              {pkg.warnings.length > 1 ? ` (+${pkg.warnings.length - 1} more)` : ''}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
