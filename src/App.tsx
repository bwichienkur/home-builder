import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileJson,
  ReceiptText,
  Save,
  Share2,
  Upload,
} from 'lucide-react';
import { CatalogPanel } from './components/catalog/CatalogPanel';
import { catalog as catalogItems } from './components/catalog/catalogData';
import { FloorPlanEditor } from './components/editor2d/FloorPlanEditor';
import { Toolbar } from './components/ui/Toolbar';
import { BomDialog } from './components/ui/BomDialog';
import { SelectionInspector, RoomDesigner } from './components/ui/SelectionInspector';
import { StudioChrome } from './components/ui/StudioChrome';
import { AdminPage } from './components/admin/AdminPage';
import { useInventoryStore } from './store/inventoryStore';
import { usePlannerStore } from './store/plannerStore';
import { roomArea, validatePlan } from './lib/geometry/rooms';
import {
  clearRecoverySnapshot,
  designShareUrl,
  loadSharedDesign,
  readDesignCodeFromLocation,
  readRecoverySnapshot,
  saveSharedDesign,
} from './lib/designShare';

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
    view,
    roomType,
    floors,
    activeFloorId,
  } = store;

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [bom, setBom] = useState(false);
  const [projectName, setProjectName] = useState('Bedroom study');
  const [notice, setNotice] = useState('');
  const [recovery, setRecovery] = useState<{ savedAt: string; payload: unknown } | null>(null);
  const openingNotice = usePlannerStore((s) => s.openingNotice);
  const clearOpeningNotice = usePlannerStore((s) => s.clearOpeningNotice);

  const closeCatalog = useCallback(() => setCatalogOpen(false), []);
  const showAddedItem = useCallback(() => {
    store.setView('3d');
    store.setCameraMode('orbit');
    setCatalogOpen(false);
    setInspectorOpen(true);
  }, [store]);

  const allCatalog = useMemo(() => [...catalogItems, ...customCatalog], [customCatalog]);
  const validation = validatePlan(walls);
  const area = validation.rooms.reduce((sum, r) => sum + roomArea(r), 0);
  const total = furniture.reduce((sum, item) => sum + (allCatalog.find((c) => c.id === item.catalogId)?.price ?? 0), 0);

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
      if (navigator.share) await navigator.share({ title: projectName, text: `Roomcraft design ${entry.code}`, url });
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
      } else if (e.key === 'Delete' || e.key === 'Backspace') store.deleteSelected();
      else if (e.key === 'Escape') {
        store.setDraftStart(null);
        setCatalogOpen(false);
        setMenuOpen(false);
        setInspectorOpen(false);
      } else if (e.key === 'ArrowLeft') store.moveSelected(-0.25, 0);
      else if (e.key === 'ArrowRight') store.moveSelected(0.25, 0);
      else if (e.key === 'ArrowUp') store.moveSelected(0, -0.25);
      else if (e.key === 'ArrowDown') store.moveSelected(0, 0.25);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  useEffect(() => {
    const open = () => {
      setInspectorOpen(true);
      setCatalogOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener('roomcraft-open-properties', open);
    return () => window.removeEventListener('roomcraft-open-properties', open);
  }, []);

  useEffect(() => {
    if (selectedWallId || selectedOpeningId || selectedFurnitureId) setInspectorOpen(true);
  }, [selectedWallId, selectedOpeningId, selectedFurnitureId]);

  useEffect(() => {
    const timer = window.setTimeout(() => store.save(), 700);
    return () => window.clearTimeout(timer);
  }, [walls, openings, furniture, store.floorColor, store.wallColor, store.roomType, store.unitSystem, store]);

  useEffect(() => {
    const code = readDesignCodeFromLocation();
    if (code) {
      const shared = loadSharedDesign(code);
      if (shared && store.importProject(shared.payload)) {
        setProjectName(shared.name);
        notify(`Opened design ${code}`);
        return;
      }
    }
    const snapshot = readRecoverySnapshot();
    const saved = localStorage.getItem('roomcraft-project');
    if (snapshot && (!saved || snapshot.savedAt > (JSON.parse(saved).savedAt ?? ''))) {
      setRecovery(snapshot);
    } else if (saved) {
      store.load();
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
      notify(ok ? 'Project imported' : 'This is not a valid Roomcraft project');
    } catch {
      notify('Could not read that project file');
    }
  };

  const openCategory = (category: string) => {
    setCatalogOpen(true);
    setMenuOpen(false);
    setInspectorOpen(false);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('roomcraft-catalog-category', { detail: category })), 0);
  };

  const isTop = view === '2d';

  return (
    <main className={`studio-shell view-${view}`}>
      <section className="studio-canvas" aria-label={isTop ? 'Top view floor plan' : '3D room view'}>
        {isTop ? (
          <>
            <Toolbar />
            <FloorPlanEditor />
          </>
        ) : (
          <Suspense fallback={<div className="loading-3d">Preparing your room…</div>}>
            <Scene3D />
          </Suspense>
        )}
      </section>

      <StudioChrome
        roomType={roomType}
        itemCount={furniture.length}
        total={total}
        catalogOpen={catalogOpen}
        menuOpen={menuOpen}
        openCatalog={() => {
          setCatalogOpen(true);
          setMenuOpen(false);
        }}
        openMenu={() => {
          setMenuOpen(true);
          setCatalogOpen(false);
        }}
        closeMenu={() => setMenuOpen(false)}
        openBom={() => setBom(true)}
        openCategory={openCategory}
        onOpenInspector={() => {
          setInspectorOpen(true);
          setCatalogOpen(false);
          setMenuOpen(false);
        }}
      />

      {menuOpen && (
        <aside className="studio-menu-sheet" role="dialog" aria-label="Project menu">
          <header>
            <button className="project-name" onClick={rename}>
              {projectName} <ChevronDown size={15} />
            </button>
          </header>
          <RoomDesigner compact />
          <div className="floor-row">
            <select aria-label="Active floor" value={activeFloorId} onChange={(e) => store.switchFloor(e.target.value)}>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button onClick={store.addFloor} title="Add floor">
              +
            </button>
          </div>
          {!validation.valid && walls.length > 0 && <div className="plan-warning">Connect the highlighted endpoints to close the room.</div>}
          <p className="menu-meta">
            {area.toFixed(1)} m² · {walls.length} walls · {furniture.length} items
          </p>
          <div className="menu-actions">
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
            <a href="/admin" className="menu-advanced">
              Advanced · inventory
            </a>
          </div>
        </aside>
      )}

      {catalogOpen && <CatalogPanel close={closeCatalog} onAdd={showAddedItem} roomType={roomType} />}

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
                clearRecoverySnapshot();
                setRecovery(null);
                notify('Recovered latest edits');
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
