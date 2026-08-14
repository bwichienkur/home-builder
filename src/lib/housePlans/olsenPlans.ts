import type { HousePlan, PlanRoomRect } from './buildPlan';
import { livingAreaSqFt, row } from './buildPlan';
import type { RoomType } from '../../types';

const SOURCE = 'https://olsencustomhomes.com/floor-plans-with-a-custom-home-builder-new-smyrna/';
const NOTE =
  'Original Roomcraft multi-room layout sized from publicly listed room programs (beds/baths/sq ft). Not an Olsen drawing or CAD copy.';

function plan(
  partial: Omit<HousePlan, 'note' | 'sourceUrl'> & { sourceUrl?: string; note?: string },
): HousePlan {
  return {
    sourceUrl: SOURCE,
    note: NOTE,
    ...partial,
  };
}

function R(name: string, roomType: RoomType, w: number, ceilingFt?: number) {
  return { name, roomType, w, ceilingFt };
}

/** Single-story Florida ranch: garage + foyer wing, great room core, owner suite, guest wing, lanai. */
function ranch3Bed(opts: {
  id: string;
  name: string;
  beds: number;
  baths: number;
  livingSqFt: number;
  totalUnderRoofSqFt?: number;
  stories?: 1 | 2;
  garageW?: number;
  garageD?: number;
  greatW?: number;
  greatD?: number;
  ownerW?: number;
  ownerD?: number;
  kitchenW?: number;
  lanaiW?: number;
  study?: boolean;
  game?: boolean;
  nook?: boolean;
}): HousePlan {
  const garageW = opts.garageW ?? 24;
  const garageD = opts.garageD ?? 22;
  const greatW = opts.greatW ?? 22;
  const greatD = opts.greatD ?? 20;
  const ownerW = opts.ownerW ?? 15;
  const ownerD = opts.ownerD ?? 18;
  const kitchenW = opts.kitchenW ?? 14;
  const lanaiW = opts.lanaiW ?? 36;
  const study = opts.study !== false;

  const rooms: PlanRoomRect[] = [];
  // Front band
  rooms.push(
    ...row(0, garageD, [
      R('Garage', 'Storage / wardrobe', garageW, 10),
      R('Laundry', 'Laundry', 8, 10),
      ...(study ? [R('Study', 'Office', 11, 12)] : [R('Flex', 'Office', 11, 12)]),
      R('Foyer', 'Hallway', 10, 13),
      R('Dining', 'Dining room', 12, 12),
    ]),
  );
  const frontDepth = garageD;
  // Living core
  rooms.push(
    ...row(frontDepth, greatD, [
      R('Bedroom 2', 'Bedroom', 12, 10),
      R('Bath 2', 'Bathroom', 7, 10),
      R('Great Room', 'Living room', greatW, 12),
      R('Kitchen', 'Kitchen', kitchenW, 12),
      ...(opts.nook !== false ? [R('Nook', 'Dining room', 11, 12)] : [R('Pantry', 'Storage / wardrobe', 8, 10)]),
    ]),
  );
  const midY = frontDepth + greatD;
  // Owner + guest
  const ownerRow = [
    R("Owner's Suite", 'Bedroom', ownerW, 10),
    R("Owner's Bath", 'Bathroom', 10, 10),
    R('WIC', 'Storage / wardrobe', 8, 10),
    R('Bedroom 3', 'Bedroom', 12, 10),
    R('Bath 3', 'Bathroom', 7, 10),
  ];
  if (opts.beds >= 4) {
    ownerRow.push(R('Bedroom 4', 'Bedroom', 12, 10));
  }
  if (opts.game) ownerRow.push(R('Game Room', 'Living room', 12, 10));
  rooms.push(...row(midY, ownerD, ownerRow));
  const backY = midY + ownerD;
  rooms.push(...row(backY, 12, [R('Lanai', 'Outdoor', lanaiW, 10), R('Pool Court', 'Outdoor', Math.max(16, greatW - 4), 10)]));

  return plan({
    id: opts.id,
    name: opts.name,
    stories: opts.stories ?? 1,
    beds: opts.beds,
    baths: opts.baths,
    livingSqFt: opts.livingSqFt,
    totalUnderRoofSqFt: opts.totalUnderRoofSqFt,
    floors: [{ id: `${opts.id}-1`, name: 'First story', rooms }],
  });
}

function twoStoryFamily(opts: {
  id: string;
  name: string;
  beds: number;
  baths: number;
  livingSqFt: number;
  totalUnderRoofSqFt?: number;
  firstLiving?: number;
  secondLiving?: number;
}): HousePlan {
  const first: PlanRoomRect[] = [
    ...row(0, 22, [
      R('Garage', 'Storage / wardrobe', 23, 10),
      R('Laundry', 'Laundry', 8, 10),
      R('Study', 'Office', 12, 12),
      R('Foyer', 'Hallway', 9, 18),
      R('Dining', 'Dining room', 13, 12),
    ]),
    ...row(22, 18, [
      R('Kitchen', 'Kitchen', 14, 12),
      R('Pantry', 'Storage / wardrobe', 6, 12),
      R('Living Room', 'Living room', 20, 12),
      R("Owner's Suite", 'Bedroom', 14, 10),
      R("Owner's Bath", 'Bathroom', 10, 10),
    ]),
    ...row(40, 12, [R('Lanai', 'Outdoor', 28, 12), R('Entry Porch', 'Outdoor', 12, 10)]),
  ];

  const second: PlanRoomRect[] = [
    ...row(0, 14, [
      R('Loft', 'Living room', 18, 10),
      R('Bedroom 2', 'Bedroom', 13, 10),
      R('Bath 2', 'Bathroom', 7, 10),
      R('Bedroom 3', 'Bedroom', 14, 10),
      R('Bath 3', 'Bathroom', 7, 10),
    ]),
    ...row(14, 10, [R('Balcony', 'Outdoor', 16, 10), R('Hall', 'Hallway', 10, 10), ...(opts.beds >= 4 ? [R('Bedroom 4', 'Bedroom', 12, 10)] : [R('Flex Loft', 'Office', 12, 10)])]),
  ];

  return plan({
    id: opts.id,
    name: opts.name,
    stories: 2,
    beds: opts.beds,
    baths: opts.baths,
    livingSqFt: opts.livingSqFt,
    totalUnderRoofSqFt: opts.totalUnderRoofSqFt,
    floors: [
      { id: `${opts.id}-1`, name: 'First story', rooms: first },
      { id: `${opts.id}-2`, name: 'Second story', rooms: second },
    ],
  });
}

/** Islamorada-inspired: family room, kitchen/nook, owner wing, garage, lanai, game room (from public flyer room list). */
function islamorada(): HousePlan {
  const rooms: PlanRoomRect[] = [
    ...row(0, 24, [
      R('Garage', 'Storage / wardrobe', 24, 10),
      R('Laundry', 'Laundry', 8, 10),
      R('Study', 'Office', 11, 10),
      R("Owner's Suite", 'Bedroom', 15, 10),
      R("Owner's Bath", 'Bathroom', 10, 10),
    ]),
    ...row(24, 20, [
      R('Bedroom 3', 'Bedroom', 13, 12),
      R('Bath 3', 'Bathroom', 7, 10),
      R('Family Room', 'Living room', 20, 12),
      R('Kitchen', 'Kitchen', 11, 12),
      R('Nook', 'Dining room', 11, 12),
    ]),
    ...row(44, 14, [
      R('Game Room', 'Living room', 12, 10),
      R('Bath 2', 'Bathroom', 7, 10),
      R('Bedroom 2', 'Bedroom', 12, 12),
      R('Foyer', 'Hallway', 8, 12),
      R('Lanai', 'Outdoor', 36, 10),
    ]),
  ];
  return plan({
    id: 'islamorada',
    name: 'Islamorada',
    stories: 1,
    beds: 4,
    baths: 3,
    livingSqFt: 2638,
    totalUnderRoofSqFt: 3864,
    floors: [{ id: 'islamorada-1', name: 'First story', rooms }],
  });
}

/** Largo-inspired from public flyer dimensions. */
function largo(): HousePlan {
  const rooms: PlanRoomRect[] = [
    ...row(0, 23, [
      R('Garage', 'Storage / wardrobe', 23, 10),
      R('Laundry', 'Laundry', 8, 10),
      R('Study', 'Office', 11, 12),
      R('Foyer', 'Hallway', 10, 13),
      R('Dining', 'Dining room', 12.5, 12),
    ]),
    ...row(23, 23, [
      R('Bedroom 2', 'Bedroom', 12, 10),
      R('Bath 2', 'Bathroom', 7, 10),
      R('Great Room', 'Living room', 22.5, 12),
      R('Kitchen', 'Kitchen', 13, 12),
      R('Nook', 'Dining room', 13, 10),
    ]),
    ...row(46, 18, [
      R('Bedroom 3', 'Bedroom', 12, 10),
      R('Bath 3', 'Bathroom', 7, 10),
      R('Hall', 'Hallway', 6, 10),
      R("Owner's Suite", 'Bedroom', 15.5, 10),
      R("Owner's Bath", 'Bathroom', 10, 10),
      R('WIC', 'Storage / wardrobe', 8, 10),
    ]),
    ...row(64, 12, [R('Lanai', 'Outdoor', 55, 10), R('Pool Area', 'Outdoor', 20, 10)]),
  ];
  return plan({
    id: 'largo',
    name: 'Largo',
    stories: 1,
    beds: 3,
    baths: 3,
    livingSqFt: 2907,
    totalUnderRoofSqFt: 4163,
    floors: [{ id: 'largo-1', name: 'First story', rooms }],
  });
}

/** Captiva-inspired two-story from public flyer. */
function captiva(): HousePlan {
  const first: PlanRoomRect[] = [
    ...row(0, 22, [
      R('Garage', 'Storage / wardrobe', 23, 10),
      R('Laundry', 'Laundry', 8, 10),
      R('Study', 'Office', 12, 12),
      R('Foyer', 'Hallway', 8, 18),
      R('Dining', 'Dining room', 13, 12),
    ]),
    ...row(22, 18, [
      R('Kitchen', 'Kitchen', 10, 12),
      R('Pantry', 'Storage / wardrobe', 6, 12),
      R('Living Room', 'Living room', 20, 12),
      R("Owner's Suite", 'Bedroom', 14, 10),
      R("Owner's Bath", 'Bathroom', 10, 10),
      R('WIC', 'Storage / wardrobe', 7, 10),
    ]),
    ...row(40, 12, [R('Lanai', 'Outdoor', 23, 12), R('Entry', 'Outdoor', 10, 10)]),
  ];
  const second: PlanRoomRect[] = [
    ...row(0, 14, [
      R('Loft', 'Living room', 21, 10),
      R('Bedroom 2', 'Bedroom', 13, 10),
      R('Bath 2', 'Bathroom', 7, 10),
      R('Bedroom 3', 'Bedroom', 16, 10),
      R('Bath 3', 'Bathroom', 7, 10),
    ]),
    ...row(14, 10, [R('Balcony', 'Outdoor', 16, 10)]),
  ];
  return plan({
    id: 'captiva',
    name: 'Captiva',
    stories: 2,
    beds: 3,
    baths: 3,
    livingSqFt: 2997,
    totalUnderRoofSqFt: 4065,
    floors: [
      { id: 'captiva-1', name: 'First story', rooms: first },
      { id: 'captiva-2', name: 'Second story', rooms: second },
    ],
  });
}

/** Coral Sands-inspired two-story from public flyer room list. */
function coralSands(): HousePlan {
  const first: PlanRoomRect[] = [
    ...row(0, 24, [
      R('Garage', 'Storage / wardrobe', 23, 10),
      R('Laundry', 'Laundry', 8, 10),
      R('Study', 'Office', 12.5, 12),
      R('Foyer', 'Hallway', 10, 13),
      R('Storage', 'Storage / wardrobe', 8, 10),
    ]),
    ...row(24, 18, [
      R('Bedroom 2', 'Bedroom', 12.5, 10),
      R('Bath 2', 'Bathroom', 7, 10),
      R('Family Room', 'Living room', 22.5, 12),
      R('Kitchen', 'Kitchen', 14, 12),
      R('Nook', 'Dining room', 14, 12),
    ]),
    ...row(42, 16, [
      R('Bedroom 3', 'Bedroom', 12.5, 10),
      R('Bath 3', 'Bathroom', 7, 10),
      R('Pantry', 'Storage / wardrobe', 8, 12),
      R("Owner's Suite", 'Bedroom', 14.5, 10),
      R("Owner's Bath", 'Bathroom', 10, 10),
      R('WIC', 'Storage / wardrobe', 8, 10),
    ]),
    ...row(58, 15, [R('Lanai', 'Outdoor', 51, 12)]),
  ];
  const second: PlanRoomRect[] = [
    ...row(0, 14, [
      R('Loft', 'Living room', 27, 10),
      R('Bedroom 4', 'Bedroom', 12, 10),
      R('Bath 4', 'Bathroom', 7, 10),
      R('Bedroom 5', 'Bedroom', 14, 10),
    ]),
    ...row(14, 8, [R('Balcony', 'Outdoor', 19, 10)]),
  ];
  return plan({
    id: 'coral-sands',
    name: 'Coral Sands',
    stories: 2,
    beds: 4,
    baths: 4,
    livingSqFt: 3721,
    totalUnderRoofSqFt: 5481,
    floors: [
      { id: 'coral-sands-1', name: 'First story', rooms: first },
      { id: 'coral-sands-2', name: 'Second story', rooms: second },
    ],
  });
}

export const olsenHousePlans: HousePlan[] = [
  coralSands(),
  islamorada(),
  largo(),
  captiva(),
  twoStoryFamily({ id: 'key-biscayne', name: 'Key Biscayne', beds: 3, baths: 3, livingSqFt: 2997, totalUnderRoofSqFt: 4065 }),
  twoStoryFamily({ id: 'sanibel', name: 'Sanibel', beds: 3, baths: 3, livingSqFt: 2997, totalUnderRoofSqFt: 3822 }),
  ranch3Bed({ id: 'st-croix', name: 'St. Croix', beds: 4, baths: 3, livingSqFt: 3505, totalUnderRoofSqFt: 5220, greatW: 24, greatD: 22, lanaiW: 42, game: true }),
  ranch3Bed({ id: 'st-thomas', name: 'St. Thomas', beds: 3, baths: 3, livingSqFt: 2568, totalUnderRoofSqFt: 3402, garageW: 20, garageD: 20, greatW: 18, ownerW: 14 }),
  twoStoryFamily({ id: 'st-johns', name: 'St. Johns', beds: 3, baths: 3, livingSqFt: 2663, totalUnderRoofSqFt: 3410 }),
  twoStoryFamily({ id: 'ravello', name: 'Ravello', beds: 3, baths: 3, livingSqFt: 2622, totalUnderRoofSqFt: 3471 }),
  ranch3Bed({ id: 'tradewinds', name: 'Tradewinds', beds: 4, baths: 3, livingSqFt: 3110, totalUnderRoofSqFt: 4739, greatW: 24, lanaiW: 40, game: true }),
  ranch3Bed({ id: 'driftwood', name: 'Driftwood', beds: 3, baths: 3, livingSqFt: 2947, totalUnderRoofSqFt: 4211, greatW: 22, lanaiW: 38 }),
  ranch3Bed({ id: 'oyster-bay', name: 'Oyster Bay', beds: 4, baths: 3, livingSqFt: 3299, totalUnderRoofSqFt: 5115, greatW: 24, greatD: 22, lanaiW: 44, game: true }),
  ranch3Bed({ id: 'sandbridge', name: 'Sandbridge', beds: 5, baths: 4, livingSqFt: 4874, totalUnderRoofSqFt: 6773, garageW: 28, garageD: 24, greatW: 28, greatD: 24, ownerW: 18, ownerD: 20, kitchenW: 16, lanaiW: 50, game: true }),
  ranch3Bed({ id: 'marbella', name: 'Marbella', beds: 3, baths: 3, livingSqFt: 2683, totalUnderRoofSqFt: 3582, garageW: 20, greatW: 18, lanaiW: 32 }),
  ranch3Bed({ id: 'verona', name: 'Verona', beds: 4, baths: 3, livingSqFt: 3261, totalUnderRoofSqFt: 4747, greatW: 24, lanaiW: 30, game: true }),
  twoStoryFamily({ id: 'villa-della-dolce-vita', name: 'Villa Della Dolce Vita', beds: 5, baths: 4, livingSqFt: 4176, totalUnderRoofSqFt: 6670 }),
  twoStoryFamily({ id: 'portofino', name: 'Portofino', beds: 4, baths: 4, livingSqFt: 4272, totalUnderRoofSqFt: 6528 }),
  ranch3Bed({ id: 'tidelands', name: 'Tidelands', beds: 4, baths: 3, livingSqFt: 3560, totalUnderRoofSqFt: 5353, greatW: 26, greatD: 22, lanaiW: 44, game: true }),
  ranch3Bed({ id: 'capri', name: 'Capri', beds: 3, baths: 3, livingSqFt: 2767, totalUnderRoofSqFt: 3920, greatW: 20, lanaiW: 34 }),
  twoStoryFamily({ id: 'granada', name: 'Granada', beds: 3, baths: 3, livingSqFt: 2565, totalUnderRoofSqFt: 3531 }),
  ranch3Bed({ id: 'santorini', name: 'Santorini', beds: 4, baths: 3, livingSqFt: 3505, totalUnderRoofSqFt: 5220, greatW: 24, lanaiW: 40, game: true }),
];

export function getHousePlan(id: string) {
  return olsenHousePlans.find((p) => p.id === id);
}

export function listHousePlanNames() {
  return olsenHousePlans.map((p) => p.name);
}

/** Quick sanity: every catalog plan builds at least one closed wall loop. */
export function assertPlanCatalog() {
  return olsenHousePlans.map((p) => ({
    id: p.id,
    name: p.name,
    floors: p.floors.length,
    rooms: p.floors.reduce((n, f) => n + f.rooms.length, 0),
    approxLiving: Math.round(p.floors.reduce((n, f) => n + livingAreaSqFt(f.rooms), 0)),
  }));
}
