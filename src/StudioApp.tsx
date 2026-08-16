import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileJson,
  Home,
  ReceiptText,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { CatalogPanel } from './components/catalog/CatalogPanel';
import { catalog as catalogItems } from './components/catalog/catalogData';
import { BomDialog } from './components/ui/BomDialog';
import { SelectionInspector } from './components/ui/SelectionInspector';
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
import { drawFloorPlanToCanvas, downloadCanvasPng, downloadPlanDxf, downloadScaledPlanPdf } from './lib/planExport/drawFloorPlan';

const Scene3D = lazy(() => import('./components/scene3d/Scene3D').then((m) => ({ default: m.Scene3D })));

export default function StudioApp() {
  const store = usePlannerStore();
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
  const [activeDesignCode, setActiveDesignCode] = useState<string | null>(() => readActiveDesignCode());
  const openingNotice = usePlannerStore((s) => s.openingNotice);
  const clearOpeningNotice = usePlannerStore((s) => s.clearOpeningNotice);
  const unitSystem = usePlannerStore((s) => s.unitSystem);
  const workflowStage = usePlannerStore((s) => s.workflowStage);
  const enterHouse = usePlannerStore((s) => s.enterHouse);

  const closeCatalog = useCallback(() => setCatalogOpen(false), []);
  const startGhostPlacement = useCallback(() => {
    store.setView('3d');
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    // Phones: place from Top (floor-first). Desktop: stay in orbit unless already Top.
    if (coarse) store.setCameraMode('top');
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

  const rename = () => {
    const name = window.prompt('Project name', projectName)?.trim();
    if (name) setProjectName(name);
  };

  const rememberDesign = useCallback((code: string | null) => {
    setActiveDesignCode(code);
    writeActiveDesignCode(code);
  }, []);

  const persistToLibrary = useCallback(() => {
    const entry = upsertSharedDesign(projectName, store.projectPayload(), activeDesignCode ?? undefined);
    rememberDesign(entry.code);
    history.replaceState(null, '', designShareUrl(entry.code));
    setDesigns(listSharedDesigns());
    return entry;
  }, [activeDesignCode, projectName, rememberDesign, store]);

  const saveBuild = useCallback(() => {
    store.save();
    const entry = persistToLibrary();
    notify(`Saved “${entry.name}”`);
  }, [persistToLibrary, store]);

  const share = useCallback(async () => {
    try {
      store.save();
      const entry = persistToLibrary();
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
    (format: 'pdf' | 'png' | 'dxf') => {
      const activeFloor = store.floors.find((f) => f.id === store.activeFloorId);
      const input = {
        name: projectName,
        floorName: activeFloor?.name,
        walls: store.walls,
        openings: store.openings,
        planRooms: store.planRooms,
        unitSystem: store.unitSystem,
      };
      const base = `${projectName.replace(/[^\w\-]+/g, '-').toLowerCase() || 'mahnikka'}-plan`;
      if (format === 'dxf') {
        downloadPlanDxf(input, `${base}.dxf`);
        notify('CAD DXF exported (walls, rooms, openings)');
        return;
      }
      if (format === 'pdf') {
        downloadScaledPlanPdf(input, `${base}.pdf`);
        notify('Scaled floor plan + schedule PDF exported');
        return;
      }
      const canvas = drawFloorPlanToCanvas(input);
      downloadCanvasPng(canvas, `${base}.png`);
      notify('Floor plan sheet PNG exported');
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
    // Opening a new selection closes the inspector; Info FAB re-opens it on demand.
    if (pendingPlacement) {
      setInspectorOpen(false);
      return;
    }
    if (selectedOpeningId) {
      setInspectorOpen(false);
      return;
    }
    if (selectedWallId) setInspectorOpen(false);
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
    if (menuOpen) setDesigns(listSharedDesigns());
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
      />

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

      {menuOpen && (
        <>
          <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={closeProjectMenu} />
          <aside className="studio-menu-sheet studio-menu-drawer" role="dialog" aria-label="Project menu">
          <header>
            <button className="project-name" onClick={rename}>
              {projectName} <ChevronDown size={15} />
            </button>
            <button type="button" className="menu-close" onClick={closeProjectMenu} aria-label="Close menu">
              <X size={18} />
            </button>
          </header>
          {!validation.valid && walls.length > 0 && <div className="plan-warning">Connect the highlighted endpoints to close the room.</div>}
          <p className="menu-meta">
            {formatArea(area, unitSystem)} · {walls.length} walls · {furniture.length} items
            {missingPrices > 0 ? ` · ${missingPrices} need quote` : ''}
            {activeDesignCode ? ` · ${activeDesignCode}` : ''}
          </p>

          <div className="menu-primary-actions">
            <button type="button" className="menu-primary" onClick={saveBuild}>
              <Save size={16} /> Save
            </button>
            <button type="button" className="menu-primary is-accent" onClick={share}>
              <Share2 size={16} /> Share
            </button>
          </div>

          <div className="menu-export-actions">
            <button type="button" className="menu-secondary" onClick={() => exportFloorPlan('pdf')} disabled={walls.length === 0}>
              <Download size={16} /> Export scaled plan PDF
            </button>
            <button type="button" className="menu-secondary" onClick={() => exportFloorPlan('png')} disabled={walls.length === 0}>
              <Download size={16} /> Export plan sheet PNG
            </button>
            <button type="button" className="menu-secondary" onClick={() => exportFloorPlan('dxf')} disabled={walls.length === 0}>
              <FileJson size={16} /> Export CAD DXF
            </button>
          </div>

          <button
            type="button"
            className="menu-secondary"
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
            <Home size={16} /> New design
          </button>

          <section className="design-library">
            <div className="design-library-head">
              <h3>Saved builds</h3>
              <span>{designs.length}</span>
            </div>
            {designs.length === 0 ? (
              <p className="muted design-library-empty">Save this design to see it here. Open a build to edit, or export the file / shopping list from each row.</p>
            ) : (
              <ul>
                {designs.map((design) => {
                  const stamp = design.updatedAt ?? design.createdAt;
                  return (
                    <li key={design.code} className={activeDesignCode === design.code ? 'is-active' : undefined}>
                      <button type="button" className="design-open" onClick={() => openSavedBuild(design)}>
                        <strong>{design.name}</strong>
                        <span>
                          {design.code} · {new Date(stamp).toLocaleDateString()}
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
                          aria-label={`Export shopping list for ${design.name}`}
                          title="Export shopping list"
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
          close={() => setBom(false)}
        />
      )}
    </main>
    </div>
  );
}
