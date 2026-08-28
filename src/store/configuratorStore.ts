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
import type {
  ExtendedSelectionProject,
  PlanVerificationStatus,
  ProjectWorkflowStatus,
  SelectionSnapshot,
  SignOffStatus,
  SurveyResponse,
  TakeoffSnapshot,
  TeamMember,
} from '../lib/configurator/projectTypes';
import {
  createEmptyExtendedProject,
  PLAN_VERIFICATION_LABEL,
  WORKFLOW_LABEL,
} from '../lib/configurator/projectTypes';
import { loadTakeoffFromFile } from '../lib/configurator/importTakeoff';
import { loadContractPricingFromFile } from '../lib/configurator/importContractPricing';
import type { FurnitureItem, PlanRoomLabel } from '../types';
import stillwaterTakeoffSeed from '../lib/configurator/stillwater183Takeoff.json';
import type { CuratedSelectionOption } from '../lib/configurator/projectTypes';
import { usePlannerStore } from './plannerStore';
import { getHousePlan } from '../lib/housePlans/planRegistry';

const STORAGE = 'roomcraft-configurator-v2';

type ConfiguratorState = {
  role: ConfiguratorRole;
  project: ExtendedSelectionProject | null;
  contract: ContractSnapshot | null;
  remoteId: string | null;
  syncing: boolean;
  syncError: string | null;
  activeRoomFilter: string | null;
  hydrate: () => void;
  syncFromApi: () => Promise<void>;
  setRole: (role: ConfiguratorRole) => void;
  loadProject: (project: ExtendedSelectionProject, remoteId?: string | null) => void;
  loadStillwater183: () => void;
  setContract: (contract: ContractSnapshot) => void;
  clearProject: () => void;
  persistProject: () => Promise<void>;
  setWorkflowStatus: (status: ProjectWorkflowStatus) => void;
  setPlanVerification: (status: PlanVerificationStatus) => void;
  setHousePlanId: (planId: string) => void;
  setTeam: (team: TeamMember[]) => void;
  importTakeoffFile: (file: File) => Promise<void>;
  importContractPricingFile: (file: File) => Promise<void>;
  saveSelections: (furniture: FurnitureItem[], planRooms: PlanRoomLabel[]) => void;
  setSurvey: (survey: SurveyResponse) => void;
  setCuratedOptions: (options: CuratedSelectionOption[]) => void;
  markClientFinished: () => void;
  setSignOff: (target: 'cof' | 'buildertrend', status: SignOffStatus) => void;
  setActiveRoomFilter: (room: string | null) => void;
};

function toExtended(project: SelectionProject | ExtendedSelectionProject): ExtendedSelectionProject {
  if ('workflowStatus' in project) return project;
  return createEmptyExtendedProject(project);
}

function readState(): Pick<ConfiguratorState, 'role' | 'project' | 'contract' | 'remoteId' | 'activeRoomFilter'> {
  if (typeof window === 'undefined') {
    return { role: 'designer', project: null, contract: null, remoteId: null, activeRoomFilter: null };
  }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? localStorage.getItem('roomcraft-configurator-v1') ?? '{}') as Partial<
      ConfiguratorState & { project?: ExtendedSelectionProject }
    >;
    const project = raw.project ? toExtended(raw.project) : null;
    return {
      role: raw.role ?? 'designer',
      project,
      contract: raw.contract ?? project?.contract ?? null,
      remoteId: raw.remoteId ?? null,
      activeRoomFilter: raw.activeRoomFilter ?? null,
    };
  } catch {
    return { role: 'designer', project: null, contract: null, remoteId: null, activeRoomFilter: null };
  }
}

function persist(state: Pick<ConfiguratorState, 'role' | 'project' | 'contract' | 'remoteId' | 'activeRoomFilter'>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE, JSON.stringify(state));
}

const initial = readState();

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function patchProject(
  get: () => ConfiguratorState,
  set: (partial: Partial<ConfiguratorState>) => void,
  patch: Partial<ExtendedSelectionProject>,
) {
  const project = get().project;
  if (!project) return;
  const next = { ...project, ...patch };
  persist({ role: get().role, project: next, contract: next.contract, remoteId: get().remoteId, activeRoomFilter: get().activeRoomFilter });
  set({ project: next, contract: next.contract });
  void get().persistProject();
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
        const extended = (match.extended ?? {}) as Partial<ExtendedSelectionProject>;
        const project = toExtended({
          id: match.id,
          name: match.name,
          planRef: match.planRef,
          lotRef: match.lotRef,
          contract: match.contract,
          createdAt: match.createdAt,
          workflowStatus: extended.workflowStatus,
          planVerification: extended.planVerification,
          housePlanId: extended.housePlanId,
          team: extended.team,
          allowances: extended.allowances,
          levelOverrides: extended.levelOverrides,
          takeoff: extended.takeoff ?? (extended as { takeoff?: TakeoffSnapshot }).takeoff,
          selections: extended.selections,
          survey: extended.survey,
          signOff: extended.signOff,
          sceneProjectId: match.sceneProjectId,
        } as ExtendedSelectionProject);
        persist({ role: get().role, project, contract: match.contract, remoteId: match.id, activeRoomFilter: get().activeRoomFilter });
        set({ project, contract: match.contract, remoteId: match.id, syncing: false });
      } else {
        set({ syncing: false });
      }
    } catch (err) {
      set({ syncing: false, syncError: err instanceof Error ? err.message : 'Selection project sync failed' });
    }
  },
  setRole: (role) => {
    persist({ ...get(), role });
    set({ role });
  },
  loadProject: (project, remoteId = null) => {
    const nextProject = toExtended(project);
    const next = { role: get().role, project: nextProject, contract: nextProject.contract, remoteId, activeRoomFilter: get().activeRoomFilter };
    persist(next);
    set(next);
    void get().persistProject();
  },
  loadStillwater183: () => {
    const base = createEmptyExtendedProject(STILLWATER_183_PROJECT);
    get().loadProject({
      ...base,
      housePlanId: 'stillwater-183',
      workflowStatus: 'plan_verification',
      planVerification: 'in_review',
      takeoff: {
        ...(stillwaterTakeoffSeed as TakeoffSnapshot),
        importedAt: new Date().toISOString(),
      },
    });
    const plan = getHousePlan('stillwater-183');
    if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
  },
  setContract: (contract) => {
    patchProject(get, set, { contract });
  },
  clearProject: () => {
    persist({ role: get().role, project: null, contract: null, remoteId: null, activeRoomFilter: null });
    set({ project: null, contract: null, remoteId: null, activeRoomFilter: null });
  },
  persistProject: async () => {
    const { project, remoteId } = get();
    if (!project) return;
    try {
      const payload = {
        name: project.name,
        planRef: project.planRef,
        lotRef: project.lotRef,
        contract: project.contract,
        sceneProjectId: project.sceneProjectId ?? null,
        extended: {
          workflowStatus: project.workflowStatus,
          planVerification: project.planVerification,
          housePlanId: project.housePlanId,
          team: project.team,
          allowances: project.allowances,
          levelOverrides: project.levelOverrides,
          takeoff: project.takeoff,
          selections: project.selections,
          survey: project.survey,
          curatedOptions: project.curatedOptions,
          signOff: project.signOff,
        },
      };
      if (remoteId && isUuid(remoteId)) {
        const saved = await updateSelectionProject(remoteId, payload);
        get().loadProject(
          {
            ...project,
            id: saved.id,
            createdAt: saved.createdAt,
            ...(saved.extended ?? {}),
          } as ExtendedSelectionProject,
          saved.id,
        );
      } else {
        const saved = await createSelectionProject(payload);
        get().loadProject(
          {
            ...project,
            id: saved.id,
            createdAt: saved.createdAt,
            ...(saved.extended ?? {}),
          } as ExtendedSelectionProject,
          saved.id,
        );
      }
      set({ syncError: null });
    } catch {
      // Offline fallback — localStorage remains source of truth.
    }
  },
  setWorkflowStatus: (workflowStatus) => patchProject(get, set, { workflowStatus }),
  setPlanVerification: (planVerification) => {
    const project = get().project;
    const takeoff = project?.takeoff
      ? {
          ...project.takeoff,
          qtySource:
            planVerification === 'approved_for_selections' && project.takeoff.lines.length > 0
              ? ('takeoff' as const)
              : project.takeoff.qtySource ?? ('auto' as const),
        }
      : undefined;
    patchProject(get, set, {
      planVerification,
      takeoff,
      workflowStatus:
        planVerification === 'approved_for_selections' ? 'ready_for_client_survey' : project?.workflowStatus ?? 'plan_verification',
    });
  },
  setHousePlanId: (housePlanId) => {
    patchProject(get, set, { housePlanId });
    if (housePlanId === 'custom') return;
    const plan = getHousePlan(housePlanId);
    if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
  },
  setTeam: (team) => patchProject(get, set, { team }),
  importTakeoffFile: async (file) => {
    const takeoff = await loadTakeoffFromFile(file);
    patchProject(get, set, { takeoff, workflowStatus: 'plan_verification' });
  },
  importContractPricingFile: async (file) => {
    const parsed = await loadContractPricingFromFile(file);
    const project = get().project;
    if (!project) return;
    patchProject(get, set, {
      allowances: [...project.allowances, ...parsed.allowances],
      levelOverrides: [...project.levelOverrides, ...parsed.levelOverrides],
    });
  },
  saveSelections: (furniture, planRooms) => {
    const snapshot: SelectionSnapshot = {
      savedAt: new Date().toISOString(),
      items: furniture
        .filter((f) => f.placementKind !== 'stair')
        .map((f) => ({
          catalogId: f.catalogId,
          qty: 1,
          signOff: 'pending' as SignOffStatus,
        })),
      floorFinishes: planRooms
        .filter((r) => r.floorCatalogId)
        .map((r) => ({ roomId: r.id, catalogId: r.floorCatalogId!, roomName: r.name || r.roomType })),
    };
    patchProject(get, set, { selections: snapshot });
  },
  setSurvey: (survey) => patchProject(get, set, { survey, workflowStatus: 'client_configurator' }),
  setCuratedOptions: (curatedOptions) => patchProject(get, set, { curatedOptions }),
  markClientFinished: () => patchProject(get, set, { workflowStatus: 'client_finished' }),
  setSignOff: (target, status) => {
    const project = get().project;
    if (!project) return;
    const signOff = { ...project.signOff, [target]: status };
    if (target === 'cof' && status === 'approved') signOff.cofSignedAt = new Date().toISOString();
    if (target === 'buildertrend' && status === 'approved') signOff.btSubmittedAt = new Date().toISOString();
    const workflowStatus: ProjectWorkflowStatus =
      status === 'approved' && target === 'cof'
        ? 'cof_signed'
        : status === 'approved' && target === 'buildertrend'
          ? 'approved'
          : project.workflowStatus;
    patchProject(get, set, { signOff, workflowStatus });
  },
  setActiveRoomFilter: (activeRoomFilter) => {
    persist({ ...get(), activeRoomFilter });
    set({ activeRoomFilter });
  },
}));

export function createBlankSelectionProject(name: string, planRef?: string): ExtendedSelectionProject {
  return createEmptyExtendedProject({
    id: `project-${Date.now()}`,
    name,
    planRef: planRef ?? name,
    contract: createPlatinumContract(name, planRef),
    createdAt: new Date().toISOString(),
  });
}

export { WORKFLOW_LABEL, PLAN_VERIFICATION_LABEL };
