import { describe, expect, it } from 'vitest';
import { catalogCardImage } from './catalogCardImage';

describe('catalogCardImage', () => {
  it('uses the 3D albedo when the thumb is only a generic SVG', () => {
    expect(
      catalogCardImage({
        thumbnailUrl: '/catalog/thumbs/floor-wood.svg',
        textureUrl: '/catalog/floors/pbr/oak-color.jpg',
      }),
    ).toBe('/catalog/floors/pbr/oak-color.jpg');
  });

  it('prefers an official model screenshot over a texture swatch', () => {
    expect(
      catalogCardImage({
        previewUrl: 'https://example.com/chair.jpg',
        thumbnailUrl: '/catalog/thumbs/chair.svg',
        textureUrl: '/catalog/materials/pbr/oak/color.jpg',
      }),
    ).toBe('https://example.com/chair.jpg');
  });
});
