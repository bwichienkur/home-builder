import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  Download,
  FileJson,
  Home,
  LogOut,
  Package,
  ReceiptText,
  Save,
  Settings,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CatalogPanel } from './components/catalog/CatalogPanel';
import { catalog as catalogItems } from './components/catalog/catalogData';
import { BomDialog } from './components/ui/BomDialog';
import { SelectionInspector } from './components/ui/SelectionInspector';
import { BuildingChecksBar } from './components/ui/BuildingChecksBar';
import { ElevationPreview } from './components/ui/ElevationPreview';
import { StudioChrome } from './components/ui/StudioChrome';
import { DesignStart } from './components/ui/DesignStart';
import { useInventoryStore } from './store/inventoryStore';
import { usePlannerStore } from './store/plannerStore';
import { roomArea, validatePlan } from './lib/geometry/rooms';
import {
  clearRecoverySnapshot,
  deleteSharedDesign,
  designShareUrl,
  listSharedDesigns,
  loadSharedDesign,
  readActiveDesignCode,
  readDesignCodeFromLocation,
  readRecoverySnapshot,
  upsertSharedDesign,
  writeActiveDesignCode,
  type SharedDesign,
} from './lib/designShare';
import { downloadTextFile, shoppingListCsvFromDesign } from './lib/shoppingListCsv';
import { formatArea } from './lib/measurements';
import { constructionTakeoffCsv } from './lib/constructionTakeoff';
import { buildHouseEstimateSnapshot, computeHouseTakeoff } from './lib/houseEstimate';
import { ESTIMATE_DISCLAIMER } from './lib/estimateSnapshot';
import { downloadBidProposalPdf } from './lib/bidPackage';
import { pickTradeRates, useTradeRatesStore } from './store/tradeRatesStore';
import { drawFloorPlanToCanvas, downloadCanvasPng, downloadMultiFloorScaledPlanPdf, downloadPlanDxf } from './lib/planExport/drawFloorPlan';
import { downloadPlanIfc } from './lib/planExport/buildIfc';
import { fetchCloudProjects, loadCloudProject, readCloudProjectRef, saveProjectToCloud } from './lib/cloudProjects';
import type { CloudProjectSummary } from './api/client';
import { useCrmStore } from './store/crmStore';
import { platformConfig } from './lib/platform/config';
import { useAuthStore } from './store/authStore';

const Scene3D = lazy(() => import('./components/scene3d/Scene3D').then((m) => ({ default: m.Scene3D })));

export default function StudioApp() {
  const store = usePlannerStore();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const customCatalog = useInventoryStore((s) => s.items);
  const {
    walls,
    openings,
    furniture,
    selectedWallId,
    selectedOpeningId,
    selectedFurnitureId,
    cameraMode,
    roomType,
  } = store;

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeProjectMenu = useCallback(() => {
    setMenuOpen(false);
    delete document.body.dataset.menuOpen;
    window.dispatchEvent(new Event('roomcraft-menu-changed'));
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 40);
  }, []);
  const openProjectMenu = useCallback(() => {
    setMenuOpen(true);
    setCatalogOpen(false);
    setInspectorOpen(false);
    document.body.dataset.menuOpen = '1';
    window.dispatchEvent(new Event('roomcraft-menu-changed'));
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 40);
  }, []);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [bom, setBom] = useState(false);
  const [projectName, setProjectName] = useState('Bedroom study');
  const [notice, setNotice] = useState('');
  const [recovery, setRecovery] = useState<{ savedAt: string; payload: unknown } | null>(null);
  const [designs, setDesigns] = useState<SharedDesign[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectSummary[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudRef, setCloudRef] = useState(() => readCloudProjectRef());
  const [elevationOpen, setElevationOpen] = useState(false);
  const [activeDesignCode, setActiveDesignCode] = useState<string | null>(() => readActiveDesignCode());
  const openingNotice = usePlannerStore((s) => s.openingNotice);
  const clearOpeningNotice = usePlannerStore((s) => s.clearOpeningNotice);
  const unitSystem = usePlannerStore((s) => s.unitSystem);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const enterHouse = usePlannerStore((s) => s.enterHouse);
  const clientId = usePlannerStore((s) => s.clientId);
  const setClientId = usePlannerStore((s) => s.setClientId);
  const crmClients = useCrmStore((s) => s.clients);

  const closeCatalog = useCallback(() => setCatalogOpen(false), []);
  const startGhostPlacement = useCallback(() => {
    store.setView('3d');
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    // Keep Plan (top) when placing; only leave walk → orbit. Never yank Plan into orbit.
    if (coarse || store.cameraMode === 'top') store.setCameraMode('top');
    else if (store.cameraMode === 'walk') store.setCameraMode('orbit');
    setCatalogOpen(false);
    setMenuOpen(false);
    setInspectorOpen(false);
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
  }, [store]);

  const allCatalog = useMemo(() => {
    const byId = new Map(catalogItems.map((i) => [i.id, i]));
    for (const item of customCatalog) byId.set(item.id, item);
    return Array.from(byId.values());
  }, [customCatalog]);
  const validation = validatePlan(walls);
  const area = validation.rooms.reduce((sum, r) => sum + roomArea(r), 0);
  const total = furniture
    .filter((item) => item.placementKind !== 'perimeter-trim' && item.placementKind !== 'stair')
    .reduce((sum, item) => sum + (allCatalog.find((c) => c.id === item.catalogId)?.price ?? 0), 0);
  const missingPrices = furniture.filter((item) => {
    if (item.placementKind === 'perimeter-trim' || item.placementKind === 'stair') return false;
    return allCatalog.find((c) => c.id === item.catalogId)?.price == null;
  }).length;
  const sellableCount = furniture.filter((i) => i.placementKind !== 'perimeter-trim' && i.placementKind !== 'stair').length;

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const rememberDesign = useCallback((code: string | null) => {
    setActiveDesignCode(code);
    writeActiveDesignCode(code);
  }, []);

  const persistToLibrary = useCallback(() => {
    const rates = pickTradeRates(useTradeRatesStore.getState());
    const prev = store.estimateSnapshot?.version ?? 0;
    const snap = buildHouseEstimateSnapshot({
      floors: store.floors,
      activeFloorId: store.activeFloorId,
      live: {
        walls: store.walls,
        openings: store.openings,
        furniture: store.furniture,
        planRooms: store.planRooms,
      },
      rates,
      quotes: store.vendorQuotes,
      previousVersion: prev,
    });
    store.setEstimateSnapshot(snap);
    const entry = upsertSharedDesign(projectName, store.projectPayload(), activeDesignCode ?? undefined);
    rememberDesign(entry.code);
    history.replaceState(null, '', designShareUrl(entry.code));
    setDesigns(listSharedDesigns());
    return { entry, snap };
  }, [activeDesignCode, projectName, rememberDesign, store]);

  const saveBuild = useCallback(async () => {
    store.save();
    const { entry, snap } = persistToLibrary();
    const cloud = await saveProjectToCloud(projectName, store.projectPayload());
    if (cloud.ok && cloud.mode === 'cloud') {
      setCloudRef({ id: cloud.id, version: cloud.version });
      setCloudProjects(await fetchCloudProjects());
      notify(`Saved “${entry.name}” · estimate v${snap.version} · cloud v${cloud.version}`);
    } else if (cloud.ok) {
      notify(`Saved “${entry.name}” · estimate v${snap.version} (local · ${cloud.reason})`);
    } else {
      notify(`Saved locally · estimate v${snap.version} — cloud: ${cloud.error}`);
    }
  }, [persistToLibrary, projectName, store]);

  const share = useCallback(async () => {
    try {
      store.save();
      const { entry } = persistToLibrary();
      const url = designShareUrl(entry.code);
      if (navigator.share) await navigator.share({ title: projectName, text: `Mahnikka design ${entry.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        notify(`Link copied · ${entry.code}`);
      }
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') notify('Sharing is unavailable in this browser');
    }
  }, [persistToLibrary, projectName, store]);

  const openSavedBuild = useCallback(
    (design: SharedDesign) => {
      if (!store.importProject(design.payload)) {
        notify('Could not open that build');
        return;
      }
      setProjectName(design.name);
      rememberDesign(design.code);
      history.replaceState(null, '', designShareUrl(design.code));
      enterHouse();
      notify(`Editing ${design.name}`);
      closeProjectMenu();
      window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
    },
    [closeProjectMenu, enterHouse, rememberDesign, store],
  );

  const openCloudBuild = useCallback(
    async (project: CloudProjectSummary) => {
      try {
        const row = await loadCloudProject(project.id);
        if (!store.importProject(row.scene)) {
          notify('Could not open that cloud project');
          return;
        }
        setProjectName(row.name || project.name);
        setCloudRef({ id: row.id, version: row.version });
        rememberDesign(null);
        enterHouse();
        notify(`Opened cloud “${row.name || project.name}” · v${row.version}`);
        closeProjectMenu();
        window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Cloud project could not be loaded');
      }
    },
    [closeProjectMenu, enterHouse, rememberDesign, store],
  );

  const exportSavedBuild = useCallback((design: SharedDesign) => {
    const blob = new Blob([JSON.stringify({ ...design.payload, exportedAt: new Date().toISOString() }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${design.name.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mahnikka'}-build.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify('Build exported');
  }, []);

  const exportSavedShoppingList = useCallback(
    (design: SharedDesign) => {
      const csv = shoppingListCsvFromDesign(design.payload, allCatalog);
      downloadTextFile(
        `${design.name.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mahnikka'}-shopping-list.csv`,
        csv,
      );
      notify('Shopping list exported');
    },
    [allCatalog],
  );

  const exportFloorPlan = useCallback(
    (format: 'pdf' | 'png' | 'dxf' | 'ifc') => {
      const floors = store.floors;
      const inputs = floors.map((f) => {
        const live = f.id === store.activeFloorId;
        const walls = live ? store.walls : f.scene.walls;
        const openings = live ? store.openings : f.scene.openings;
        const furniture = live ? store.furniture : f.scene.furniture;
        const planRooms = live ? store.planRooms : f.planRooms ?? f.scene.planRooms ?? [];
        return {
          name: projectName,
          floorName: f.name,
          walls,
          openings,
          planRooms,
          furniture,
          unitSystem: store.unitSystem,
        };
      });
      const active = inputs.find((_, i) => floors[i]?.id === store.activeFloorId) ?? inputs[0];
      const base = `${projectName.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mahnikka'}-plan`;
      if (format === 'dxf') {
        if (inputs.length <= 1 && active) {
          downloadPlanDxf(active, `${base}.dxf`);
        } else {
          inputs.forEach((input, i) => {
            const slug = (input.floorName || `floor-${i + 1}`).replace(/[^\w\-]+/g, '-').toLowerCase();
            window.setTimeout(() => downloadPlanDxf(input, `${base}-${slug}.dxf`), i * 200);
          });
        }
        notify(
          inputs.length > 1
            ? `CAD DXF exported for ${inputs.length} floors`
            : 'CAD DXF exported (walls, rooms, openings, dims)',
        );
        return;
      }
      if (format === 'ifc') {
        downloadPlanIfc(
          {
            name: projectName,
            floorName: active?.floorName,
            walls: active?.walls ?? [],
            openings: active?.openings ?? [],
            planRooms: active?.planRooms ?? [],
            furniture: active?.furniture,
            unitSystem: store.unitSystem,
            floors: (() => {
              let elev = 0;
              return inputs.map((input, i) => {
                const floor = store.floors[i];
                const heights = input.walls.map((w) => w.height).filter((h) => Number.isFinite(h) && h > 0);
                const avgWall = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 2.7;
                const storyH = floor?.storyHeightM ?? avgWall;
                const entry = {
                  floorName: input.floorName || 'Level',
                  walls: input.walls,
                  openings: input.openings,
                  planRooms: input.planRooms,
                  furniture: input.furniture,
                  elevationM: elev,
                };
                elev += storyH;
                return entry;
              });
            })(),
          },
          `${base}.ifc`,
        );
        notify(inputs.length > 1 ? `IFC4 multi-storey export (${inputs.length} floors)` : 'IFC4 walls/spaces exported');
        return;
      }
      if (format === 'pdf') {
        downloadMultiFloorScaledPlanPdf(inputs, `${base}.pdf`);
        notify(
          inputs.length > 1
            ? `Construction set PDF exported (${inputs.length} floors)`
            : 'Construction set PDF exported',
        );
        return;
      }
      if (!active) return;
      const canvas = drawFloorPlanToCanvas(active);
      downloadCanvasPng(canvas, `${base}.png`);
      notify('Floor plan sheet PNG exported (active floor)');
    },
    [projectName, store],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        store.duplicateSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveBuild();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!store.pendingPlacement) store.deleteSelected();
      } else if (e.key === 'Escape') {
        if (store.pendingPlacement) store.cancelPendingPlacement();
        store.setDraftStart(null);
        setCatalogOpen(false);
        closeProjectMenu();
        setInspectorOpen(false);
      } else if (e.key === 'Enter' && store.pendingPlacement) {
        e.preventDefault();
        store.commitPendingPlacement();
      } else if (e.key === 'ArrowLeft') store.moveSelected(-0.25, 0);
      else if (e.key === 'ArrowRight') store.moveSelected(0.25, 0);
      else if (e.key === 'ArrowUp') store.moveSelected(0, -0.25);
      else if (e.key === 'ArrowDown') store.moveSelected(0, 0.25);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, closeProjectMenu, saveBuild]);

  useEffect(() => {
    const open = () => {
      const state = usePlannerStore.getState();
      const item = state.furniture.find((f) => f.id === state.selectedFurnitureId);
      // Walls/floors/ceilings/room → right inspector. Keep trim selection for trim edit.
      if (!item || item.placementKind !== 'perimeter-trim') {
        usePlannerStore.getState().selectFurniture(null);
      }
      setInspectorOpen(true);
      setCatalogOpen(false);
      closeProjectMenu();
    };
    window.addEventListener('roomcraft-open-properties', open);
    return () => {
      window.removeEventListener('roomcraft-open-properties', open);
    };
  }, [closeProjectMenu]);

  const pendingPlacement = usePlannerStore((s) => s.pendingPlacement);
  useEffect(() => {
    // Opening a new selection closes the inspector; Info FAB / wall pick re-opens it.
    if (pendingPlacement) {
      setInspectorOpen(false);
      return;
    }
    if (selectedOpeningId) {
      // Opening FABs handle edit — keep sheet closed until Info is pressed.
      setInspectorOpen(false);
      return;
    }
    // Wall select opens properties via roomcraft-open-properties; do not force-close here.
  }, [selectedWallId, selectedOpeningId, pendingPlacement]);

  useEffect(() => {
    if (inspectorOpen) document.body.dataset.inspectorOpen = '1';
    else delete document.body.dataset.inspectorOpen;
    window.dispatchEvent(new Event('roomcraft-inspector-changed'));
    return () => {
      delete document.body.dataset.inspectorOpen;
    };
  }, [inspectorOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => store.save(), 700);
    return () => window.clearTimeout(timer);
  }, [walls, openings, furniture, store.floorColor, store.wallColor, store.ceilingColor, store.roomType, store.unitSystem, store]);

  useEffect(() => {
    if (!menuOpen) return;
    setDesigns(listSharedDesigns());
    setCloudRef(readCloudProjectRef());
    let cancelled = false;
    setCloudLoading(true);
    void fetchCloudProjects().then((items) => {
      if (!cancelled) {
        setCloudProjects(items);
        setCloudLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [menuOpen]);

  useEffect(() => {
    const code = readDesignCodeFromLocation();
    if (code) {
      const shared = loadSharedDesign(code);
      if (shared && store.importProject(shared.payload)) {
        setProjectName(shared.name);
        rememberDesign(shared.code);
        enterHouse();
        notify(`Opened design ${code}`);
        window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
        return;
      }
    }
    const snapshot = readRecoverySnapshot();
    const saved = localStorage.getItem('roomcraft-project');
    if (snapshot && (!saved || snapshot.savedAt > (JSON.parse(saved).savedAt ?? ''))) {
      setRecovery(snapshot);
    } else if (saved) {
      store.load();
      if (usePlannerStore.getState().walls.length) {
        enterHouse();
        window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openingNotice) return;
    notify(openingNotice);
    clearOpeningNotice();
  }, [openingNotice, clearOpeningNotice]);

  const importProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const ok = store.importProject(JSON.parse(await file.text()));
      if (ok) {
        rememberDesign(null);
        const url = new URL(location.href);
        url.searchParams.delete('design');
        history.replaceState(null, '', url.toString());
        notify('Project imported — save to add it to Saved builds');
      } else notify('This is not a valid Mahnikka project');
    } catch {
      notify('Could not read that project file');
    }
  };

  const openCategory = (category: string) => {
    if (usePlannerStore.getState().workflowStage !== 'room') {
      notify('Open a room before adding furniture');
      return;
    }
    store.setStudioMode('furnish');
    setCatalogOpen(true);
    setMenuOpen(false);
    setInspectorOpen(false);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('roomcraft-catalog-category', { detail: category })), 0);
  };

  const isTop = cameraMode === 'top';
  const shellClass = [
    'studio-shell',
    'view-3d',
    isTop ? 'camera-top' : '',
    cameraMode === 'walk' ? 'camera-walk' : '',
    pendingPlacement ? 'is-placing' : '',
    workflowStage === 'start' ? 'is-start' : '',
    workflowStage === 'room' ? 'is-room-focus' : '',
    selectedFurnitureId || pendingPlacement ? 'has-action-fabs' : '',
    inspectorOpen ? 'has-inspector' : '',
    catalogOpen ? 'has-catalog' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="studio-root">
      {!platformConfig.cloudConfigured() && workflowStage !== 'start' && (
        <div className="studio-local-save-banner" role="status">
          <span className="studio-local-save-full">
            Saves stay in this browser until <code>VITE_API_URL</code> is set. Link a client before handing off jobs.
          </span>
          <span className="studio-local-save-short">
            Saves are local on this device until cloud API is connected.
          </span>
        </div>
      )}
    <main className={shellClass}>
      <section className="studio-canvas" aria-label={isTop ? 'Top-down room view' : '3D room view'}>
        <div className="scene-layer">
          <Suspense fallback={<div className="loading-3d">Preparing your room…</div>}>
            <Scene3D />
          </Suspense>
        </div>
      </section>

      {workflowStage === 'start' && (
        <DesignStart
          onBegan={() => {
            setMenuOpen(false);
            setCatalogOpen(false);
            setInspectorOpen(false);
            setProjectName(usePlannerStore.getState().housePlanName || 'Untitled design');
            rememberDesign(null);
          }}
        />
      )}

      <StudioChrome
        roomType={roomType}
        itemCount={sellableCount}
        total={total}
        catalogOpen={catalogOpen}
        menuOpen={menuOpen}
        openCatalog={() => {
          store.setStudioMode('furnish');
          setCatalogOpen(true);
          setMenuOpen(false);
          setInspectorOpen(false);
        }}
        openMenu={openProjectMenu}
        closeMenu={closeProjectMenu}
        openBom={() => setBom(true)}
        openCategory={openCategory}
        onOpenInspector={() => {
          setInspectorOpen(true);
          setCatalogOpen(false);
          setMenuOpen(false);
        }}
        onSave={saveBuild}
        onShare={share}
        onOpenElevations={() => {
          setElevationOpen(true);
          setCatalogOpen(false);
          setInspectorOpen(false);
          closeProjectMenu();
        }}
      />

      <ElevationPreview open={elevationOpen} onClose={() => setElevationOpen(false)} />

      {catalogOpen && <CatalogPanel close={closeCatalog} onAdd={startGhostPlacement} roomType={roomType} />}

      {inspectorOpen && (
        <button
          type="button"
          className="inspector-backdrop"
          aria-label="Close panel"
          onClick={() => setInspectorOpen(false)}
        />
      )}
      <SelectionInspector
        open={inspectorOpen}
        onClose={() => {
          setInspectorOpen(false);
        }}
      />

      <BuildingChecksBar />

      {menuOpen && (
        <>
          <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={closeProjectMenu} />
          <aside className="studio-menu-sheet studio-menu-drawer" role="dialog" aria-label="Project menu">
          <header>
            <label className="project-name-edit">
              <span className="eyebrow">Project</span>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                aria-label="Project name"
              />
            </label>
            <button type="button" className="menu-close" onClick={closeProjectMenu} aria-label="Close menu">
              <X size={18} />
            </button>
          </header>
          {!validation.valid && walls.length > 0 && <div className="plan-warning">Connect the highlighted endpoints to close the room.</div>}
          <p className="menu-meta">
            <span>{formatArea(area, unitSystem)}</span>
            <span aria-hidden>·</span>
            <span>{walls.length} walls</span>
            {furniture.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{furniture.length} items</span>
              </>
            )}
            {missingPrices > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{missingPrices} need quote</span>
              </>
            )}
          </p>
          {(activeDesignCode || cloudRef) && (
            <p className="menu-meta-secondary">
              {activeDesignCode ? `Code ${activeDesignCode}` : ''}
              {activeDesignCode && cloudRef ? ' · ' : ''}
              {cloudRef ? `Cloud v${cloudRef.version}` : ''}
            </p>
          )}

          <div className="menu-primary-actions">
            <button type="button" className="menu-primary" onClick={saveBuild}>
              <Save size={16} /> Save
            </button>
            <button type="button" className="menu-primary is-accent" onClick={share}>
              <Share2 size={16} /> Share
            </button>
          </div>

          <section className="menu-section" aria-label="Job">
            <h3 className="menu-section-title">Job</h3>
            <div className="menu-list">
              <button
                type="button"
                className="menu-row"
                onClick={() => {
                  closeProjectMenu();
                  navigate('/plans');
                }}
              >
                <FileJson size={16} aria-hidden />
                <span>House plans</span>
              </button>
              <button
                type="button"
                className="menu-row menu-row--app-nav"
                onClick={() => {
                  closeProjectMenu();
                  navigate('/inventory');
                }}
              >
                <Package size={16} aria-hidden />
                <span>Materials</span>
              </button>
              <label className="menu-row menu-row-field">
                <span className="menu-row-label">Client</span>
                <select
                  value={clientId ?? ''}
                  onChange={(e) => setClientId(e.target.value || null)}
                  aria-label="Linked client"
                >
                  <option value="">None</option>
                  {crmClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="menu-row"
                onClick={() => {
                  rememberDesign(null);
                  const url = new URL(location.href);
                  url.searchParams.delete('design');
                  history.replaceState(null, '', url.toString());
                  store.showStart();
                  setMenuOpen(false);
                  setCatalogOpen(false);
                  setInspectorOpen(false);
                }}
              >
                <Home size={16} aria-hidden />
                <span>New design</span>
              </button>
            </div>
          </section>

          <details className="menu-fold menu-fold--app">
            <summary>App</summary>
            <div className="menu-fold-body">
              <div className="menu-list">
                <button
                  type="button"
                  className="menu-row"
                  onClick={() => {
                    closeProjectMenu();
                    navigate('/');
                  }}
                >
                  <Home size={16} aria-hidden />
                  <span>Home</span>
                </button>
                <button
                  type="button"
                  className="menu-row"
                  onClick={() => {
                    closeProjectMenu();
                    navigate('/settings');
                  }}
                >
                  <Settings size={16} aria-hidden />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  className="menu-row"
                  onClick={() => {
                    closeProjectMenu();
                    void logout().then(() => navigate('/login'));
                  }}
                >
                  <LogOut size={16} aria-hidden />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </details>

          <details className="menu-fold">
            <summary>Export</summary>
            <div className="menu-fold-body">
              <p className="menu-fold-label">Drawings</p>
              <div className="menu-export-grid">
                <button type="button" className="menu-chip" onClick={() => exportFloorPlan('pdf')} disabled={walls.length === 0}>
                  PDF set
                </button>
                <button type="button" className="menu-chip" onClick={() => exportFloorPlan('png')} disabled={walls.length === 0}>
                  Plan PNG
                </button>
                <button type="button" className="menu-chip" onClick={() => exportFloorPlan('dxf')} disabled={walls.length === 0}>
                  DXF
                </button>
                <button type="button" className="menu-chip" onClick={() => exportFloorPlan('ifc')} disabled={walls.length === 0}>
                  IFC4
                </button>
                <button
                  type="button"
                  className="menu-chip"
                  disabled={walls.length === 0}
                  onClick={() => {
                    setElevationOpen(true);
                    closeProjectMenu();
                  }}
                >
                  Elevations
                </button>
              </div>
              <p className="menu-fold-label">Estimate</p>
              <div className="menu-export-grid">
                <button
                  type="button"
                  className="menu-chip"
                  disabled={walls.length === 0}
                  onClick={() => {
                    const rates = pickTradeRates(useTradeRatesStore.getState());
                    const snap = buildHouseEstimateSnapshot({
                      floors: store.floors,
                      activeFloorId: store.activeFloorId,
                      live: {
                        walls: store.walls,
                        openings: store.openings,
                        furniture: store.furniture,
                        planRooms: store.planRooms,
                      },
                      rates,
                      quotes: store.vendorQuotes,
                      previousVersion: store.estimateSnapshot?.version ?? 0,
                      label: 'Bid proposal',
                    });
                    store.setEstimateSnapshot(snap);
                    downloadBidProposalPdf(
                      snap,
                      {
                        projectName,
                        jurisdiction: store.bidSettings.jurisdiction,
                        validityDays: store.bidSettings.validityDays,
                        paymentTerms: store.bidSettings.paymentTerms,
                        inclusions: store.bidSettings.inclusions,
                        exclusions: store.bidSettings.exclusions,
                        alternateNotes: store.bidSettings.alternateNotes,
                      },
                      `${projectName.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mahnikka'}-bid.pdf`,
                    );
                    notify('Bid proposal PDF exported');
                  }}
                >
                  Bid PDF
                </button>
                <button
                  type="button"
                  className="menu-chip"
                  disabled={walls.length === 0}
                  onClick={() => {
                    const rates = pickTradeRates(useTradeRatesStore.getState());
                    const takeoff = computeHouseTakeoff({
                      floors: store.floors,
                      activeFloorId: store.activeFloorId,
                      live: {
                        walls: store.walls,
                        openings: store.openings,
                        furniture: store.furniture,
                        planRooms: store.planRooms,
                      },
                      wasteFactor: rates.wasteFactor,
                    });
                    const csv = constructionTakeoffCsv(takeoff, {
                      name: projectName,
                      unitSystem,
                      floorName: store.floors.length > 1 ? 'All floors' : store.floors[0]?.name,
                      disclaimer: ESTIMATE_DISCLAIMER,
                    });
                    downloadTextFile(
                      `${projectName.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mahnikka'}-takeoff.csv`,
                      csv,
                    );
                    notify(store.floors.length > 1 ? 'Whole-house takeoff CSV exported' : 'Construction takeoff CSV exported');
                  }}
                >
                  Takeoff CSV
                </button>
              </div>
            </div>
          </details>

          <details className="menu-fold">
            <summary>
              Projects
              <span className="menu-fold-count">
                {(platformConfig.cloudConfigured() ? cloudProjects.length : 0) + designs.length}
              </span>
            </summary>
            <div className="menu-fold-body">
              <section className="design-library design-library--nested">
                <div className="design-library-head">
                  <h3>
                    <Cloud size={14} aria-hidden /> Cloud
                  </h3>
                  <span>{cloudLoading ? '…' : cloudProjects.length}</span>
                </div>
                {cloudLoading ? (
                  <p className="muted design-library-empty cloud-library-empty">Checking cloud library…</p>
                ) : !platformConfig.cloudConfigured() ? (
                  <p className="muted design-library-empty cloud-library-empty">
                    Connect <code>VITE_API_URL</code> to sync jobs to cloud.
                  </p>
                ) : cloudProjects.length === 0 ? (
                  <p className="muted design-library-empty cloud-library-empty">
                    No cloud jobs yet — Save syncs the estimate here.
                  </p>
                ) : (
                  <ul>
                    {cloudProjects.map((project) => {
                      const active = cloudRef?.id === project.id;
                      return (
                        <li key={project.id} className={active ? 'is-active' : undefined}>
                          <button type="button" className="design-open" onClick={() => void openCloudBuild(project)}>
                            <strong>{project.name}</strong>
                            <span>
                              v{project.version} · {new Date(project.updatedAt).toLocaleDateString()}
                              {active ? ' · editing' : ''}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="design-library design-library--nested">
                <div className="design-library-head">
                  <h3>{platformConfig.cloudConfigured() ? 'On this device' : 'Saved builds'}</h3>
                  <span>{designs.length}</span>
                </div>
                {designs.length === 0 ? (
                  <p className="muted design-library-empty">
                    {platformConfig.cloudConfigured()
                      ? 'Local cache of recent saves.'
                      : 'Save a design to list it here.'}
                  </p>
                ) : (
                  <ul>
                    {designs.map((design) => {
                      const stamp = design.updatedAt ?? design.createdAt;
                      const cos = design.payload.changeOrders?.length ?? 0;
                      return (
                        <li key={design.code} className={activeDesignCode === design.code ? 'is-active' : undefined}>
                          <button type="button" className="design-open" onClick={() => openSavedBuild(design)}>
                            <strong>{design.name}</strong>
                            <span>
                              {design.code} · {new Date(stamp).toLocaleDateString()}
                              {design.payload.estimateSnapshot
                                ? ` · est v${design.payload.estimateSnapshot.version}`
                                : ''}
                              {cos > 0 ? ` · ${cos} CO` : ''}
                              {activeDesignCode === design.code ? ' · editing' : ''}
                            </span>
                          </button>
                          <div className="design-item-actions">
                            <button
                              type="button"
                              aria-label={`Export ${design.name}`}
                              title="Export build"
                              onClick={() => exportSavedBuild(design)}
                            >
                              <Download size={15} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Export FF&E list for ${design.name}`}
                              title="Export FF&E list"
                              onClick={() => exportSavedShoppingList(design)}
                            >
                              <ReceiptText size={15} />
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              aria-label={`Delete ${design.name}`}
                              title="Delete"
                              onClick={() => {
                                deleteSharedDesign(design.code);
                                if (activeDesignCode === design.code) rememberDesign(null);
                                setDesigns(listSharedDesigns());
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <label className="project-import design-library-import">
                  <FileJson size={15} /> Import build file
                  <input type="file" accept="application/json,.json" onChange={importProject} />
                </label>
              </section>
            </div>
          </details>
        </aside>
        </>
      )}

      {notice && (
        <div className="app-notice" role="status">
          {notice}
        </div>
      )}

      {recovery && (
        <div className="recovery-banner" role="status">
          <div>
            <strong>Recover unsaved edits?</strong>
            <p>Autosave from {new Date(recovery.savedAt).toLocaleString()} is available.</p>
          </div>
          <div className="recovery-actions">
            <button
              className="primary"
              onClick={() => {
                store.importProject(recovery.payload);
                enterHouse();
                clearRecoverySnapshot();
                setRecovery(null);
                notify('Recovered latest edits');
                window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
              }}
            >
              Restore
            </button>
            <button
              onClick={() => {
                clearRecoverySnapshot();
                setRecovery(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {bom && (
        <BomDialog
          items={furniture}
          catalog={allCatalog}
          walls={walls}
          openings={openings}
          planRooms={store.planRooms}
          unitSystem={unitSystem}
          close={() => setBom(false)}
        />
      )}
    </main>
    </div>
  );
}
