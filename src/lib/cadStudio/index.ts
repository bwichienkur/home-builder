export type {
  CadPlate,
  CadExtrusion,
  CadLayerInfo,
  CadSegmentFt,
  CadFixtureKind,
  CadFixtureHintFt,
  CadFixtureInstance,
  CadSlabKind,
  CadSlabFt,
  CadRoofKind,
  CadRoofOverrides,
  CadGuidelineFt,
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
export {
  buildCadMassing,
  detectFrontFace,
  setPlateRoof,
  DEFAULT_ROOF_OVERRIDES,
  exteriorContourBounds,
} from './buildCadMassing';
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
  detectCadRoomStamps,
  formatDraftLength,
  formatRoomAreaSqFt,
  type CadRoomStamp,
} from './cadRoomStamps';
export {
  computeExteriorDims,
  computeInteriorDims,
  type CadExteriorDim,
} from './cadExteriorDims';
export { snapCadDraftPoint, defaultWallThicknessFt, type CadSnapResult } from './cadDrawSnap';
export {
  addFixtureHint,
  addGuideline,
  addOpeningHint,
  addSlab,
  addWallCenterline,
  deleteSelection,
  formatWallLengthFt,
  moveFixtureHint,
  moveLabel,
  moveOpeningHint,
  moveSlab,
  pickAtPoint,
  segLengthFt,
  selectionSummary,
  setWallThickness,
  syncWallSegments,
  updateSlab,
  type CadEditTool,
  type CadPlateSelection,
} from './editCadPlate';
