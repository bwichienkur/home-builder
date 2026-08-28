import type { HousePlan } from './buildPlan';
import stillwaterSeed from './stillwater183Plan.json';

/** Baked house plan from Olsen MODEL.dwg (wall-layer import). Regenerate via npm run plan:import-stillwater */
export const stillwater183Plan: HousePlan = {
  ...(stillwaterSeed as HousePlan),
  id: 'stillwater-183',
  name: '183 Stillwater · Veranda Model 183',
};
