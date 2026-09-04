/** Parse architectural / decimal lengths to feet. */
export function parseArchitecturalLength(input: string): number | null {
  const raw = input.trim().toLowerCase().replace(/,/g, '');
  if (!raw) return null;

  // 12'-6" | 12' 6" | 12'6 | 12 ft 6 in
  const ftIn = raw.match(/^(-?\d+)\s*'\s*-?\s*(\d+(?:\.\d+)?)\s*"?$/);
  if (ftIn) {
    const ft = Number(ftIn[1]);
    const inches = Number(ftIn[2]);
    if (!Number.isFinite(ft) || !Number.isFinite(inches)) return null;
    return ft + (Math.sign(ft) || 1) * (inches / 12);
  }

  const ftOnly = raw.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)?$/);
  if (ftOnly && !raw.includes('"') && !/in/.test(raw)) {
    const n = Number(ftOnly[1]);
    return Number.isFinite(n) ? n : null;
  }

  // 12 6 → 12'-6"
  const spaced = raw.match(/^(-?\d+)\s+(\d+(?:\.\d+)?)$/);
  if (spaced) {
    const ft = Number(spaced[1]);
    const inches = Number(spaced[2]);
    return ft + (Math.sign(ft) || 1) * (inches / 12);
  }

  // inches only: 18" or 18 in
  const inchesOnly = raw.match(/^(-?\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (inchesOnly) {
    const n = Number(inchesOnly[1]);
    return Number.isFinite(n) ? n / 12 : null;
  }

  const plain = Number(raw);
  return Number.isFinite(plain) ? plain : null;
}

export function parseAngleDeg(input: string): number | null {
  const raw = input.trim().replace(/°/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Normalize to (-180, 180]
  let a = ((n % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
}

export function wallAngleDeg(w: { x1: number; y1: number; x2: number; y2: number }): number {
  return (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;
}
