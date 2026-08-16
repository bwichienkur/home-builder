import type { FurnitureItem, Opening, PlanRoomLabel, Wall } from '../types';
import {
  computeConstructionTakeoff,
  mergeConstructionTakeoffs,
  type ConstructionTakeoff,
} from './constructionTakeoff';
import { buildEstimateSnapshot, type EstimateSnapshot } from './estimateSnapshot';
import type { TradeRates } from '../store/tradeRatesStore';
import { pickTradeRates } from '../store/tradeRatesStore';

export type HouseTakeoffFloor = {
  id: string;
  scene: { walls: Wall[]; openings: Opening[]; furniture: FurnitureItem[] };
  planRooms?: PlanRoomLabel[];
};

/** Whole-house takeoff: envelope (slab/footing/roof) on ground floor only. */
export function computeHouseTakeoff(input: {
  floors: HouseTakeoffFloor[];
  activeFloorId: string;
  live?: {
    walls: Wall[];
    openings: Opening[];
    furniture: FurnitureItem[];
    planRooms: PlanRoomLabel[];
  };
  wasteFactor?: number;
}): ConstructionTakeoff {
  const parts = input.floors.map((f, i) => {
    const live = input.live && f.id === input.activeFloorId;
    return computeConstructionTakeoff({
      walls: live ? input.live!.walls : f.scene.walls,
      openings: live ? input.live!.openings : f.scene.openings,
      furniture: live ? input.live!.furniture : f.scene.furniture,
      planRooms: live ? input.live!.planRooms : f.planRooms ?? [],
      wasteFactor: input.wasteFactor,
      includeEnvelope: i === 0,
    });
  });
  return mergeConstructionTakeoffs(parts);
}

export function buildHouseEstimateSnapshot(input: {
  floors: HouseTakeoffFloor[];
  activeFloorId: string;
  live: {
    walls: Wall[];
    openings: Opening[];
    furniture: FurnitureItem[];
    planRooms: PlanRoomLabel[];
  };
  rates: TradeRates;
  previousVersion?: number;
  label?: string;
}): EstimateSnapshot {
  const rates = pickTradeRates(input.rates);
  const takeoff = computeHouseTakeoff({
    floors: input.floors,
    activeFloorId: input.activeFloorId,
    live: input.live,
    wasteFactor: rates.wasteFactor,
  });
  return buildEstimateSnapshot({
    takeoff,
    rates,
    previousVersion: input.previousVersion,
    label: input.label,
  });
}
