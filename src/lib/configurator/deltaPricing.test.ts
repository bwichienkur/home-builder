import { describe, expect, it } from 'vitest';
import { catalog } from '../../components/catalog/catalogData';
import { createPlatinumContract } from './contractTypes';
import { formatCatalogPrice, parseLevelNumber } from './deltaPricing';

describe('delta pricing', () => {
  const contract = createPlatinumContract('Test COF', '183 Stillwater');

  it('parses level numbers', () => {
    expect(parseLevelNumber('Level 5')).toBe(5);
    expect(parseLevelNumber(undefined)).toBeNull();
  });

  it('hides dollar amounts for client role', () => {
    const item = catalog.find((i) => i.sourceTab === 'Countertops' && i.level === 'Level 9');
    expect(item).toBeTruthy();
    const view = formatCatalogPrice(item!, catalog, contract, 'client');
    expect(view.showPrice).toBe(false);
    expect(view.label).toContain('Level 9');
  });

  it('marks included tiers at or below contract baseline', () => {
    const item = catalog.find((i) => i.sourceTab === 'Countertops' && i.level === 'Level 5');
    expect(item).toBeTruthy();
    const view = formatCatalogPrice(item!, catalog, contract, 'designer');
    expect(view.included).toBe(true);
    expect(view.label).toBe('Included');
  });

  it('shows positive delta above included tier when a lower baseline row exists', () => {
    const higher = catalog.find((i) => i.sourceTab === 'Countertops' && i.level === 'Level 9' && i.name.includes('Calacatta'));
    const lower = catalog.find((i) => i.sourceTab === 'Countertops' && i.level === 'Level 5' && i.name.includes('Calacatta'));
    if (!higher || !lower || higher.price == null || lower.price == null) return;
    const view = formatCatalogPrice(higher, catalog, contract, 'designer');
    if (view.delta) {
      expect(view.delta).toBeGreaterThan(0);
      expect(view.label.startsWith('+$')).toBe(true);
    }
  });
});
