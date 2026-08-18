const PHOTO = /\.(jpe?g|png|webp|avif)(\?|$)/i;

/**
 * Card image that matches what you see in 3D:
 * official model screenshot → photo thumb → PBR albedo (floors / millwork) → SVG fallback.
 */
export function catalogCardImage(item: {
  thumbnailUrl?: string;
  textureUrl?: string;
  previewUrl?: string;
}): string | undefined {
  if (item.previewUrl && PHOTO.test(item.previewUrl)) return item.previewUrl;
  if (item.thumbnailUrl && PHOTO.test(item.thumbnailUrl)) return item.thumbnailUrl;
  if (item.textureUrl) return item.textureUrl;
  return item.thumbnailUrl;
}
