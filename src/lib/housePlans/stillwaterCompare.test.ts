/**
 * Stillwater DWG→plan comparison artifact.
 * Run: npm run plan:compare-stillwater
 *
 * Writes artifacts/plan-fidelity/stillwater-compare-report.json + overlay SVG.
 * Pair with public/plan-sheets/stillwater-183/plan-set.pdf and Build CAD overlay.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { importDxfDrawingPackage } from './dxfDrawingImport';
import { computePlanFidelityMetrics, evaluatePlanFidelity, renderFidelityRoomSvg } from './planFidelity';
import {
  STILLWATER_FIDELITY_THRESHOLDS,
  STILLWATER_EXPECTED_NAME_PATTERNS,
  STILLWATER_SOURCE,
} from './stillwaterFidelityExpectations';

describe('stillwater DWG compare artifact', () => {
  it('imports MODEL.dxf and writes overlay + report', () => {
    const dxfPath = join(process.cwd(), STILLWATER_SOURCE.dxf);
    expect(existsSync(dxfPath), `missing ${dxfPath} — run plan:fidelity once`).toBe(true);
    const dxf = readFileSync(dxfPath, 'utf8');
    const { plan, package: pkg } = importDxfDrawingPackage(dxf, 'MODEL.dwg', '183 Stillwater');
    const warnings = pkg.warnings ?? [];
    const metrics = computePlanFidelityMetrics(plan, {
      expectedNamePatterns: [...STILLWATER_EXPECTED_NAME_PATTERNS],
      importWarnings: warnings,
    });
    const ev = evaluatePlanFidelity(metrics, STILLWATER_FIDELITY_THRESHOLDS);

    const outDir = join(process.cwd(), 'artifacts/plan-fidelity');
    mkdirSync(outDir, { recursive: true });

    const report = {
      evaluatedAt: new Date().toISOString(),
      pass: ev.pass,
      failures: ev.failures,
      metrics: {
        ...metrics,
        rasterCoveragePct: Math.round(metrics.rasterCoveragePct * 1000) / 10,
        envelopeCoveragePct:
          metrics.envelopeCoveragePct != null
            ? Math.round(metrics.envelopeCoveragePct * 1000) / 10
            : undefined,
      },
      importWarnings: warnings,
      howToReproduce: {
        ui: 'Build → Admin → Project setup → drop MODEL.dwg + plan-set.pdf → Import into project',
        dwg: STILLWATER_SOURCE.dwg,
        pdf: 'public/plan-sheets/stillwater-183/plan-set.pdf',
        cliCompare: 'npm run plan:compare-stillwater',
        cliFidelity: 'npm run plan:fidelity',
        visualParity: [
          'Plan view → Layers → enable CAD overlay (DXF linework under rooms)',
          'Plan sheets → FLOOR page of plan-set.pdf for dimensioned architect reference',
          'Compare room labels/adjacency to PDF; blank tan gaps mean residual fill still missing plate',
        ],
        cadHygiene: [
          'Export/import Model Space floor viewport (not paperspace elevations)',
          'Keep A-WALL / door layers; soft open-plan edges as CENTER or DASHED linetype',
          'Room names as MTEXT near room centroids (underlined MTEXT decoded)',
          'Avoid exploding blocks if INSERT geometry is needed for walls',
        ],
      },
    };
    writeFileSync(join(outDir, 'stillwater-compare-report.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(outDir, 'stillwater-compare-overlay.svg'), renderFidelityRoomSvg(plan.floors[0]!.rooms));
    writeFileSync(join(outDir, 'stillwater-rooms.svg'), renderFidelityRoomSvg(plan.floors[0]!.rooms));

    expect(ev.pass).toBe(true);
    expect(metrics.roomCount).toBeGreaterThanOrEqual(20);
  });
});
