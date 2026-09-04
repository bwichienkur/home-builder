/** Map hour-of-day (6–18) to a sun position vector for CAD Studio lighting. */
export function sunPositionFromHour(hour: number, radius = 55): [number, number, number] {
  const h = Math.max(6, Math.min(18, hour));
  // 6am = east, noon = south-high, 6pm = west
  const t = (h - 6) / 12; // 0..1
  const az = -Math.PI / 2 + t * Math.PI; // -90° → +90°
  const elev = Math.sin(t * Math.PI) * 0.85 + 0.15; // higher at noon
  const y = radius * elev;
  const xz = radius * Math.sqrt(Math.max(0.05, 1 - elev * elev));
  return [Math.cos(az) * xz, y, Math.sin(az) * xz];
}
