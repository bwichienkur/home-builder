import type { PlanFidelityThresholds } from './planFidelity';

/**
 * Regression thresholds for Stillwater MODEL.dxf full-package import.
 * Baseline captured Aug 2026 after plan-fill-gaps (#261): 21 rooms, ~51% raster coverage,
 * 4133 living sq ft. Thresholds sit slightly below baseline to catch regressions, not
 * aspirational CAD fidelity (target 95% is a future Phase 1 goal).
 */
export const STILLWATER_EXPECTED_NAME_PATTERNS = [
  'GARAGE',
  'KITCHEN',
  'GREAT',
  'MASTER',
  'FOYER',
  'LAUNDRY',
  'PANTRY',
  'NOOK',
  'LANAI',
  'BATH',
  'BED',
] as const;

export const STILLWATER_FIDELITY_THRESHOLDS: PlanFidelityThresholds = {
  minRoomCount: 18,
  minNamedHits: 10,
  minEnvelopeCoveragePct: 0.55,
  minLivingSqFt: 3800,
  minGrossRoomAreaSqFt: 3000,
  requiredNamePatterns: [
    'GARAGE',
    'KITCHEN',
    'GREAT',
    'MASTER',
    'FOYER',
    'LANAI',
  ],
};

export const STILLWATER_SOURCE = {
  dwg: 'plans/source/183-stillwater/MODEL.dwg',
  dxf: 'plans/source/183-stillwater/MODEL.dxf',
  planName: 'Stillwater',
} as const;
