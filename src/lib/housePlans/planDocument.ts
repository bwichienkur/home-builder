/**
 * Plan Engine v0 — canonical plan document types.
 *
 * Import pipelines produce a NormalizedPlanDocument; build and UI consume it.
 * v0 is a structural alias over HousePlan (no behavior change) so we can evolve
 * the engine without rewriting configurator storage yet.
 */
import type { HousePlan, HousePlanFloor, PlanRoomRect } from './buildPlan';

/** Single source of truth after import — immutable per import revision (v0 = HousePlan). */
export type NormalizedPlanDocument = HousePlan;

export type PlanFloorDocument = HousePlanFloor;

export type PlanRoomDocument = PlanRoomRect;

/** Mark an imported plan as the canonical document (identity for now). */
export function asPlanDocument(plan: HousePlan): NormalizedPlanDocument {
  return plan;
}

/** Floors on the document (alias for readability in Plan Engine code). */
export function planDocumentFloors(doc: NormalizedPlanDocument): PlanFloorDocument[] {
  return doc.floors;
}

/** Rooms on a floor. */
export function planDocumentRooms(doc: NormalizedPlanDocument, floorIndex = 0): PlanRoomDocument[] {
  return doc.floors[floorIndex]?.rooms ?? [];
}
