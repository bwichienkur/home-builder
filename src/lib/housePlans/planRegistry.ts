import type { HousePlan } from './buildPlan';
import { stillwater183Plan } from './stillwater183Plan';
import { useCrmStore } from '../../store/crmStore';

/**
 * Floorplan templates available in Build / estimator verification.
 * Flyer proxies and sample teaching plans were removed — they did not match real CAD plans.
 * Additional templates will be uploaded to the app later; Stillwater is the seed template.
 */
export function listFloorplanTemplates(): HousePlan[] {
  return [stillwater183Plan];
}

/** Built-in plans shown in Build / Plans — templates only (no inaccurate flyer proxies). */
export function listBuiltinHousePlans(): HousePlan[] {
  return listFloorplanTemplates();
}

export function getBuiltinHousePlan(id: string) {
  return listBuiltinHousePlans().find((p) => p.id === id);
}

/** Resolve a plan from builtins or CRM-imported library. */
export function getHousePlan(id: string): HousePlan | undefined {
  const builtin = getBuiltinHousePlan(id);
  if (builtin) return builtin;
  const meta = useCrmStore.getState().housePlans.find((p) => p.id === id);
  if (!meta?.planJson) return undefined;
  return meta.planJson as HousePlan;
}

export function listHousePlanSummaries() {
  const builtin = listBuiltinHousePlans().map((p) => ({
    id: p.id,
    name: p.name,
    beds: p.beds,
    baths: p.baths,
    stories: p.stories,
    livingSqFt: p.livingSqFt,
    source: 'builtin' as const,
    license: p.note,
    format: 'native-json' as const,
  }));
  const imported = useCrmStore.getState().housePlans.map((p) => ({
    id: p.id,
    name: p.name,
    beds: p.beds,
    baths: p.baths,
    stories: p.stories,
    livingSqFt: p.livingSqFt ?? 0,
    source: 'imported' as const,
    license: p.license,
    format: p.format,
  }));
  return [...builtin, ...imported];
}

export function assertPlanCatalog() {
  for (const plan of listBuiltinHousePlans()) {
    if (!plan.id || !plan.floors?.length) throw new Error(`Invalid sample plan ${plan.id}`);
  }
}
