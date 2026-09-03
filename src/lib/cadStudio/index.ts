export type {
  CadPlate,
  CadExtrusion,
  CadLayerInfo,
  CadSegmentFt,
  CadFixtureKind,
  CadFixtureHintFt,
  CadFixtureInstance,
  CadElevationSheet,
  CadElevationSegmentFt,
  CadMassing,
  CadRoofMassing,
  CadPlanFace,
} from './types';
export {
  buildCadPlateFromDxf,
  withLayerVisibility,
  setLayerClassify,
  removeLayer,
  hideNonFloorPreset,
  showWallsAndDoorsPreset,
  rebuildPlateFromLayerSettings,
  visibleSegments,
  visibleLabels,
} from './buildCadPlate';
export { buildCadElevationSheets, extractRoofProfileFromElevation } from './buildCadElevation';
export { buildCadMassing, detectFrontFace } from './buildCadMassing';
export {
  classifyLayerKind,
  classifySegmentRole,
  isElevationLayer,
  defaultLayerVisible,
  roleToClassify,
  type CadLayerClassify,
} from './classifyLayers';
export { renderCadPlateSvg } from './renderCadPlateSvg';
export { renderCadElevationSvg, elevationSvgDataUrl } from './renderCadElevationSvg';
export { extrudeCadPlate } from './extrudeCadPlate';
export { detectCadFixtures } from './detectCadFixtures';
export { demoCadPlate } from './demoCadPlate';
export {
  addFixtureHint,
  addOpeningHint,
  addWallCenterline,
  deleteSelection,
  formatWallLengthFt,
  moveFixtureHint,
  moveLabel,
  moveOpeningHint,
  pickAtPoint,
  segLengthFt,
  selectionSummary,
  syncWallSegments,
  type CadEditTool,
  type CadPlateSelection,
} from './editCadPlate';
