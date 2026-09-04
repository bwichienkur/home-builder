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
  CadDormerFt,
  CadSectionCutFt,
  CadSectionDrawing,
  CadBuilding,
  CadTerrainOverrides,
  CadTitleBlock,
  CadStory,
  CadUnderlay,
  CadOpeningHintFt,
  CadWallCenterlineFt,
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
export {
  buildCadSectionDrawing,
  renderCadSectionSvg,
  defaultSectionCut,
} from './buildCadSection';
export {
  buildCadSheetSet,
  exportCadSheetSetHtml,
  wrapSheetWithTitleBlock,
  setPlateTitleBlock,
  DEFAULT_TITLE_BLOCK,
} from './buildCadSheetSet';
export {
  buildTerrainMeshData,
  setPlateTerrain,
  terrainHeightFt,
  DEFAULT_TERRAIN,
} from './buildCadTerrain';
export { exportCadPlateGltf, exportCadExtrusionGltf } from './exportCadGltf';
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
  parseArchitecturalLength,
  parseAngleDeg,
  wallAngleDeg,
} from './cadLengthParse';
export {
  createCadHistory,
  pushCadHistory,
  undoCadHistory,
  redoCadHistory,
  replaceCadPresent,
  previewCadPresent,
  commitCadPresent,
  type CadHistoryState,
} from './cadHistory';
export {
  softToggleLayer,
  softSetAllLayers,
  softSetLayerVisibility,
  visibleWallCenterlines,
  visibleOpeningHints,
  visibleSlabs,
  visibleStairs,
  visibleFixtures,
  isLayerOn,
  layerVisibleSet,
} from './cadLayerVisibility';
export {
  setWallLength,
  setWallAngle,
  flipWall,
  moveWall,
  moveWalls,
  autoJoinWallEndpoints,
  trimWallTo,
  extendWallTo,
  breakWallAt,
  offsetWall,
  copyWalls,
  mirrorWalls,
  placeHostedOpening,
  setOpeningWidth,
  setOpeningSill,
  flipOpeningHand,
  resyncHostedOpenings,
  applyWallLengthDim,
  wallHeadingLabel,
} from './cadWallModify';
export {
  buildTempDimsForSelection,
  buildBetweenWallDim,
  applyTempDimEdit,
  signedCenterlineDistanceFt,
  type CadTempDim,
  type CadTempDimSelection,
} from './cadDimEdit';
export {
  combineCollinearWalls,
  stretchSharedNode,
  alignWalls,
  setDistanceBetweenWalls,
  autoHostOpenings,
  signedWallDistanceFt,
} from './cadWallGraph';
export {
  assignOpeningMarks,
  renameRoomLabel,
  exportDoorWindowScheduleCsv,
} from './cadMarks';
export {
  ensureDefaultStories,
  setActiveStory,
  addStory,
} from './cadStories';
export {
  setUnderlay,
  calibrateUnderlay,
  setUnderlayOpacity,
} from './cadUnderlay';
export {
  addDormer,
  addFixtureHint,
  addGuideline,
  addOpeningHint,
  addSectionCut,
  addSlab,
  addStair,
  addWallCenterline,
  deleteSelection,
  formatWallLengthFt,
  moveFixtureHint,
  moveLabel,
  moveOpeningHint,
  moveSlab,
  moveWallEndpoint,
  nearestWallHost,
  pickAtPoint,
  segLengthFt,
  selectionSummary,
  setWallMaterial,
  setWallThickness,
  syncWallSegments,
  toggleBuildingVisible,
  updateSlab,
  updateStair,
  updateWallCenterline,
  type CadEditTool,
  type CadPlateSelection,
  type CadGripKind,
  type CadDragTarget,
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
