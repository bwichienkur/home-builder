import { describe, expect, it } from 'vitest';
import { catalog } from '../../components/catalog/catalogData';
import { complementCategories, complementaryProducts } from './complements';

describe('complementary products', () => {
  it('maps bedroom products toward lighting and storage', () => {
    expect(complementCategories('Bedroom')).toEqual(expect.arrayContaining(['Lighting', 'Storage']));
  });

  it('suggests other catalog items for bathroom tile in a bathroom', () => {
    const tile = catalog.find((i) => i.category === 'Tile' && i.roomTypes?.includes('Bathroom'));
    expect(tile).toBeTruthy();
    const suggestions = complementaryProducts(tile!, catalog, 'Bathroom', 4);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.id !== tile!.id)).toBe(true);
    expect(suggestions.some((s) => s.category === 'Plumbing' || s.category === 'Surfaces' || s.category === 'Trim')).toBe(true);
  });
});
