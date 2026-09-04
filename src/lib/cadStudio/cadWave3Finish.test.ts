import { describe, expect, it } from 'vitest';
import {
  buildCadSectionDrawing,
  renderCadSectionSvg,
} from './buildCadSection';
import { buildCadSheetSet, exportCadSheetSetHtml } from './buildCadSheetSet';
import { demoCadPlate } from './demoCadPlate';
import { addDormer, addSectionCut, toggleBuildingVisible } from './editCadPlate';
import { exportCadPlateGltf } from './exportCadGltf';
import { extrudeCadPlate } from './extrudeCadPlate';
import { setPlateTerrain, buildTerrainMeshData } from './buildCadTerrain';

describe('cad wave3 finish', () => {
  it('demo includes dormer, section, buildings, and terrain', () => {
    const plate = demoCadPlate();
    expect(plate.dormers?.length).toBeGreaterThan(0);
    expect(plate.sectionCuts?.length).toBeGreaterThan(0);
    expect(plate.buildings?.some((b) => b.id === 'bldg-garage')).toBe(true);
    expect(plate.wallCenterlines.some((w) => w.buildingId === 'bldg-garage')).toBe(true);
    expect(plate.terrain?.enabled).toBe(true);
    expect(plate.titleBlock?.projectName).toBeTruthy();
  });

  it('section drawing hits walls along the cut', () => {
    const plate = demoCadPlate();
    const cut = plate.sectionCuts![0]!;
    const drawing = buildCadSectionDrawing(plate, cut);
    expect(drawing.hits.length).toBeGreaterThan(0);
    expect(drawing.lengthFt).toBeGreaterThan(10);
    const svg = renderCadSectionSvg(drawing, { title: cut.label });
    expect(svg).toContain('<svg');
    expect(svg).toContain(cut.label);
  });

  it('sheet set includes floor, elevations, and section pages', () => {
    const pages = buildCadSheetSet(demoCadPlate());
    expect(pages.some((p) => p.kind === 'floor')).toBe(true);
    expect(pages.some((p) => p.kind === 'elevation')).toBe(true);
    expect(pages.some((p) => p.kind === 'section')).toBe(true);
    const html = exportCadSheetSetHtml(demoCadPlate());
    expect(html).toContain('A-101');
    expect(html).toContain('FLOOR PLAN');
    expect(html).toContain('Demo Ranch');
  });

  it('gltf export is valid JSON with meshes', () => {
    const gltf = JSON.parse(exportCadPlateGltf(demoCadPlate()));
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.meshes.length).toBeGreaterThan(0);
    expect(gltf.buffers[0].uri).toContain('base64');
  });

  it('hiding garage building removes its walls from extrusion', () => {
    let plate = demoCadPlate();
    const before = extrudeCadPlate(plate).wallSegmentsFt.length;
    plate = toggleBuildingVisible(plate, 'bldg-garage');
    const after = extrudeCadPlate(plate).wallSegmentsFt.length;
    expect(after).toBeLessThan(before);
  });

  it('addDormer and addSectionCut append', () => {
    let plate = demoCadPlate();
    const d0 = plate.dormers?.length ?? 0;
    const s0 = plate.sectionCuts?.length ?? 0;
    plate = addDormer(plate, 10, 10);
    plate = addSectionCut(plate, 0, 5, 40, 5);
    expect(plate.dormers?.length).toBe(d0 + 1);
    expect(plate.sectionCuts?.length).toBe(s0 + 1);
  });

  it('terrain mesh builds when enabled', () => {
    let plate = setPlateTerrain(demoCadPlate(), { enabled: true, gradePercent: 5 });
    const mesh = buildTerrainMeshData(plate, {
      cx: (plate.bounds.minX + plate.bounds.maxX) / 2,
      cy: (plate.bounds.minY + plate.bounds.maxY) / 2,
    });
    expect(mesh).not.toBeNull();
    expect(mesh!.positions.length).toBeGreaterThan(30);
  });
});
