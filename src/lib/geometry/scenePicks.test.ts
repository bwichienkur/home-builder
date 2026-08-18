import { describe, expect, it } from 'vitest';
import { preferInteriorPicks } from './scenePicks';

const hit = (flags: Record<string, boolean>) => ({ object: { userData: flags } });

describe('preferInteriorPicks', () => {
  it('lets a plan room floor win over wall pick proxies', () => {
    const hits = [hit({ wallCutawayPick: true }), hit({ roomPick: true })];
    const next = preferInteriorPicks(hits, { cameraMode: 'top', planWallTool: false, tool: 'select' });
    expect(next).toHaveLength(1);
    expect(next[0]?.object.userData?.roomPick).toBe(true);
  });

  it('keeps wall strips first while the Walls tool is armed', () => {
    const hits = [hit({ roomPick: true }), hit({ wallPlanPick: true })];
    const next = preferInteriorPicks(hits, { cameraMode: 'top', planWallTool: true, tool: 'select' });
    expect(next).toHaveLength(1);
    expect(next[0]?.object.userData?.wallPlanPick).toBe(true);
  });

  it('does not steal furniture clicks on the plan', () => {
    const hits = [hit({ furniturePick: true }), hit({ roomPick: true })];
    const next = preferInteriorPicks(hits, { cameraMode: 'top', planWallTool: false, tool: 'select' });
    expect(next[0]?.object.userData?.furniturePick).toBe(true);
  });
});
