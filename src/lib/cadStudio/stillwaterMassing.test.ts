import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCadPlateFromDxf, extrudeCadPlate, renderCadElevationSvg } from './index';
import { wallEndpointJoinStats } from '../housePlans/dxfRooms';

describe('stillwater massing from elevation layers', () => {
  it('extracts front/side elevations and builds massing with DXF roof profile', () => {
    const dxf = readFileSync('plans/source/183-stillwater/MODEL.dxf', 'utf8');
    const plate = buildCadPlateFromDxf(dxf, 'MODEL.dxf');
    expect(plate.elevationFront?.segments.length ?? 0).toBeGreaterThan(50);
    expect(plate.elevationSide?.segments.length ?? 0).toBeGreaterThan(20);

    const joinStats = wallEndpointJoinStats(plate.wallCenterlines);
    expect(joinStats.joined / joinStats.total).toBeGreaterThan(0.5);

    const frontSvg = renderCadElevationSvg(plate.elevationFront!);
    expect(frontSvg).toContain('<svg');
    expect(frontSvg).toContain('#7c8491');

    const extrusion = extrudeCadPlate(plate);
    expect(extrusion.massing.frontElevation).toBeTruthy();
    expect(extrusion.wallSegmentsFt.length).toBe(plate.wallCenterlines.length);
    expect(extrusion.massing.roof.ridgeHeightM).toBeGreaterThan(extrusion.heightM);
    expect(['dxf', 'procedural']).toContain(extrusion.massing.roof.style);
    if (extrusion.massing.roof.style === 'dxf') {
      expect(extrusion.massing.roof.profile?.length ?? 0).toBeGreaterThan(5);
    }
  }, 120_000);
});
