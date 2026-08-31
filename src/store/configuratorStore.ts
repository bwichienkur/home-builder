import { create } from 'zustand';
import {
  createPlatinumContract,
  PLATINUM_INCLUDED_LEVELS,
  STILLWATER_183_PROJECT,
  type ConfiguratorRole,
  type ContractIncludedLevel,
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
  AllowanceBudget,
  ContractLevelOverride,
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
import {
  asPlanDocument,
  mergeRoomConfigurations,
  roomConfigurationsFromLabels,
} from '../lib/housePlans/planDocument';
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
  setAllowances: (allowances: AllowanceBudget[]) => void;
  upsertAllowance: (allowance: AllowanceBudget, index?: number) => void;
  removeAllowance: (index: number) => void;
  setLevelOverrides: (overrides: ContractLevelOverride[]) => void;
  setIncludedLevel: (row: ContractIncludedLevel) => void;
  addIncludedLevel: (row?: Partial<ContractIncludedLevel>) => void;
  removeIncludedLevel: (pricingCategory: string) => void;
  resetIncludedLevelsToPlatinum: () => void;
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

function isStillwaterProject(project: ExtendedSelectionProject | null | undefined): boolean {
  if (!project) return false;
  if (project.housePlanId === 'stillwater-183') return true;
  const hay = `${project.id} ${project.planRef ?? ''} ${project.name ?? ''}`;
  return /stillwater/i.test(hay);
}

function withStillwaterSheets(project: ExtendedSelectionProject): ExtendedSelectionProject {
  if (!isStillwaterProject(project)) return project;
  const drawings = stillwaterDrawingPackage();
  // Upgrade older SVG-only packs (or packs that lost pdfUrl on persist) to the readable PDF set.
  if (project.drawingPackage?.pdfUrl && project.drawingPackage.sheetSource === 'pdf') {
    return {
      ...project,
      housePlanId: project.housePlanId ?? 'stillwater-183',
      drawingPackageId: project.drawingPackageId ?? drawings.id,
    };
  }
  return {
    ...project,
    housePlanId: project.housePlanId ?? 'stillwater-183',
    drawingPackageId: drawings.id,
    drawingPackage: drawings,
  };
}

function slimDrawingPackageForPersist(pkg: DrawingPackage | undefined): DrawingPackage | undefined {
  if (!pkg) return undefined;
  return {
    ...pkg,
    // Keep hosted/public PDF paths; drop ephemeral blob: URLs (rehydrate from IDB).
    pdfUrl: pkg.pdfUrl?.startsWith('blob:') ? undefined : pkg.pdfUrl,
    sheets: pkg.sheets.map(({ svg: _svg, ...rest }) => rest),
  };
}

/**
 * localStorage has a ~5 MB origin quota. Full DXF imports embed wallSegmentsFt +
 * polygon rooms that blow past it. Large plan/PDF/SVG bodies already live in
 * IndexedDB via drawingPackageId — omit them from the sync key.
 */
export function slimProjectForLocalPersist(project: ExtendedSelectionProject): ExtendedSelectionProject {
  const { importedHousePlan: _plan, ...rest } = project;
  return {
    ...rest,
    drawingPackage: slimDrawingPackageForPersist(project.drawingPackage),
  };
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as DOMException;
  return e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014;
}

function writeLocalStorageJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Persist configurator shell state without large CAD payloads. */
export function persistConfiguratorLocal(
  state: Pick<
    ConfiguratorState,
    'role' | 'project' | 'contract' | 'remoteId' | 'activeRoomFilter' | 'shareToken' | 'lastInviteUrl'
  >,
) {
  if (typeof localStorage === 'undefined') return;
  const project = state.project ? slimProjectForLocalPersist(state.project) : null;
  const payload = { ...state, project };
  try {
    writeLocalStorageJson(STORAGE, payload);
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;
    // Last resort: drop drawingPackage meta + takeoff lines; keep ids for IDB rehydrate.
    const emergency = project
      ? {
          ...payload,
          project: {
            ...project,
            drawingPackage: project.drawingPackage
              ? {
                  id: project.drawingPackage.id,
                  sourceFileName: project.drawingPackage.sourceFileName,
                  importedAt: project.drawingPackage.importedAt,
                  warnings: [],
                  sheets: [],
                  pdfFileName: project.drawingPackage.pdfFileName,
                  pdfUrl: project.drawingPackage.pdfUrl?.startsWith('blob:')
                    ? undefined
                    : project.drawingPackage.pdfUrl,
                  sheetSource: project.drawingPackage.sheetSource,
                }
              : undefined,
            takeoff: project.takeoff
              ? { ...project.takeoff, lines: [] as typeof project.takeoff.lines }
              : undefined,
          },
        }
      : payload;
    try {
      writeLocalStorageJson(STORAGE, emergency);
    } catch (err2) {
      if (!isQuotaExceededError(err2)) throw err2;
      console.warn(
        'Configurator localStorage quota exceeded — project kept in memory/IndexedDB only.',
        err2,
      );
    }
  }
}

function toExtended(project: SelectionProject | ExtendedSelectionProject): ExtendedSelectionProject {
  if ('workflowStatus' in project) return withStillwaterSheets(project);
  return withStillwaterSheets(createEmptyExtendedProject(project));
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
  persistConfiguratorLocal(state);
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
    const project = state.project ? withStillwaterSheets(toExtended(state.project)) : null;
    set({ ...state, project });
    if (project?.importedHousePlan) {
      usePlannerStore.getState().applyHousePlanObject(project.importedHousePlan);
    } else if (project?.housePlanId && project.housePlanId !== 'custom') {
      const plan = getHousePlan(project.housePlanId);
      if (plan) usePlannerStore.getState().applyHousePlanObject(plan);
    }
    if (project?.drawingPackage && state.project && !state.project.drawingPackage?.sheets?.length) {
      persist({ ...state, project });
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
      await get().hydrateDrawingPackage();
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
        await get().hydrateDrawingPackage();
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
  setAllowances: (allowances) => patchProject(get, set, { allowances }),
  upsertAllowance: (allowance, index) => {
    const project = get().project;
    if (!project) return;
    const next = [...project.allowances];
    if (index != null && index >= 0 && index < next.length) next[index] = allowance;
    else next.push(allowance);
    patchProject(get, set, { allowances: next });
  },
  removeAllowance: (index) => {
    const project = get().project;
    if (!project) return;
    patchProject(get, set, { allowances: project.allowances.filter((_, i) => i !== index) });
  },
  setLevelOverrides: (levelOverrides) => patchProject(get, set, { levelOverrides }),
  setIncludedLevel: (row) => {
    const project = get().project;
    if (!project?.contract) return;
    const existing = project.contract.includedLevels;
    const idx = existing.findIndex((r) => r.pricingCategory === row.pricingCategory);
    const includedLevels =
      idx >= 0
        ? existing.map((r, i) => (i === idx ? { ...r, ...row } : r))
        : [...existing, row];
    // Keep a manual override so delta pricing / COF prefer the edited tier.
    const without = project.levelOverrides.filter((o) => o.pricingCategory !== row.pricingCategory);
    const levelOverrides: ContractLevelOverride[] = [
      ...without,
      {
        pricingCategory: row.pricingCategory,
        includedLevel: row.includedLevel,
        label: row.label,
        source: 'manual',
      },
    ];
    patchProject(get, set, {
      contract: {
        ...project.contract,
        includedLevels,
        verifiedAt: new Date().toISOString().slice(0, 10),
      },
      levelOverrides,
    });
  },
  addIncludedLevel: (partial) => {
    const project = get().project;
    if (!project?.contract) return;
    const label = partial?.label?.trim() || 'New trade';
    const pricingCategory =
      partial?.pricingCategory?.trim() ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') ||
      `tier-${Date.now()}`;
    if (project.contract.includedLevels.some((r) => r.pricingCategory === pricingCategory)) return;
    const row: ContractIncludedLevel = {
      pricingCategory,
      sourceTab: partial?.sourceTab ?? '',
      includedLevel: partial?.includedLevel ?? 'Level 3',
      label,
      priceUnit: partial?.priceUnit ?? 'each',
    };
    get().setIncludedLevel(row);
  },
  removeIncludedLevel: (pricingCategory) => {
    const project = get().project;
    if (!project?.contract) return;
    patchProject(get, set, {
      contract: {
        ...project.contract,
        includedLevels: project.contract.includedLevels.filter((r) => r.pricingCategory !== pricingCategory),
        verifiedAt: new Date().toISOString().slice(0, 10),
      },
      levelOverrides: project.levelOverrides.filter((o) => o.pricingCategory !== pricingCategory),
      allowances: project.allowances.filter((a) => a.pricingCategory !== pricingCategory),
    });
  },
  resetIncludedLevelsToPlatinum: () => {
    const project = get().project;
    if (!project?.contract) return;
    let tiers = PLATINUM_INCLUDED_LEVELS.map((r) => ({ ...r }));
    try {
      const raw = localStorage.getItem('olsen-org-config-v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { platinumTiers?: ContractIncludedLevel[] };
        if (parsed.platinumTiers?.length) tiers = parsed.platinumTiers.map((r) => ({ ...r }));
      }
    } catch {
      /* defaults */
    }
    patchProject(get, set, {
      contract: {
        ...project.contract,
        includedLevels: tiers,
        baseline: 'platinum',
        verifiedAt: new Date().toISOString().slice(0, 10),
        notes: 'Platinum Features baseline — delta pricing shows upgrade above included tier.',
      },
      levelOverrides: project.levelOverrides.filter((o) => o.source !== 'manual'),
    });
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
    if (housePlanId === 'stillwater-183') {
      const drawings = stillwaterDrawingPackage();
      patchProject(get, set, {
        housePlanId,
        drawingPackageId: drawings.id,
        drawingPackage: drawings,
      });
    } else {
      patchProject(get, set, { housePlanId });
    }
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
    const needsPlanFromIdb =
      !project.importedHousePlan && (project.housePlanId === 'custom' || !project.housePlanId);
    // Keep the hosted Stillwater / PDF plan-set package — do not replace with legacy SVG IDB packs.
    if (project.drawingPackage?.sheetSource === 'pdf' && project.drawingPackage.pdfUrl && !needsPlanFromIdb) {
      return;
    }
    if (
      project.drawingPackage?.sheetSource === 'static' &&
      project.drawingPackage.sheets.some((s) => s.imageUrl) &&
      !needsPlanFromIdb
    ) {
      return;
    }
    try {
      const stored = await loadDrawingPackage(project.drawingPackageId);
      if (!stored) return;
      // Prefer PDF already on the project over older IDB SVG packages.
      if (project.drawingPackage?.pdfUrl && !stored.package.pdfUrl && !needsPlanFromIdb) return;
      const nextPackage = stored.package.pdfUrl
        ? stored.package
        : project.drawingPackage?.pdfUrl
          ? project.drawingPackage
          : stored.package;
      const nextPlan = stored.plan ?? project.importedHousePlan;
      const next = {
        ...project,
        drawingPackage: nextPackage,
        importedHousePlan: nextPlan,
      };
      set({ project: next });
      if (nextPlan && needsPlanFromIdb) {
        usePlannerStore.getState().applyHousePlanObject(nextPlan);
      }
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

    const planner = usePlannerStore.getState();
    const prevRooms = project.importedHousePlan?.floors?.[0]?.rooms ?? [];
    const prevConfigs = roomConfigurationsFromLabels(planner.planRooms);

    const result = await importDrawingFiles(files, {
      planName: opts?.planName ?? project.name,
      onProgress: opts?.onProgress,
    });

    const doc = asPlanDocument(result.plan, { sourceFile: files.drawing?.name });
    const packageId = await saveDrawingPackage({
      package: result.package,
      plan: doc,
      pdfBlob: result.pdfBlob,
    });

    patchProject(get, set, {
      housePlanId: 'custom',
      importedHousePlan: doc,
      drawingPackageId: packageId,
      drawingPackage: result.package,
      workflowStatus: 'plan_verification',
      planVerification: 'in_review',
      planRef: result.plan.name,
    });

    // Apply the stamped document so stable room IDs match stored plan.
    planner.applyHousePlanObject(doc);

    // Re-apply finishes that survive re-import via name+centroid match.
    const nextRooms = doc.floors[0]?.rooms ?? [];
    const merged = mergeRoomConfigurations(prevRooms, nextRooms, prevConfigs);
    for (const cfg of merged) {
      usePlannerStore.getState().updatePlanRoom(cfg.roomId, {
        floorColor: cfg.floorColor,
        floorCatalogId: cfg.floorCatalogId,
        floorName: cfg.floorName,
        wallColor: cfg.wallColor,
        ceilingColor: cfg.ceilingColor,
        wallCatalogId: cfg.wallCatalogId,
        ceilingCatalogId: cfg.ceilingCatalogId,
      });
    }
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
      wallFinishes: planRooms
        .filter((r) => r.wallCatalogId)
        .map((r) => ({ roomId: r.id, catalogId: r.wallCatalogId!, roomName: r.name || r.roomType })),
      ceilingFinishes: planRooms
        .filter((r) => r.ceilingCatalogId)
        .map((r) => ({ roomId: r.id, catalogId: r.ceilingCatalogId!, roomName: r.name || r.roomType })),
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
    map[token] = { project: slimProjectForLocalPersist(project), expiresAt, clientEmail };
    try {
      localStorage.setItem(LOCAL_SHARES, JSON.stringify(map));
    } catch (err) {
      if (!isQuotaExceededError(err)) throw err;
      // Drop older local shares and retry once with a minimal project stub.
      const minimal = {
        [token]: {
          project: slimProjectForLocalPersist({
            ...project,
            takeoff: project.takeoff ? { ...project.takeoff, lines: [] } : undefined,
            selections: undefined,
            drawingPackage: undefined,
          }),
          expiresAt,
          clientEmail,
        },
      };
      try {
        localStorage.setItem(LOCAL_SHARES, JSON.stringify(minimal));
      } catch (err2) {
        if (!isQuotaExceededError(err2)) throw err2;
        console.warn('Client share localStorage quota exceeded', err2);
      }
    }
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

export function createBlankSelectionProject(
  name: string,
  planRef?: string,
  lotRef?: string,
): ExtendedSelectionProject {
  return createEmptyExtendedProject({
    id: `project-${Date.now()}`,
    name,
    planRef: planRef ?? name,
    lotRef,
    contract: createPlatinumContract(name, planRef, lotRef),
    createdAt: new Date().toISOString(),
  });
}

export { WORKFLOW_LABEL, PLAN_VERIFICATION_LABEL };
