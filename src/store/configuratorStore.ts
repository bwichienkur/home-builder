import { create } from 'zustand';
import {
  createPlatinumContract,
  STILLWATER_183_PROJECT,
  type ConfiguratorRole,
  type ContractSnapshot,
  type SelectionProject,
} from '../lib/configurator/contractTypes';

const STORAGE = 'roomcraft-configurator-v1';

type ConfiguratorState = {
  role: ConfiguratorRole;
  project: SelectionProject | null;
  contract: ContractSnapshot | null;
  hydrate: () => void;
  setRole: (role: ConfiguratorRole) => void;
  loadProject: (project: SelectionProject) => void;
  loadStillwater183: () => void;
  setContract: (contract: ContractSnapshot) => void;
  clearProject: () => void;
};

function readState(): Pick<ConfiguratorState, 'role' | 'project' | 'contract'> {
  if (typeof window === 'undefined') return { role: 'designer', project: null, contract: null };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<ConfiguratorState>;
    return {
      role: raw.role ?? 'designer',
      project: raw.project ?? null,
      contract: raw.contract ?? raw.project?.contract ?? null,
    };
  } catch {
    return { role: 'designer', project: null, contract: null };
  }
}

function persist(state: Pick<ConfiguratorState, 'role' | 'project' | 'contract'>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE, JSON.stringify(state));
}

const initial = readState();

export const useConfiguratorStore = create<ConfiguratorState>((set, get) => ({
  ...initial,
  hydrate: () => set(readState()),
  setRole: (role) => {
    persist({ ...get(), role });
    set({ role });
  },
  loadProject: (project) => {
    const next = { role: get().role, project, contract: project.contract };
    persist(next);
    set(next);
  },
  loadStillwater183: () => {
    get().loadProject(STILLWATER_183_PROJECT);
  },
  setContract: (contract) => {
    const project = get().project;
    const nextProject = project ? { ...project, contract } : null;
    persist({ role: get().role, project: nextProject, contract });
    set({ contract, project: nextProject });
  },
  clearProject: () => {
    persist({ role: get().role, project: null, contract: null });
    set({ project: null, contract: null });
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
