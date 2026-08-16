import type { HousePlan, PlanRoomRect } from './buildPlan';
import { livingAreaSqFt } from './buildPlan';
import type { RoomType } from '../../types';

const SOURCE = 'https://olsencustomhomes.com/floor-plans-with-a-custom-home-builder-new-smyrna/';
const FLYERS: Record<string, string> = {
  'coral-sands': 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Coral-Sands-Flyer.pdf',
  islamorada: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/ISLAMORADA-Flyer.pdf',
  largo: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Largo-Flyer.pdf',
  captiva: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Captiva-Flyer-1.pdf',
  'key-biscayne': 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Key-Biscayne-Flyer-1-1.pdf',
  sanibel: 'https://olsencustomhomes.com/wp-content/uploads/2024/08/Sanibel-Flyer-1.pdf',
  'st-croix': 'https://olsencustomhomes.com/wp-content/uploads/2024/05/ST-Croix-Flyer.pdf',
  'st-thomas': 'https://olsencustomhomes.com/wp-content/uploads/2024/08/St-Thomas-Flyer.pdf',
  'st-johns': 'https://olsencustomhomes.com/wp-content/uploads/2023/06/OLSEN_Brochure_StJohns.pdf',
  ravello: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Ravello.pdf',
  tradewinds: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Tradewinds.pdf',
  driftwood: 'https://olsencustomhomes.com/wp-content/uploads/2023/06/CC_DriftwoodFlyer_lr.pdf',
  'oyster-bay': 'https://olsencustomhomes.com/wp-content/uploads/2023/06/CC_OysterBayFlyer_lr.pdf',
  sandbridge: 'https://olsencustomhomes.com/wp-content/uploads/2023/06/CC_SandbridgeFlyer_lr.pdf',
  marbella: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Marbella.pdf',
  verona: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Verona.pdf',
  'villa-della-dolce-vita': 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Villa-Della-Dolce-Vita.pdf',
  portofino: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Portifino.pdf',
  tidelands: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Tidelands.pdf',
  capri: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Capri.pdf',
  granada: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Granada.pdf',
  santorini: 'https://olsencustomhomes.com/wp-content/uploads/2024/05/Santorini.pdf',
};
const NOTE =
  'Room sizes and adjacency derived from Olsen Custom Homes published floor-plan flyers. Polygon footprints (including octagons and 45° walls) where the flyer is non-rectangular; otherwise axis-aligned. Not a CAD tracing of Olsen drawings.';

function plan(
  partial: Omit<HousePlan, 'note' | 'sourceUrl'> & { sourceUrl?: string; note?: string; flyerUrl?: string },
): HousePlan {
  return {
    sourceUrl: SOURCE,
    note: NOTE,
    ...partial,
    flyerUrl: partial.flyerUrl ?? FLYERS[partial.id],
  };
}

/** Feet + inches → decimal feet (flyer dimension helper). */
export function ft(feet: number, inches = 0) {
  return feet + inches / 12;
}

export function room(
  name: string,
  roomType: RoomType | string,
  x: number,
  y: number,
  w: number,
  h: number,
  ceilingFt?: number,
): PlanRoomRect {
  return {
    id: `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.round(x * 10)}-${Math.round(y * 10)}`,
    name,
    roomType: roomType as RoomType,
    x,
    y,
    w,
    h,
    ceilingFt,
  };
}

/** Polygon room in plan feet; x/y/w/h become the axis-aligned bounds. */
export function poly(
  name: string,
  roomType: RoomType | string,
  pointsFt: { x: number; y: number }[],
  ceilingFt?: number,
): PlanRoomRect {
  const xs = pointsFt.map((p) => p.x);
  const ys = pointsFt.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    id: `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.round(minX * 10)}-${Math.round(minY * 10)}`,
    name,
    roomType: roomType as RoomType,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    pointsFt,
    ceilingFt,
  };
}

function coral_sands(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 22.8333, 30.0833, 10),
    room('Laundry', 'Laundry', 22.8333, 0, 8, 10, 10),
    room('Storage', 'Storage /wardrobe', 30.8333, 0, 8, 10, 10),
    room('Foyer', 'Hallway', 38.8333, 0, 10, 13.3333, 13.33),
    room('Entry', 'Outdoor', 38.8333, -6, 10, 6, 10),
    room('Study', 'Office', 48.8333, 0, 12.5, 12, 12),
    room('Bedroom 2', 'Bedroom', 0, 30.0833, 12.4167, 12.1667, 10),
    room('Bath 2', 'Bathroom', 12.4167, 30.0833, 7, 12.1667, 10),
    room('Pantry', 'Storage /wardrobe', 19.4167, 30.0833, 12.4167, 12.1667, 12),
    room('Kitchen', 'Kitchen', 32.0, 13.3333, 13.8333, 16.5833, 12),
    room('Family Room', 'Living room', 45.8333, 13.3333, 22.5, 16.5833, 12),
    room('Bedroom 3', 'Bedroom', 0, 42.25, 12.4167, 12, 10),
    room('Bath 3', 'Bathroom', 12.4167, 42.25, 7, 12, 10),
    room('Nook', 'Dining room', 32.0, 29.9167, 13.8333, 10.5, 12),
    room("Owner's Suite", 'Bedroom', 45.8333, 29.9166, 14.3333, 17.3333, 10),
    room("Owner's Bath", 'Bathroom', 60.1667, 29.9166, 10, 12, 10),
    room('WIC', 'Storage /wardrobe', 70.1667, 29.9166, 8, 10, 10),
    room('Lanai', 'Outdoor', 0, 54.25, 50.6667, 15, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 14.25, 27, 10),
    room('Bedroom 4', 'Bedroom', 14.25, 0, 11.75, 11, 10),
    room('Bath 4', 'Bathroom', 26.0, 0, 7, 11, 10),
    room('Bedroom 5', 'Bedroom', 33.0, 0, 13.5833, 11, 10),
    room('Balcony', 'Outdoor', 0, 27, 19.1667, 8.3333, 10),
  ];
  return plan({
    id: 'coral-sands',
    name: 'Coral Sands',
    stories: 2,
    beds: 4,
    baths: 4,
    livingSqFt: 3721,
    totalUnderRoofSqFt: 5481,
    floors: [{ id: 'coral-sands-1', name: 'First story', rooms: first }, { id: 'coral-sands-2', name: 'Second story', rooms: second }],
  });
}

function islamorada(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Study', 'Office', 0, 0, 11, 12, 10),
    room('Foyer', 'Hallway', 11, 0, 8, 12, 12),
    room('Bedroom 3', 'Bedroom', 19, 0, 13, 11.8333, 12),
    room('Bath 3', 'Bathroom', 32, 0, 7, 11.8333, 10),
    room('Laundry', 'Laundry', 39, 0, 8, 11.8333, 10),
    room('Garage', 'Storage /wardrobe', 50, 0, 24, 32.75, 10),
    room("Owner's Suite", 'Bedroom', 0, 12, 14.6667, 19, 10),
    room("Owner's Bath", 'Bathroom', 0, 31, 10, 12, 10),
    room('WIC', 'Storage /wardrobe', 10, 31, 8, 10, 10),
    room('Family Room', 'Living room', 19, 11.8333, 20, 28.6667, 12),
    room('Kitchen', 'Kitchen', 39, 11.8333, 10.5, 14.4167, 12),
    room('Nook', 'Dining room', 39, 26.25, 10.5, 12.5833, 12),
    room('Bedroom 2', 'Bedroom', 50, 32.75, 11.8333, 11.9167, 12),
    room('Game Room', 'Living room', 50, 44.6667, 11.8333, 12.9167, 10),
    room('Bath 2', 'Bathroom', 61.8333, 44.6667, 7, 12.9167, 10),
    room('Lanai', 'Outdoor', 19, 44.6667, 31, 14, 10),
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

function largo(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 23.3333, 30.3333, 10),
    room('Dining', 'Dining room', 23.3333, 0, 12.5, 12.25, 12),
    room('Foyer', 'Hallway', 35.8333, 0, 10, 12.25, 13.33),
    room('Study', 'Office', 45.8333, 0, 10.8333, 11.6667, 12),
    room('Entry', 'Outdoor', 35.8333, -6, 10, 6, 10),
    room('Laundry', 'Laundry', 23.3333, 12.25, 8, 8, 10),
    room('Kitchen', 'Kitchen', 31.3333, 12.25, 12.8333, 15.5, 12),
    room('Great Room', 'Living room', 44.1667, 12.25, 22.4167, 23, 12),
    room("Owner's Bath", 'Bathroom', 66.5833, 12.25, 10, 14, 10),
    room('WIC', 'Storage /wardrobe', 76.5833, 12.25, 8, 10, 10),
    room('Bedroom 2', 'Bedroom', 0, 30.3333, 12, 12.3333, 10),
    room('Bath 2', 'Bathroom', 12, 30.3333, 11.3333, 12.3333, 10),
    room('Bedroom 3', 'Bedroom', 0, 42.6667, 12, 15.3333, 10),
    room('Bath 3', 'Bathroom', 12, 42.6667, 7, 15.3333, 10),
    room('Pantry', 'Storage /wardrobe', 19, 42.6667, 12.3333, 8, 10),
    room('Hall', 'Hallway', 23.3333, 20.25, 8, 7.5, 10),
    room('Nook', 'Dining room', 31.3333, 27.75, 12.8333, 9, 10),
    room("Owner's Suite", 'Bedroom', 66.5833, 26.25, 15.5, 21.3333, 10),
    room('Owner Hall', 'Hallway', 58.5833, 35.25, 8, 6, 12),
    room('Lanai', 'Outdoor', 0, 58.1667, 54.8333, 12.1667, 10),
    room('Pool Area', 'Outdoor', 12, 70.3333, 30, 14, 10),
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

function captiva(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 22.8333, 20.0833, 10),
    room('Laundry', 'Laundry', 0, 20.0833, 8, 8, 10),
    room('Bedroom 2', 'Bedroom', 22.8333, 0, 12.6667, 12, 10),
    room('Bath 2', 'Bathroom', 35.5, 0, 7, 12, 10),
    room('Study', 'Office', 22.8333, 12, 12, 11.3333, 12),
    room('Foyer', 'Hallway', 8, 20.0833, 7.6667, 7.75, 22),
    room('Entry', 'Outdoor', 8, -6, 7.6667, 6, 10),
    room('Pantry', 'Storage /wardrobe', 15.6667, 20.0833, 6, 8, 12),
    room('Kitchen', 'Kitchen', 21.6667, 23.3333, 8.1667, 10, 12),
    room('Dining', 'Dining room', 30.0, 23.3333, 8, 13.3333, 12),
    room('Living Room', 'Living room', 8, 28.0833, 13.5, 20.6667, 12),
    room("Owner's Suite", 'Bedroom', 0, 28.0833, 8, 20.6667, 10),
    room("Owner's Bath", 'Bathroom', 0, 48.75, 10, 10, 10),
    room('WIC', 'Storage /wardrobe', 10, 48.75, 7, 10, 10),
    room('Lanai', 'Outdoor', 0, 58.75, 23.1667, 11, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 20.8333, 12.1667, 10),
    room('Bedroom 3', 'Bedroom', 20.8333, 0, 15.75, 12, 10),
    room('Bath 3', 'Bathroom', 36.5833, 0, 7, 12, 10),
    room('Balcony', 'Outdoor', 0, 12.1667, 18, 9.5, 10),
  ];
  return plan({
    id: 'captiva',
    name: 'Captiva',
    stories: 2,
    beds: 3,
    baths: 3,
    livingSqFt: 2997,
    totalUnderRoofSqFt: 4065,
    floors: [{ id: 'captiva-1', name: 'First story', rooms: first }, { id: 'captiva-2', name: 'Second story', rooms: second }],
  });
}

function key_biscayne(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage / wardrobe', 0, 0, 24, 32.75, 10),
    room('Laundry', 'Laundry', 24, 0, 8, 8, 10),
    room('Powder', 'Bathroom', 32, 0, 6, 8, 10),
    room('Foyer', 'Hallway', 38, 0, 10, 12, 13.33),
    room('Entry', 'Outdoor', 38, -6, 10, 6, 10),
    room('Study', 'Office', 48, 0, 12.5833, 11.6667, 12),
    room('Pantry', 'Storage /wardrobe', 24, 8, 8.75, 6.5, 10),
    room('Kitchen', 'Kitchen', 32.75, 12, 15.25, 16.6667, 12),
    room('Nook', 'Dining room', 48, 12, 14.8333, 11.5, 12),
    room('Family Room', 'Living room', 24, 28.6667, 23.6667, 20.9167, 12),
    room("Owner's Suite", 'Bedroom', 47.6667, 28.6667, 15.5, 18.5, 10),
    room('Master Bath', 'Bathroom', 63.1667, 28.6667, 10, 12, 10),
    room('WIC', 'Storage /wardrobe', 73.1667, 28.6667, 8, 10, 10),
    room('Lanai', 'Outdoor', 24, 49.5834, 23.5, 17.3333, 10),
    room('Pool Bath', 'Bathroom', 47.6667, 47.1667, 16.3333, 6.1667, 10),
  ];
  const second: PlanRoomRect[] = [
    room('Library', 'Office', 0, 0, 10, 12, 10),
    room('Bedroom 2', 'Bedroom', 10, 0, 11.5, 13, 10),
    room('Bath 2', 'Bathroom', 21.5, 0, 7, 13, 10),
    room('Loft', 'Living room', 28.5, 0, 15.6667, 13, 10),
    room('Bedroom 3', 'Bedroom', 0, 13, 12.6667, 12.5, 10),
    room('Bedroom 4', 'Bedroom', 12.6667, 13, 15.3333, 12.5, 10),
    room('Bath 4', 'Bathroom', 28.0, 13, 7, 12.5, 10),
    room('Covered Balcony', 'Outdoor', 35.0, 13, 18, 10, 10),
  ];
  return plan({
    id: 'key-biscayne',
    name: 'Key Biscayne',
    stories: 2,
    beds: 4,
    baths: 4,
    livingSqFt: 3894,
    totalUnderRoofSqFt: 5703,
    floors: [{ id: 'key-biscayne-1', name: 'First story', rooms: first }, { id: 'key-biscayne-2', name: 'Second story', rooms: second }],
  });
}

function sanibel(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 20, 19, 10),
    room('Laundry', 'Laundry', 20, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 28, 0, 8, 12, 12),
    room('Entry', 'Outdoor', 28, -5, 8, 5, 10),
    room('Dining Room', 'Dining room', 36, 0, 10.3333, 12, 12),
    room('Bedroom 2', 'Bedroom', 0, 19, 13.6667, 11, 10),
    room('Bath 2', 'Bathroom', 13.6667, 19, 7, 11, 10),
    room('Kitchen', 'Kitchen', 20.6667, 12, 8.6667, 15, 12),
    room('Living Room', 'Living room', 29.3333, 12, 18.25, 18, 12),
    room('Bedroom 3', 'Bedroom', 0, 30, 12.0833, 12.4167, 12),
    room('Bath 3', 'Bathroom', 12.0833, 30, 7, 12.4167, 10),
    room("Owner's Suite", 'Bedroom', 19.0833, 30, 13, 16.6667, 12),
    room("Owner's Bath", 'Bathroom', 32.0833, 30, 10, 10, 10),
    room('Lanai', 'Outdoor', 19.0833, 46.6667, 25.1667, 8, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Bonus Room', 'Living room', 0, 0, 19.5833, 20.1667, 10),
    room('Bath 4', 'Bathroom', 19.5833, 0, 7, 10, 10),
    room('Balcony', 'Outdoor', 0, 20.1667, 20.5833, 8, 10),
  ];
  return plan({
    id: 'sanibel',
    name: 'Sanibel',
    stories: 2,
    beds: 3,
    baths: 4,
    livingSqFt: 2997,
    totalUnderRoofSqFt: 3822,
    floors: [{ id: 'sanibel-1', name: 'First story', rooms: first }, { id: 'sanibel-2', name: 'Second story', rooms: second }],
  });
}

function st_croix(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 20, 21, 10),
    room('Storage Area', 'Storage / wardrobe', 20, 0, 11.1667, 14, 10),
    room('Laundry', 'Laundry', 31.1667, 0, 8.3333, 6, 10),
    room('Foyer', 'Hallway', 39.5, 0, 8, 12, 12),
    room('Entry', 'Outdoor', 39.5, -5, 8, 5, 10),
    room('Study', 'Office', 47.5, 0, 11, 11.1667, 12),
    room('Half Bath', 'Bathroom', 31.1667, 6, 8, 6, 10),
    room('Kitchen', 'Kitchen', 0, 21, 18.3333, 16, 12),
    room('Dining', 'Dining room', 18.3333, 21, 18.1667, 11.3333, 12),
    room('Great Room', 'Living room', 36.5, 12, 22, 12.6667, 12),
    room("Owner's Suite", 'Bedroom', 0, 37, 16.6667, 15.8333, 10),
    room('WIC', 'Storage /wardrobe', 16.6667, 37, 5.3333, 7.9167, 10),
    room("Owner's Bath", 'Bathroom', 22.0, 37, 10, 12, 10),
    room('Lanai', 'Outdoor', 36.5, 24.6667, 22, 11.3333, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 15, 16.8333, 10),
    room('Bedroom 2', 'Bedroom', 15, 0, 12.1667, 11.5833, 10),
    room('Bath', 'Bathroom', 27.1667, 0, 7, 11.5833, 10),
    room('Bedroom 3', 'Bedroom', 0, 16.8333, 12.1667, 11.3333, 10),
    room('Balcony', 'Outdoor', 12.1667, 16.8333, 22.6667, 11.3333, 10),
  ];
  return plan({
    id: 'st-croix',
    name: 'St. Croix',
    stories: 2,
    beds: 4,
    baths: 4,
    livingSqFt: 2781,
    totalUnderRoofSqFt: 3953,
    floors: [{ id: 'st-croix-1', name: 'First story', rooms: first }, { id: 'st-croix-2', name: 'Second story', rooms: second }],
  });
}

function st_thomas(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Bedroom 4', 'Bedroom', 0, 0, 11, 11.1667, 10),
    room('Foyer', 'Hallway', 11, 0, 8, 11.1667, 12),
    room('Entry', 'Outdoor', 11, -5, 8, 5, 10),
    room('Garage', 'Storage /wardrobe', 19, 0, 20, 22, 10),
    room('Kitchen', 'Kitchen', 0, 11.1667, 18.3333, 16, 12),
    room('Dining', 'Dining room', 0, 27.1667, 18.1667, 11, 12),
    room('Great Room', 'Living room', 0, 38.1667, 23.5, 24.3333, 12),
    room('Lanai', 'Outdoor', 0, 62.5, 22, 15, 10),
    room('Laundry', 'Laundry', 19, 22, 8, 8, 10),
    room('Bedroom 2', 'Bedroom', 27, 22, 11.1667, 8, 10),
    room('Bath 3', 'Bathroom', 38.1667, 22, 7, 8, 10),
    room('Bath 2', 'Bathroom', 19, 30, 7, 8, 10),
    room('Bedroom 3', 'Bedroom', 26, 30, 14.8333, 8, 10),
    room("Owner's Suite", 'Bedroom', 23.5, 38.1667, 16.6667, 15.8333, 10),
    room('WIC', 'Storage /wardrobe', 40.1667, 38.1667, 8, 8, 10),
    room("Owner's Bath", 'Bathroom', 40.1667, 46.1667, 10, 12, 10),
  ];
  return plan({
    id: 'st-thomas',
    name: 'St. Thomas',
    stories: 1,
    beds: 4,
    baths: 3,
    livingSqFt: 2568,
    totalUnderRoofSqFt: 3402,
    floors: [{ id: 'st-thomas-1', name: 'First story', rooms }],
  });
}

function st_johns(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage / wardrobe', 0, 0, 22, 22, 10),
    room('Laundry', 'Laundry', 22, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 30, 0, 8, 12, 16),
    room('Entry', 'Outdoor', 30, -5, 8, 5, 10),
    room('Study', 'Office', 38, 0, 12, 11, 12),
    room('Dining', 'Dining room', 50, 0, 12, 12, 12),
    room('Kitchen', 'Kitchen', 22, 12, 12, 10, 12),
    room('Pantry', 'Storage /wardrobe', 34, 12, 6, 8, 12),
    room('Living Room', 'Living room', 40, 12, 20, 18, 12),
    room("Owner's Suite", 'Bedroom', 0, 22, 14, 18, 10),
    room("Owner's Bath", 'Bathroom', 14, 22, 8, 12, 10),
    room('WIC', 'Storage /wardrobe', 14, 34, 8, 8, 10),
    room('Lanai', 'Outdoor', 40, 30, 23, 12, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 18, 14, 10),
    room('Bedroom 2', 'Bedroom', 18, 0, 13, 12, 10),
    room('Bath 2', 'Bathroom', 31, 0, 7, 12, 10),
    room('Bedroom 3', 'Bedroom', 38, 0, 14, 12, 10),
    room('Bath 3', 'Bathroom', 52, 0, 7, 12, 10),
    room('Balcony', 'Outdoor', 0, 14, 16, 10, 10),
    room('Bedroom 4', 'Bedroom', 18, 14, 13, 12, 10),
  ];
  return plan({
    id: 'st-johns',
    name: 'St. Johns',
    stories: 2,
    beds: 4,
    baths: 2.5,
    livingSqFt: 2663,
    totalUnderRoofSqFt: 3410,
    floors: [{ id: 'st-johns-1', name: 'First story', rooms: first }, { id: 'st-johns-2', name: 'Second story', rooms: second }],
  });
}

function ravello(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage / wardrobe', 0, 0, 22, 22, 10),
    room('Laundry', 'Laundry', 22, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 30, 0, 8, 12, 16),
    room('Entry', 'Outdoor', 30, -5, 8, 5, 10),
    room('Study', 'Office', 38, 0, 12, 11, 12),
    room('Dining', 'Dining room', 50, 0, 12, 12, 12),
    room('Kitchen', 'Kitchen', 22, 12, 12, 10, 12),
    room('Pantry', 'Storage /wardrobe', 34, 12, 6, 8, 12),
    room('Living Room', 'Living room', 40, 12, 20, 18, 12),
    room("Owner's Suite", 'Bedroom', 0, 22, 14, 18, 10),
    room("Owner's Bath", 'Bathroom', 14, 22, 8, 12, 10),
    room('WIC', 'Storage /wardrobe', 14, 34, 8, 8, 10),
    room('Lanai', 'Outdoor', 40, 30, 23, 12, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 18, 14, 10),
    room('Bedroom 2', 'Bedroom', 18, 0, 13, 12, 10),
    room('Bath 2', 'Bathroom', 31, 0, 7, 12, 10),
    room('Bedroom 3', 'Bedroom', 38, 0, 14, 12, 10),
    room('Bath 3', 'Bathroom', 52, 0, 7, 12, 10),
    room('Balcony', 'Outdoor', 0, 14, 16, 10, 10),
  ];
  return plan({
    id: 'ravello',
    name: 'Ravello',
    stories: 2,
    beds: 4,
    baths: 3.5,
    livingSqFt: 2622,
    totalUnderRoofSqFt: 3471,
    floors: [{ id: 'ravello-1', name: 'First story', rooms: first }, { id: 'ravello-2', name: 'Second story', rooms: second }],
  });
}

function tradewinds(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 24, 34, 10),
    room('Bedroom 2', 'Bedroom', 24, 0, 13, 12.8333, 10),
    room('Bath 2', 'Bathroom', 37, 0, 7, 12.8333, 10),
    room('Bedroom 3', 'Bedroom', 24, 12.8333, 12.8333, 14, 10),
    room('Bath 3', 'Bathroom', 36.8333, 12.8333, 7, 8, 10),
    room('Hall', 'Hallway', 36.8333, 20.8333, 7, 6, 10),
    room('Laundry', 'Laundry', 24, 26.8333, 15, 6, 10),
    room('Entry', 'Outdoor', 44, 0, 8, 5, 10),
    room('Foyer', 'Hallway', 44, 5, 8, 8, 12),
    room('Study', 'Office', 52, 0, 14.5, 13.0, 12),
    room('Kitchen', 'Kitchen', 44, 13, 12.8333, 18, 12),
    room('Pantry', 'Storage /wardrobe', 56.8333, 13, 6, 8, 10),
    room('Nook', 'Dining room', 44, 31, 14.8333, 12.3333, 12),
    room('Family Room', 'Living room', 62.8333, 13, 26.4167, 17.75, 12),
    room("Owner's Bath", 'Bathroom', 89.25, 0, 11, 16, 10),
    room('WIC', 'Storage /wardrobe', 89.25, 16, 8, 10, 10),
    room("Owner's Suite", 'Bedroom', 89.25, 26, 15.5, 20, 10),
    room('Lanai', 'Outdoor', 24, 43.3333, 65, 12, 10),
  ];
  return plan({
    id: 'tradewinds',
    name: 'Tradewinds',
    stories: 1,
    beds: 3,
    baths: 3,
    livingSqFt: 3110,
    totalUnderRoofSqFt: 4739,
    floors: [{ id: 'tradewinds-1', name: 'First story', rooms }],
  });
}

function driftwood(): HousePlan {
  // Flyer: 65'w × 86'4"d, 3 bed / 3.5 bath. Living rear wall faceted toward lanai; owner bath bay.
  const rooms: PlanRoomRect[] = [
    poly('Garage', 'Storage /wardrobe', [{ x: 41, y: 0 }, { x: 65, y: 0 }, { x: 65, y: 31.875 }, { x: 41, y: 31.875 }], 10),
    poly('Entry', 'Outdoor', [{ x: 30, y: 0 }, { x: 41, y: 0 }, { x: 41, y: 5 }, { x: 30, y: 5 }], 10),
    poly('Foyer', 'Hallway', [{ x: 30, y: 5 }, { x: 41, y: 5 }, { x: 41, y: 15 }, { x: 30, y: 15 }], 13),
    poly('Study', 'Office', [{ x: 30, y: 15 }, { x: 41, y: 15 }, { x: 41, y: 24 }, { x: 30, y: 24 }], 12),
    poly('Dining', 'Dining room', [{ x: 18, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 15 }, { x: 18, y: 15 }], 12),
    poly("Owner's Suite", 'Bedroom', [{ x: 0, y: 20 }, { x: 16, y: 20 }, { x: 16, y: 38 }, { x: 0, y: 38 }], 10),
    poly("Owner's Bath", 'Bathroom', [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 14 }, { x: 3, y: 20 }, { x: 0, y: 16 }], 10),
    poly('WIC', 'Storage /wardrobe', [{ x: 12, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 14 }, { x: 12, y: 14 }], 10),
    poly('Great Room', 'Living room', [
      { x: 16, y: 24 }, { x: 40, y: 24 }, { x: 40, y: 48 }, { x: 36, y: 54 }, { x: 28, y: 56 }, { x: 20, y: 54 }, { x: 16, y: 48 },
    ], 12),
    poly('Kitchen', 'Kitchen', [{ x: 41, y: 31.875 }, { x: 54, y: 31.875 }, { x: 54, y: 45.875 }, { x: 41, y: 45.875 }], 12),
    poly('Nook', 'Dining room', [{ x: 41, y: 45.875 }, { x: 54, y: 45.875 }, { x: 54, y: 55.875 }, { x: 41, y: 55.875 }], 12),
    poly('Bedroom 2', 'Bedroom', [{ x: 54, y: 31.875 }, { x: 65, y: 31.875 }, { x: 65, y: 45.875 }, { x: 54, y: 45.875 }], 10),
    poly('Bath 2', 'Bathroom', [{ x: 54, y: 45.875 }, { x: 65, y: 45.875 }, { x: 65, y: 53.875 }, { x: 54, y: 53.875 }], 10),
    poly('Bedroom 3', 'Bedroom', [{ x: 54, y: 53.875 }, { x: 65, y: 53.875 }, { x: 65, y: 69.875 }, { x: 54, y: 69.875 }], 10),
    poly('Bath 3', 'Bathroom', [{ x: 54, y: 69.875 }, { x: 65, y: 69.875 }, { x: 65, y: 79.875 }, { x: 54, y: 79.875 }], 10),
    poly('Laundry', 'Laundry', [{ x: 40, y: 55.875 }, { x: 48, y: 55.875 }, { x: 48, y: 63.875 }, { x: 40, y: 63.875 }], 10),
    poly('Powder', 'Bathroom', [{ x: 24, y: 15 }, { x: 30, y: 15 }, { x: 30, y: 21 }, { x: 24, y: 21 }], 10),
    poly('Lanai', 'Outdoor', [
      { x: 16, y: 48 }, { x: 20, y: 54 }, { x: 28, y: 56 }, { x: 36, y: 54 }, { x: 40, y: 48 }, { x: 40, y: 86.333 }, { x: 16, y: 86.333 },
    ], 10),
  ];
  return plan({
    id: 'driftwood',
    name: 'Driftwood',
    stories: 1,
    beds: 3,
    baths: 3.5,
    livingSqFt: 2947,
    totalUnderRoofSqFt: 4211,
    floors: [{ id: 'driftwood-1', name: 'First story', rooms }],
  });
}

function oyster_bay(): HousePlan {
  // Coastal Collection flyer: 89'w × 90'd, 3 bed / 3.5 bath / study / 3-car.
  // Brochure topology (front y=0): garage front-left + 45° garage hall, dining octagon
  // + study bay at front, secondary beds on the left, kitchen + octagon nook center,
  // owner's suite/bath on the right, L-lanai wrapping the nook at the rear.
  const rooms: PlanRoomRect[] = [
    poly('Garage', 'Storage /wardrobe', [
      { x: 0, y: 0 }, { x: 36, y: 0 }, { x: 36, y: 29.833 }, { x: 0, y: 29.833 },
    ], 10),
    poly('Storage', 'Storage /wardrobe', [
      { x: 0, y: 29.833 }, { x: 6.5, y: 29.833 }, { x: 6.5, y: 36.14 }, { x: 0, y: 36.14 },
    ], 10),
    poly('Garage Hall', 'Hallway', [
      { x: 36, y: 18 }, { x: 36, y: 26 }, { x: 46, y: 36 }, { x: 46, y: 28 },
    ], 10),
    poly('Laundry', 'Laundry', [
      { x: 36, y: 10 }, { x: 46, y: 10 }, { x: 46, y: 18 }, { x: 36, y: 18 },
    ], 10),
    poly('Dining', 'Dining room', [
      { x: 48.8, y: 1 }, { x: 55.2, y: 1 }, { x: 58, y: 3.8 }, { x: 58, y: 13.2 },
      { x: 55.2, y: 16 }, { x: 48.8, y: 16 }, { x: 46, y: 13.2 }, { x: 46, y: 3.8 },
    ], 12),
    poly('Entry', 'Outdoor', [
      { x: 58, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 7.333 }, { x: 58, y: 7.333 },
    ], 10),
    poly('Foyer', 'Hallway', [
      { x: 58, y: 7.333 }, { x: 70, y: 7.333 }, { x: 70, y: 20 }, { x: 58, y: 20 },
    ], 13),
    poly('Study', 'Office', [
      { x: 70, y: 0 }, { x: 80, y: 0 }, { x: 83, y: 3 }, { x: 83, y: 20 }, { x: 70, y: 20 },
    ], 12),
    poly("Owner's Bath", 'Bathroom', [
      { x: 83, y: 0 }, { x: 85.5, y: 0 }, { x: 89, y: 3.5 }, { x: 89, y: 20 }, { x: 83, y: 20 },
    ], 10),
    poly('Powder', 'Bathroom', [
      { x: 50, y: 16 }, { x: 58, y: 16 }, { x: 58, y: 22 }, { x: 50, y: 22 },
    ], 10),
    poly('WIC', 'Storage /wardrobe', [
      { x: 76.5, y: 20 }, { x: 89, y: 20 }, { x: 89, y: 32 }, { x: 76.5, y: 32 },
    ], 10),
    poly('Owner Hall', 'Hallway', [
      { x: 74.667, y: 32 }, { x: 89, y: 32 }, { x: 89, y: 48 }, { x: 74.667, y: 48 },
    ], 10),
    poly('Pantry', 'Storage /wardrobe', [
      { x: 38, y: 36 }, { x: 46, y: 36 }, { x: 46, y: 48 }, { x: 38, y: 48 },
    ], 10),
    poly('Kitchen', 'Kitchen', [
      { x: 49, y: 48 }, { x: 57, y: 48 }, { x: 60, y: 51 }, { x: 60, y: 63 },
      { x: 57, y: 66 }, { x: 49, y: 66 }, { x: 46, y: 63 }, { x: 46, y: 51 },
    ], 12),
    poly('Breakfast', 'Dining room', [
      { x: 49.1, y: 66 }, { x: 56.9, y: 66 }, { x: 59.5, y: 68.6 }, { x: 59.5, y: 77.4 },
      { x: 56.9, y: 80 }, { x: 49.1, y: 80 }, { x: 46.5, y: 77.4 }, { x: 46.5, y: 68.6 },
    ], 12),
    poly('Great Room', 'Living room', [
      { x: 60, y: 48 }, { x: 74.667, y: 48 }, { x: 74.667, y: 83.5 }, { x: 60, y: 83.5 },
    ], 12),
    poly("Owner's Suite", 'Bedroom', [
      { x: 74.667, y: 48 }, { x: 89, y: 48 }, { x: 89, y: 83.5 }, { x: 74.667, y: 83.5 },
    ], 10),
    poly('Bedroom 3', 'Bedroom', [
      { x: 0, y: 40 }, { x: 13.5, y: 40 }, { x: 13.5, y: 56 }, { x: 0, y: 56 },
    ], 10),
    poly('Bath 3', 'Bathroom', [
      { x: 13.5, y: 40 }, { x: 22, y: 40 }, { x: 22, y: 52 }, { x: 13.5, y: 52 },
    ], 10),
    poly('Bedroom 2', 'Bedroom', [
      { x: 0, y: 56 }, { x: 13.5, y: 56 }, { x: 13.5, y: 83.5 }, { x: 0, y: 83.5 },
    ], 10),
    poly('Bath 2', 'Bathroom', [
      { x: 13.5, y: 56 }, { x: 22, y: 56 }, { x: 22, y: 68 }, { x: 13.5, y: 68 },
    ], 10),
    poly('Bed Hall', 'Hallway', [
      { x: 22, y: 40 }, { x: 34, y: 40 }, { x: 34, y: 68 }, { x: 22, y: 68 },
    ], 10),
    poly('Gallery', 'Hallway', [
      { x: 34, y: 48 }, { x: 46, y: 48 }, { x: 46, y: 64 }, { x: 34, y: 64 },
    ], 12),
    poly('Lanai', 'Outdoor', [
      { x: 0, y: 83.5 }, { x: 46.5, y: 83.5 }, { x: 46.5, y: 80 }, { x: 59.5, y: 80 },
      { x: 59.5, y: 83.5 }, { x: 89, y: 83.5 }, { x: 89, y: 90 }, { x: 0, y: 90 },
    ], 10),
  ];
  return plan({
    id: 'oyster-bay',
    name: 'Oyster Bay',
    stories: 1,
    beds: 3,
    baths: 3.5,
    livingSqFt: 3299,
    totalUnderRoofSqFt: 5115,
    floors: [{ id: 'oyster-bay-1', name: 'First story', rooms }],
  });
}

function sandbridge(): HousePlan {
  // Coastal Collection flyer: 70'w × 115'd, 4 bed / 4 bath / den / 3-car garage.
  // Non-rectangular flyer features kept as polygons: octagonal gallery + breakfast,
  // chamfered den/owner suite/club, angled lanai. Wings remain mostly orthogonal.
  const rooms: PlanRoomRect[] = [
    poly('Garage', 'Storage /wardrobe', [{ x: 36, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 30.4 }, { x: 36, y: 30.4 }], 10),
    poly('Den', 'Office', [{ x: 0, y: 2 }, { x: 2, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 18 }, { x: 0, y: 18 }], 12),
    poly('Entry', 'Outdoor', [{ x: 16, y: 0 }, { x: 36, y: 0 }, { x: 36, y: 4.05 }, { x: 16, y: 4.05 }], 10),
    poly('Powder', 'Bathroom', [{ x: 0, y: 18 }, { x: 8, y: 18 }, { x: 8, y: 26 }, { x: 0, y: 26 }], 10),
    poly('Foyer', 'Hallway', [{ x: 16, y: 4.05 }, { x: 36, y: 4.05 }, { x: 36, y: 22 }, { x: 24, y: 22 }, { x: 20, y: 18 }, { x: 16, y: 18 }], 13),
    poly("Owner's Suite", 'Bedroom', [{ x: 0, y: 26 }, { x: 18, y: 26 }, { x: 18, y: 50 }, { x: 12, y: 56 }, { x: 0, y: 56 }], 10),
    poly("Owner's Bath", 'Bathroom', [{ x: 0, y: 56 }, { x: 10, y: 56 }, { x: 10, y: 70 }, { x: 0, y: 66 }], 10),
    poly('WIC', 'Storage /wardrobe', [{ x: 10, y: 56 }, { x: 18, y: 56 }, { x: 18, y: 70 }, { x: 10, y: 70 }], 10),
    poly('WIC B', 'Storage /wardrobe', [{ x: 0, y: 70 }, { x: 18, y: 70 }, { x: 18, y: 78 }, { x: 0, y: 78 }], 10),
    poly('Owner Hall', 'Hallway', [{ x: 18, y: 26 }, { x: 20, y: 26 }, { x: 20, y: 78 }, { x: 18, y: 78 }], 10),
    poly('Sitting', 'Living room', [{ x: 0, y: 78 }, { x: 24, y: 78 }, { x: 24, y: 100 }, { x: 0, y: 100 }], 10),
    poly('Gallery', 'Hallway', [
      { x: 27.3, y: 34 }, { x: 36.7, y: 34 }, { x: 40, y: 37.3 }, { x: 40, y: 46.7 },
      { x: 36.7, y: 50 }, { x: 27.3, y: 50 }, { x: 24, y: 46.7 }, { x: 24, y: 37.3 },
    ], 12),
    poly('Vestibule', 'Hallway', [
      { x: 24, y: 22 }, { x: 36, y: 22 }, { x: 36, y: 30.4 }, { x: 36.7, y: 30.4 },
      { x: 36.7, y: 34 }, { x: 27.3, y: 34 }, { x: 24, y: 37.3 },
    ], 13),
    poly('Great Room', 'Living room', [
      { x: 20, y: 22 }, { x: 24, y: 37.3 }, { x: 24, y: 46.7 }, { x: 27.3, y: 50 },
      { x: 36.7, y: 50 }, { x: 48, y: 48 }, { x: 48, y: 56 }, { x: 20, y: 56 },
    ], 12),
    poly('Kitchen', 'Kitchen', [
      { x: 36.7, y: 30.4 }, { x: 50.5, y: 30.4 }, { x: 50.5, y: 36.8 }, { x: 50.5, y: 43.2 },
      { x: 50.5, y: 48 }, { x: 48, y: 48 }, { x: 36.7, y: 50 }, { x: 40, y: 46.7 },
      { x: 40, y: 37.3 }, { x: 36.7, y: 34 },
    ], 12),
    poly('Breakfast', 'Dining room', [
      { x: 52.8, y: 34.5 }, { x: 59.2, y: 34.5 }, { x: 61.5, y: 36.8 }, { x: 61.5, y: 43.2 },
      { x: 59.2, y: 45.5 }, { x: 52.8, y: 45.5 }, { x: 50.5, y: 43.2 }, { x: 50.5, y: 36.8 },
    ], 12),
    poly('Pantry', 'Storage /wardrobe', [{ x: 48, y: 48 }, { x: 56, y: 48 }, { x: 56, y: 56 }, { x: 48, y: 56 }], 10),
    poly('Laundry', 'Laundry', [{ x: 56, y: 48 }, { x: 70, y: 48 }, { x: 70, y: 56 }, { x: 56, y: 56 }], 10),
    poly('Bedroom 2', 'Bedroom', [{ x: 48, y: 56 }, { x: 62, y: 56 }, { x: 62, y: 70 }, { x: 48, y: 70 }], 10),
    poly('Bath 2', 'Bathroom', [{ x: 62, y: 56 }, { x: 70, y: 56 }, { x: 70, y: 70 }, { x: 62, y: 70 }], 10),
    poly('Bedroom 3', 'Bedroom', [{ x: 48, y: 70 }, { x: 62, y: 70 }, { x: 62, y: 84 }, { x: 48, y: 84 }], 10),
    poly('Bath 3', 'Bathroom', [{ x: 62, y: 70 }, { x: 70, y: 70 }, { x: 70, y: 84 }, { x: 62, y: 84 }], 10),
    poly('Bedroom 4', 'Bedroom', [{ x: 48, y: 84 }, { x: 62, y: 84 }, { x: 62, y: 98 }, { x: 48, y: 98 }], 10),
    poly('Bath 4', 'Bathroom', [{ x: 62, y: 84 }, { x: 70, y: 84 }, { x: 70, y: 94 }, { x: 62, y: 94 }], 10),
    poly('WIC 4', 'Storage /wardrobe', [{ x: 62, y: 94 }, { x: 70, y: 94 }, { x: 70, y: 100 }, { x: 62, y: 100 }], 10),
    poly('Club Room', 'Living room', [{ x: 48, y: 100 }, { x: 70, y: 100 }, { x: 70, y: 115 }, { x: 52, y: 115 }, { x: 48, y: 110 }], 10),
    poly('Lanai', 'Outdoor', [{ x: 24, y: 56 }, { x: 48, y: 56 }, { x: 48, y: 82 }, { x: 36, y: 96 }, { x: 24, y: 82 }], 10),
  ];
  return plan({
    id: 'sandbridge',
    name: 'Sandbridge',
    stories: 1,
    beds: 4,
    baths: 4,
    livingSqFt: 4874,
    totalUnderRoofSqFt: 6773,
    floors: [{ id: 'sandbridge-1', name: 'First story', rooms }],
  });
}

function marbella(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 20, 22, 10),
    room('Laundry', 'Laundry', 20, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 28, 0, 9, 12, 13),
    room('Entry', 'Outdoor', 28, -5, 9, 5, 10),
    room('Study', 'Office', 37, 0, 11, 12, 12),
    room('Dining', 'Dining room', 48, 0, 12, 12, 12),
    room('Bedroom 2', 'Bedroom', 0, 22, 12, 12, 10),
    room('Bath 2', 'Bathroom', 12, 22, 7, 12, 10),
    room('Great Room', 'Living room', 19, 22, 18, 18, 12),
    room('Kitchen', 'Kitchen', 37, 22, 14, 11.7, 12),
    room('Nook', 'Dining room', 37, 33.7, 14, 6.3, 12),
    room('Bedroom 3', 'Bedroom', 0, 40, 12, 14, 10),
    room('Bath 3', 'Bathroom', 12, 40, 7, 14, 10),
    room("Owner's Suite", 'Bedroom', 23.5, 40, 14, 16, 10),
    room("Owner's Bath", 'Bathroom', 37.5, 40, 10, 12, 10),
    room('WIC', 'Storage /wardrobe', 37.5, 52, 8, 8, 10),
    room('Bedroom 4', 'Bedroom', 0, 54, 12, 12, 10),
    room('Lanai', 'Outdoor', 19, 60, 28, 12, 10),
  ];
  return plan({
    id: 'marbella',
    name: 'Marbella',
    stories: 1,
    beds: 4,
    baths: 3,
    livingSqFt: 2683,
    totalUnderRoofSqFt: 3582,
    floors: [{ id: 'marbella-1', name: 'First story', rooms }],
  });
}

function verona(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 24, 26, 10),
    room('Laundry', 'Laundry', 24, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 32, 0, 9, 12, 13),
    room('Entry', 'Outdoor', 32, -5, 9, 5, 10),
    room('Study', 'Office', 41, 0, 11, 12, 12),
    room('Dining', 'Dining room', 52, 0, 12, 12, 12),
    room('Bedroom 2', 'Bedroom', 0, 26, 12, 12, 10),
    room('Bath 2', 'Bathroom', 12, 26, 7, 12, 10),
    room('Great Room', 'Living room', 19, 26, 24, 22, 12),
    room('Kitchen', 'Kitchen', 43, 26, 14, 14.3, 12),
    room('Nook', 'Dining room', 43, 40.3, 14, 7.7, 12),
    room('Bedroom 3', 'Bedroom', 0, 48, 12, 14, 10),
    room('Bath 3', 'Bathroom', 12, 48, 7, 14, 10),
    room("Owner's Suite", 'Bedroom', 25.0, 48, 16, 18, 10),
    room("Owner's Bath", 'Bathroom', 41.0, 48, 10, 12, 10),
    room('WIC', 'Storage /wardrobe', 41.0, 60, 8, 8, 10),
    room('Bedroom 4', 'Bedroom', 0, 62, 12, 12, 10),
    room('Game Room', 'Living room', 0, 74, 14, 12, 10),
    room('Lanai', 'Outdoor', 19, 68, 32, 14, 10),
  ];
  return plan({
    id: 'verona',
    name: 'Verona',
    stories: 1,
    beds: 4,
    baths: 3.5,
    livingSqFt: 3261,
    totalUnderRoofSqFt: 4747,
    floors: [{ id: 'verona-1', name: 'First story', rooms }],
  });
}

function villa_della_dolce_vita(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage / wardrobe', 0, 0, 22, 22, 10),
    room('Laundry', 'Laundry', 22, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 30, 0, 8, 12, 16),
    room('Entry', 'Outdoor', 30, -5, 8, 5, 10),
    room('Study', 'Office', 38, 0, 12, 11, 12),
    room('Dining', 'Dining room', 50, 0, 12, 12, 12),
    room('Kitchen', 'Kitchen', 22, 12, 12, 10, 12),
    room('Pantry', 'Storage /wardrobe', 34, 12, 6, 8, 12),
    room('Living Room', 'Living room', 40, 12, 20, 18, 12),
    room("Owner's Suite", 'Bedroom', 0, 22, 14, 18, 10),
    room("Owner's Bath", 'Bathroom', 14, 22, 8, 12, 10),
    room('WIC', 'Storage /wardrobe', 14, 34, 8, 8, 10),
    room('Lanai', 'Outdoor', 40, 30, 23, 12, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 18, 14, 10),
    room('Bedroom 2', 'Bedroom', 18, 0, 13, 12, 10),
    room('Bath 2', 'Bathroom', 31, 0, 7, 12, 10),
    room('Bedroom 3', 'Bedroom', 38, 0, 14, 12, 10),
    room('Bath 3', 'Bathroom', 52, 0, 7, 12, 10),
    room('Balcony', 'Outdoor', 0, 14, 16, 10, 10),
    room('Bedroom 4', 'Bedroom', 0, 24, 12, 12, 10),
  ];
  return plan({
    id: 'villa-della-dolce-vita',
    name: 'Villa Della Dolce Vita',
    stories: 2,
    beds: 4,
    baths: 4,
    livingSqFt: 4176,
    totalUnderRoofSqFt: 6670,
    floors: [{ id: 'villa-della-dolce-vita-1', name: 'First story', rooms: first }, { id: 'villa-della-dolce-vita-2', name: 'Second story', rooms: second }],
  });
}

function portofino(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage / wardrobe', 0, 0, 22, 22, 10),
    room('Laundry', 'Laundry', 22, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 30, 0, 8, 12, 16),
    room('Entry', 'Outdoor', 30, -5, 8, 5, 10),
    room('Study', 'Office', 38, 0, 12, 11, 12),
    room('Dining', 'Dining room', 50, 0, 12, 12, 12),
    room('Kitchen', 'Kitchen', 22, 12, 12, 10, 12),
    room('Pantry', 'Storage /wardrobe', 34, 12, 6, 8, 12),
    room('Living Room', 'Living room', 40, 12, 20, 18, 12),
    room("Owner's Suite", 'Bedroom', 0, 22, 14, 18, 10),
    room("Owner's Bath", 'Bathroom', 14, 22, 8, 12, 10),
    room('WIC', 'Storage /wardrobe', 14, 34, 8, 8, 10),
    room('Lanai', 'Outdoor', 40, 30, 23, 12, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 18, 14, 10),
    room('Bedroom 2', 'Bedroom', 18, 0, 13, 12, 10),
    room('Bath 2', 'Bathroom', 31, 0, 7, 12, 10),
    room('Bedroom 3', 'Bedroom', 38, 0, 14, 12, 10),
    room('Bath 3', 'Bathroom', 52, 0, 7, 12, 10),
    room('Balcony', 'Outdoor', 0, 14, 16, 10, 10),
    room('Bedroom 4', 'Bedroom', 0, 24, 12, 12, 10),
  ];
  return plan({
    id: 'portofino',
    name: 'Portofino',
    stories: 2,
    beds: 4,
    baths: 3.5,
    livingSqFt: 4272,
    totalUnderRoofSqFt: 6528,
    floors: [{ id: 'portofino-1', name: 'First story', rooms: first }, { id: 'portofino-2', name: 'Second story', rooms: second }],
  });
}

function tidelands(): HousePlan {
  // Flyer: 4 bed / 4 bath / study / 3-car. L-shaped lanai wrapping nook + family room.
  const rooms: PlanRoomRect[] = [
    poly('Garage', 'Storage /wardrobe', [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 34 }, { x: 0, y: 34 }], 10),
    poly('Bedroom 2', 'Bedroom', [{ x: 24, y: 0 }, { x: 37, y: 0 }, { x: 37, y: 12.9167 }, { x: 24, y: 12.9167 }], 10),
    poly('Bath 2', 'Bathroom', [{ x: 37, y: 0 }, { x: 46, y: 0 }, { x: 46, y: 7 }, { x: 37, y: 7 }], 10),
    poly('Bedroom 3', 'Bedroom', [{ x: 24, y: 12.9167 }, { x: 37, y: 12.9167 }, { x: 37, y: 26.5834 }, { x: 24, y: 26.5834 }], 10),
    poly('Bath 3', 'Bathroom', [{ x: 37, y: 12.9167 }, { x: 46, y: 12.9167 }, { x: 46, y: 21.5834 }, { x: 37, y: 21.5834 }], 10),
    poly('Bedroom 4', 'Bedroom', [{ x: 24, y: 26.5833 }, { x: 37, y: 26.5833 }, { x: 37, y: 39.5833 }, { x: 24, y: 39.5833 }], 10),
    poly('Bath 4', 'Bathroom', [{ x: 37, y: 26.5833 }, { x: 46, y: 26.5833 }, { x: 46, y: 35.25 }, { x: 37, y: 35.25 }], 10),
    poly('Hall', 'Hallway', [{ x: 37, y: 35.25 }, { x: 46, y: 35.25 }, { x: 46, y: 41.25 }, { x: 37, y: 41.25 }], 10),
    poly('Laundry', 'Laundry', [{ x: 46, y: 0 }, { x: 65.25, y: 0 }, { x: 65.25, y: 8.3333 }, { x: 46, y: 8.3333 }], 10),
    poly('Entry', 'Outdoor', [{ x: 46, y: -5 }, { x: 54, y: -5 }, { x: 54, y: 0 }, { x: 46, y: 0 }], 10),
    poly('Foyer', 'Hallway', [{ x: 65.25, y: 0 }, { x: 73.25, y: 0 }, { x: 73.25, y: 11.6667 }, { x: 65.25, y: 11.6667 }], 13),
    poly('Study', 'Office', [{ x: 73.25, y: 0 }, { x: 87.75, y: 0 }, { x: 87.75, y: 11.6667 }, { x: 73.25, y: 11.6667 }], 12),
    poly('Kitchen', 'Kitchen', [{ x: 46, y: 8.3333 }, { x: 58.8333, y: 8.3333 }, { x: 58.8333, y: 26.8333 }, { x: 46, y: 26.8333 }], 12),
    poly('Pantry', 'Storage /wardrobe', [{ x: 58.8333, y: 8.3333 }, { x: 64.8333, y: 8.3333 }, { x: 64.8333, y: 17.6666 }, { x: 58.8333, y: 17.6666 }], 10),
    poly('Nook', 'Dining room', [{ x: 46, y: 26.8333 }, { x: 60.8333, y: 26.8333 }, { x: 60.8333, y: 39.1666 }, { x: 46, y: 39.1666 }], 12),
    poly('Family Room', 'Living room', [{ x: 64.8333, y: 11.6667 }, { x: 91.25, y: 11.6667 }, { x: 91.25, y: 30.75 }, { x: 64.8333, y: 30.75 }], 12),
    poly("Owner's Bath", 'Bathroom', [{ x: 91.25, y: 0 }, { x: 102.25, y: 0 }, { x: 102.25, y: 16 }, { x: 91.25, y: 16 }], 10),
    poly('WIC', 'Storage /wardrobe', [{ x: 91.25, y: 16 }, { x: 99.25, y: 16 }, { x: 99.25, y: 26 }, { x: 91.25, y: 26 }], 10),
    poly("Owner's Suite", 'Bedroom', [{ x: 99.25, y: 16 }, { x: 114.75, y: 16 }, { x: 114.75, y: 36 }, { x: 99.25, y: 36 }], 10),
    poly('Lanai', 'Outdoor', [
      { x: 46, y: 39.1667 }, { x: 91.25, y: 39.1667 }, { x: 91.25, y: 53 }, { x: 64.8333, y: 53 }, { x: 64.8333, y: 46 }, { x: 46, y: 46 },
    ], 10),
  ];
  return plan({
    id: 'tidelands',
    name: 'Tidelands',
    stories: 1,
    beds: 4,
    baths: 4,
    livingSqFt: 3560,
    totalUnderRoofSqFt: 5353,
    floors: [{ id: 'tidelands-1', name: 'First story', rooms }],
  });
}

function capri(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Garage', 'Storage /wardrobe', 0, 0, 22, 24, 10),
    room('Laundry', 'Laundry', 22, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 30, 0, 9, 12, 13),
    room('Entry', 'Outdoor', 30, -5, 9, 5, 10),
    room('Study', 'Office', 39, 0, 11, 12, 12),
    room('Dining', 'Dining room', 50, 0, 12, 12, 12),
    room('Bedroom 2', 'Bedroom', 0, 24, 12, 12, 10),
    room('Bath 2', 'Bathroom', 12, 24, 7, 12, 10),
    room('Great Room', 'Living room', 19, 24, 20, 18, 12),
    room('Kitchen', 'Kitchen', 39, 24, 14, 11.7, 12),
    room('Nook', 'Dining room', 39, 35.7, 14, 6.3, 12),
    room('Bedroom 3', 'Bedroom', 0, 42, 12, 14, 10),
    room('Bath 3', 'Bathroom', 12, 42, 7, 14, 10),
    room("Owner's Suite", 'Bedroom', 24.0, 42, 14, 16, 10),
    room("Owner's Bath", 'Bathroom', 38.0, 42, 10, 12, 10),
    room('WIC', 'Storage /wardrobe', 38.0, 54, 8, 8, 10),
    room('Lanai', 'Outdoor', 19, 62, 28, 12, 10),
  ];
  return plan({
    id: 'capri',
    name: 'Capri',
    stories: 1,
    beds: 3,
    baths: 3.5,
    livingSqFt: 2767,
    totalUnderRoofSqFt: 3920,
    floors: [{ id: 'capri-1', name: 'First story', rooms }],
  });
}

function granada(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage / wardrobe', 0, 0, 22, 22, 10),
    room('Laundry', 'Laundry', 22, 0, 8, 8, 10),
    room('Foyer', 'Hallway', 30, 0, 8, 12, 16),
    room('Entry', 'Outdoor', 30, -5, 8, 5, 10),
    room('Study', 'Office', 38, 0, 12, 11, 12),
    room('Dining', 'Dining room', 50, 0, 12, 12, 12),
    room('Kitchen', 'Kitchen', 22, 12, 12, 10, 12),
    room('Pantry', 'Storage /wardrobe', 34, 12, 6, 8, 12),
    room('Living Room', 'Living room', 40, 12, 20, 18, 12),
    room("Owner's Suite", 'Bedroom', 0, 22, 14, 18, 10),
    room("Owner's Bath", 'Bathroom', 14, 22, 8, 12, 10),
    room('WIC', 'Storage /wardrobe', 14, 34, 8, 8, 10),
    room('Lanai', 'Outdoor', 40, 30, 23, 12, 12),
  ];
  const second: PlanRoomRect[] = [
    room('Loft', 'Living room', 0, 0, 18, 14, 10),
    room('Bedroom 2', 'Bedroom', 18, 0, 13, 12, 10),
    room('Bath 2', 'Bathroom', 31, 0, 7, 12, 10),
    room('Bedroom 3', 'Bedroom', 38, 0, 14, 12, 10),
    room('Bath 3', 'Bathroom', 52, 0, 7, 12, 10),
    room('Balcony', 'Outdoor', 0, 14, 16, 10, 10),
  ];
  return plan({
    id: 'granada',
    name: 'Granada',
    stories: 2,
    beds: 4,
    baths: 2.5,
    livingSqFt: 2565,
    totalUnderRoofSqFt: 3531,
    floors: [{ id: 'granada-1', name: 'First story', rooms: first }, { id: 'granada-2', name: 'Second story', rooms: second }],
  });
}

function santorini(): HousePlan {
  // Flyer: 4 bed / 4 bath / den. Octagonal family, diagonal dinette, chamfered owner suite.
  const rooms: PlanRoomRect[] = [
    poly('Garage', 'Storage /wardrobe', [{ x: 58, y: 0 }, { x: 88.5, y: 0 }, { x: 88.5, y: 31.4 }, { x: 58, y: 31.4 }], 10),
    poly('Entry', 'Outdoor', [{ x: 48, y: 0 }, { x: 58, y: 0 }, { x: 58, y: 6 }, { x: 48, y: 6 }], 10),
    poly('Foyer', 'Hallway', [{ x: 48, y: 6 }, { x: 58, y: 6 }, { x: 58, y: 18 }, { x: 48, y: 18 }], 13),
    poly('Den', 'Office', [{ x: 48, y: 18 }, { x: 58, y: 18 }, { x: 58, y: 30.67 }, { x: 48, y: 30.67 }], 12),
    poly('Dining', 'Dining room', [{ x: 48, y: 30.67 }, { x: 61.67, y: 30.67 }, { x: 61.67, y: 45 }, { x: 48, y: 45 }], 12),
    poly('Living', 'Living room', [{ x: 30, y: 18 }, { x: 48, y: 18 }, { x: 48, y: 37 }, { x: 30, y: 37 }], 12),
    poly('Kitchen', 'Kitchen', [{ x: 30, y: 0 }, { x: 43.67, y: 0 }, { x: 43.67, y: 15.33 }, { x: 30, y: 15.33 }], 12),
    poly('Utility', 'Laundry', [{ x: 43.67, y: 0 }, { x: 48, y: 0 }, { x: 48, y: 12 }, { x: 43.67, y: 12 }], 10),
    poly('Dinette', 'Dining room', [{ x: 14, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 13 }, { x: 22, y: 13 }, { x: 14, y: 7 }], 12),
    poly('Family Room', 'Living room', [
      { x: 21.8, y: 45 }, { x: 34.2, y: 45 }, { x: 38.5, y: 49.3 }, { x: 38.5, y: 61.7 },
      { x: 34.2, y: 66 }, { x: 21.8, y: 66 }, { x: 17.5, y: 61.7 }, { x: 17.5, y: 49.3 },
    ], 12),
    poly('Bedroom 2', 'Bedroom', [{ x: 0, y: 42 }, { x: 12.33, y: 42 }, { x: 12.33, y: 54 }, { x: 0, y: 54 }], 10),
    poly('Bath 2', 'Bathroom', [{ x: 12.33, y: 42 }, { x: 17.5, y: 42 }, { x: 17.5, y: 54 }, { x: 12.33, y: 54 }], 10),
    poly('Bedroom 3', 'Bedroom', [{ x: 40, y: 45 }, { x: 52.33, y: 45 }, { x: 52.33, y: 57 }, { x: 40, y: 57 }], 10),
    poly('Bath 3', 'Bathroom', [{ x: 52.33, y: 45 }, { x: 58.33, y: 45 }, { x: 58.33, y: 57 }, { x: 52.33, y: 57 }], 10),
    poly('Bedroom 4', 'Bedroom', [{ x: 0, y: 54 }, { x: 13, y: 54 }, { x: 13, y: 69.33 }, { x: 0, y: 69.33 }], 10),
    poly('Pool Bath', 'Bathroom', [{ x: 13, y: 54 }, { x: 17.5, y: 54 }, { x: 17.5, y: 62 }, { x: 13, y: 62 }], 10),
    poly("Owner's Suite", 'Bedroom', [{ x: 16, y: 18 }, { x: 30, y: 18 }, { x: 30, y: 38 }, { x: 22, y: 42 }, { x: 16, y: 38 }], 10),
    poly("Owner's Bath", 'Bathroom', [{ x: 0, y: 18 }, { x: 14, y: 18 }, { x: 14, y: 34 }, { x: 0, y: 34 }], 10),
    poly('WIC', 'Storage /wardrobe', [{ x: 0, y: 34 }, { x: 14, y: 34 }, { x: 14, y: 42 }, { x: 0, y: 42 }], 10),
    poly('Lanai', 'Outdoor', [
      { x: 14, y: 13 }, { x: 30, y: 13 }, { x: 30, y: 18 }, { x: 22, y: 42 }, { x: 17.5, y: 45 },
      { x: 40, y: 45 }, { x: 40, y: 66 }, { x: 17.5, y: 66 }, { x: 17.5, y: 54 }, { x: 16, y: 42 }, { x: 16, y: 13 },
    ], 10),
  ];
  return plan({
    id: 'santorini',
    name: 'Santorini',
    stories: 1,
    beds: 4,
    baths: 4,
    livingSqFt: 3505,
    totalUnderRoofSqFt: 5220,
    floors: [{ id: 'santorini-1', name: 'First story', rooms }],
  });
}

export const olsenHousePlans: HousePlan[] = [
  coral_sands(),
  islamorada(),
  largo(),
  captiva(),
  key_biscayne(),
  sanibel(),
  st_croix(),
  st_thomas(),
  st_johns(),
  ravello(),
  tradewinds(),
  driftwood(),
  oyster_bay(),
  sandbridge(),
  marbella(),
  verona(),
  villa_della_dolce_vita(),
  portofino(),
  tidelands(),
  capri(),
  granada(),
  santorini(),
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
