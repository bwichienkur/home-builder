import { describe, expect, it } from 'vitest';
import { catalog } from '../../components/catalog/catalogData';
import { complementCategories, complementaryProducts } from './complements';

describe('complementary products', () => {
  it('maps bedroom products toward lighting and storage', () => {
    expect(complementCategories('Bedroom')).toEqual(expect.arrayContaining(['Lighting', 'Storage']));
  });

  it('suggests other catalog items for a bed in a bedroom', () => {
    const bed = catalog.find((i) => i.id === 'queen-bed')!;
    const suggestions = complementaryProducts(bed, catalog, 'Bedroom', 4);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.id !== bed.id)).toBe(true);
    expect(suggestions.some((s) => s.category === 'Lighting' || s.category === 'Storage' || s.category === 'Decor')).toBe(true);
  });
});
