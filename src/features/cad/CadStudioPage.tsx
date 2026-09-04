import { useMemo, useRef, useState } from 'react';
import {
  applyAutoFoundation,
  buildCadPlateFromDxf,
  CAD_WALL_MATERIALS,
  clearAutoFoundation,
  createCadHistory,
  copyWalls,
  demoCadPlate,
  deleteSelection,
  downloadSvgAsPng,
  downloadTextFile,
  exportCadPlateDxf,
  exportCadPlateGltf,
  exportCadRoomScheduleCsv,
  exportCadSheetSetHtml,
  extrudeCadPlate,
  flipOpeningHand,
  flipWall,
  formatWallLengthFt,
  hideNonFloorPreset,
  mirrorWalls,
  parseAngleDeg,
  parseArchitecturalLength,
  redoCadHistory,
  removeLayer,
  renderCadElevationSvg,
  renderCadPlateSvg,
  renderCadSectionSvg,
  replaceCadPresent,
  previewCadPresent,
  commitCadPresent,
  buildCadSectionDrawing,
  resyncHostedOpenings,
  roleToClassify,
  roomScheduleSummary,
  segLengthFt,
  selectionSummary,
  setLayerClassify,
  setOpeningSill,
  setOpeningWidth,
  setPlateRoof,
  setPlateTerrain,
  setPlateTitleBlock,
  setWallAngle,
  setWallLength,
  setWallMaterial,
  setWallThickness,
  showWallsAndDoorsPreset,
  toggleBuildingVisible,
  undoCadHistory,
  updateSlab,
  updateStair,
  wallAngleDeg,
  withLayerVisibility,
  DEFAULT_ROOF_OVERRIDES,
  type CadEditTool,
  type CadHistoryState,
  type CadLayerClassify,
  type CadPlateSelection,
  type CadWallMaterialId,
} from '../../lib/cadStudio';
import type { CadFixtureKind, CadPlate, CadRoofKind, CadSlabKind } from '../../lib/cadStudio/types';
import { defaultWallThicknessFt } from '../../lib/cadStudio/cadDrawSnap';
import { CadPlateEditor } from './CadPlateEditor';
import { importDrawingFiles, type DrawingImportProgress } from '../../lib/housePlans/importDrawingFile';
import { CadExtrudeView } from './CadExtrudeView';
import { CadMassingView } from './CadMassingView';
import { pdfViewerSrc, stillwaterCadSheetPlate } from './stillwaterCad';
import './cadStudio.css';

type LayoutMode = 'split' | 'plate' | 'extrude' | 'massing' | 'sheets';
type PlateMode = 'floor' | 'front' | 'side' | 'section';
type StudioMode = 'draw' | 'modify' | 'annotate' | 'site' | 'roof' | 'layers' | 'sheets';
type OpeningKind = 'door' | 'window' | 'passage' | 'garage';

const CLASSIFY_OPTIONS: { id: CadLayerClassify; label: string }[] = [
  { id: 'wall', label: 'Wall' },
  { id: 'door', label: 'Door' },
  { id: 'fixture', label: 'Fixture' },
  { id: 'soft', label: 'Soft' },
  { id: 'dim', label: 'Dim' },
  { id: 'ignore', label: 'Ignore' },
  { id: 'other', label: 'Other' },
];

const STUDIO_MODES: { id: StudioMode; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'modify', label: 'Modify' },
  { id: 'annotate', label: 'Annotate' },
  { id: 'site', label: 'Site' },
  { id: 'roof', label: 'Roof' },
  { id: 'layers', label: 'Layers' },
  { id: 'sheets', label: 'Sheets' },
];

function progressLabel(p: DrawingImportProgress | null): string {
  if (!p) return '';
  if (p.stage === 'reading') return `Reading ${p.detail ?? 'file'}…`;
  if (p.stage === 'converting') return 'Converting DWG → DXF…';
  if (p.stage === 'parsing') return 'Building CAD plate…';
  return 'Done';
}

export function CadStudioPage() {
  const [history, setHistory] = useState<CadHistoryState>(() => createCadHistory(demoCadPlate()));
  const plate = history.present;
  const gestureBaselineRef = useRef<CadPlate | null>(null);

  const commitPlate = (next: CadPlate | ((p: CadPlate) => CadPlate)) => {
    setHistory((h) => {
      const resolved = typeof next === 'function' ? next(h.present) : next;
      const baseline = gestureBaselineRef.current;
      gestureBaselineRef.current = null;
      return commitCadPresent(h, resolved, baseline);
    });
  };

  const previewPlate = (next: CadPlate | ((p: CadPlate) => CadPlate)) => {
    setHistory((h) => {
      const resolved = typeof next === 'function' ? next(h.present) : next;
      if (!gestureBaselineRef.current) gestureBaselineRef.current = h.present;
      return previewCadPresent(h, resolved);
    });
  };

  /** Discrete edits — always push history (trim, draw complete, inspector). */
  const setPlate = commitPlate;

  const loadPlate = (p: CadPlate) => {
    gestureBaselineRef.current = null;
    setHistory((h) => replaceCadPresent(h, p));
  };
  const [layout, setLayout] = useState<LayoutMode>('split');
  const [plateMode, setPlateMode] = useState<PlateMode>('floor');
  const [studioMode, setStudioMode] = useState<StudioMode>('draw');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DrawingImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [editTool, setEditTool] = useState<CadEditTool>('select');
  const [fixtureKind, setFixtureKind] = useState<CadFixtureKind>('sink');
  const [openingKind, setOpeningKind] = useState<OpeningKind>('door');
  const [wallLayer, setWallLayer] = useState('WALLS EXT');
  const [windowSillFt, setWindowSillFt] = useState(3);
  const [slabKind, setSlabKind] = useState<CadSlabKind>('terrace');
  const [showExteriorDims, setShowExteriorDims] = useState(true);
  const [showInteriorDims, setShowInteriorDims] = useState(false);
  const [showRoomFills, setShowRoomFills] = useState(true);
  const [selection, setSelection] = useState<CadPlateSelection | null>(null);
  const [wallMulti, setWallMulti] = useState<number[]>([]);
  const [statusAid, setStatusAid] = useState('');
  const [layerFilter, setLayerFilter] = useState('');
  const [snapOn, setSnapOn] = useState(true);
  const [unitLabel] = useState<'ft-in' | 'm'>('ft-in');
  const [sunHour, setSunHour] = useState(14);
  const [shadowsOn, setShadowsOn] = useState(true);
  const [sectionClip, setSectionClip] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wallLengthInputRef = useRef<HTMLInputElement>(null);

  const visibility = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const layer of plate.layers) map[layer.name] = layer.visible;
    return map;
  }, [plate]);

  const visibleLayerSet = useMemo(
    () => new Set(plate.layers.filter((l) => l.visible).map((l) => l.name)),
    [plate],
  );

  const plateSvg = useMemo(() => {
    if (plateMode === 'front' && plate.elevationFront) {
      return renderCadElevationSvg(plate.elevationFront, {
        title: plate.elevationFront.name,
        visibleLayers: visibleLayerSet,
        richFills: true,
      });
    }
    if (plateMode === 'side' && plate.elevationSide) {
      return renderCadElevationSvg(plate.elevationSide, {
        title: plate.elevationSide.name,
        visibleLayers: visibleLayerSet,
        richFills: true,
      });
    }
    if (plateMode === 'section') {
      const cut = plate.sectionCuts?.[0];
      if (!cut) return null;
      return renderCadSectionSvg(buildCadSectionDrawing(plate, cut), { title: cut.label });
    }
    return null;
  }, [plate, plateMode, visibleLayerSet]);

  const extrusion = useMemo(() => extrudeCadPlate(plate), [plate]);

  const roomSchedule = useMemo(() => roomScheduleSummary(plate), [plate]);

  const storySheets = useMemo(
    () => plate.sheets.filter((s) => s.kind === 'floor' || s.kind === 'elevation'),
    [plate],
  );

  const activeSheet =
    plate.sheets.find((s) => s.id === sheetId) ??
    plate.sheets.find((s) => s.kind === 'floor') ??
    plate.sheets[0] ??
    null;

  const filteredLayers = useMemo(() => {
    const q = layerFilter.trim().toLowerCase();
    const list = plate.layers;
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
    setPlate(withLayerVisibility(plate, { ...visibility, [name]: !visibility[name] }));
  };

  const pickTool = (
    tool: CadEditTool,
    opts?: { wallLayer?: string; opening?: OpeningKind; fixture?: CadFixtureKind; slab?: CadSlabKind },
  ) => {
    setEditTool(tool);
    setSelection(null);
    setWallMulti([]);
    if (opts?.wallLayer) setWallLayer(opts.wallLayer);
    if (opts?.opening) setOpeningKind(opts.opening);
    if (opts?.fixture) setFixtureKind(opts.fixture);
    if (opts?.slab) setSlabKind(opts.slab);
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
        loadPlate(buildCadPlateFromDxf(text, file.name));
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
        loadPlate({
          ...next,
          warnings: [...result.package.warnings, ...next.warnings],
        });
      } else {
        throw new Error('Use a .dxf or .dwg file.');
      }
      setLayout('split');
      setPlateMode('floor');
      setStudioMode('layers');
      setSheetId(null);
      setSelection(null);
      setWallMulti([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const requestWallLengthEdit = (index: number) => {
    setSelection({ kind: 'wall', index });
    setStudioMode('modify');
    const wall = plate.wallCenterlines[index];
    if (!wall) return;
    const current = formatWallLengthFt(segLengthFt(wall));
    const raw = window.prompt('Wall length', current);
    if (raw == null) return;
    const len = parseArchitecturalLength(raw);
    if (len == null) return;
    setPlate(resyncHostedOpenings(setWallLength(plate, index, len, 'start'), index));
    queueMicrotask(() => wallLengthInputRef.current?.focus());
  };

  const modifyHint =
    editTool === 'trim'
      ? 'Trim: click cutter wall, then wall to shorten'
      : editTool === 'extend'
        ? 'Extend: click boundary wall, then wall to lengthen'
        : editTool === 'break'
          ? 'Break: click wall at split point'
          : editTool === 'offset'
            ? 'Offset: click wall to copy parallel 1 ft'
            : statusAid || 'Shift ortho · Esc cancel · Tab length · Ctrl+Z undo';

  const modeBanner =
    editTool === 'trim' || editTool === 'extend' || editTool === 'break'
      ? modifyHint
      : null;

  const hasFrontElev = !!plate.elevationFront?.segments.length;
  const hasSideElev = !!plate.elevationSide?.segments.length;
  const visibleCount = plate.layers.filter((l) => l.visible).length;
  const layerCount = plate.layers.length;
  const show2d = layout === 'split' || layout === 'plate';
  const show3d = (layout === 'split' || layout === 'extrude') && !!extrusion;
  const can3d = !!plate.wallCenterlines.length;

  const renderFloorPane = () => {
    if (plateMode === 'floor' && plate.segments.length) {
      return (
        <CadPlateEditor
          plate={plate}
          tool={editTool}
          fixtureKind={fixtureKind}
          openingKind={openingKind}
          wallLayer={wallLayer}
          windowSillFt={windowSillFt}
          slabKind={slabKind}
          snapOn={snapOn}
          showExteriorDims={showExteriorDims}
          showInteriorDims={showInteriorDims}
          showRoomFills={showRoomFills}
          selection={selection}
          onSelectionChange={setSelection}
          wallMulti={wallMulti}
          onWallMultiChange={setWallMulti}
          onPlateChange={commitPlate}
          onPlatePreview={previewPlate}
          onPlateCommit={commitPlate}
          onStatus={setStatusAid}
          onUndo={() => {
            gestureBaselineRef.current = null;
            setHistory((h) => undoCadHistory(h));
          }}
          onRedo={() => {
            gestureBaselineRef.current = null;
            setHistory((h) => redoCadHistory(h));
          }}
          onRequestWallLengthEdit={requestWallLengthEdit}
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
          : plateMode === 'section'
            ? 'Draw a section cut (Annotate → Section cut tool).'
            : 'No elevation viewport detected for this drawing.'}
      </div>
    );
  };

  return (
    <div className="cad-studio">
      <header className="cad-studio-top">
        <div className="cad-studio-brand">
          <h1>CAD Studio</h1>
          <p>Draw · modify · annotate — import DXF layers, edit plan, rebuild 3D.</p>
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
              loadPlate(demoCadPlate());
              setLayout('split');
              setPlateMode('floor');
              setStudioMode('draw');
              setSelection(null);
              setWallMulti([]);
            }}
          >
            Demo ranch
          </button>
          <button
            type="button"
            onClick={() => {
              loadPlate(stillwaterCadSheetPlate());
              setLayout('sheets');
            }}
          >
            Stillwater sheets
          </button>
          <span className="cad-action-sep" aria-hidden />
          <button
            type="button"
            disabled={!history.past.length}
            onClick={() => {
              gestureBaselineRef.current = null;
              setHistory((h) => undoCadHistory(h));
            }}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!history.future.length}
            onClick={() => {
              gestureBaselineRef.current = null;
              setHistory((h) => redoCadHistory(h));
            }}
            title="Redo (Ctrl+Y)"
          >
            Redo
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
        <aside className="cad-catalog" aria-label="Studio tools">
          <div className="cad-mode-ribbon" role="tablist" aria-label="Studio modes">
            {STUDIO_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={studioMode === mode.id}
                className={studioMode === mode.id ? 'is-active' : ''}
                onClick={() => {
                  setStudioMode(mode.id);
                  if (mode.id === 'sheets') setLayout('sheets');
                  else if (layout === 'sheets') setLayout('split');
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {(studioMode === 'draw' || studioMode === 'modify' || studioMode === 'annotate') && (
          <div className="cad-context-strip">
            {studioMode === 'draw' && (
              <section>
                <h2>Draw</h2>
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
                    className={editTool === 'opening' && openingKind === 'door' ? 'is-active' : ''}
                    onClick={() => pickTool('opening', { opening: 'door' })}
                  >
                    <strong>Door</strong>
                    <span>Hosted on wall</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'opening' && openingKind === 'window' ? 'is-active' : ''}
                    onClick={() => pickTool('opening', { opening: 'window' })}
                  >
                    <strong>Window</strong>
                    <span>Sill {windowSillFt}' AFF</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'opening' && openingKind === 'passage' ? 'is-active' : ''}
                    onClick={() => pickTool('opening', { opening: 'passage' })}
                  >
                    <strong>Passage</strong>
                    <span>Opening without leaf</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'opening' && openingKind === 'garage' ? 'is-active' : ''}
                    onClick={() => pickTool('opening', { opening: 'garage' })}
                  >
                    <strong>Garage</strong>
                    <span>~16' sectional</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'stair' ? 'is-active' : ''}
                    onClick={() => pickTool('stair')}
                  >
                    <strong>Stair</strong>
                    <span>Single click · straight run</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'guide' ? 'is-active' : ''}
                    onClick={() => pickTool('guide')}
                  >
                    <strong>Guide</strong>
                    <span>Construction aid</span>
                  </button>
                  <button
                    type="button"
                    className={editTool === 'select' ? 'is-active' : ''}
                    onClick={() => pickTool('select')}
                  >
                    <strong>Select</strong>
                    <span>Grips · move · multi</span>
                  </button>
                </div>
                <label className="cad-fixture-pick">
                  Window sill (ft above floor)
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={0.25}
                    value={windowSillFt}
                    onChange={(e) => setWindowSillFt(Number(e.target.value) || 0)}
                  />
                </label>
                <h2 style={{ marginTop: '0.75rem' }}>Fixtures</h2>
                <div className="cad-modify-bar" role="group" aria-label="Fixture tools">
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
                      {label}
                    </button>
                  ))}
                </div>
                <p className="cad-edit-hint">
                  Walls & openings: click start then end (Tab for length HUD). Escape cancels.
                </p>
              </section>
            )}

            {studioMode === 'modify' && (
              <section>
                <h2>Modify</h2>
                <div className="cad-modify-bar" role="group" aria-label="Modify tools">
                  <button
                    type="button"
                    className={editTool === 'select' ? 'is-active' : ''}
                    onClick={() => pickTool('select')}
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    className={editTool === 'trim' ? 'is-active' : ''}
                    onClick={() => pickTool('trim')}
                  >
                    Trim
                  </button>
                  <button
                    type="button"
                    className={editTool === 'extend' ? 'is-active' : ''}
                    onClick={() => pickTool('extend')}
                  >
                    Extend
                  </button>
                  <button
                    type="button"
                    className={editTool === 'break' ? 'is-active' : ''}
                    onClick={() => pickTool('break')}
                  >
                    Break
                  </button>
                  <button
                    type="button"
                    className={editTool === 'offset' ? 'is-active' : ''}
                    onClick={() => pickTool('offset')}
                  >
                    Offset
                  </button>
                  <button
                    type="button"
                    disabled={!selection || selection.kind !== 'wall'}
                    onClick={() => {
                      if (!selection || selection.kind !== 'wall') return;
                      const indices = wallMulti.includes(selection.index)
                        ? wallMulti
                        : [selection.index];
                      setPlate(copyWalls(plate, indices, 2, 0));
                      setStatusAid(`Copied ${indices.length} wall(s) +2' in X`);
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    disabled={!selection || selection.kind !== 'wall'}
                    onClick={() => {
                      if (!selection || selection.kind !== 'wall') return;
                      const indices = wallMulti.includes(selection.index)
                        ? wallMulti
                        : [selection.index];
                      const w = plate.wallCenterlines[selection.index]!;
                      const cx = (w.x1 + w.x2) / 2;
                      const cy = (w.y1 + w.y2) / 2;
                      setPlate(mirrorWalls(plate, indices, 'x', { x: cx, y: cy }));
                      setStatusAid(`Mirrored ${indices.length} wall(s)`);
                    }}
                  >
                    Mirror
                  </button>
                  <button
                    type="button"
                    className={editTool === 'delete' ? 'is-active' : ''}
                    onClick={() => pickTool('delete')}
                  >
                    Delete
                  </button>
                  <button type="button" disabled title="Coming">
                    Align
                  </button>
                  <button type="button" disabled title="Coming">
                    Combine
                  </button>
                </div>
                <p className="cad-edit-hint">
                  Trim / Extend need two wall clicks. Break / Offset are single-click. Shift+click multi-selects.
                </p>
              </section>
            )}

            {studioMode === 'annotate' && (
              <section>
                <h2>Annotate</h2>
                <div className="cad-catalog-items">
                  <button
                    type="button"
                    className={editTool === 'section' ? 'is-active' : ''}
                    onClick={() => pickTool('section')}
                  >
                    <strong>Section cut</strong>
                    <span>Draw cut line on plan</span>
                  </button>
                </div>
                <div className="cad-modify-bar" role="group" aria-label="Annotation toggles">
                  <button
                    type="button"
                    className={showExteriorDims ? 'is-active' : ''}
                    onClick={() => setShowExteriorDims((v) => !v)}
                  >
                    Ext dims {showExteriorDims ? 'on' : 'off'}
                  </button>
                  <button
                    type="button"
                    className={showInteriorDims ? 'is-active' : ''}
                    onClick={() => setShowInteriorDims((v) => !v)}
                  >
                    Int dims {showInteriorDims ? 'on' : 'off'}
                  </button>
                  <button
                    type="button"
                    className={showRoomFills ? 'is-active' : ''}
                    onClick={() => setShowRoomFills((v) => !v)}
                  >
                    Room fills {showRoomFills ? 'on' : 'off'}
                  </button>
                  <button
                    type="button"
                    className={plateMode === 'section' ? 'is-active' : ''}
                    disabled={!plate?.sectionCuts?.length}
                    onClick={() => {
                      setPlateMode('section');
                      setLayout('plate');
                    }}
                  >
                    View section
                  </button>
                  <button
                    type="button"
                    className={sectionClip ? 'is-active' : ''}
                    onClick={() => setSectionClip((v) => !v)}
                  >
                    3D section clip
                  </button>
                </div>
                <p className="cad-edit-hint">
                  Dimension-driven wall edit is coming — for now edit length in Properties after select.
                </p>
              </section>
            )}
          </div>
          )}

          {(studioMode === 'layers' ||
            studioMode === 'site' ||
            studioMode === 'roof' ||
            studioMode === 'sheets') && (
          <div className="cad-catalog-body">
            {studioMode === 'layers' && (
              <section className="cad-layer-panel">
                <h2>Layers</h2>
                <p className="cad-layer-summary">
                  {visibleCount} visible · {layerCount} total · soft hide (keeps authored walls)
                </p>
                <p className="cad-edit-hint">
                  Toggles hide layers in both 2D plan and 3D extrude.
                </p>
                <div className="cad-layer-presets">
                  <button type="button" onClick={() => setPlate(hideNonFloorPreset(plate))}>
                    Hide dims / roof / noise
                  </button>
                  <button type="button" onClick={() => setPlate(showWallsAndDoorsPreset(plate))}>
                    Walls + doors only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
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

            {studioMode === 'site' && (
              <section>
                <h2>Site</h2>
                <p className="cad-edit-hint">
                  Click polygon corners on the 2D plan. Close by clicking near the first point, double-click,
                  or Enter. Escape cancels.
                </p>
                <div className="cad-catalog-items">
                  {(
                    [
                      { id: 'terrace' as const, label: 'Terrace', hint: 'Patio / deck plate' },
                      { id: 'driveway' as const, label: 'Driveway', hint: 'Paved approach' },
                      { id: 'garden' as const, label: 'Garden', hint: 'Planting bed plate' },
                      { id: 'balcony' as const, label: 'Balcony', hint: 'Elevated slab' },
                      { id: 'plot' as const, label: 'Plot boundary', hint: 'Lot polyline' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={editTool === 'slab' && slabKind === item.id ? 'is-active' : ''}
                      onClick={() => pickTool('slab', { slab: item.id })}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.hint}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={editTool === 'select' ? 'is-active' : ''}
                    onClick={() => pickTool('select')}
                  >
                    <strong>Select / move</strong>
                    <span>Drag slabs on plan</span>
                  </button>
                </div>
                <div className="cad-sill-control" style={{ marginTop: 12 }}>
                  <label className="cad-fixture-pick">
                    <input
                      type="checkbox"
                      checked={!!plate?.foundation?.enabled}
                      disabled={!plate}
                      onChange={(e) => {
                        if (!plate) return;
                        setPlate(applyAutoFoundation(plate, { enabled: e.target.checked }));
                      }}
                    />{' '}
                    Auto foundation
                  </label>
                  <label>
                    Mode
                    <select
                      disabled={!plate}
                      value={plate?.foundation?.mode ?? 'slab+footing'}
                      onChange={(e) => {
                        if (!plate) return;
                        const mode = e.target.value as 'slab' | 'footing' | 'slab+footing';
                        setPlate(
                          applyAutoFoundation(plate, {
                            enabled: true,
                            mode,
                          }),
                        );
                      }}
                    >
                      <option value="slab">Slab only</option>
                      <option value="footing">Footing only</option>
                      <option value="slab+footing">Slab + footing</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!plate?.foundation?.enabled}
                    onClick={() => {
                      if (!plate) return;
                      setPlate(clearAutoFoundation(plate));
                    }}
                  >
                    Clear auto foundation
                  </button>
                </div>
                <div className="cad-sill-control" style={{ marginTop: 12 }}>
                  <label className="cad-fixture-pick">
                    <input
                      type="checkbox"
                      checked={!!plate?.terrain?.enabled}
                      disabled={!plate}
                      onChange={(e) => {
                        if (!plate) return;
                        setPlate(setPlateTerrain(plate, { enabled: e.target.checked }));
                      }}
                    />{' '}
                    Terrain slope
                  </label>
                  <label>
                    Grade %
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={0.5}
                      disabled={!plate}
                      value={plate?.terrain?.gradePercent ?? 4}
                      onChange={(e) => {
                        if (!plate) return;
                        setPlate(
                          setPlateTerrain(plate, {
                            enabled: true,
                            gradePercent: Number(e.target.value) || 0,
                          }),
                        );
                      }}
                    />
                  </label>
                </div>
                {(plate?.buildings?.length ?? 0) > 0 && (
                  <div className="cad-room-schedule" style={{ marginTop: 12 }}>
                    <h3>Buildings</h3>
                    <ul>
                      {plate!.buildings!.map((b) => (
                        <li key={b.id}>
                          <label className="cad-fixture-pick">
                            <input
                              type="checkbox"
                              checked={b.visible}
                              onChange={() => setPlate(toggleBuildingVisible(plate!, b.id))}
                            />{' '}
                            {b.name}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {studioMode === 'roof' && (
              <section>
                <h2>Roof</h2>
                <p className="cad-edit-hint">
                  Styles rebuild from the exterior wall contour. Auto keeps a DXF elevation profile when
                  present.
                </p>
                <div className="cad-catalog-items">
                  {(
                    [
                      { id: 'auto' as const, label: 'Auto', hint: 'DXF profile or gable' },
                      { id: 'gable' as const, label: 'Gable', hint: 'Dual slope from contour' },
                      { id: 'flat' as const, label: 'Flat', hint: 'Low plate roof' },
                      { id: 'shed' as const, label: 'Shed', hint: 'Single slope' },
                    ] as const
                  ).map((item) => {
                    const active = (plate?.roof?.kind ?? 'auto') === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={active ? 'is-active' : ''}
                        disabled={!plate}
                        onClick={() => {
                          if (!plate) return;
                          setPlate(
                            setPlateRoof(plate, {
                              kind: item.id as CadRoofKind,
                              forceProcedural: item.id !== 'auto',
                            }),
                          );
                          setLayout('massing');
                        }}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="cad-sill-control">
                  <label>
                    Pitch (rise / 12)
                    <input
                      type="number"
                      min={0}
                      max={18}
                      step={1}
                      disabled={!plate}
                      value={plate?.roof?.pitchRise12 ?? DEFAULT_ROOF_OVERRIDES.pitchRise12}
                      onChange={(e) => {
                        if (!plate) return;
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        setPlate(setPlateRoof(plate, { pitchRise12: v, forceProcedural: true }));
                      }}
                    />
                  </label>
                  <label>
                    Overhang (ft)
                    <input
                      type="number"
                      min={0}
                      max={4}
                      step={0.25}
                      disabled={!plate}
                      value={plate?.roof?.overhangFt ?? DEFAULT_ROOF_OVERRIDES.overhangFt}
                      onChange={(e) => {
                        if (!plate) return;
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        setPlate(setPlateRoof(plate, { overhangFt: v }));
                      }}
                    />
                  </label>
                </div>
                <button type="button" onClick={() => setLayout('massing')} disabled={!can3d}>
                  Open massing roof view
                </button>
                <div className="cad-catalog-items" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className={editTool === 'dormer' ? 'is-active' : ''}
                    onClick={() => pickTool('dormer')}
                  >
                    <strong>Place dormer</strong>
                    <span>Click on plan near roof</span>
                  </button>
                </div>
              </section>
            )}


            {studioMode === 'sheets' && (
              <section>
                <h2>Sheets</h2>
                <p className="cad-edit-hint">
                  Title block, sheet set, and export package for permit / client deliverables.
                </p>
                <div className="cad-sill-control">
                  <label>
                    Project name
                    <input
                      type="text"
                      disabled={!plate}
                      value={plate?.titleBlock?.projectName ?? ''}
                      onChange={(e) => {
                        if (!plate) return;
                        setPlate(setPlateTitleBlock(plate, { projectName: e.target.value }));
                      }}
                    />
                  </label>
                  <label>
                    Scale
                    <input
                      type="text"
                      disabled={!plate}
                      value={plate?.titleBlock?.scaleLabel ?? '1/4" = 1\'-0"'}
                      onChange={(e) => {
                        if (!plate) return;
                        setPlate(setPlateTitleBlock(plate, { scaleLabel: e.target.value }));
                      }}
                    />
                  </label>
                  <label>
                    Revision
                    <input
                      type="text"
                      disabled={!plate}
                      value={plate?.titleBlock?.revision ?? 'A'}
                      onChange={(e) => {
                        if (!plate) return;
                        setPlate(setPlateTitleBlock(plate, { revision: e.target.value }));
                      }}
                    />
                  </label>
                </div>
              <div className="cad-export-actions">
                <h3>Export</h3>
                <button
                  type="button"
                  disabled={!plate}
                  onClick={() => {
                    if (!plate) return;
                    const base = (plate.sourceFileName || 'cad-plate').replace(/\.(dxf|dwg)$/i, '');
                    downloadTextFile(`${base}.dxf`, exportCadPlateDxf(plate), 'application/dxf');
                  }}
                >
                  Download DXF
                </button>
                <button
                  type="button"
                  disabled={!plate}
                  onClick={() => {
                    if (!plate) return;
                    const base = (plate.sourceFileName || 'cad-plate').replace(/\.(dxf|dwg)$/i, '');
                    downloadTextFile(
                      `${base}-rooms.csv`,
                      exportCadRoomScheduleCsv(plate),
                      'text/csv;charset=utf-8',
                    );
                  }}
                >
                  Download room CSV
                </button>
                <button
                  type="button"
                  disabled={!plate}
                  onClick={() => {
                    if (!plate) return;
                    const base = (plate.sourceFileName || 'cad-plate').replace(/\.(dxf|dwg)$/i, '');
                    const svg = renderCadPlateSvg(plate, { title: plate.sourceFileName });
                    void downloadSvgAsPng(svg, `${base}-floor.png`);
                  }}
                >
                  Download floor PNG
                </button>
                <button
                  type="button"
                  disabled={!plate}
                  onClick={() => {
                    if (!plate) return;
                    const base = (plate.sourceFileName || 'cad-plate').replace(/\.(dxf|dwg)$/i, '');
                    downloadTextFile(
                      `${base}-sheet-set.html`,
                      exportCadSheetSetHtml(plate),
                      'text/html;charset=utf-8',
                    );
                  }}
                >
                  Download sheet set
                </button>
                <button
                  type="button"
                  disabled={!plate}
                  onClick={() => {
                    if (!plate) return;
                    const base = (plate.sourceFileName || 'cad-plate').replace(/\.(dxf|dwg)$/i, '');
                    downloadTextFile(
                      `${base}.gltf`,
                      exportCadPlateGltf(plate),
                      'model/gltf+json',
                    );
                  }}
                >
                  Download glTF
                </button>
                <button
                  type="button"
                  disabled={!plate?.sectionCuts?.length}
                  onClick={() => {
                    if (!plate?.sectionCuts?.[0]) return;
                    const base = (plate.sourceFileName || 'cad-plate').replace(/\.(dxf|dwg)$/i, '');
                    const svg = renderCadSectionSvg(
                      buildCadSectionDrawing(plate, plate.sectionCuts[0]),
                      { title: plate.sectionCuts[0].label },
                    );
                    void downloadSvgAsPng(svg, `${base}-section.png`);
                  }}
                >
                  Download section PNG
                </button>
              </div>

              </section>
            )}
          </div>
          )}

            <section className="cad-inspector cad-inspector-sticky">
              <h2>Properties</h2>
              {selection ? (
                <div className="cad-selection-inspector">
                  <div className="cad-selection-title">{selectionSummary(plate, selection)}</div>
                  {selection.kind === 'wall' && plate.wallCenterlines[selection.index] && (
                    <div className="cad-sill-control">
                      <label>
                        Length
                        <input
                          ref={wallLengthInputRef}
                          type="text"
                          key={`wall-len-${selection.index}-${formatWallLengthFt(segLengthFt(plate.wallCenterlines[selection.index]!))}`}
                          defaultValue={formatWallLengthFt(segLengthFt(plate.wallCenterlines[selection.index]!))}
                          onBlur={(e) => {
                            const len = parseArchitecturalLength(e.target.value);
                            if (len == null) return;
                            setPlate(
                              resyncHostedOpenings(
                                setWallLength(plate, selection.index, len, 'start'),
                                selection.index,
                              ),
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </label>
                      <label>
                        Angle (°)
                        <input
                          type="text"
                          key={`wall-ang-${selection.index}-${wallAngleDeg(plate.wallCenterlines[selection.index]!).toFixed(1)}`}
                          defaultValue={wallAngleDeg(plate.wallCenterlines[selection.index]!).toFixed(1)}
                          onBlur={(e) => {
                            const ang = parseAngleDeg(e.target.value);
                            if (ang == null) return;
                            setPlate(
                              resyncHostedOpenings(
                                setWallAngle(plate, selection.index, ang, 'mid'),
                                selection.index,
                              ),
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setPlate(resyncHostedOpenings(flipWall(plate, selection.index), selection.index))
                        }
                      >
                        Flip 180°
                      </button>
                      <label>
                        Thickness (ft)
                        <input
                          type="number"
                          min={0.2}
                          max={1.5}
                          step={0.05}
                          value={defaultWallThicknessFt(plate.wallCenterlines[selection.index]!)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(setWallThickness(plate, selection.index, v));
                          }}
                        />
                      </label>
                      <div className="cad-catalog-items" style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => setPlate(setWallThickness(plate, selection.index, 0.5))}
                        >
                          <strong>Exterior 6"</strong>
                          <span>0.50 ft</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlate(setWallThickness(plate, selection.index, 0.333))}
                        >
                          <strong>Interior 4"</strong>
                          <span>0.33 ft</span>
                        </button>
                      </div>
                      <div className="cad-paint-presets" role="group" aria-label="Wall paint">
                        <span className="cad-paint-label">Paint</span>
                        {CAD_WALL_MATERIALS.map((mat) => {
                          const active =
                            (plate.wallCenterlines[selection.index]!.materialId ??
                              (plate.wallCenterlines[selection.index]!.exterior ? 'stucco' : 'interior')) ===
                            mat.id;
                          return (
                            <button
                              key={mat.id}
                              type="button"
                              className={active ? 'is-active' : ''}
                              onClick={() =>
                                setPlate(setWallMaterial(plate, selection.index, mat.id as CadWallMaterialId))
                              }
                            >
                              {mat.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {selection.kind === 'opening' && plate.openingHints[selection.index] && (
                    <div className="cad-sill-control">
                      <label>
                        Width (ft)
                        <input
                          type="number"
                          min={0.5}
                          max={20}
                          step={0.25}
                          value={
                            plate.openingHints[selection.index]!.widthFt ??
                            segLengthFt(plate.openingHints[selection.index]!)
                          }
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(setOpeningWidth(plate, selection.index, v));
                          }}
                        />
                      </label>
                      {plate.openingHints[selection.index]!.kind === 'window' && (
                        <label>
                          Sill (ft AFF)
                          <input
                            type="number"
                            min={0}
                            max={8}
                            step={0.25}
                            value={plate.openingHints[selection.index]!.sillFt ?? 0}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isFinite(v)) return;
                              setPlate(setOpeningSill(plate, selection.index, v));
                            }}
                          />
                        </label>
                      )}
                      <button type="button" onClick={() => setPlate(flipOpeningHand(plate, selection.index))}>
                        Flip hand
                      </button>
                    </div>
                  )}
                  {selection.kind === 'stair' && plate.stairs?.[selection.index] && (
                    <div className="cad-sill-control">
                      <label>
                        Steps
                        <input
                          type="number"
                          min={3}
                          max={40}
                          step={1}
                          value={plate.stairs[selection.index]!.steps}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(updateStair(plate, selection.index, { steps: Math.round(v) }));
                          }}
                        />
                      </label>
                      <label>
                        Run (ft)
                        <input
                          type="number"
                          min={2}
                          max={30}
                          step={0.25}
                          value={plate.stairs[selection.index]!.runFt}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(updateStair(plate, selection.index, { runFt: v }));
                          }}
                        />
                      </label>
                      <label className="cad-fixture-pick">
                        <input
                          type="checkbox"
                          checked={!!plate.stairs[selection.index]!.railing}
                          onChange={(e) =>
                            setPlate(updateStair(plate, selection.index, { railing: e.target.checked }))
                          }
                        />{' '}
                        Railing
                      </label>
                    </div>
                  )}
                  {selection.kind === 'slab' && plate.slabs?.[selection.index] && (
                    <div className="cad-sill-control">
                      <label>
                        Thickness (ft)
                        <input
                          type="number"
                          min={0.1}
                          max={2}
                          step={0.05}
                          value={plate.slabs[selection.index]!.thicknessFt}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(updateSlab(plate, selection.index, { thicknessFt: v }));
                          }}
                        />
                      </label>
                      <label>
                        Elevation Z (ft)
                        <input
                          type="number"
                          min={-2}
                          max={40}
                          step={0.25}
                          value={plate.slabs[selection.index]!.elevationFt}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(updateSlab(plate, selection.index, { elevationFt: v }));
                          }}
                        />
                      </label>
                      <label className="cad-fixture-pick">
                        <input
                          type="checkbox"
                          checked={!!plate.slabs[selection.index]!.railing}
                          onChange={(e) =>
                            setPlate(updateSlab(plate, selection.index, { railing: e.target.checked }))
                          }
                        />{' '}
                        Perimeter railing
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    className="cad-delete-btn"
                    onClick={() => {
                      setPlate(deleteSelection(plate, selection));
                      setSelection(null);
                      setWallMulti([]);
                    }}
                  >
                    Delete selected
                  </button>
                </div>
              ) : (
                <p className="cad-edit-hint">Select a wall, door, fixture, slab, stair, or label on the 2D plan.</p>
              )}
              {roomSchedule.length > 0 && (
                <div className="cad-room-schedule">
                  <h3>Room schedule</h3>
                  <ul>
                    {roomSchedule.map((r) => (
                      <li key={`${r.name}-${r.areaSqFt}`}>
                        <span>{r.name}</span>
                        <span>{r.areaLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="cad-stats">
                <div>File: {plate?.sourceFileName ?? '—'}</div>
                <div>Walls: {plate?.wallCenterlines.length ?? 0}</div>
                <div>Openings: {plate?.openingHints.length ?? 0}</div>
                <div>Stairs: {plate?.stairs?.length ?? 0}</div>
                <div>Slabs: {plate?.slabs?.length ?? 0}</div>
                <div>Fixtures: {plate?.segments.filter((s) => s.role === 'fixture').length ?? 0}</div>
                <div>3D fixtures: {extrusion?.fixtures.length ?? 0}</div>
                <div>
                  Tool: {editTool}
                  {editTool === 'wall' ? ` · ${wallLayer}` : ''}
                  {editTool === 'opening' ? ` · ${openingKind}` : ''}
                  {editTool === 'slab' ? ` · ${slabKind}` : ''}
                </div>
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
                <button
                  type="button"
                  className={showExteriorDims ? 'is-active' : ''}
                  onClick={() => setShowExteriorDims((v) => !v)}
                  title="Automatic exterior dimension chains"
                >
                  Ext dims {showExteriorDims ? 'on' : 'off'}
                </button>
                <button
                  type="button"
                  className={showInteriorDims ? 'is-active' : ''}
                  onClick={() => setShowInteriorDims((v) => !v)}
                  title="Interior wall dimensions"
                >
                  Int dims {showInteriorDims ? 'on' : 'off'}
                </button>
                <button
                  type="button"
                  className={showRoomFills ? 'is-active' : ''}
                  onClick={() => setShowRoomFills((v) => !v)}
                  title="Room fill polygons"
                >
                  Fills {showRoomFills ? 'on' : 'off'}
                </button>
                <label className="cad-sun-control" title="Sun hour for 3D lighting">
                  Sun {sunHour}:00
                  <input
                    type="range"
                    min={6}
                    max={18}
                    step={1}
                    value={sunHour}
                    onChange={(e) => setSunHour(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className={shadowsOn ? 'is-active' : ''}
                  onClick={() => setShadowsOn((v) => !v)}
                  title="Toggle 3D shadows"
                >
                  Shadows {shadowsOn ? 'on' : 'off'}
                </button>
                <span className="cad-unit-pill">{unitLabel === 'ft-in' ? 'ft / in' : 'm'}</span>
                <span className="cad-aid-hint">{modifyHint}</span>
              </div>
            </div>
          )}

          <main
            className={`cad-main ${layout === 'split' ? 'cad-main-split' : ''} ${layout === 'sheets' ? 'cad-main-sheets' : ''}`}
          >
            {show2d && (
              <div className="cad-plate-host">
                {modeBanner && (
                  <div className="cad-mode-banner" role="status">
                    {modeBanner}
                  </div>
                )}
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
                  <button
                    type="button"
                    className={plateMode === 'section' ? 'is-active' : ''}
                    onClick={() => setPlateMode('section')}
                    disabled={!plate?.sectionCuts?.length}
                  >
                    Section
                  </button>
                </div>
                <div className="cad-pane-scroll">{renderFloorPane()}</div>
              </div>
            )}

            {show3d && extrusion && (
              <div className="cad-extrude-host" aria-label="Live 3D">
                <div className="cad-pane-label">3D</div>
                <CadExtrudeView
                  extrusion={extrusion}
                  plate={plate}
                  sunHour={sunHour}
                  shadows={shadowsOn}
                  sectionClip={sectionClip}
                />
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
