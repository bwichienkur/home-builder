import type { CadPlate, CadStory } from './types';

export type { CadStory };

let storySeq = 0;
function nextStoryId(): string {
  storySeq += 1;
  return `story-${storySeq.toString(36)}`;
}

/** Ensure plate has at least Level 1 at elevation 0. */
export function ensureDefaultStories(plate: CadPlate): CadPlate {
  if (plate.stories && plate.stories.length > 0) {
    if (plate.activeStoryId && plate.stories.some((s) => s.id === plate.activeStoryId)) {
      return plate;
    }
    const active = plate.stories.find((s) => s.active) ?? plate.stories[0]!;
    return {
      ...plate,
      activeStoryId: active.id,
      stories: plate.stories.map((s) => ({ ...s, active: s.id === active.id })),
    };
  }
  const level1: CadStory = {
    id: nextStoryId(),
    name: 'Level 1',
    levelFt: 0,
    active: true,
  };
  return { ...plate, stories: [level1], activeStoryId: level1.id };
}

/** Set the active story by id. */
export function setActiveStory(plate: CadPlate, storyId: string): CadPlate {
  const withDefaults = ensureDefaultStories(plate);
  if (!withDefaults.stories?.some((s) => s.id === storyId)) return withDefaults;
  return {
    ...withDefaults,
    activeStoryId: storyId,
    stories: withDefaults.stories!.map((s) => ({ ...s, active: s.id === storyId })),
  };
}

/** Append a story and leave the previous active story unchanged. */
export function addStory(plate: CadPlate, name: string, levelFt: number): CadPlate {
  const withDefaults = ensureDefaultStories(plate);
  const story: CadStory = {
    id: nextStoryId(),
    name,
    levelFt,
    active: false,
  };
  return {
    ...withDefaults,
    stories: [...(withDefaults.stories ?? []), story],
  };
}
