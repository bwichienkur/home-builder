/** Olsen configurator project workflow, takeoff, team, and sign-off types. */
import type { PriceUnit } from '../../components/catalog/catalogTypes';
import type { ContractSnapshot, PricingCategory, SelectionProject } from './contractTypes';
import type { DrawingPackage } from '../housePlans/drawingPackage';
import type { HousePlan } from '../housePlans/buildPlan';

export type PlanVerificationStatus = 'unverified' | 'in_review' | 'approved_for_selections';

export type ProjectWorkflowStatus =
  | 'draft'
  | 'plan_verification'
  | 'ready_for_client_survey'
  | 'client_survey'
  | 'client_configurator'
  | 'client_finished'
  | 'designer_meetings'
  | 'pending_pricing'
  | 'cof_signed'
  | 'bt_submitted'
  | 'approved';

export type SignOffStatus = 'pending' | 'approved' | 'declined';

export type TeamRole = 'admin' | 'estimator' | 'designer' | 'project_manager' | 'client';

export type TeamMember = {
  role: TeamRole;
  name: string;
  email?: string;
  /** Auth user id when assigned from the directory. */
  userId?: string;
  /** CRM client id when role is client. */
  clientId?: string;
};

export type AllowanceBudget = {
  pricingCategory: PricingCategory;
  label: string;
  budgetAmount: number;
  priceUnit?: PriceUnit;
};

export type ContractLevelOverride = {
  pricingCategory: PricingCategory;
  includedLevel: string;
  label?: string;
  source?: 'contract_pricing_page' | 'manual';
};

export type QtySource = 'takeoff' | 'geometry' | 'auto';

export type TakeoffLine = {
  id: string;
  sheet: string;
  room?: string;
  category: PricingCategory | string;
  description: string;
  qty: number;
  unit: string;
  source: 'takeoff_xlsx' | 'cof_xlsx' | 'geometry' | 'manual';
  notes?: string;
};

export type TakeoffSnapshot = {
  importedAt: string;
  sourceFile?: string;
  /** After approval, `takeoff` is the source of truth when lines exist. */
  qtySource?: QtySource;
  lines: TakeoffLine[];
};

export type PersistedSelection = {
  catalogId: string;
  sku?: string;
  roomId?: string;
  roomName?: string;
  qty: number;
  signOff?: SignOffStatus;
  kitId?: string;
  notes?: string;
};

export type SelectionSnapshot = {
  savedAt: string;
  items: PersistedSelection[];
  floorFinishes: { roomId: string; catalogId: string; roomName?: string }[];
};

export type SurveyResponse = {
  completedAt?: string;
  exteriorStyle?: string;
  interiorStyle?: string;
  palette?: string;
  notes?: string;
  /** Full answers keyed by survey question id (configurable questionnaire). */
  answers?: Record<string, string | string[]>;
  surveyConfigId?: string;
  surveyConfigVersion?: number;
};

export type CuratedSelectionOption = {
  catalogId: string;
  label: string;
  roomType: string;
  tier: 'lookbook' | 'survey' | 'designer';
};

export type ExtendedSelectionProject = SelectionProject & {
  workflowStatus: ProjectWorkflowStatus;
  planVerification: PlanVerificationStatus;
  housePlanId?: string;
  /** Full HousePlan when imported from DWG/DXF (housePlanId usually `custom`). */
  importedHousePlan?: HousePlan;
  /** Sheet reference pack (SVG/PDF). Large SVG bodies live in IndexedDB via drawingPackageId. */
  drawingPackage?: DrawingPackage;
  drawingPackageId?: string;
  team: TeamMember[];
  allowances: AllowanceBudget[];
  levelOverrides: ContractLevelOverride[];
  takeoff?: TakeoffSnapshot;
  selections?: SelectionSnapshot;
  survey?: SurveyResponse;
  curatedOptions?: CuratedSelectionOption[];
  signOff: {
    cof: SignOffStatus;
    buildertrend: SignOffStatus;
    cofSignedAt?: string;
    btSubmittedAt?: string;
  };
  sceneProjectId?: string;
};

export function createEmptyExtendedProject(base: SelectionProject): ExtendedSelectionProject {
  return {
    ...base,
    workflowStatus: 'draft',
    planVerification: 'unverified',
    team: [],
    allowances: [],
    levelOverrides: [],
    signOff: { cof: 'pending', buildertrend: 'pending' },
  };
}

export function effectiveIncludedLevel(
  contract: ContractSnapshot,
  category: PricingCategory,
  overrides: ContractLevelOverride[] = [],
): string | undefined {
  const override = overrides.find((o) => o.pricingCategory === category);
  if (override) return override.includedLevel;
  return contract.includedLevels.find((r) => r.pricingCategory === category)?.includedLevel;
}

export const WORKFLOW_LABEL: Record<ProjectWorkflowStatus, string> = {
  draft: 'Draft',
  plan_verification: 'Plan verification',
  ready_for_client_survey: 'Ready for survey',
  client_survey: 'Client survey',
  client_configurator: 'Client configurator',
  client_finished: 'Client finished — schedule meeting',
  designer_meetings: 'Designer meetings',
  pending_pricing: 'Pending pricing',
  cof_signed: 'COF signed',
  bt_submitted: 'BT submitted',
  approved: 'Approved',
};

export const PLAN_VERIFICATION_LABEL: Record<PlanVerificationStatus, string> = {
  unverified: 'Unverified',
  in_review: 'In review',
  approved_for_selections: 'Approved for selections',
};
