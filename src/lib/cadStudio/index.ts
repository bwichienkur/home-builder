export type { CadPlate, CadExtrusion, CadLayerInfo, CadSegmentFt } from './types';
export { buildCadPlateFromDxf, withLayerVisibility, visibleSegments } from './buildCadPlate';
export { classifyLayerKind, classifySegmentRole, isElevationLayer } from './classifyLayers';
export { renderCadPlateSvg } from './renderCadPlateSvg';
export { extrudeCadPlate } from './extrudeCadPlate';
export { demoCadPlate } from './demoCadPlate';
