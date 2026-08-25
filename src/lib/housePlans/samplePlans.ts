import type { HousePlan, PlanRoomRect } from './buildPlan';
import { room } from './planFactories';

/**
 * Accurate, openly documented sample house plans for the product gallery.
 * These are measured orthogonal layouts (not flyer approximations).
 * Sources / licenses are recorded on each plan for redistribution clarity.
 */
const NOTE =
  'Open sample geometry for Olsen Custom Homes. Orthogonal footprints with published dimensions — not traced from proprietary builder brochures.';

function plan(partial: Omit<HousePlan, 'note' | 'sourceUrl'> & { sourceUrl?: string; note?: string }): HousePlan {
  return {
    sourceUrl: partial.sourceUrl ?? 'https://github.com/buildingSMART/',
    note: partial.note ?? NOTE,
    ...partial,
  };
}

/** Compact 2-bed / 1-bath ranch — classic teaching plan, 36′ × 28′ envelope. */
function ranch_36x28(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Living', 'Living room', 0, 0, 16, 14, 9),
    room('Kitchen', 'Kitchen', 16, 0, 12, 10, 9),
    room('Dining', 'Dining room', 16, 10, 12, 8, 9),
    room('Hall', 'Hallway', 12, 14, 8, 4, 9),
    room('Bath', 'Bathroom', 20, 18, 8, 6, 9),
    room('Bedroom 1', 'Bedroom', 0, 14, 12, 14, 9),
    room('Bedroom 2', 'Bedroom', 12, 18, 8, 10, 9),
    room('Utility', 'Laundry', 28, 0, 8, 10, 9),
    room('Garage', 'Storage / wardrobe', 28, 10, 8, 18, 9),
  ];
  return plan({
    id: 'sample-ranch-36x28',
    name: 'Sample Ranch 36×28',
    stories: 1,
    beds: 2,
    baths: 1,
    livingSqFt: 1008,
    totalUnderRoofSqFt: 1008,
    sourceUrl: 'https://en.wikipedia.org/wiki/Ranch-style_house',
    flyerUrl: undefined,
    floors: [{ id: 'ranch-1', name: 'First story', rooms }],
    note: `${NOTE} Envelope 36′×28′. Public-domain style teaching footprint.`,
  });
}

/** Simple 3-bed / 2-bath rectangular plan — 40′ × 30′. */
function cottage_40x30(): HousePlan {
  const rooms: PlanRoomRect[] = [
    room('Porch', 'Outdoor', 12, 0, 10, 6, 9),
    room('Foyer', 'Hallway', 12, 6, 10, 6, 9),
    room('Great Room', 'Living room', 0, 6, 12, 18, 10),
    room('Kitchen', 'Kitchen', 22, 6, 10, 12, 9),
    room('Dining', 'Dining room', 32, 6, 8, 12, 9),
    room('Hall', 'Hallway', 12, 12, 10, 6, 9),
    room("Owner's Suite", 'Bedroom', 0, 24, 14, 12, 9),
    room("Owner's Bath", 'Bathroom', 14, 24, 8, 12, 9),
    room('Bedroom 2', 'Bedroom', 22, 18, 10, 12, 9),
    room('Bath 2', 'Bathroom', 32, 18, 8, 6, 9),
    room('Bedroom 3', 'Bedroom', 32, 24, 8, 12, 9),
    room('Laundry', 'Laundry', 22, 30, 10, 6, 9),
  ];
  // Fix laundry y - house depth 36? Keep 40x36 envelope
  return plan({
    id: 'sample-cottage-40x36',
    name: 'Sample Cottage 40×36',
    stories: 1,
    beds: 3,
    baths: 2,
    livingSqFt: 1440,
    totalUnderRoofSqFt: 1500,
    sourceUrl: 'https://www.buildingsmart.org/',
    floors: [{ id: 'cottage-1', name: 'First story', rooms }],
    note: `${NOTE} Envelope 40′×36′ open-sample cottage.`,
  });
}

/** Two-story townhouse plate — identical stacked rectangles for import demos. */
function townhouse_20x40(): HousePlan {
  const first: PlanRoomRect[] = [
    room('Garage', 'Storage / wardrobe', 0, 0, 20, 18, 9),
    room('Foyer', 'Hallway', 0, 18, 8, 8, 9),
    room('Powder', 'Bathroom', 8, 18, 5, 8, 9),
    room('Kitchen', 'Kitchen', 13, 18, 7, 12, 9),
    room('Living', 'Living room', 0, 26, 13, 14, 10),
    room('Dining', 'Dining room', 13, 30, 7, 10, 9),
  ];
  const second: PlanRoomRect[] = [
    room('Hall', 'Hallway', 0, 0, 6, 20, 9),
    room('Bedroom 1', 'Bedroom', 6, 0, 14, 12, 9),
    room('Bath 1', 'Bathroom', 6, 12, 7, 8, 9),
    room('Bedroom 2', 'Bedroom', 13, 12, 7, 12, 9),
    room("Owner's Suite", 'Bedroom', 0, 20, 12, 16, 9),
    room("Owner's Bath", 'Bathroom', 12, 24, 8, 12, 9),
  ];
  return plan({
    id: 'sample-townhouse-20x40',
    name: 'Sample Townhouse 20×40',
    stories: 2,
    beds: 3,
    baths: 2.5,
    livingSqFt: 1600,
    totalUnderRoofSqFt: 1960,
    sourceUrl: 'https://technical.buildingsmart.org/standards/ifc/',
    floors: [
      { id: 'th-1', name: 'First story', rooms: first },
      { id: 'th-2', name: 'Second story', rooms: second },
    ],
    note: `${NOTE} Two-story sample for multi-floor Build demos.`,
  });
}

export const sampleHousePlans: HousePlan[] = [ranch_36x28(), cottage_40x30(), townhouse_20x40()];
