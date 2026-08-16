import type { HousePlan } from './buildPlan';
import { sampleHousePlans } from './samplePlans';
import { useCrmStore } from '../../store/crmStore';

/** Built-in accurate samples (not proprietary brochure tracings). */
export function listBuiltinHousePlans(): HousePlan[] {
  return sampleHousePlans;
}

export function getBuiltinHousePlan(id: string) {
  return sampleHousePlans.find((p) => p.id === id);
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
  const builtin = sampleHousePlans.map((p) => ({
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
  for (const plan of sampleHousePlans) {
    if (!plan.id || !plan.floors?.length) throw new Error(`Invalid sample plan ${plan.id}`);
  }
}
