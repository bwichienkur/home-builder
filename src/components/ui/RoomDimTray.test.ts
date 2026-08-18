import { describe, expect, it } from 'vitest';
import { shouldShowRoomDimTray, roomDimTrayMode } from './RoomDimTray';

describe('shouldShowRoomDimTray', () => {
  it('stays hidden when a room is only selected', () => {
    expect(
      shouldShowRoomDimTray({
        workflowStage: 'house',
        cameraMode: 'top',
        planWallTool: false,
        hasRoom: true,
      }),
    ).toBe(false);
  });

  it('shows W/D/H only while the Walls tool is armed on the plan', () => {
    expect(
      shouldShowRoomDimTray({
        workflowStage: 'house',
        cameraMode: 'top',
        planWallTool: true,
        hasRoom: true,
      }),
    ).toBe(true);
  });
});

describe('roomDimTrayMode', () => {
  it('uses envelope W/D/H for a four-sided room with no wall selected', () => {
    expect(roomDimTrayMode({ sideCount: 4, hasSelectedWall: false })).toBe('wdh');
  });

  it('prompts for L on polygons until a wall is tapped', () => {
    expect(roomDimTrayMode({ sideCount: 5, hasSelectedWall: false })).toBe('h-prompt');
    expect(roomDimTrayMode({ sideCount: 6, hasSelectedWall: false })).toBe('h-prompt');
  });

  it('switches to L/H when a wall is selected', () => {
    expect(roomDimTrayMode({ sideCount: 4, hasSelectedWall: true })).toBe('lh');
    expect(roomDimTrayMode({ sideCount: 5, hasSelectedWall: true })).toBe('lh');
  });
});
