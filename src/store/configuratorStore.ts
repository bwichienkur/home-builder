import { create } from 'zustand';
import {
  createPlatinumContract,
  STILLWATER_183_PROJECT,
  type ConfiguratorRole,
  type ContractSnapshot,
  type SelectionProject,
} from '../lib/configurator/contractTypes';
import {
  createSelectionProject,
  listSelectionProjects,
  updateSelectionProject,
} from '../api/client';

const STORAGE = 'roomcraft-configurator-v1';

type ConfiguratorState = {
  role: ConfiguratorRole;
  project: SelectionProject | null;
  contract: ContractSnapshot | null;
  remoteId: string | null;
  syncing: boolean;
  syncError: string | null;
  hydrate: () => void;
  syncFromApi: () => Promise<void>;
  setRole: (role: ConfiguratorRole) => void;
  loadProject: (project: SelectionProject, remoteId?: string | null) => void;
  loadStillwater183: () => void;
  setContract: (contract: ContractSnapshot) => void;
  clearProject: () => void;
  persistProject: () => Promise<void>;
};

function readState(): Pick<ConfiguratorState, 'role' | 'project' | 'contract' | 'remoteId'> {
  if (typeof window === 'undefined') return { role: 'designer', project: null, contract: null, remoteId: null };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<ConfiguratorState>;
    return {
      role: raw.role ?? 'designer',
      project: raw.project ?? null,
      contract: raw.contract ?? raw.project?.contract ?? null,
      remoteId: raw.remoteId ?? null,
    };
  } catch {
    return { role: 'designer', project: null, contract: null, remoteId: null };
  }
}

function persist(state: Pick<ConfiguratorState, 'role' | 'project' | 'contract' | 'remoteId'>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE, JSON.stringify(state));
}

const initial = readState();

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export const useConfiguratorStore = create<ConfiguratorState>((set, get) => ({
  ...initial,
  syncing: false,
  syncError: null,
  hydrate: () => set(readState()),
  syncFromApi: async () => {
    set({ syncing: true, syncError: null });
    try {
      const items = await listSelectionProjects();
      const current = get().project;
      const remoteId = get().remoteId;
      const match =
        (remoteId && items.find((p) => p.id === remoteId)) ??
        (current && items.find((p) => p.planRef === current.planRef && p.name === current.name));
      if (match) {
        const project: SelectionProject = {
          id: match.id,
          name: match.name,
          planRef: match.planRef,
          lotRef: match.lotRef,
          contract: match.contract,
          createdAt: match.createdAt,
        };
        persist({ role: get().role, project, contract: match.contract, remoteId: match.id });
        set({ project, contract: match.contract, remoteId: match.id, syncing: false });
      } else {
        set({ syncing: false });
      }
    } catch (err) {
      set({
        syncing: false,
        syncError: err instanceof Error ? err.message : 'Selection project sync failed',
      });
    }
  },
  setRole: (role) => {
    persist({ ...get(), role });
    set({ role });
  },
  loadProject: (project, remoteId = null) => {
    const next = { role: get().role, project, contract: project.contract, remoteId };
    persist(next);
    set(next);
    void get().persistProject();
  },
  loadStillwater183: () => {
    get().loadProject(STILLWATER_183_PROJECT);
  },
  setContract: (contract) => {
    const project = get().project;
    const nextProject = project ? { ...project, contract } : null;
    persist({ role: get().role, project: nextProject, contract, remoteId: get().remoteId });
    set({ contract, project: nextProject });
    void get().persistProject();
  },
  clearProject: () => {
    persist({ role: get().role, project: null, contract: null, remoteId: null });
    set({ project: null, contract: null, remoteId: null });
  },
  persistProject: async () => {
    const { project, contract, remoteId } = get();
    if (!project || !contract) return;
    try {
      const payload = {
        name: project.name,
        planRef: project.planRef,
        lotRef: project.lotRef,
        contract,
      };
      if (remoteId && isUuid(remoteId)) {
        const saved = await updateSelectionProject(remoteId, payload);
        const nextProject: SelectionProject = {
          id: saved.id,
          name: saved.name,
          planRef: saved.planRef,
          lotRef: saved.lotRef,
          contract: saved.contract,
          createdAt: saved.createdAt,
        };
        persist({ role: get().role, project: nextProject, contract: saved.contract, remoteId: saved.id });
        set({ project: nextProject, contract: saved.contract, remoteId: saved.id, syncError: null });
      } else {
        const saved = await createSelectionProject(payload);
        const nextProject: SelectionProject = {
          id: saved.id,
          name: saved.name,
          planRef: saved.planRef,
          lotRef: saved.lotRef,
          contract: saved.contract,
          createdAt: saved.createdAt,
        };
        persist({ role: get().role, project: nextProject, contract: saved.contract, remoteId: saved.id });
        set({ project: nextProject, contract: saved.contract, remoteId: saved.id, syncError: null });
      }
    } catch {
      // Offline / no DATABASE_URL — localStorage remains source of truth.
    }
  },
}));

export function createBlankSelectionProject(name: string, planRef?: string): SelectionProject {
  return {
    id: `project-${Date.now()}`,
    name,
    planRef: planRef ?? name,
    contract: createPlatinumContract(name, planRef),
    createdAt: new Date().toISOString(),
  };
}
