import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankSelectionProject, useConfiguratorStore } from '../../store/configuratorStore';
import { PLATINUM_INCLUDED_LEVELS } from './contractTypes';

describe('contract COF / allowances editors', () => {
  beforeEach(() => {
    useConfiguratorStore.setState({
      role: 'admin',
      project: null,
      contract: null,
      remoteId: null,
      activeRoomFilter: null,
      shareToken: null,
      lastInviteUrl: null,
    });
    useConfiguratorStore.getState().loadProject(createBlankSelectionProject('Test COF Job', 'Test', 'Lot 1'));
  });

  it('updates included tiers and records a manual override', () => {
    const { setIncludedLevel } = useConfiguratorStore.getState();
    const kitchen = PLATINUM_INCLUDED_LEVELS.find((r) => r.pricingCategory === 'countertops-kitchen')!;
    setIncludedLevel({ ...kitchen, includedLevel: 'Level 3', label: 'Kitchen CT Level 3' });
    const project = useConfiguratorStore.getState().project!;
    expect(project.contract.includedLevels.find((r) => r.pricingCategory === 'countertops-kitchen')?.includedLevel).toBe(
      'Level 3',
    );
    expect(project.levelOverrides.some((o) => o.pricingCategory === 'countertops-kitchen' && o.source === 'manual')).toBe(
      true,
    );
  });

  it('adds and removes allowance lines for COF export', () => {
    const { upsertAllowance, removeAllowance } = useConfiguratorStore.getState();
    upsertAllowance({
      pricingCategory: 'outdoor-kitchen',
      label: 'Summer kitchen allowance',
      budgetAmount: 8500,
      priceUnit: 'allowance',
    });
    expect(useConfiguratorStore.getState().project!.allowances).toHaveLength(1);
    expect(useConfiguratorStore.getState().project!.allowances[0]!.budgetAmount).toBe(8500);
    removeAllowance(0);
    expect(useConfiguratorStore.getState().project!.allowances).toHaveLength(0);
  });

  it('resets included levels to Platinum defaults', () => {
    const { setIncludedLevel, resetIncludedLevelsToPlatinum } = useConfiguratorStore.getState();
    const floor = PLATINUM_INCLUDED_LEVELS.find((r) => r.pricingCategory === 'floor-tile')!;
    setIncludedLevel({ ...floor, includedLevel: 'Level 1' });
    resetIncludedLevelsToPlatinum();
    const project = useConfiguratorStore.getState().project!;
    expect(project.contract.includedLevels.find((r) => r.pricingCategory === 'floor-tile')?.includedLevel).toBe('Level 3');
    expect(project.levelOverrides.some((o) => o.source === 'manual')).toBe(false);
  });
});
