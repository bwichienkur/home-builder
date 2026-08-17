import { describe, expect, it } from 'vitest';
import { shouldShowRoomDimTray } from './RoomDimTray';

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
