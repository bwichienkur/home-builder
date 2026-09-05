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
  CadAnnotativeDim,
  CadOpeningHintFt,
  CadWallCenterlineFt,
  CadWallTypeId,
  CadOpeningTypeId,
  CadOpeningSwing,
} from './types';

export {
  CAD_WALL_TYPES,
  CAD_OPENING_TYPES,
  ensureModelKernel,
  ensureAllStoryFloorSlabs,
  ensureStoryFloorSlab,
  applyWallType,
  applyOpeningType,
  setOpeningHeight,
  setOpeningSwing,
  setWallStory,
  setOpeningStory,
  filterPlateToStory,
  storyHeightFt,
  resyncAllHostedOpenings,
  wallTypeById,
  openingTypeById,
} from './cadModelKernel';
export { storyZFromEntityId } from './extrudeCadPlate';

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
  dimCoveredByManual,
  upsertAnnotativeDim,
  setAnnotativeDimLocked,
  type CadExteriorDim,
} from './cadExteriorDims';
export { snapCadDraftPoint, snapToGridFt, defaultWallThicknessFt, type CadSnapResult } from './cadDrawSnap';
export { wallFootprintQuad, wallFootprintPointsAttr, type WallFootprintQuad } from './cadWallFootprint';
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
  previewHostedOpening,
  hostedOpeningGeom,
  setOpeningWidth,
  setOpeningSill,
  flipOpeningHand,
  resyncHostedOpenings,
  applyWallLengthDim,
  wallHeadingLabel,
  type HostedOpeningPreview,
} from './cadWallModify';
export {
  buildTempDimsForSelection,
  buildBetweenWallDim,
  applyTempDimEdit,
  applyAssociativeExteriorDim,
  promoteTempDimToAnnotative,
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
  renderDoorWindowScheduleSvg,
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
export { flipPlan } from './cadPlanOps';
export {
  OLSEN_OPENING_PRESETS,
  defaultOpeningHeightFt,
  slideOpeningAlongWall,
  setOpeningOffsetFromStart,
  openingOffsetFromStartFt,
  applyOpeningPreset,
  convertSegmentToOpening,
  detectOpeningClashes,
  listUnhostedOpenings,
  listConvertibleOpeningSegments,
  copySelectionToStory,
  saveDesignSnapshot,
  restoreDesignSnapshot,
  buildBetweenOpeningsDim,
  setDistanceBetweenOpenings,
  pickOpeningAtPoint,
  pickWallAtPoint,
  normalizeOpeningDefaults,
  openingHeightM,
} from './cadOpeningEdit';
export type { CadDesignSnapshot } from './types';
export {
  addDormer,
  addFixtureHint,
  alignFixtureHintToWall,
  alignFixturePoseToNearestWall,
  addGuideline,
  addOpeningHint,
  addSectionCut,
  addSlab,
  addStair,
  addWallCenterline,
  deleteSelection,
  formatWallLengthFt,
  moveFixtureHint,
  rotateFixtureHint,
  setFixtureHintRotation,
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

export {
  loadCadAutosave,
  saveCadAutosave,
  clearCadAutosave,
  formatCadAutosaveTime,
  type CadAutosavePayload,
} from './cadAutosave';
