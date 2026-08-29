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
  inviteSelectionProjectClient,
  getSharedSelectionProject,
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
  CuratedSelectionOption,
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
import { usePlannerStore } from './plannerStore';
import { getHousePlan } from '../lib/housePlans/planRegistry';
import { stillwaterDrawingPackage, type DrawingPackage } from '../lib/housePlans/drawingPackage';
import type { HousePlan } from '../lib/housePlans/buildPlan';
import { importDrawingFiles, type DrawingImportProgress } from '../lib/housePlans/importDrawingFile';
import { loadDrawingPackage, saveDrawingPackage } from '../lib/housePlans/drawingPackageStorage';
import { downloadCofExcel } from '../lib/configurator/exportCof';
import { buildBtSelectionRows, downloadBtSelectionsCsv } from '../lib/configurator/exportBtSelections';
import { getOlsenCatalogSeed } from '../lib/catalog/catalogSource';
import { expandCatalogSelection } from '../lib/configurator/selectionKits';

const STORAGE = 'roomcraft-configurator-v2';
const LOCAL_SHARES = 'roomcraft-client-shares';

type ConfiguratorState = {
  role: ConfiguratorRole;
  project: ExtendedSelectionProject | null;
  contract: ContractSnapshot | null;
  remoteId: string | null;
  shareToken: string | null;
  lastInviteUrl: string | null;
  syncing: boolean;
  syncError: string | null;
  activeRoomFilter: string | null;
  hydrate: () => void;
  hydrateFromShareToken: (token: string) => Promise<boolean>;
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
  importProjectDrawing: (
    files: { drawing?: File | null; pdf?: File | null },
    opts?: { planName?: string; createIfEmpty?: boolean; onProgress?: (p: DrawingImportProgress) => void },
  ) => Promise<void>;
  hydrateDrawingPackage: () => Promise<void>;
  saveSelections: (furniture: FurnitureItem[], planRooms: PlanRoomLabel[]) => void;
  setSurvey: (survey: SurveyResponse) => void;
  setCuratedOptions: (options: CuratedSelectionOption[]) => void;
  markClientFinished: () => void;
  setSignOff: (target: 'cof' | 'buildertrend', status: SignOffStatus) => void;
  completeCloseout: () => Promise<void>;
  createClientInvite: (clientEmail?: string) => Promise<string>;
  setActiveRoomFilter: (room: string | null) => void;
};

function slimDrawingPackageForPersist(pkg: DrawingPackage | undefined): DrawingPackage | undefined {
  if (!pkg) return undefined;
  return {
    ...pkg,
    pdfUrl: pkg.pdfFileName ? undefined : pkg.pdfUrl?.startsWith('blob:') ? undefined : pkg.pdfUrl,
    sheets: pkg.sheets.map(({ svg: _svg, ...rest }) => rest),
  };
}

function toExtended(project: SelectionProject | ExtendedSelectionProject): ExtendedSelectionProject {
  if ('workflowStatus' in project) return project;
  return createEmptyExtendedProject(project);
}

function readState(): Pick<
  ConfiguratorState,
  'role' | 'project' | 'contract' | 'remoteId' | 'activeRoomFilter' | 'shareToken' | 'lastInviteUrl'
> {
  if (typeof window === 'undefined') {
    return {
      role: 'designer',
      project: null,
      contract: null,
      remoteId: null,
      activeRoomFilter: null,
      shareToken: null,
      lastInviteUrl: null,
    };
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
      shareToken: raw.shareToken ?? null,
      lastInviteUrl: raw.lastInviteUrl ?? null,
    };
  } catch {
    return {
      role: 'designer',
      project: null,
      contract: null,
      remoteId: null,
      activeRoomFilter: null,
      shareToken: null,
      lastInviteUrl: null,
    };
  }
}

function persist(
  state: Pick<
    ConfiguratorState,
    'role' | 'project' | 'contract' | 'remoteId' | 'activeRoomFilter' | 'shareToken' | 'lastInviteUrl'
  >,
) {
  if (typeof window === 'undefined') return;
  const project = state.project
    ? { ...state.project, drawingPackage: slimDrawingPackageForPersist(state.project.drawingPackage) }
    : null;
  localStorage.setItem(STORAGE, JSON.stringify({ ...state, project }));
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
  persist({
    role: get().role,
    project: next,
    contract: next.contract,
    remoteId: get().remoteId,
    activeRoomFilter: get().activeRoomFilter,
    shareToken: get().shareToken,
    lastInviteUrl: get().lastInviteUrl,
  });
  set({ project: next, contract: next.contract });
  void get().persistProject();
}

export const useConfiguratorStore = create<ConfiguratorState>((set, get) => ({
  ...initial,
  shareToken: initial.shareToken ?? null,
  lastInviteUrl: initial.lastInviteUrl ?? null,
  syncing: false,
  syncError: null,
  hydrate: () => {
    const state = readState();
    set(state);
    const project = state.project;
    if (project?.importedHousePlan) {
      usePlannerStore.getState().applyHousePlanObject(project.importedHousePlan);
    } else if (project?.housePlanId && project.housePlanId !== 'custom') {
      const plan = getHousePlan(project.housePlanId);
      if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
    }
    void get().hydrateDrawingPackage();
  },
  hydrateFromShareToken: async (token) => {
    try {
      const shared = await getSharedSelectionProject(token);
      const extended = (shared.extended ?? {}) as Partial<ExtendedSelectionProject>;
      const project = toExtended({
        id: shared.id,
        name: shared.name,
        planRef: shared.planRef,
        lotRef: shared.lotRef,
        contract: shared.contract,
        createdAt: shared.createdAt,
        ...extended,
      } as ExtendedSelectionProject);
      persist({
        role: 'client',
        project,
        contract: project.contract,
        remoteId: shared.id,
        activeRoomFilter: null,
        shareToken: token,
        lastInviteUrl: null,
      });
      set({
        role: 'client',
        project,
        contract: project.contract,
        remoteId: shared.id,
        shareToken: token,
        activeRoomFilter: null,
      });
      if (project.housePlanId) {
        const plan = getHousePlan(project.housePlanId);
        if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
      }
      return true;
    } catch {
      // Local fallback shares (same browser / demo)
      try {
        const map = JSON.parse(localStorage.getItem(LOCAL_SHARES) ?? '{}') as Record<
          string,
          { project: ExtendedSelectionProject; expiresAt?: string }
        >;
        const entry = map[token];
        if (!entry?.project) return false;
        if (entry.expiresAt && new Date(entry.expiresAt).getTime() < Date.now()) return false;
        const project = toExtended(entry.project);
        persist({
          role: 'client',
          project,
          contract: project.contract,
          remoteId: null,
          activeRoomFilter: null,
          shareToken: token,
          lastInviteUrl: null,
        });
        set({ role: 'client', project, contract: project.contract, shareToken: token, remoteId: null });
        if (project.housePlanId) {
          const plan = getHousePlan(project.housePlanId);
          if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
        }
        return true;
      } catch {
        return false;
      }
    }
  },
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
          importedHousePlan: extended.importedHousePlan,
          drawingPackageId: extended.drawingPackageId,
          drawingPackage: extended.drawingPackage,
          team: extended.team,
          allowances: extended.allowances,
          levelOverrides: extended.levelOverrides,
          takeoff: extended.takeoff ?? (extended as { takeoff?: TakeoffSnapshot }).takeoff,
          selections: extended.selections,
          survey: extended.survey,
          signOff: extended.signOff,
          sceneProjectId: match.sceneProjectId,
        } as ExtendedSelectionProject);
        persist({
          role: get().role,
          project,
          contract: match.contract,
          remoteId: match.id,
          activeRoomFilter: get().activeRoomFilter,
          shareToken: get().shareToken,
          lastInviteUrl: get().lastInviteUrl,
        });
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
    const next = { role: get().role, project: nextProject, contract: nextProject.contract, remoteId, activeRoomFilter: get().activeRoomFilter, shareToken: get().shareToken, lastInviteUrl: get().lastInviteUrl };
    persist(next);
    set(next);
    if (nextProject.importedHousePlan) {
      usePlannerStore.getState().applyHousePlanObject(nextProject.importedHousePlan);
    } else if (nextProject.housePlanId && nextProject.housePlanId !== 'custom') {
      const plan = getHousePlan(nextProject.housePlanId);
      if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
    }
    void get().hydrateDrawingPackage();
    void get().persistProject();
  },
  loadStillwater183: () => {
    const base = createEmptyExtendedProject(STILLWATER_183_PROJECT);
    const drawings = stillwaterDrawingPackage();
    get().loadProject({
      ...base,
      housePlanId: 'stillwater-183',
      drawingPackageId: drawings.id,
      drawingPackage: drawings,
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
    persist({
      role: get().role,
      project: null,
      contract: null,
      remoteId: null,
      activeRoomFilter: null,
      shareToken: null,
      lastInviteUrl: null,
    });
    set({ project: null, contract: null, remoteId: null, activeRoomFilter: null, shareToken: null, lastInviteUrl: null });
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
          importedHousePlan: project.importedHousePlan,
          drawingPackageId: project.drawingPackageId,
          drawingPackage: slimDrawingPackageForPersist(project.drawingPackage),
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
    if (housePlanId === 'custom') {
      const imported = get().project?.importedHousePlan;
      if (imported) usePlannerStore.getState().applyHousePlanObject(imported);
      return;
    }
    const plan = getHousePlan(housePlanId);
    if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
  },
  setTeam: (team) => patchProject(get, set, { team }),
  hydrateDrawingPackage: async () => {
    const project = get().project;
    if (!project?.drawingPackageId) return;
    if (project.drawingPackage?.sheetSource === 'static' && project.drawingPackage.sheets.some((s) => s.imageUrl)) {
      return;
    }
    try {
      const stored = await loadDrawingPackage(project.drawingPackageId);
      if (!stored) return;
      const next = {
        ...project,
        drawingPackage: stored.package,
        importedHousePlan: stored.plan ?? project.importedHousePlan,
      };
      set({ project: next });
    } catch {
      /* ignore IDB misses */
    }
  },
  importProjectDrawing: async (files, opts) => {
    let project = get().project;
    if (!project && opts?.createIfEmpty) {
      const name = opts.planName?.trim() || files.drawing?.name.replace(/\.(dwg|dxf)$/i, '') || 'New project';
      get().loadProject(createBlankSelectionProject(name));
      project = get().project;
    }
    if (!project) throw new Error('Create a project before importing a drawing.');

    const result = await importDrawingFiles(files, {
      planName: opts?.planName ?? project.name,
      onProgress: opts?.onProgress,
    });

    const packageId = await saveDrawingPackage({
      package: result.package,
      plan: result.plan,
      pdfBlob: result.pdfBlob,
    });

    patchProject(get, set, {
      housePlanId: 'custom',
      importedHousePlan: result.plan as HousePlan,
      drawingPackageId: packageId,
      drawingPackage: result.package,
      workflowStatus: 'plan_verification',
      planVerification: 'in_review',
      planRef: result.plan.name,
    });
    usePlannerStore.getState().applyHousePlanObject(result.plan);
  },
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
    const catalog = getOlsenCatalogSeed();
    const snapshot: SelectionSnapshot = {
      savedAt: new Date().toISOString(),
      items: furniture
        .filter((f) => f.placementKind !== 'stair')
        .map((f) => {
          const product = catalog.find((p) => p.id === f.catalogId);
          const kitId = product ? expandCatalogSelection(product, catalog).kitId : undefined;
          return {
            catalogId: f.catalogId,
            sku: product?.sku,
            qty: 1,
            signOff: 'pending' as SignOffStatus,
            kitId,
          };
        }),
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
  completeCloseout: async () => {
    const project = get().project;
    if (!project) return;
    const catalog = getOlsenCatalogSeed();
    const furniture = usePlannerStore.getState().furniture;
    const planRooms = usePlannerStore.getState().planRooms;
    await downloadCofExcel({
      project,
      contract: project.contract,
      catalog,
      furniture,
      planRooms,
      takeoff: project.takeoff,
      levelOverrides: project.levelOverrides,
      allowances: project.allowances,
    });
    const btRows = buildBtSelectionRows({ project, catalog, furniture, planRooms });
    downloadBtSelectionsCsv(btRows);
    const now = new Date().toISOString();
    patchProject(get, set, {
      signOff: {
        cof: 'approved',
        buildertrend: 'approved',
        cofSignedAt: now,
        btSubmittedAt: now,
      },
      workflowStatus: 'approved',
    });
  },
  createClientInvite: async (clientEmail) => {
    const project = get().project;
    if (!project) throw new Error('No project');
    const remoteId = get().remoteId;
    if (remoteId && isUuid(remoteId)) {
      try {
        const invited = await inviteSelectionProjectClient(remoteId, { clientEmail });
        persist({
          ...get(),
          lastInviteUrl: invited.shareUrl,
          shareToken: invited.shareToken,
        });
        set({ lastInviteUrl: invited.shareUrl, shareToken: invited.shareToken });
        return invited.shareUrl;
      } catch {
        /* fall through to local share */
      }
    }
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const map = JSON.parse(localStorage.getItem(LOCAL_SHARES) ?? '{}') as Record<string, unknown>;
    map[token] = { project, expiresAt, clientEmail };
    localStorage.setItem(LOCAL_SHARES, JSON.stringify(map));
    const shareUrl = `${window.location.origin}/build?share=${token}`;
    persist({ ...get(), lastInviteUrl: shareUrl, shareToken: token });
    set({ lastInviteUrl: shareUrl, shareToken: token });
    return shareUrl;
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
