/**
 * Stillwater plan fidelity gate — regression test for DWG/DXF import accuracy.
 * Run: npm run plan:fidelity
 *
 * Generates MODEL.dxf from MODEL.dwg when missing (gitignored). CI and local dev
 * should pass when import quality regresses.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { importDxfDrawingPackage } from './dxfDrawingImport';
import {
  computePlanFidelityMetrics,
  evaluatePlanFidelity,
  renderFidelityRoomSvg,
} from './planFidelity';
import {
  STILLWATER_EXPECTED_NAME_PATTERNS,
  STILLWATER_FIDELITY_THRESHOLDS,
  STILLWATER_SOURCE,
} from './stillwaterFidelityExpectations';

const ARTIFACT_DIR = join(process.cwd(), 'artifacts/plan-fidelity');

async function ensureStillwaterDxf(): Promise<boolean> {
  if (existsSync(STILLWATER_SOURCE.dxf)) return true;
  if (!existsSync(STILLWATER_SOURCE.dwg)) return false;
  const { init, convertDwgToDxf } = await import('dwgdxf');
  await init();
  const bytes = readFileSync(STILLWATER_SOURCE.dwg);
  const converted = await convertDwgToDxf(new Uint8Array(bytes));
  writeFileSync(STILLWATER_SOURCE.dxf, converted);
  return true;
}

describe('Stillwater plan fidelity gate', () => {
  let dxfReady = false;

  beforeAll(async () => {
    dxfReady = await ensureStillwaterDxf();
  }, 180_000);

  it(
    'imports MODEL.dxf with room coverage and named rooms above regression thresholds',
    (ctx) => {
      if (!dxfReady) {
        ctx.skip();
        return;
      }

      const dxfText = readFileSync(STILLWATER_SOURCE.dxf, 'utf8');
      const { plan, package: pkg } = importDxfDrawingPackage(
        dxfText,
        'MODEL.dxf',
        STILLWATER_SOURCE.planName,
      );

      const metrics = computePlanFidelityMetrics(plan, {
        expectedNamePatterns: [...STILLWATER_EXPECTED_NAME_PATTERNS],
        importWarnings: pkg.warnings,
      });
      const evaluation = evaluatePlanFidelity(metrics, STILLWATER_FIDELITY_THRESHOLDS);

      mkdirSync(ARTIFACT_DIR, { recursive: true });
      const reportPath = join(ARTIFACT_DIR, 'stillwater-report.json');
      const svgPath = join(ARTIFACT_DIR, 'stillwater-rooms.svg');
      writeFileSync(
        reportPath,
        `${JSON.stringify(
          {
            evaluatedAt: new Date().toISOString(),
            pass: evaluation.pass,
            failures: evaluation.failures,
            metrics: {
              ...metrics,
              rasterCoveragePct: Math.round(metrics.rasterCoveragePct * 1000) / 10,
              envelopeCoveragePct:
                metrics.envelopeCoveragePct != null
                  ? Math.round(metrics.envelopeCoveragePct * 1000) / 10
                  : undefined,
            },
            thresholds: STILLWATER_FIDELITY_THRESHOLDS,
            importWarnings: pkg.warnings.filter((w) =>
              /Envelope|Detected|Cropped|seal|outdoor|residual/i.test(w),
            ),
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(svgPath, renderFidelityRoomSvg(plan.floors[0]!.rooms));

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            pass: evaluation.pass,
            roomCount: metrics.roomCount,
            livingSqFt: metrics.livingSqFt,
            envelopeCoveragePct:
              metrics.envelopeCoveragePct != null
                ? Math.round(metrics.envelopeCoveragePct * 1000) / 10
                : undefined,
            rasterCoveragePct: Math.round(metrics.rasterCoveragePct * 1000) / 10,
            namedHits: metrics.namedRoomHits,
            polygonRooms: metrics.polygonRoomCount,
            outdoorRooms: metrics.outdoorRoomCount,
            artifacts: { reportPath, svgPath },
          },
          null,
          2,
        ),
      );

      if (!evaluation.pass) {
        expect.fail(`Stillwater fidelity gate failed:\n${evaluation.failures.join('\n')}`);
      }
      expect(metrics.roomCount).toBeGreaterThanOrEqual(STILLWATER_FIDELITY_THRESHOLDS.minRoomCount);
      expect(metrics.namedRoomHits.length).toBeGreaterThanOrEqual(
        STILLWATER_FIDELITY_THRESHOLDS.minNamedHits,
      );
    },
    300_000,
  );
});
