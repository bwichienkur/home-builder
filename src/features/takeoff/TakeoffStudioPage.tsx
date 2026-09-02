import { useCallback, useMemo, useRef, useState } from 'react';
import { extrudeCadPlate } from '../../lib/cadStudio';
import {
  calibrateScaleFromPoints,
  capturePagePng,
  collectSnapCandidates,
  formatFtIn,
  formatSqFt,
  loadDemoStillwaterProject,
  loadPdfProject,
  measureObject,
  newId,
  parseLengthFt,
  requestTakeoffAi,
  snapPoint,
  takeoffToCadPlate,
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
  { id: 'wall', label: 'Wall' },
  { id: 'room', label: 'Room' },
  { id: 'door', label: 'Door' },
  { id: 'window', label: 'Window' },
  { id: 'fixture', label: 'Fixture' },
];

function progressText(stage: string, page?: number, total?: number) {
  if (stage === 'reading') return 'Reading PDF…';
  if (stage === 'parsing') return 'Parsing pages…';
  if (stage === 'thumbs') return `Thumbnails ${page ?? 0}/${total ?? '?'}`;
  return 'Ready';
}

export function TakeoffStudioPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<TakeoffProject | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<TakeoffTool>('wall');
  const [draft, setDraft] = useState<TakeoffPointPx[]>([]);
  const [calibrateLen, setCalibrateLen] = useState("12'-0\"");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [view3d, setView3d] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const page = project?.pages.find((p) => p.id === pageId) ?? project?.pages[0] ?? null;
  const pageObjects = useMemo(
    () => (project && page ? project.objects.filter((o) => o.pageId === page.id) : []),
    [project, page],
  );

  const extrusion = useMemo(() => {
    if (!project || !page?.scale || page.scale.pixelsPerFoot <= 0 || !view3d) return null;
    try {
      const plate = takeoffToCadPlate(project, page, project.objects);
      return extrudeCadPlate(plate);
    } catch {
      return null;
    }
  }, [project, page, view3d]);

  const loadFile = async (file: File) => {
    setBusy(true);
    setError('');
    setStatus('Loading…');
    try {
      const next = await loadPdfProject(file, (p) =>
        setStatus(progressText(p.stage, p.page, p.total)),
      );
      setProject(next);
      setPageId(next.pages[0]?.id ?? null);
      setDraft([]);
      setSelectedId(null);
      setView3d(false);
      setStatus(`${next.pages.length} pages loaded`);
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
      setProject(next);
      setPageId(next.pages[0]?.id ?? null);
      setDraft([]);
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
        setTool('wall');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Calibration failed.');
      }
      return;
    }

    const kind =
      tool === 'wall' || tool === 'room' || tool === 'door' || tool === 'window' || tool === 'fixture'
        ? tool
        : null;
    if (!kind) return;

    const minPts = kind === 'fixture' ? 1 : kind === 'room' ? 3 : 2;
    if (draft.length < minPts) return;

    const points =
      kind === 'room' && draft.length >= 3
        ? draft
        : kind === 'door' || kind === 'window'
          ? draft.slice(0, 2)
          : draft;

    const measured = measureObject(points, kind, page.scale);
    addObject({
      id: newId(kind),
      pageId: page.id,
      kind,
      points,
      ...measured,
      source: 'manual',
      createdAt: new Date().toISOString(),
    });
    setDraft([]);
    setStatus(
      kind === 'room'
        ? `Room ${formatSqFt(measured.areaSqFt)}`
        : `${kind} ${formatFtIn(measured.lengthFt)}`,
    );
  }, [project, page, draft, tool, calibrateLen, updatePage, addObject]);

  const onCanvasClick = (raw: TakeoffPointPx, event: React.MouseEvent) => {
    if (!page || !project) return;
    const ortho = event.shiftKey && draft.length ? draft[draft.length - 1] : null;
    const candidates = collectSnapCandidates(project.objects, page.id);
    const point = snapPoint(raw, [...candidates, ...draft], ortho);

    if (tool === 'calibrate') {
      setDraft((prev) => {
        const next = [...prev, point].slice(0, 2);
        return next;
      });
      return;
    }

    if (tool === 'fixture') {
      const measured = measureObject([point], 'fixture', page.scale);
      addObject({
        id: newId('fixture'),
        pageId: page.id,
        kind: 'fixture',
        points: [point],
        ...measured,
        source: 'manual',
        createdAt: new Date().toISOString(),
      });
      return;
    }

    if (tool === 'door' || tool === 'window') {
      const next = [...draft, point].slice(0, 2);
      setDraft(next);
      if (next.length === 2) {
        const measured = measureObject(next, tool, page.scale);
        addObject({
          id: newId(tool),
          pageId: page.id,
          kind: tool,
          points: next,
          ...measured,
          source: 'manual',
          createdAt: new Date().toISOString(),
        });
        setDraft([]);
        setStatus(`${tool} ${formatFtIn(measured.lengthFt)}`);
      }
      return;
    }

    if (tool === 'wall' || tool === 'room') {
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

  return (
    <div className="takeoff-page">
      <header className="takeoff-header">
        <div>
          <h1 className="takeoff-brand">Plan Takeoff</h1>
          <p className="takeoff-sub">
            Import a plan PDF, calibrate scale, and trace walls and rooms — like PlanSwift. Optional
            Claude/GPT assist for page type and scale hints. CAD Studio stays available for DWG.
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
            disabled={!page?.scale || !(page.scale.pixelsPerFoot > 0) || pageObjects.filter((o) => o.kind === 'wall').length === 0}
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
            Upload your architect’s PDF, or load the Stillwater demo to try calibrate + trace.
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
              {page ? (
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
            </div>
          </div>

          <aside className="takeoff-side">
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
                  : tool === 'wall' || tool === 'room'
                    ? 'Click points along the path. Double-click or Finish to commit. Shift = ortho.'
                    : tool === 'door' || tool === 'window'
                      ? 'Click two points across the opening.'
                      : 'Click to place.'}
              </p>
              {(tool === 'wall' || tool === 'room' || tool === 'calibrate') && draft.length > 0 ? (
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
                  : 'not calibrated'}
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
              <p className="takeoff-hint">Needs ANTHROPIC_API_KEY or OPENAI_API_KEY on the server.</p>
            </section>

            <section className="takeoff-panel">
              <h2>Objects ({pageObjects.length})</h2>
              <ul className="takeoff-list">
                {pageObjects.map((o) => (
                  <li key={o.id} className={selectedId === o.id ? 'is-active' : undefined}>
                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}
                      onClick={() => setSelectedId(o.id)}
                    >
                      {o.kind}
                      {o.kind === 'room'
                        ? ` · ${formatSqFt(o.areaSqFt)}`
                        : o.lengthFt != null
                          ? ` · ${formatFtIn(o.lengthFt)}`
                          : ''}
                    </button>
                    <button type="button" onClick={() => deleteObject(o.id)}>
                      Delete
                    </button>
                  </li>
                ))}
                {pageObjects.length === 0 ? <li style={{ background: 'transparent' }}>None yet</li> : null}
              </ul>
            </section>

            {view3d ? (
              <section className="takeoff-panel">
                <h2>3D preview</h2>
                <div className="takeoff-3d">
                  {extrusion ? <CadExtrudeView extrusion={extrusion} /> : (
                    <p className="takeoff-hint">Calibrate scale and trace walls to preview.</p>
                  )}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
