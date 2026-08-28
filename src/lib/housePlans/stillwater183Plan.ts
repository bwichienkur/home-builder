import type { HousePlan } from './buildPlan';
import planJson from './stillwater183Plan.json';

/** Baked Stillwater 183 house plan. Regenerate JSON when rooms change. */
export const stillwater183Plan = planJson as HousePlan;
