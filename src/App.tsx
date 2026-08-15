import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileJson,
  Home,
  LogIn,
  ReceiptText,
  Save,
  Share2,
  Upload,
  X,
} from 'lucide-react';
import { CatalogPanel } from './components/catalog/CatalogPanel';
import { catalog as catalogItems } from './components/catalog/catalogData';
import { BomDialog } from './components/ui/BomDialog';
import { SelectionInspector } from './components/ui/SelectionInspector';
import { SelectedProductCard } from './components/ui/SelectedProductCard';
import { StudioChrome } from './components/ui/StudioChrome';
import { DesignStart } from './components/ui/DesignStart';
import { AdminPage } from './components/admin/AdminPage';
import { useInventoryStore } from './store/inventoryStore';
import { usePlannerStore } from './store/plannerStore';
import { roomArea, validatePlan } from './lib/geometry/rooms';
import {
  clearRecoverySnapshot,
  deleteSharedDesign,
  designShareUrl,
  listSharedDesigns,
  loadSharedDesign,
  readDesignCodeFromLocation,
  readRecoverySnapshot,
  saveSharedDesign,
  type SharedDesign,
} from './lib/designShare';
import { formatArea } from './lib/measurements';

const Scene3D = lazy(() => import('./components/scene3d/Scene3D').then((m) => ({ default: m.Scene3D })));

function useAdminRoute() {
  const [isAdmin, setIsAdmin] = useState(() => typeof location !== 'undefined' && location.pathname.replace(/\/+$/, '') === '/admin');
  useEffect(() => {
    const sync = () => setIsAdmin(location.pathname.replace(/\/+$/, '') === '/admin');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return isAdmin;
}

export default function App() {
  const isAdmin = useAdminRoute();
  if (isAdmin) return <AdminPage />;
  return <StudioApp />;
}

function StudioApp() {
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
    document.body.dataset.menuOpen = '1';
    window.dispatchEvent(new Event('roomcraft-menu-changed'));
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 40);
  }, []);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [productCardOpen, setProductCardOpen] = useState(false);
  const [bom, setBom] = useState(false);
  const [projectName, setProjectName] = useState('Bedroom study');
  const [notice, setNotice] = useState('');
  const [recovery, setRecovery] = useState<{ savedAt: string; payload: unknown } | null>(null);
  const [designs, setDesigns] = useState<SharedDesign[]>([]);
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
    setProductCardOpen(false);
    window.setTimeout(() => window.dispatchEvent(new Event('roomcraft-refocus')), 0);
  }, [store]);

  const allCatalog = useMemo(() => [...catalogItems, ...customCatalog], [customCatalog]);
  const validation = validatePlan(walls);
  const area = validation.rooms.reduce((sum, r) => sum + roomArea(r), 0);
  const total = furniture.reduce((sum, item) => sum + (allCatalog.find((c) => c.id === item.catalogId)?.price ?? 0), 0);
  const missingPrices = furniture.filter((item) => allCatalog.find((c) => c.id === item.catalogId)?.price == null).length;

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const rename = () => {
    const name = window.prompt('Project name', projectName)?.trim();
    if (name) setProjectName(name);
  };

  const share = async () => {
    try {
      const entry = saveSharedDesign(projectName, store.projectPayload());
      const url = designShareUrl(entry.code);
      history.replaceState(null, '', url);
      setDesigns(listSharedDesigns());
      if (navigator.share) await navigator.share({ title: projectName, text: `Mahnikka design ${entry.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        notify(`Design code ${entry.code} copied`);
      }
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') notify('Sharing is unavailable in this browser');
    }
  };

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
  }, [store, closeProjectMenu]);

  useEffect(() => {
    const open = () => {
      // Walls/floors/ceilings → inspector. Never stack with the retail product card.
      setInspectorOpen(true);
      setProductCardOpen(false);
      setCatalogOpen(false);
      closeProjectMenu();
    };
    const openCard = () => {
      setProductCardOpen(true);
      setInspectorOpen(false);
      setCatalogOpen(false);
      setMenuOpen(false);
    };
    const dismissCard = () => setProductCardOpen(false);
    window.addEventListener('roomcraft-open-properties', open);
    window.addEventListener('roomcraft-open-product-card', openCard);
    window.addEventListener('roomcraft-dismiss-product-card', dismissCard);
    return () => {
      window.removeEventListener('roomcraft-open-properties', open);
      window.removeEventListener('roomcraft-open-product-card', openCard);
      window.removeEventListener('roomcraft-dismiss-product-card', dismissCard);
    };
  }, []);

  const pendingPlacement = usePlannerStore((s) => s.pendingPlacement);
  useEffect(() => {
    // One panel at a time: furniture → product card; walls/openings auto-open inspector.
    // Room/floor edit opens only from the right-rail Edit control (or open-properties).
    if (pendingPlacement) {
      setInspectorOpen(false);
      setProductCardOpen(false);
      return;
    }
    if (selectedFurnitureId) {
      setProductCardOpen(true);
      setInspectorOpen(false);
      return;
    }
    setProductCardOpen(false);
    // Openings need the inspector to edit size/type. Walls stay on-plan so end
    // handles remain draggable — open properties from the wall Edit fab instead.
    if (selectedOpeningId) setInspectorOpen(true);
    else if (selectedWallId) setInspectorOpen(false);
  }, [selectedWallId, selectedOpeningId, selectedFurnitureId, pendingPlacement]);

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
      notify(ok ? 'Project imported' : 'This is not a valid Mahnikka project');
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
    productCardOpen && selectedFurnitureId && !pendingPlacement && !inspectorOpen ? 'has-product-card' : '',
    selectedFurnitureId || pendingPlacement ? 'has-action-fabs' : '',
    inspectorOpen ? 'has-inspector' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
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
          }}
        />
      )}

      <StudioChrome
        roomType={roomType}
        itemCount={furniture.length}
        total={total}
        catalogOpen={catalogOpen}
        menuOpen={menuOpen}
        openCatalog={() => {
          store.setStudioMode('furnish');
          setCatalogOpen(true);
          setMenuOpen(false);
        }}
        openMenu={openProjectMenu}
        closeMenu={closeProjectMenu}
        openBom={() => setBom(true)}
        openCategory={openCategory}
        onOpenInspector={() => {
          setInspectorOpen(true);
          setProductCardOpen(false);
          setCatalogOpen(false);
          setMenuOpen(false);
        }}
      />

      {productCardOpen &&
        selectedFurnitureId &&
        !inspectorOpen &&
        !pendingPlacement &&
        !catalogOpen &&
        !menuOpen && (
        <SelectedProductCard
          roomType={roomType}
          onModify={() => {
            setInspectorOpen(true);
            setProductCardOpen(false);
            setCatalogOpen(false);
            setMenuOpen(false);
          }}
          onClose={() => setProductCardOpen(false)}
          onPlaceComplement={() => {
            setInspectorOpen(false);
            setProductCardOpen(false);
            setCatalogOpen(false);
            setMenuOpen(false);
          }}
        />
      )}

      {menuOpen && (
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
          </p>
          <div className="menu-actions">
            <button type="button" onClick={() => notify('Sign-in is coming soon')}>
              <LogIn size={16} /> Log in
            </button>
            <button
              onClick={() => {
                store.showStart();
                setMenuOpen(false);
                setCatalogOpen(false);
                setInspectorOpen(false);
              }}
            >
              <Home size={16} /> New design
            </button>
            <button
              onClick={() => {
                store.save();
                notify('Project saved on this device');
              }}
            >
              <Save size={16} /> Save
            </button>
            <button
              onClick={() => {
                store.load();
                notify('Saved project loaded');
              }}
            >
              <Upload size={16} /> Load
            </button>
            <button onClick={store.exportProject}>
              <Download size={16} /> Export
            </button>
            <label className="project-import">
              <FileJson size={16} /> Import
              <input type="file" accept="application/json,.json" onChange={importProject} />
            </label>
            <button onClick={share}>
              <Share2 size={16} /> Share
            </button>
            <button onClick={() => setBom(true)}>
              <ReceiptText size={16} /> Shopping list
            </button>
          </div>
          {designs.length > 0 && (
            <section className="design-library">
              <p className="eyebrow">Design library</p>
              <ul>
                {designs.map((design) => (
                  <li key={design.code}>
                    <button
                      onClick={() => {
                        if (store.importProject(design.payload)) {
                          setProjectName(design.name);
                          history.replaceState(null, '', designShareUrl(design.code));
                          notify(`Opened ${design.code}`);
                          setMenuOpen(false);
                        }
                      }}
                    >
                      <strong>{design.name}</strong>
                      <span>
                        {design.code} · {new Date(design.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      className="design-delete"
                      aria-label={`Delete ${design.code}`}
                      onClick={() => {
                        deleteSharedDesign(design.code);
                        setDesigns(listSharedDesigns());
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      )}

      {catalogOpen && <CatalogPanel close={closeCatalog} onAdd={startGhostPlacement} roomType={roomType} />}

      <SelectionInspector
        open={inspectorOpen}
        onClose={() => {
          setInspectorOpen(false);
        }}
      />

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

      {bom && <BomDialog items={furniture} catalog={allCatalog} close={() => setBom(false)} />}
    </main>
  );
}
