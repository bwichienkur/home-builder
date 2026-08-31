import type { PlanFidelityThresholds } from './planFidelity';

/**
 * Regression thresholds for Stillwater MODEL.dxf full-package import.
 * Raised Aug 2026 toward CAD-faithfulness after plan-engine-continue.
 * Baseline: ~22 rooms, 11/11 named hits, ~63% envelope, ~51% raster, ~4186 living, ~3400+ gross.
 * Aspirational long-term target remains ~95% envelope / raster coverage (needs richer CAD geometry).
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
  minRoomCount: 20,
  minNamedHits: 11,
  minEnvelopeCoveragePct: 0.58,
  minLivingSqFt: 4000,
  minGrossRoomAreaSqFt: 3000,
  requiredNamePatterns: [
    'GARAGE',
    'KITCHEN',
    'GREAT',
    'MASTER',
    'FOYER',
    'LANAI',
    'NOOK',
    'LAUNDRY',
  ],
};

export const STILLWATER_SOURCE = {
  dwg: 'plans/source/183-stillwater/MODEL.dwg',
  dxf: 'plans/source/183-stillwater/MODEL.dxf',
  planName: 'Stillwater',
} as const;
