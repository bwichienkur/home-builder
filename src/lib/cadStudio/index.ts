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
  CadStairFt,
  CadWallMaterialId,
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
  applyAutoFoundation,
  clearAutoFoundation,
  buildAutoFoundationSlabs,
  DEFAULT_FOUNDATION,
} from './buildCadFoundation';
export type { CadFoundationOverrides } from './types';
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
  addStair,
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
  setWallMaterial,
  setWallThickness,
  syncWallSegments,
  updateSlab,
  updateStair,
  type CadEditTool,
  type CadPlateSelection,
} from './editCadPlate';
export {
  CAD_WALL_MATERIALS,
  wallStrokeForMaterial,
  wallPaintMaterial,
} from './cadSceneMaterials';
export {
  exportCadPlateDxf,
  downloadTextFile,
  exportCadRoomScheduleCsv,
  roomScheduleSummary,
  downloadSvgAsPng,
  wallLengthSummary,
} from './exportCadPlate';
export { sunPositionFromHour } from './cadSun';
