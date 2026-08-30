/**
 * One-off Stillwater room-import benchmark (vitest).
 * Run: npx vitest run scripts/bench-stillwater-rooms.spec.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDxfHousePlan } from '../src/lib/housePlans/dxfImport';
import { importDxfDrawingPackage } from '../src/lib/housePlans/dxfDrawingImport';

function writeRoomSvg(
  path: string,
  rooms: { name: string; x: number; y: number; w: number; h: number }[],
) {
  if (!rooms.length) return;
  const xs = rooms.map((r) => r.x);
  const ys = rooms.map((r) => r.y);
  const x2 = rooms.map((r) => r.x + r.w);
  const y2 = rooms.map((r) => r.y + r.h);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanW = Math.max(...x2) - minX;
  const spanH = Math.max(...y2) - minY;
  const pad = 2;
  const W = spanW + pad * 2;
  const H = spanH + pad * 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#f1f5f9"/>`;
  svg += `<g transform="translate(${pad - minX} ${H + minY - pad}) scale(1,-1)">`;
  for (const r of rooms) {
    svg += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="rgba(217,168,106,0.45)" stroke="#92400e" stroke-width="0.15"/>`;
  }
  svg += `</g>`;
  for (const r of rooms) {
    const tx = r.x - minX + pad + r.w / 2;
    const ty = H - (r.y - minY + pad + r.h / 2);
    const label = r.name.replace(/&/g, '&amp;').slice(0, 20);
    svg += `<text x="${tx}" y="${ty}" text-anchor="middle" font-size="1.1" fill="#1e293b" font-family="sans-serif">${label}</text>`;
  }
  svg += `</svg>`;
  writeFileSync(path, svg);
}

describe('Stillwater connected-plan benchmark', () => {
  it(
    'imports a connected floor plate from MODEL.dxf',
    () => {
      const wallsPath = 'plans/source/183-stillwater/MODEL.walls.dxf';
      const fullPath = 'plans/source/183-stillwater/MODEL.dxf';
      expect(existsSync(wallsPath)).toBe(true);

      const wallResult = importDxfHousePlan(readFileSync(wallsPath, 'utf8'), 'Stillwater walls');
      const wallRooms = wallResult.plan.floors[0]!.rooms;
      writeRoomSvg('/tmp/stillwater-rooms-walls.svg', wallRooms);
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            mode: 'walls-only',
            rooms: wallRooms.length,
            livingSqFt: wallResult.plan.livingSqFt,
            names: wallRooms.map((r) => `${r.name} (${Math.round(r.w)}×${Math.round(r.h)})`),
            warnings: wallResult.warnings.filter((w) =>
              /Envelope|Detected|Wall segments|seal/i.test(w),
            ),
          },
          null,
          2,
        ),
      );

      expect(existsSync(fullPath)).toBe(true);
      const pkg = importDxfDrawingPackage(readFileSync(fullPath, 'utf8'), 'MODEL.dxf', 'Stillwater');
      const rooms = pkg.plan.floors[0]!.rooms;
      writeRoomSvg('/tmp/stillwater-rooms-full.svg', rooms);

      const living = pkg.plan.livingSqFt;
      const xs = rooms.map((r) => r.x);
      const ys = rooms.map((r) => r.y);
      const x2 = rooms.map((r) => r.x + r.w);
      const y2 = rooms.map((r) => r.y + r.h);
      const spanArea = (Math.max(...x2) - Math.min(...xs)) * (Math.max(...y2) - Math.min(...ys));
      const coverage = living / Math.max(1, spanArea);
      const names = rooms.map((r) => r.name.toUpperCase());
      const namedHits = ['GARAGE', 'KITCHEN', 'GREAT', 'BED', 'BATH', 'FOYER', 'LAUNDRY', 'MASTER', 'PANTRY', 'NOOK', 'LANAI'].filter(
        (k) => names.some((n) => n.includes(k)),
      );

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            mode: 'full-package',
            rooms: rooms.length,
            livingSqFt: living,
            coveragePct: Math.round(coverage * 100),
            namedHits,
            names: rooms.map((r) => `${r.name} (${Math.round(r.w)}×${Math.round(r.h)})`),
            warnings: pkg.package.warnings.filter((w) =>
              /Envelope|Detected|Wall segments|Cropped|seal/i.test(w),
            ),
          },
          null,
          2,
        ),
      );

      // Connected plate: many rooms + substantial coverage of the wall bbox.
      expect(rooms.length).toBeGreaterThanOrEqual(8);
      expect(coverage).toBeGreaterThan(0.33);
      expect(namedHits.length).toBeGreaterThanOrEqual(2);
    },
    300_000,
  );
});
