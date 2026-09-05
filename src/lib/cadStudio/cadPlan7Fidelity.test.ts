import { describe, expect, it } from 'vitest';
import {
  buildCadSectionDrawing,
  cadWallHatchPatternDefs,
  defaultSectionCut,
  demoCadPlate,
  displayFidelityConfig,
  CAD_DISPLAY_FIDELITY,
  renderCadElevationSvg,
  renderCadPlateSvg,
  renderCadSectionSvg,
  wallHatchLegendForPlate,
  wallHatchStyleForWall,
  withLayerVisibility,
  visibleWallCenterlines,
} from './index';

describe('Plan7 fidelity pack', () => {
  it('hatches walls by type and lists a legend', () => {
    const plate = demoCadPlate();
    const style = wallHatchStyleForWall(plate.wallCenterlines[0]!);
    expect(style.patternId).toMatch(/^cad-hatch-/);
    expect(cadWallHatchPatternDefs()).toContain(style.patternId);
    const legend = wallHatchLegendForPlate(plate.wallCenterlines);
    expect(legend.length).toBeGreaterThan(0);
    const svg = renderCadPlateSvg(plate, { title: 'Plan', showLegend: true });
    expect(svg).toContain('url(#' + style.patternId);
    expect(svg).toContain('Wall types');
  });

  it('omits hidden-layer openings from plate SVG (soft visibility)', () => {
    const plate = withLayerVisibility(demoCadPlate(), { DOORS: false, WINDOWS: false });
    expect(visibleWallCenterlines(plate).length).toBeGreaterThan(0);
    const svg = renderCadPlateSvg(plate);
    expect(svg).not.toContain('#b45309');
  });

  it('section drawing includes poché, slabs, and level markers', () => {
    const plate = demoCadPlate();
    const cut = plate.sectionCuts?.[0] ?? defaultSectionCut(plate);
    const drawing = buildCadSectionDrawing(plate, cut);
    expect(drawing.hits.length).toBeGreaterThan(0);
    expect(drawing.levels?.some((l) => /GRADE|F\.?F\.?/i.test(l.label))).toBe(true);
    expect(drawing.slabs?.some((s) => s.kind === 'floor')).toBe(true);
    const svg = renderCadSectionSvg(drawing, { title: cut.label });
    expect(svg).toContain('cad-sec-');
    expect(svg).toMatch(/GRADE|F\.F\.|CEILING|RIDGE/);
  });

  it('elevation SVG includes level markers and height dim', () => {
    const plate = demoCadPlate();
    const sheet = plate.elevationFront ?? plate.elevationSide;
    expect(sheet).toBeTruthy();
    const svg = renderCadElevationSvg(sheet!, { title: sheet!.name, richFills: true });
    expect(svg).toContain('GRADE');
    expect(svg).toContain('RIDGE');
  });

  it('display fidelity presets cover sketch through photoreal', () => {
    expect(CAD_DISPLAY_FIDELITY.map((f) => f.id)).toEqual([
      'sketch',
      'massing',
      'dollhouse',
      'presentation',
      'photoreal',
    ]);
    const dollhouse = displayFidelityConfig('dollhouse');
    expect(dollhouse.dollhouseCutaway).toBe(true);
    expect(dollhouse.shadows).toBe(true);
    const photo = displayFidelityConfig('photoreal');
    expect(photo.siteContext).toBe(true);
    expect(photo.richEnvironment).toBe(true);
  });
});
