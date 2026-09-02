import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extrudeCadPlate } from '../../lib/cadStudio';
import {
  calibrateScaleFromPoints,
  capturePagePng,
  clearPdfVectorCache,
  collectSnapCandidates,
  createTakeoffItem,
  ensureProjectItems,
  extractPdfPageVectors,
  formatFtIn,
  formatItemMode,
  formatSqFt,
  loadDemoStillwaterProject,
  loadPdfProject,
  measureObject,
  newId,
  parseLengthFt,
  pickPdfLineAtPoint,
  requestTakeoffAi,
  snapPoint,
  sumItemQuantity,
  takeoffToCadPlate,
  type TakeoffItem,
  type TakeoffMeasureMode,
  type TakeoffObject,
  type TakeoffPointPx,
  type TakeoffProject,
  type TakeoffTool,
} from '../../lib/takeoff';
import { CadExtrudeView } from '../cad/CadExtrudeView';
import { PdfTakeoffCanvas } from './PdfTakeoffCanvas';
import '../cad/cadStudio.css';
import './takeoffStudio.css';

const TOOLS: { id: TakeoffTool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'calibrate', label: 'Calibrate' },
  { id: 'linear', label: 'Linear' },
  { id: 'area', label: 'Area' },
  { id: 'count', label: 'Count' },
];

function progressText(stage: string, page?: number, total?: number) {
  if (stage === 'reading') return 'Reading PDF…';
  if (stage === 'parsing') return 'Parsing pages…';
  if (stage === 'thumbs') return `Thumbnails ${page ?? 0}/${total ?? '?'}`;
  return 'Ready';
}

function isMeasureTool(tool: TakeoffTool): tool is TakeoffMeasureMode {
  return tool === 'linear' || tool === 'area' || tool === 'count';
}

export function TakeoffStudioPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<TakeoffProject | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [tool, setTool] = useState<TakeoffTool>('linear');
  const [draft, setDraft] = useState<TakeoffPointPx[]>([]);
  const [calibrateLen, setCalibrateLen] = useState("12'-0\"");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [view3d, setView3d] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newItemMode, setNewItemMode] = useState<TakeoffMeasureMode>('linear');
  const [newItemName, setNewItemName] = useState('');

  const page = project?.pages.find((p) => p.id === pageId) ?? project?.pages[0] ?? null;
  const items = project?.items ?? [];
  const activeItem = items.find((i) => i.id === activeItemId) ?? null;
  const pageObjects = useMemo(
    () => (project && page ? project.objects.filter((o) => o.pageId === page.id) : []),
    [project, page],
  );

  const itemQuantities = useMemo(() => {
    if (!project) return [];
    return project.items.map((item) => ({
      item,
      qty: sumItemQuantity(item, project.objects, page?.scale),
    }));
  }, [project, page?.scale]);

  const extrusionResult = useMemo(() => {
    if (!project || !page?.scale || page.scale.pixelsPerFoot <= 0 || !view3d) {
      return { extrusion: null as ReturnType<typeof extrudeCadPlate> | null, error: '' };
    }
    try {
      const plate = takeoffToCadPlate(project, page, project.objects);
      const heightM = (project.storyHeightFt ?? 9) * 0.3048;
      const next = extrudeCadPlate(plate, { heightM });
      if (!next.walls.length) {
        return {
          extrusion: next,
          error: `Plate has ${plate.wallCenterlines.length} centerlines but 0 extruded walls.`,
        };
      }
      return { extrusion: next, error: '' };
    } catch (err) {
      return {
        extrusion: null,
        error: err instanceof Error ? err.message : '3D preview failed.',
      };
    }
  }, [project, page, view3d]);
  const extrusion = extrusionResult.extrusion;
  const extrudeError = extrusionResult.error;

  useEffect(() => {
    if (!project?.pdfUrl || page == null) return;
    void extractPdfPageVectors(project.pdfUrl, page.pageIndex).catch(() => {
      /* vector snap will fall back to manual */
    });
  }, [project?.pdfUrl, page?.pageIndex]);

  const adoptProject = (next: TakeoffProject) => {
    const withItems = ensureProjectItems(next);
    setProject(withItems);
    setPageId(withItems.pages[0]?.id ?? null);
    setDraft([]);
    setSelectedId(null);
    const firstLinear = withItems.items.find((i) => i.mode === 'linear') ?? withItems.items[0];
    setActiveItemId(firstLinear?.id ?? null);
    setTool(firstLinear?.mode ?? 'linear');
    setView3d(false);
  };

  const loadFile = async (file: File) => {
    setBusy(true);
    setError('');
    setStatus('Loading…');
    try {
      const next = await loadPdfProject(file, (p) =>
        setStatus(progressText(p.stage, p.page, p.total)),
      );
      clearPdfVectorCache();
      adoptProject(next);
      setStatus(`${next.pages.length} pages · ${next.items.length} takeoff items`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF load failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await loadDemoStillwaterProject((p) =>
        setStatus(progressText(p.stage, p.page, p.total)),
      );
      clearPdfVectorCache();
      adoptProject(next);
      setStatus('Stillwater demo PDF loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo load failed.');
    } finally {
      setBusy(false);
    }
  };

  const updatePage = useCallback((pageTargetId: string, patch: Partial<NonNullable<typeof page>>) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        pages: prev.pages.map((p) => (p.id === pageTargetId ? { ...p, ...patch } : p)),
      };
    });
  }, []);

  const addObject = useCallback((obj: TakeoffObject) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        objects: [...prev.objects, obj],
      };
    });
    setSelectedId(obj.id);
  }, []);

  const deleteObject = (id: string) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        objects: prev.objects.filter((o) => o.id !== id),
      };
    });
    if (selectedId === id) setSelectedId(null);
  };

  const deleteItem = (id: string) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        items: prev.items.filter((i) => i.id !== id),
        objects: prev.objects.filter((o) => o.itemId !== id),
      };
    });
    if (activeItemId === id) {
      setActiveItemId(null);
    }
  };

  const renameItem = (id: string, name: string) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        items: prev.items.map((i) => (i.id === id ? { ...i, name } : i)),
      };
    });
  };

  const addItem = () => {
    const item = createTakeoffItem(newItemMode, newItemName || undefined);
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        items: [...prev.items, item],
      };
    });
    setActiveItemId(item.id);
    setTool(item.mode);
    setDraft([]);
    setNewItemName('');
    setStatus(`Added ${formatItemMode(item.mode)} item “${item.name}”`);
  };

  const selectItem = (item: TakeoffItem) => {
    setActiveItemId(item.id);
    setTool(item.mode);
    setDraft([]);
    setStatus(`Digitizing: ${item.name} (${formatItemMode(item.mode)})`);
  };

  const resolveActiveItem = useCallback(
    (mode: TakeoffMeasureMode): TakeoffItem | null => {
      if (!project) return null;
      if (activeItem?.mode === mode) return activeItem;
      const existing = project.items.find((i) => i.mode === mode);
      if (existing) {
        setActiveItemId(existing.id);
        return existing;
      }
      const created = createTakeoffItem(mode);
      setProject((prev) => {
        if (!prev) return prev;
        return { ...prev, items: [...prev.items, created], updatedAt: new Date().toISOString() };
      });
      setActiveItemId(created.id);
      return created;
    },
    [project, activeItem],
  );

  const commitDigitize = useCallback(
    (
      mode: TakeoffMeasureMode,
      points: TakeoffPointPx[],
      source: TakeoffObject['source'],
      itemOverride?: TakeoffItem | null,
    ) => {
      if (!page) return;
      const item = itemOverride ?? resolveActiveItem(mode);
      if (!item) return;
      const kind = item.objectKind;
      const measured = measureObject(points, kind, page.scale, mode);
      addObject({
        id: newId(mode),
        pageId: page.id,
        kind,
        itemId: item.id,
        measureMode: mode,
        points,
        label: item.name,
        color: item.color,
        ...measured,
        source,
        createdAt: new Date().toISOString(),
      });
      setDraft([]);
      const piece =
        mode === 'area'
          ? formatSqFt(measured.areaSqFt)
          : mode === 'count'
            ? '1 EA'
            : formatFtIn(measured.lengthFt);
      setStatus(`${item.name}: +${piece}${source === 'vector' ? ' (auto line)' : ''}`);
    },
    [page, resolveActiveItem, addObject],
  );

  const finishDraft = useCallback(() => {
    if (!project || !page || draft.length === 0) return;

    if (tool === 'calibrate') {
      if (draft.length < 2) return;
      const known = parseLengthFt(calibrateLen);
      if (known == null) {
        setError('Enter a valid length (e.g. 12\'-0").');
        return;
      }
      try {
        const scale = calibrateScaleFromPoints(draft[0]!, draft[1]!, known, page.scale?.scaleHint);
        updatePage(page.id, { scale });
        setDraft([]);
        setStatus(`Scale set: ${scale.pixelsPerFoot.toFixed(2)} px/ft`);
        setError('');
        setTool('linear');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Calibration failed.');
      }
      return;
    }

    if (tool === 'linear' || tool === 'wall') {
      if (draft.length < 2) return;
      commitDigitize('linear', draft, 'manual');
      return;
    }
    if (tool === 'area' || tool === 'room') {
      if (draft.length < 3) return;
      commitDigitize('area', draft, 'manual');
    }
  }, [project, page, draft, tool, calibrateLen, updatePage, commitDigitize]);

  const onCanvasClick = (raw: TakeoffPointPx, event: React.MouseEvent) => {
    if (!page || !project) return;
    if (tool === 'select') return;

    const ortho = event.shiftKey && draft.length ? draft[draft.length - 1] : null;
    const candidates = collectSnapCandidates(project.objects, page.id);
    const point = snapPoint(raw, [...candidates, ...draft], ortho);

    if (tool === 'calibrate') {
      setDraft((prev) => [...prev, point].slice(0, 2));
      return;
    }

    if (tool === 'count' || tool === 'fixture') {
      commitDigitize('count', [point], 'manual');
      return;
    }

    // Linear: PlanSwift-style click a PDF vector line for full length.
    if ((tool === 'linear' || tool === 'wall') && draft.length === 0 && !event.altKey) {
      void (async () => {
        try {
          setStatus('Snapping to PDF line…');
          const hit = await pickPdfLineAtPoint(project.pdfUrl, page.pageIndex, raw, {
            maxDistPx: 12,
            minLengthPx: 6,
          });
          if (hit && hit.points.length >= 2) {
            commitDigitize('linear', hit.points, 'vector');
            return;
          }
          setDraft([point]);
          setStatus('No vector line nearby — click more points, then Finish (Alt = always manual).');
        } catch (err) {
          setDraft([point]);
          setStatus(
            err instanceof Error
              ? `Vector snap unavailable (${err.message}). Continue manually.`
              : 'Vector snap unavailable — continue manually.',
          );
        }
      })();
      return;
    }

    if (tool === 'linear' || tool === 'wall' || tool === 'area' || tool === 'room') {
      setDraft((prev) => [...prev, point]);
    }
  };

  const runAi = async (task: 'classify' | 'scale_hint' | 'elevation_heights') => {
    if (!project || !page) return;
    const activePageId = page.id;
    setAiBusy(true);
    setError('');
    try {
      const { base64 } = await capturePagePng(project.pdfUrl, page.pageIndex, 0.9);
      const result = await requestTakeoffAi({ task, imageBase64: base64 });
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          storyHeightFt: result.storyHeightFt ?? prev.storyHeightFt,
          pages: prev.pages.map((p) => {
            if (p.id !== activePageId) return p;
            return {
              ...p,
              kind: result.pageKind,
              scale: p.scale
                ? { ...p.scale, scaleHint: result.scaleHint || p.scale.scaleHint }
                : result.scaleHint
                  ? { pixelsPerFoot: 0, scaleHint: result.scaleHint }
                  : p.scale,
            };
          }),
        };
      });
      setStatus(
        `AI (${result.pageKind}${result.scaleHint ? ` · ${result.scaleHint}` : ''}${
          result.confidence != null ? ` · ${Math.round(result.confidence * 100)}%` : ''
        })`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assist failed.');
    } finally {
      setAiBusy(false);
    }
  };

  const saveProject = async () => {
    if (!project) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/takeoff/project', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ project }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        throw new Error(body.error || `Save failed (HTTP ${res.status})`);
      }
      setStatus(
        body.saved
          ? `Saved to database (${body.backend})`
          : 'Saved locally only — DATABASE_URL not configured',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const wallCount = project?.objects.filter((o) => o.kind === 'wall').length ?? 0;

  return (
    <div className="takeoff-page">
      <header className="takeoff-header">
        <div>
          <h1 className="takeoff-brand">Plan Takeoff</h1>
          <p className="takeoff-sub">
            PlanSwift-style Linear, Area, and Count takeoffs on a plan PDF. Quantities roll up per
            item. Optional Claude/GPT assist for page type and scale.
          </p>
        </div>
        <div className="takeoff-actions">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="takeoff-btn takeoff-btn-primary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Upload PDF
          </button>
          <button type="button" className="takeoff-btn" disabled={busy} onClick={() => void loadDemo()}>
            Load Stillwater demo
          </button>
          <button type="button" className="takeoff-btn" disabled={!project || busy} onClick={() => void saveProject()}>
            Save project
          </button>
          <button
            type="button"
            className="takeoff-btn"
            disabled={!page?.scale || !(page.scale.pixelsPerFoot > 0) || wallCount === 0}
            onClick={() => setView3d((v) => !v)}
          >
            {view3d ? 'Hide 3D' : 'Preview 3D'}
          </button>
        </div>
      </header>

      {error ? (
        <p className="takeoff-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p className="takeoff-status">{status}</p> : null}

      {!project ? (
        <div className="takeoff-empty">
          <div>
            <strong>Start with a plan set PDF</strong>
            Upload your architect’s PDF, or load the Stillwater demo. Digitize with Linear / Area /
            Count items — quantities accumulate like PlanSwift.
          </div>
        </div>
      ) : (
        <div className="takeoff-layout">
          <aside className="takeoff-pages" aria-label="Pages">
            {project.pages.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`takeoff-page-card${p.id === page?.id ? ' is-active' : ''}`}
                onClick={() => {
                  setPageId(p.id);
                  setDraft([]);
                }}
              >
                {p.thumbUrl ? <img src={p.thumbUrl} alt="" /> : <div style={{ height: 80 }} />}
                <span>
                  {p.name}
                  {p.kind ? ` · ${p.kind}` : ''}
                  {p.scale?.pixelsPerFoot ? ' · scaled' : ''}
                </span>
              </button>
            ))}
          </aside>

          <div className="takeoff-stage">
            <div className="takeoff-stage-inner">
              {view3d && extrusion && extrusion.walls.length > 0 ? (
                <div className="takeoff-3d takeoff-3d-stage">
                  <CadExtrudeView extrusion={extrusion} />
                </div>
              ) : page ? (
                <PdfTakeoffCanvas
                  pdfUrl={project.pdfUrl}
                  pageIndex={page.pageIndex}
                  pageWidthPt={page.widthPt}
                  pageHeightPt={page.heightPt}
                  objects={pageObjects}
                  draftPoints={draft}
                  tool={tool}
                  onCanvasClick={onCanvasClick}
                  onCanvasDoubleClick={finishDraft}
                />
              ) : null}
              {view3d && extrudeError ? (
                <p className="takeoff-error" style={{ margin: '0.75rem' }}>
                  {extrudeError}
                </p>
              ) : null}
            </div>
          </div>

          <aside className="takeoff-side">
            <section className="takeoff-panel">
              <h2>Takeoff items</h2>
              <p className="takeoff-hint" style={{ marginTop: 0 }}>
                Select an item, then digitize. Totals update as you click.
              </p>
              <ul className="takeoff-items">
                {itemQuantities.map(({ item, qty }) => (
                  <li key={item.id} className={activeItemId === item.id ? 'is-active' : undefined}>
                    <button
                      type="button"
                      className="takeoff-item-main"
                      onClick={() => selectItem(item)}
                    >
                      <span className="takeoff-item-swatch" style={{ background: item.color }} />
                      <span className="takeoff-item-copy">
                        <strong>{item.name}</strong>
                        <span>
                          {formatItemMode(item.mode)} · {qty.formatted}
                          {qty.pieceCount ? ` · ${qty.pieceCount} pcs` : ''}
                        </span>
                      </span>
                    </button>
                    <input
                      className="takeoff-item-rename"
                      aria-label={`Rename ${item.name}`}
                      value={item.name}
                      onChange={(e) => renameItem(item.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button type="button" className="takeoff-item-del" onClick={() => deleteItem(item.id)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="takeoff-item-add">
                <select
                  value={newItemMode}
                  onChange={(e) => setNewItemMode(e.target.value as TakeoffMeasureMode)}
                  aria-label="New item mode"
                >
                  <option value="linear">Linear (LF)</option>
                  <option value="area">Area (SF)</option>
                  <option value="count">Count (EA)</option>
                </select>
                <input
                  placeholder="Name (optional)"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
                <button type="button" className="takeoff-btn" onClick={addItem}>
                  Add item
                </button>
              </div>
            </section>

            <section className="takeoff-panel">
              <h2>Tools</h2>
              <div className="takeoff-tools">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`takeoff-tool${tool === t.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setTool(t.id);
                      setDraft([]);
                      if (isMeasureTool(t.id)) {
                        const match = items.find((i) => i.mode === t.id);
                        if (match) setActiveItemId(match.id);
                      }
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {tool === 'calibrate' ? (
                <label className="takeoff-field">
                  Known length
                  <input value={calibrateLen} onChange={(e) => setCalibrateLen(e.target.value)} />
                </label>
              ) : null}
              <p className="takeoff-hint">
                {tool === 'calibrate'
                  ? 'Click two ends of a known dimension, then Finish (or double-click). Hold Shift for ortho.'
                  : tool === 'linear'
                    ? 'Click a PDF line to grab full length into the active Linear item. Miss or Alt = manual points; Finish to commit.'
                    : tool === 'area'
                      ? 'Click polygon corners for the active Area item. Double-click or Finish to commit (≥3 pts).'
                      : tool === 'count'
                        ? 'Each click adds 1 EA to the active Count item.'
                        : 'Select an object in the list, or pick a takeoff item to digitize.'}
              </p>
              {(tool === 'linear' || tool === 'area' || tool === 'calibrate') && draft.length > 0 ? (
                <button type="button" className="takeoff-btn" style={{ marginTop: '0.5rem' }} onClick={finishDraft}>
                  Finish ({draft.length} pts)
                </button>
              ) : null}
              {draft.length > 0 ? (
                <button
                  type="button"
                  className="takeoff-btn"
                  style={{ marginTop: '0.35rem' }}
                  onClick={() => setDraft([])}
                >
                  Cancel draft
                </button>
              ) : null}
            </section>

            <section className="takeoff-panel">
              <h2>Page</h2>
              <p className="takeoff-hint" style={{ marginTop: 0 }}>
                Scale:{' '}
                {page?.scale?.pixelsPerFoot && page.scale.pixelsPerFoot > 0
                  ? `${page.scale.pixelsPerFoot.toFixed(2)} px/ft`
                  : 'not calibrated — Area/Linear ft need scale'}
                {page?.scale?.scaleHint ? ` · ${page.scale.scaleHint}` : ''}
              </p>
              <div className="takeoff-actions" style={{ marginTop: '0.45rem' }}>
                <button
                  type="button"
                  className="takeoff-btn"
                  disabled={aiBusy || !page}
                  onClick={() => void runAi('classify')}
                >
                  {aiBusy ? 'AI…' : 'AI classify'}
                </button>
                <button
                  type="button"
                  className="takeoff-btn"
                  disabled={aiBusy || !page}
                  onClick={() => void runAi('scale_hint')}
                >
                  AI scale hint
                </button>
              </div>
            </section>

            <section className="takeoff-panel">
              <h2>
                Pieces
                {activeItem ? ` · ${activeItem.name}` : ''} ({pageObjects.length} on page)
              </h2>
              <ul className="takeoff-list">
                {pageObjects.map((o) => {
                  const itemName = items.find((i) => i.id === o.itemId)?.name;
                  return (
                    <li key={o.id} className={selectedId === o.id ? 'is-active' : undefined}>
                      <button
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          flex: 1,
                        }}
                        onClick={() => setSelectedId(o.id)}
                      >
                        {itemName || o.kind}
                        {o.measureMode === 'area' || o.kind === 'room'
                          ? ` · ${formatSqFt(o.areaSqFt)}`
                          : o.measureMode === 'count'
                            ? ` · ${o.count ?? 1} EA`
                            : o.lengthFt != null
                              ? ` · ${formatFtIn(o.lengthFt)}`
                              : ''}
                      </button>
                      <button type="button" onClick={() => deleteObject(o.id)}>
                        Delete
                      </button>
                    </li>
                  );
                })}
                {pageObjects.length === 0 ? <li style={{ background: 'transparent' }}>None yet</li> : null}
              </ul>
            </section>

            {view3d ? (
              <section className="takeoff-panel">
                <h2>3D preview</h2>
                <p className="takeoff-hint" style={{ marginTop: 0 }}>
                  Showing in the main stage. Click Hide 3D to return to the PDF.
                </p>
                {extrudeError ? <p className="takeoff-hint">{extrudeError}</p> : null}
                {extrusion ? (
                  <p className="takeoff-hint">
                    {extrusion.walls.length} walls · {extrusion.openings.length} openings
                  </p>
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
