import type { CatalogItem } from '../../components/catalog/catalogData';
import type { FurnitureItem, PlanRoomLabel } from '../../types';
import { roomArea } from '../geometry/rooms';
import type { ContractSnapshot, PricingCategory } from './contractTypes';
import { baseItemName, formatCatalogPrice, pricingCategoryForItem } from './deltaPricing';
import type { AllowanceBudget, ContractLevelOverride, TakeoffSnapshot } from './projectTypes';
import { takeoffQtyForCategory } from './importTakeoff';

const M2_TO_SQFT = (1 / 0.3048) ** 2;

export type RoomRollupLine = {
  roomId: string;
  roomName: string;
  category: PricingCategory | string;
  description: string;
  qty: number;
  unit: string;
  unitDelta?: number;
  lineDelta?: number;
  included: boolean;
};

export type ProjectRollup = {
  roomLines: RoomRollupLine[];
  roomTotals: { roomId: string; roomName: string; delta: number }[];
  jobDelta: number;
  allowanceRemaining: { category: PricingCategory | string; budget: number; spent: number; remaining: number }[];
};

function lineQty(item: FurnitureItem, product?: CatalogItem, takeoff?: TakeoffSnapshot, roomName?: string) {
  const cat = product ? pricingCategoryForItem(product) : null;
  if (cat && takeoff && product?.priceUnit === 'sq ft') {
    const imported = takeoffQtyForCategory(takeoff, cat, roomName);
    if (imported > 0) return imported;
  }
  if (product?.priceUnit === 'linear ft' || item.placementKind === 'perimeter-trim') {
    return item.width / 0.3048;
  }
  return 1;
}

export function computeProjectRollup(input: {
  catalog: CatalogItem[];
  contract: ContractSnapshot;
  furniture: FurnitureItem[];
  planRooms: PlanRoomLabel[];
  takeoff?: TakeoffSnapshot;
  allowances?: AllowanceBudget[];
  levelOverrides?: ContractLevelOverride[];
  role?: 'designer' | 'client' | 'admin';
}): ProjectRollup {
  const roomLines: RoomRollupLine[] = [];
  const roomNameById = new Map(input.planRooms.map((r) => [r.id, r.name || r.roomType || 'Room']));

  for (const item of input.furniture.filter((f) => f.placementKind !== 'stair')) {
    const product = input.catalog.find((p) => p.id === item.catalogId);
    if (!product) continue;
    const roomId = product.roomTypes?.[0] ?? 'whole-home';
    const roomName = roomId;
    const priceView = formatCatalogPrice(product, input.catalog, input.contract, input.role ?? 'designer', input.levelOverrides);
    const qty = lineQty(item, product, input.takeoff, roomName);
    const unitDelta = priceView.delta ?? (priceView.included ? 0 : product.price ?? product.cost ?? 0);
    roomLines.push({
      roomId,
      roomName,
      category: pricingCategoryForItem(product) ?? product.category,
      description: baseItemName(product.name),
      qty,
      unit: product.priceUnit ?? 'each',
      unitDelta: priceView.included ? 0 : unitDelta,
      lineDelta: priceView.included ? 0 : Math.round((unitDelta ?? 0) * qty * 100) / 100,
      included: priceView.included,
    });
  }

  for (const room of input.planRooms) {
    if (!room.floorCatalogId) continue;
    const product = input.catalog.find((p) => p.id === room.floorCatalogId);
    if (!product) continue;
    const importedQty = takeoffQtyForCategory(input.takeoff, pricingCategoryForItem(product) ?? 'floor-tile', room.name);
    const qty = importedQty > 0 ? importedQty : roomArea(room.points) * M2_TO_SQFT;
    const priceView = formatCatalogPrice(product, input.catalog, input.contract, input.role ?? 'designer', input.levelOverrides);
    const unitDelta = priceView.delta ?? (priceView.included ? 0 : product.price ?? product.cost ?? 0);
    roomLines.push({
      roomId: room.id,
      roomName: room.name || room.roomType || 'Room',
      category: pricingCategoryForItem(product) ?? 'floor-tile',
      description: baseItemName(product.name),
      qty: Math.round(qty * 10) / 10,
      unit: product.priceUnit ?? 'sq ft',
      unitDelta: priceView.included ? 0 : unitDelta,
      lineDelta: priceView.included ? 0 : Math.round((unitDelta ?? 0) * qty * 100) / 100,
      included: priceView.included,
    });
  }

  const roomTotalsMap = new Map<string, { roomId: string; roomName: string; delta: number }>();
  for (const line of roomLines) {
    const prev = roomTotalsMap.get(line.roomId) ?? { roomId: line.roomId, roomName: line.roomName, delta: 0 };
    prev.delta += line.lineDelta ?? 0;
    roomTotalsMap.set(line.roomId, prev);
  }

  const jobDelta = roomLines.reduce((sum, l) => sum + (l.lineDelta ?? 0), 0);
  const allowanceRemaining = (input.allowances ?? []).map((a) => {
    const spent = roomLines
      .filter((l) => l.category === a.pricingCategory && !l.included)
      .reduce((sum, l) => sum + (l.lineDelta ?? 0), 0);
    return {
      category: a.pricingCategory,
      budget: a.budgetAmount,
      spent,
      remaining: Math.round((a.budgetAmount - spent) * 100) / 100,
    };
  });

  return {
    roomLines,
    roomTotals: Array.from(roomTotalsMap.values()),
    jobDelta: Math.round(jobDelta * 100) / 100,
    allowanceRemaining,
  };
}
