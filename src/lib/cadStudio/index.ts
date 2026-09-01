export type {
  CadPlate,
  CadExtrusion,
  CadLayerInfo,
  CadSegmentFt,
  CadFixtureKind,
  CadFixtureHintFt,
  CadFixtureInstance,
} from './types';
export { buildCadPlateFromDxf, withLayerVisibility, visibleSegments, visibleLabels } from './buildCadPlate';
export { classifyLayerKind, classifySegmentRole, isElevationLayer } from './classifyLayers';
export { renderCadPlateSvg } from './renderCadPlateSvg';
export { extrudeCadPlate } from './extrudeCadPlate';
export { detectCadFixtures } from './detectCadFixtures';
export { demoCadPlate } from './demoCadPlate';
