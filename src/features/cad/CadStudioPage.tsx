import { useMemo, useRef, useState } from 'react';
import {
  addStory,
  alignWalls,
  applyAutoFoundation,
  applyOpeningPreset,
  assignOpeningMarks,
  autoHostOpenings,
  buildCadPlateFromDxf,
  CAD_WALL_MATERIALS,
  calibrateUnderlay,
  clearAutoFoundation,
  combineCollinearWalls,
  convertSegmentToOpening,
  copySelectionToStory,
  createCadHistory,
  copyWalls,
  demoCadPlate,
  deleteSelection,
  detectOpeningClashes,
  downloadSvgAsPng,
  downloadTextFile,
  ensureDefaultStories,
  exportCadPlateDxf,
  exportCadPlateGltf,
  exportCadRoomScheduleCsv,
  exportCadSheetSetHtml,
  exportDoorWindowScheduleCsv,
  extrudeCadPlate,
  flipOpeningHand,
  flipPlan,
  flipWall,
  formatWallLengthFt,
  hideNonFloorPreset,
  listConvertibleOpeningSegments,
  listUnhostedOpenings,
  mirrorWalls,
  normalizeOpeningDefaults,
  OLSEN_OPENING_PRESETS,
  parseAngleDeg,
  parseArchitecturalLength,
  promoteTempDimToAnnotative,
  redoCadHistory,
  removeLayer,
  renameRoomLabel,
  renderCadElevationSvg,
  renderCadPlateSvg,
  renderCadSectionSvg,
  replaceCadPresent,
  previewCadPresent,
  commitCadPresent,
  buildCadSectionDrawing,
  restoreDesignSnapshot,
  resyncHostedOpenings,
  roleToClassify,
  roomScheduleSummary,
  saveDesignSnapshot,
  segLengthFt,
  selectionSummary,
  setActiveStory,
  setAnnotativeDimLocked,
  setDistanceBetweenWalls,
  setLayerClassify,
  setOpeningHeight,
  setOpeningSill,
  setOpeningSwing,
  setOpeningWidth,
  setPlateRoof,
  setPlateTerrain,
  setPlateTitleBlock,
  setUnderlay,
  setUnderlayOpacity,
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
  ensureModelKernel,
  CAD_WALL_TYPES,
  CAD_OPENING_TYPES,
  applyWallType,
  applyOpeningType,
  setWallStory,
  setOpeningStory,
  type CadEditTool,
  type CadHistoryState,
  type CadLayerClassify,
  type CadPlateSelection,
  type CadTempDim,
  type CadWallMaterialId,
} from '../../lib/cadStudio';
import type { CadFixtureKind, CadPlate, CadRoofKind, CadSlabKind } from '../../lib/cadStudio/types';
import { defaultOpeningHeightFt } from '../../lib/cadStudio/cadOpeningEdit';
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
  const [history, setHistory] = useState<CadHistoryState>(() =>
    createCadHistory(normalizeOpeningDefaults(demoCadPlate())),
  );
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
    const cleaned = ensureModelKernel(
      normalizeOpeningDefaults(
        ensureDefaultStories(autoHostOpenings(assignOpeningMarks(p))),
      ),
    );
    setHistory((h) => replaceCadPresent(h, cleaned));
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
  const [openingMulti, setOpeningMulti] = useState<number[]>([]);
  const [statusAid, setStatusAid] = useState('');
  const [snapshotName, setSnapshotName] = useState('Scheme A');
  const [layerFilter, setLayerFilter] = useState('');
  const [snapOn, setSnapOn] = useState(true);
  const [unitLabel] = useState<'ft-in' | 'm'>('ft-in');
  const [sunHour, setSunHour] = useState(14);
  const [shadowsOn, setShadowsOn] = useState(true);
  const [sectionClip, setSectionClip] = useState(false);
  const [setDistanceInput, setSetDistanceInput] = useState(`4'-0"`);
  const [underlayKnownFt, setUnderlayKnownFt] = useState(`40'-0"`);
  const [underlayMeasuredFt, setUnderlayMeasuredFt] = useState(`20'-0"`);
  const [newStoryName, setNewStoryName] = useState('Level 2');
  const [newStoryLevel, setNewStoryLevel] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);
  const underlayFileRef = useRef<HTMLInputElement>(null);
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
  const openingClashes = useMemo(() => detectOpeningClashes(plate), [plate]);
  const unhostedOpenings = useMemo(() => listUnhostedOpenings(plate), [plate]);
  const convertibleSegments = useMemo(() => listConvertibleOpeningSegments(plate), [plate]);

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
    setOpeningMulti([]);
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

  const storyLevels = useMemo(() => ensureDefaultStories(plate).stories ?? [], [plate]);

  const selectedWallIndices = useMemo(() => {
    if (!selection || selection.kind !== 'wall') return [] as number[];
    const set = new Set([selection.index, ...wallMulti]);
    return [...set];
  }, [selection, wallMulti]);

  const requestWallLengthEdit = (index: number) => {
    setSelection({ kind: 'wall', index });
    setStudioMode('modify');
    queueMicrotask(() => wallLengthInputRef.current?.focus());
  };

  const onPromoteTempDim = (dim: CadTempDim) => {
    setPlate(promoteTempDimToAnnotative(plate, dim));
    setStatusAid('Promoted temp dim to annotative (auto dims will not wipe it)');
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
          openingMulti={openingMulti}
          onOpeningMultiChange={setOpeningMulti}
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
          onPromoteTempDim={onPromoteTempDim}
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
          <p>Olsen Custom Homes</p>
        </div>

        <div className="cad-studio-actions">
          <div className="cad-action-group" aria-label="File">
            <label className="cad-file-btn cad-btn-primary">
              {busy ? 'Importing…' : 'Import'}
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
            <details className="cad-samples-menu">
              <summary className="cad-btn">Samples</summary>
              <div className="cad-samples-panel" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    loadPlate(demoCadPlate());
                    setLayout('split');
                    setPlateMode('floor');
                    setStudioMode('draw');
                    setSelection(null);
                    setWallMulti([]);
                    const menu = e.currentTarget.closest('details');
                    if (menu) menu.open = false;
                  }}
                >
                  Demo ranch
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    loadPlate(stillwaterCadSheetPlate());
                    setLayout('sheets');
                    const menu = e.currentTarget.closest('details');
                    if (menu) menu.open = false;
                  }}
                >
                  Stillwater sheets
                </button>
              </div>
            </details>
          </div>

          <span className="cad-action-sep" aria-hidden />

          <div className="cad-action-group" aria-label="History">
            <button
              type="button"
              className="cad-btn"
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
              className="cad-btn"
              disabled={!history.future.length}
              onClick={() => {
                gestureBaselineRef.current = null;
                setHistory((h) => redoCadHistory(h));
              }}
              title="Redo (Ctrl+Y)"
            >
              Redo
            </button>
          </div>

          <span className="cad-action-sep" aria-hidden />

          <div className="cad-action-group" aria-label="Layout">
            <div className="cad-view-toggle" role="group" aria-label="Layout">
              <button type="button" className={layout === 'split' ? 'is-active' : ''} onClick={() => setLayout('split')}>
                Split
              </button>
              <button type="button" className={layout === 'plate' ? 'is-active' : ''} onClick={() => setLayout('plate')}>
                2D
              </button>
              <button
                type="button"
                className={layout === 'extrude' ? 'is-active' : ''}
                onClick={() => setLayout('extrude')}
                disabled={!can3d}
              >
                3D
              </button>
              <button
                type="button"
                className={layout === 'massing' ? 'is-active' : ''}
                onClick={() => setLayout('massing')}
                disabled={!can3d}
              >
                Mass
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
          </div>
        </div>

        <div className="cad-status">
          {error ? <span className="cad-error">{error}</span> : progressLabel(progress) || 'Shift ortho · Esc cancel · Ctrl+Z undo'}
        </div>
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
                  <button
                    type="button"
                    disabled={selectedWallIndices.length < 2}
                    title="Align midpoints of selected walls on X"
                    onClick={() => {
                      setPlate(alignWalls(plate, selectedWallIndices, 'x'));
                      setStatusAid(`Aligned ${selectedWallIndices.length} walls on X`);
                    }}
                  >
                    Align X
                  </button>
                  <button
                    type="button"
                    disabled={selectedWallIndices.length < 2}
                    title="Align midpoints of selected walls on Y"
                    onClick={() => {
                      setPlate(alignWalls(plate, selectedWallIndices, 'y'));
                      setStatusAid(`Aligned ${selectedWallIndices.length} walls on Y`);
                    }}
                  >
                    Align Y
                  </button>
                  <button
                    type="button"
                    title="Merge collinear abutting walls"
                    onClick={() => {
                      const before = plate.wallCenterlines.length;
                      const next = combineCollinearWalls(plate);
                      setPlate(next);
                      setStatusAid(
                        `Combine: ${before} → ${next.wallCenterlines.length} walls`,
                      );
                    }}
                  >
                    Combine
                  </button>
                  <button
                    type="button"
                    disabled={selectedWallIndices.length !== 2}
                    title="Set centerline distance between two selected walls"
                    onClick={() => {
                      if (selectedWallIndices.length !== 2) return;
                      const dist = parseArchitecturalLength(setDistanceInput);
                      if (dist == null) {
                        setStatusAid('Enter a distance like 4\'-0"');
                        return;
                      }
                      const [a, b] = selectedWallIndices;
                      setPlate(setDistanceBetweenWalls(plate, a!, b!, dist));
                      setStatusAid(`Set distance to ${formatWallLengthFt(dist)}`);
                    }}
                  >
                    Set distance
                  </button>
                  <button
                    type="button"
                    title="Attach unhosted openings to nearest walls"
                    onClick={() => {
                      const before = plate.openingHints.filter((o) => o.hostWallIndex == null).length;
                      const next = autoHostOpenings(plate);
                      setPlate(next);
                      const after = next.openingHints.filter((o) => o.hostWallIndex == null).length;
                      setStatusAid(`Auto-host: ${before - after} openings attached`);
                    }}
                  >
                    Auto-host
                  </button>
                  <button
                    type="button"
                    title="Mirror whole plan about vertical center (scheme flip)"
                    onClick={() => {
                      setPlate(flipPlan(plate, 'x'));
                      setStatusAid('Flipped plan on X');
                    }}
                  >
                    Flip X
                  </button>
                </div>
                {selectedWallIndices.length === 2 && (
                  <label className="cad-set-distance">
                    Distance
                    <input
                      type="text"
                      value={setDistanceInput}
                      onChange={(e) => setSetDistanceInput(e.target.value)}
                      aria-label="Set distance between walls"
                    />
                  </label>
                )}
                <p className="cad-edit-hint">
                  Trim / Extend need two wall clicks. Break / Offset are single-click. Shift+click multi-selects.
                  Endpoint grips stretch shared nodes. Click a temp dim to type exact length.
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
                  <button
                    type="button"
                    onClick={() => {
                      setPlate(assignOpeningMarks(plate));
                      setStatusAid('Assigned door/window marks');
                    }}
                  >
                    Assign marks
                  </button>
                </div>
                {(plate.annotativeDims?.length ?? 0) > 0 && (
                  <div className="cad-anno-locks" style={{ marginTop: 10 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: '0.85rem' }}>Annotative dims</h3>
                    <ul className="cad-anno-lock-list">
                      {plate.annotativeDims!.map((d) => (
                        <li key={d.id}>
                          <span>{d.label}</span>
                          <button
                            type="button"
                            className={d.locked ? 'is-active' : ''}
                            onClick={() =>
                              setPlate(setAnnotativeDimLocked(plate, d.id, !d.locked))
                            }
                          >
                            {d.locked ? 'Unlock' : 'Lock'}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="cad-edit-hint">
                      Double-click a temp dim (or Keep in HUD) to promote. Locked dims keep their value.
                    </p>
                  </div>
                )}
                <p className="cad-edit-hint">
                  Select a wall or opening to show temporary dims — click the value, type length, Enter.
                  Shift+select two walls for a between-walls distance dim. Shift+select two openings for
                  between-opening spacing. Click overall exterior dims to resize the plan.
                </p>
                {(unhostedOpenings.length > 0 || convertibleSegments.length > 0) && (
                  <div className="cad-opening-review" style={{ marginTop: 10 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: '0.85rem' }}>Opening import review</h3>
                    {unhostedOpenings.length > 0 && (
                      <>
                        <p className="cad-edit-hint">{unhostedOpenings.length} unhosted</p>
                        <button
                          type="button"
                          onClick={() => {
                            setPlate(autoHostOpenings(plate));
                            setStatusAid('Auto-hosted openings');
                          }}
                        >
                          Auto-host all
                        </button>
                      </>
                    )}
                    {convertibleSegments.slice(0, 6).map((s) => (
                      <button
                        key={s.segmentIndex}
                        type="button"
                        style={{ display: 'block', marginTop: 4 }}
                        onClick={() => {
                          const kind = /win/i.test(s.layer) ? 'window' : 'door';
                          setPlate(convertSegmentToOpening(plate, s.segmentIndex, kind));
                          setStatusAid(`Converted segment on ${s.layer}`);
                        }}
                      >
                        Convert {s.layer} ({s.lengthFt.toFixed(1)}′) → opening
                      </button>
                    ))}
                  </div>
                )}
                {openingClashes.length > 0 && (
                  <ul className="cad-warnings" style={{ marginTop: 8 }}>
                    {openingClashes.slice(0, 4).map((c, i) => (
                      <li key={`${c.kind}-${c.openingIndex}-${i}`}>{c.message}</li>
                    ))}
                  </ul>
                )}
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
                <div className="cad-underlay-panel" style={{ marginTop: 12 }}>
                  <h3 style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>Underlay</h3>
                  <input
                    ref={underlayFileRef}
                    type="file"
                    accept="image/*,.pdf"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !plate) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const url = String(reader.result ?? '');
                        if (!url) return;
                        const { minX, minY, maxX, maxY } = plate.bounds;
                        const widthFt = Math.max(10, maxX - minX);
                        const heightFt = Math.max(10, maxY - minY);
                        setPlate(
                          setUnderlay(plate, {
                            id: `underlay-${Date.now().toString(36)}`,
                            imageUrl: url,
                            xFt: minX,
                            yFt: minY,
                            widthFt,
                            heightFt,
                            opacity: 0.45,
                            locked: false,
                          }),
                        );
                        setStatusAid(`Underlay loaded: ${file.name}`);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <div className="cad-modify-bar">
                    <button type="button" onClick={() => underlayFileRef.current?.click()}>
                      Load image
                    </button>
                    <button
                      type="button"
                      disabled={!plate.underlay}
                      onClick={() => {
                        setPlate(setUnderlay(plate, null));
                        setStatusAid('Underlay cleared');
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  {plate.underlay && (
                    <>
                      <label>
                        Opacity
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={plate.underlay.opacity}
                          onChange={(e) =>
                            setPlate(setUnderlayOpacity(plate, Number(e.target.value)))
                          }
                        />
                      </label>
                      <div className="cad-sill-control">
                        <label>
                          Known length
                          <input
                            type="text"
                            value={underlayKnownFt}
                            onChange={(e) => setUnderlayKnownFt(e.target.value)}
                          />
                        </label>
                        <label>
                          Measured on underlay
                          <input
                            type="text"
                            value={underlayMeasuredFt}
                            onChange={(e) => setUnderlayMeasuredFt(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const known = parseArchitecturalLength(underlayKnownFt);
                            const measured = parseArchitecturalLength(underlayMeasuredFt);
                            if (known == null || measured == null) {
                              setStatusAid('Enter known and measured lengths');
                              return;
                            }
                            setPlate(calibrateUnderlay(plate, known, measured));
                            setStatusAid('Underlay calibrated');
                          }}
                        >
                          Calibrate
                        </button>
                      </div>
                    </>
                  )}
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
                    const marked = assignOpeningMarks(plate);
                    setPlate(marked);
                    downloadTextFile(
                      `${base}-openings.csv`,
                      exportDoorWindowScheduleCsv(marked),
                      'text/csv;charset=utf-8',
                    );
                  }}
                >
                  Download door/window CSV
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
                      <label>
                        Wall type
                        <select
                          value={plate.wallCenterlines[selection.index]!.typeId ?? (plate.wallCenterlines[selection.index]!.exterior ? 'wall-ext-2x6' : 'wall-int-2x4')}
                          onChange={(e) =>
                            setPlate(applyWallType(plate, selection.index, e.target.value as import('../../lib/cadStudio/types').CadWallTypeId))
                          }
                        >
                          {CAD_WALL_TYPES.map((wt) => (
                            <option key={wt.id} value={wt.id}>
                              {wt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!!plate.stories?.length && (
                        <label>
                          Story
                          <select
                            value={plate.wallCenterlines[selection.index]!.storyId ?? plate.activeStoryId ?? ''}
                            onChange={(e) => setPlate(setWallStory(plate, selection.index, e.target.value))}
                          >
                            {plate.stories.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  )}
                  {selection.kind === 'opening' && plate.openingHints[selection.index] && (
                    <div className="cad-sill-control">
                      <label>
                        Mark
                        <input
                          type="text"
                          key={`open-mark-${selection.index}-${plate.openingHints[selection.index]!.mark ?? ''}`}
                          defaultValue={plate.openingHints[selection.index]!.mark ?? ''}
                          onBlur={(e) => {
                            const mark = e.target.value.trim();
                            const openings = plate.openingHints.map((o, i) =>
                              i === selection.index ? { ...o, mark: mark || undefined } : o,
                            );
                            setPlate({ ...plate, openingHints: openings });
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </label>
                      <label>
                        Preset
                        <select
                          value=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (!id) return;
                            setPlate(applyOpeningPreset(plate, selection.index, id));
                            setStatusAid(`Applied preset ${id}`);
                          }}
                        >
                          <option value="">Olsen sizes…</option>
                          {OLSEN_OPENING_PRESETS.filter(
                            (p) =>
                              p.kind === plate.openingHints[selection.index]!.kind ||
                              plate.openingHints[selection.index]!.kind === 'door',
                          ).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
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
                      <label>
                        Height (ft)
                        <input
                          type="number"
                          min={0.5}
                          max={12}
                          step={0.25}
                          value={
                            plate.openingHints[selection.index]!.heightFt ??
                            defaultOpeningHeightFt(plate.openingHints[selection.index]!.kind)
                          }
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(setOpeningHeight(plate, selection.index, v));
                          }}
                        />
                      </label>
                      {(plate.openingHints[selection.index]!.kind === 'window' ||
                        plate.openingHints[selection.index]!.kind === 'door') && (
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
                      {plate.openingHints[selection.index]!.kind === 'door' && (
                        <label>
                          Swing
                          <select
                            value={plate.openingHints[selection.index]!.swing ?? 'left'}
                            onChange={(e) =>
                              setPlate(
                                setOpeningSwing(
                                  plate,
                                  selection.index,
                                  e.target.value as 'left' | 'right' | 'none',
                                ),
                              )
                            }
                          >
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                            <option value="none">None</option>
                          </select>
                        </label>
                      )}
                      <div className="cad-edit-hint">
                        Host:{' '}
                        {plate.openingHints[selection.index]!.hostWallIndex != null
                          ? `Wall ${plate.openingHints[selection.index]!.hostWallIndex}`
                          : 'Unhosted — use Auto-host'}
                      </div>
                      <button type="button" onClick={() => setPlate(flipOpeningHand(plate, selection.index))}>
                        Flip hand
                      </button>
                      <label>
                        Opening type
                        <select
                          value={plate.openingHints[selection.index]!.typeId ?? 'door-3068'}
                          onChange={(e) =>
                            setPlate(
                              applyOpeningType(
                                plate,
                                selection.index,
                                e.target.value as import('../../lib/cadStudio/types').CadOpeningTypeId,
                              ),
                            )
                          }
                        >
                          {CAD_OPENING_TYPES.filter(
                            (ot) =>
                              ot.kind === plate.openingHints[selection.index]!.kind ||
                              true,
                          ).map((ot) => (
                            <option key={ot.id} value={ot.id}>
                              {ot.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Height (ft)
                        <input
                          type="number"
                          min={0.5}
                          max={12}
                          step={0.125}
                          value={plate.openingHints[selection.index]!.heightFt ?? 6.667}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            setPlate(setOpeningHeight(plate, selection.index, v));
                          }}
                        />
                      </label>
                      <label>
                        Swing
                        <select
                          value={plate.openingHints[selection.index]!.swing ?? 'none'}
                          onChange={(e) =>
                            setPlate(
                              setOpeningSwing(
                                plate,
                                selection.index,
                                e.target.value as import('../../lib/cadStudio/types').CadOpeningSwing,
                              ),
                            )
                          }
                        >
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                          <option value="slider">Slider</option>
                          <option value="none">None</option>
                        </select>
                      </label>

                    </div>
                  )}
                  {selection.kind === 'label' && plate.labels[selection.index] && (
                    <div className="cad-sill-control">
                      <label>
                        Room / label name
                        <input
                          type="text"
                          key={`label-${selection.index}-${plate.labels[selection.index]!.text}`}
                          defaultValue={plate.labels[selection.index]!.text}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (!name) return;
                            setPlate(renameRoomLabel(plate, selection.index, name));
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </label>
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
                {storyLevels.map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    className={
                      (plate.activeStoryId ?? storyLevels[0]?.id) === story.id ? 'is-active' : ''
                    }
                    onClick={() => {
                      setPlate(setActiveStory(plate, story.id));
                      setPlateMode('floor');
                    }}
                    title={`${story.name} @ ${story.levelFt.toFixed(1)} ft`}
                  >
                    {story.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="cad-story-add"
                  title="Add story"
                  onClick={() => {
                    const next = addStory(plate, newStoryName || 'Level', newStoryLevel);
                    const added = next.stories?.[next.stories.length - 1];
                    setPlate(added ? setActiveStory(next, added.id) : next);
                    setNewStoryName(`Level ${(next.stories?.length ?? 1) + 1}`);
                    setNewStoryLevel(newStoryLevel + 10);
                  }}
                >
                  + Story
                </button>
                <button
                  type="button"
                  title="Copy selected walls/openings onto the active story"
                  disabled={
                    !(
                      (selection?.kind === 'wall' && selectedWallIndices.length) ||
                      (selection?.kind === 'opening' && selection)
                    )
                  }
                  onClick={() => {
                    const storyId = plate.activeStoryId ?? storyLevels[0]?.id;
                    if (!storyId) return;
                    const walls =
                      selection?.kind === 'wall' ? selectedWallIndices : ([] as number[]);
                    const openings =
                      selection?.kind === 'opening'
                        ? [selection.index, ...openingMulti]
                        : ([] as number[]);
                    setPlate(copySelectionToStory(plate, storyId, walls, openings));
                    setStatusAid('Copied selection to active story');
                  }}
                >
                  Copy to story
                </button>
                <button
                  type="button"
                  title="Save design option snapshot"
                  onClick={() => {
                    setPlate(saveDesignSnapshot(plate, snapshotName));
                    setStatusAid(`Saved snapshot “${snapshotName}”`);
                  }}
                >
                  Save option
                </button>
                {(plate.designSnapshots?.length ?? 0) > 0 && (
                  <select
                    aria-label="Restore design option"
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      setPlate(restoreDesignSnapshot(plate, id));
                      setStatusAid('Restored design option');
                    }}
                  >
                    <option value="">Restore…</option>
                    {plate.designSnapshots!.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  aria-label="Snapshot name"
                  style={{ width: '6.5rem', fontSize: '0.75rem' }}
                />
                {storySheets.length > 0 && (
                  <>
                    <span className="cad-story-label" style={{ marginLeft: 8 }}>
                      Sheets
                    </span>
                    {storySheets.map((sheet) => (
                      <button
                        key={sheet.id}
                        type="button"
                        className={activeSheet?.id === sheet.id ? 'is-active' : ''}
                        onClick={() => {
                          setSheetId(sheet.id);
                          if (sheet.kind === 'elevation') {
                            setPlateMode(/side|left|right/i.test(sheet.name) ? 'side' : 'front');
                            setLayout(
                              layout === 'extrude' ? 'split' : layout === 'massing' ? 'split' : layout,
                            );
                          } else {
                            setPlateMode('floor');
                          }
                        }}
                      >
                        {sheet.name}
                      </button>
                    ))}
                  </>
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
                  onSelectOpening={(openingId) => {
                    const bare = openingId.replace(/^z[0-9.]+\|/, '').replace(/-hint-\d+$/, '');
                    const byId = plate.openingHints.findIndex((o) => o.id && openingId.includes(o.id));
                    if (byId >= 0) {
                      setSelection({ kind: 'opening', index: byId });
                      setOpeningMulti([]);
                      setWallMulti([]);
                      setStudioMode('modify');
                      return;
                    }
                    const m = /-hint-(\d+)$/.exec(openingId);
                    if (m) {
                      const idx = Number(m[1]);
                      if (Number.isFinite(idx) && plate.openingHints[idx]) {
                        setSelection({ kind: 'opening', index: idx });
                        setOpeningMulti([]);
                        setWallMulti([]);
                        setStudioMode('modify');
                      }
                    }
                    void bare;
                  }}
                  onPickOpening={(index) => {
                    setSelection({ kind: 'opening', index });
                    setOpeningMulti([]);
                    setWallMulti([]);
                    setStudioMode('modify');
                    setStatusAid(`Selected opening from 3D`);
                  }}
                  onPickWall={(index) => {
                    setSelection({ kind: 'wall', index });
                    setWallMulti([]);
                    setOpeningMulti([]);
                    setStudioMode('modify');
                    setStatusAid(`Selected wall from 3D`);
                  }}
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
