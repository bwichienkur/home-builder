import { describe, expect, it } from 'vitest';
import { addRoomPlanAction, planToolHint } from './planToolHint';

describe('planToolHint', () => {
  it('prompts to tap a wall while placing a window', () => {
    expect(planToolHint({ tool: 'window', pendingAttachMode: false, selectedRoomId: null })).toBe(
      'Tap a wall to place a window',
    );
  });

  it('prompts to select a room before adding', () => {
    expect(planToolHint({ tool: 'select', pendingAttachMode: true, selectedRoomId: null })).toBe(
      'Tap a room to add onto',
    );
  });

  it('prompts to tap a wall while adding a corner', () => {
    expect(planToolHint({ tool: 'corner', pendingAttachMode: false, selectedRoomId: 'r1' })).toBe(
      'Tap a wall to add a corner',
    );
    expect(planToolHint({ tool: 'corner', pendingAttachMode: false, selectedRoomId: null })).toBe(
      'Tap a room, then Corner',
    );
  });

  it('prompts a side once a host room is selected', () => {
    expect(planToolHint({ tool: 'select', pendingAttachMode: true, selectedRoomId: 'r1' })).toBe(
      'Tap a side of the room to add another',
    );
  });
});

describe('addRoomPlanAction', () => {
  it('auto-selects the only room', () => {
    expect(addRoomPlanAction({ selectedRoomId: null, onlyRoomId: 'solo', pendingAttachMode: false })).toEqual({
      selectId: 'solo',
      attach: true,
      prompt: false,
    });
  });

  it('prompts when several rooms exist and none is selected', () => {
    expect(addRoomPlanAction({ selectedRoomId: null, onlyRoomId: null, pendingAttachMode: false })).toEqual({
      selectId: null,
      attach: true,
      prompt: true,
    });
  });

  it('cancels attach mode when Add is toggled off', () => {
    expect(addRoomPlanAction({ selectedRoomId: 'r1', onlyRoomId: null, pendingAttachMode: true })).toEqual({
      selectId: 'r1',
      attach: false,
      prompt: false,
    });
  });
});
