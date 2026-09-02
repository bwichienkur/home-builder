import { newId } from './geometry';
import type {
  TakeoffItem,
  TakeoffMeasureMode,
  TakeoffObject,
  TakeoffObjectKind,
  TakeoffProject,
  TakeoffScale,
} from './types';
import { formatFtIn, formatSqFt } from './geometry';

const DEFAULT_COLORS = {
  linear: '#1e405a',
  area: '#2f6f4e',
  count: '#b45309',
} as const;

export function defaultTakeoffItems(): TakeoffItem[] {
  return [
    {
      id: newId('item'),
      name: 'Walls',
      mode: 'linear',
      color: DEFAULT_COLORS.linear,
      objectKind: 'wall',
      unit: 'lf',
    },
    {
      id: newId('item'),
      name: 'Floor areas',
      mode: 'area',
      color: DEFAULT_COLORS.area,
      objectKind: 'room',
      unit: 'sf',
    },
    {
      id: newId('item'),
      name: 'Doors',
      mode: 'count',
      color: '#9a3412',
      objectKind: 'door',
      unit: 'ea',
    },
    {
      id: newId('item'),
      name: 'Windows',
      mode: 'count',
      color: '#0369a1',
      objectKind: 'window',
      unit: 'ea',
    },
    {
      id: newId('item'),
      name: 'Fixtures',
      mode: 'count',
      color: DEFAULT_COLORS.count,
      objectKind: 'fixture',
      unit: 'ea',
    },
  ];
}

export function ensureProjectItems(project: TakeoffProject): TakeoffProject {
  if (Array.isArray(project.items) && project.items.length > 0) return project;
  return { ...project, items: defaultTakeoffItems() };
}

export function createTakeoffItem(
  mode: TakeoffMeasureMode,
  name?: string,
): TakeoffItem {
  const defaults: Record<
    TakeoffMeasureMode,
    { name: string; objectKind: TakeoffObjectKind; unit: TakeoffItem['unit']; color: string }
  > = {
    linear: { name: 'Linear', objectKind: 'wall', unit: 'lf', color: DEFAULT_COLORS.linear },
    area: { name: 'Area', objectKind: 'room', unit: 'sf', color: DEFAULT_COLORS.area },
    count: { name: 'Count', objectKind: 'fixture', unit: 'ea', color: DEFAULT_COLORS.count },
  };
  const d = defaults[mode];
  return {
    id: newId('item'),
    name: name?.trim() || d.name,
    mode,
    color: d.color,
    objectKind: d.objectKind,
    unit: d.unit,
  };
}

export type ItemQuantity = {
  itemId: string;
  mode: TakeoffMeasureMode;
  /** Linear feet, square feet, or each. */
  value: number;
  pieceCount: number;
  formatted: string;
};

export function sumItemQuantity(
  item: TakeoffItem,
  objects: TakeoffObject[],
  _scale?: TakeoffScale,
): ItemQuantity {
  const owned = objects.filter((o) => o.itemId === item.id);
  if (item.mode === 'linear') {
    const value = owned.reduce((s, o) => s + (o.lengthFt ?? 0), 0);
    return {
      itemId: item.id,
      mode: 'linear',
      value,
      pieceCount: owned.length,
      formatted: owned.length ? `${formatFtIn(value)} LF` : '0 LF',
    };
  }
  if (item.mode === 'area') {
    const value = owned.reduce((s, o) => s + (o.areaSqFt ?? 0), 0);
    return {
      itemId: item.id,
      mode: 'area',
      value,
      pieceCount: owned.length,
      formatted: owned.length ? formatSqFt(value) : '0.0 sf',
    };
  }
  const value = owned.reduce((s, o) => s + (o.count ?? 1), 0);
  return {
    itemId: item.id,
    mode: 'count',
    value,
    pieceCount: owned.length,
    formatted: `${value} EA`,
  };
}

export function formatItemMode(mode: TakeoffMeasureMode): string {
  if (mode === 'linear') return 'Linear';
  if (mode === 'area') return 'Area';
  return 'Count';
}

export function toolForMode(mode: TakeoffMeasureMode): 'linear' | 'area' | 'count' {
  return mode;
}
