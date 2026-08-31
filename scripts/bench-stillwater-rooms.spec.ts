/**
 * Stillwater room-import benchmark (legacy wrapper).
 * Prefer: npm run plan:fidelity
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDxfDrawingPackage } from '../src/lib/housePlans/dxfDrawingImport';
import {
  computePlanFidelityMetrics,
  evaluatePlanFidelity,
  renderFidelityRoomSvg,
} from '../src/lib/housePlans/planFidelity';
import {
  STILLWATER_EXPECTED_NAME_PATTERNS,
  STILLWATER_FIDELITY_THRESHOLDS,
  STILLWATER_SOURCE,
} from '../src/lib/housePlans/stillwaterFidelityExpectations';

describe('Stillwater connected-plan benchmark', () => {
  it(
    'imports a connected floor plate from MODEL.dxf',
    () => {
      expect(existsSync(STILLWATER_SOURCE.dxf)).toBe(true);
      const pkg = importDxfDrawingPackage(
        readFileSync(STILLWATER_SOURCE.dxf, 'utf8'),
        'MODEL.dxf',
        STILLWATER_SOURCE.planName,
      );
      const metrics = computePlanFidelityMetrics(pkg.plan, {
        expectedNamePatterns: [...STILLWATER_EXPECTED_NAME_PATTERNS],
        importWarnings: pkg.package.warnings,
      });
      const evaluation = evaluatePlanFidelity(metrics, STILLWATER_FIDELITY_THRESHOLDS);

      const artifactDir = join(process.cwd(), 'artifacts/plan-fidelity');
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, 'stillwater-rooms.svg'), renderFidelityRoomSvg(pkg.plan.floors[0]!.rooms));

      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ metrics, pass: evaluation.pass, failures: evaluation.failures }, null, 2));

      expect(evaluation.pass).toBe(true);
    },
    300_000,
  );
});
