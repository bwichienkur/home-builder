import { useMemo } from 'react';
import type { PlanRoomLabel, Point, Wall } from '../../types';

type FloorPlate = {
  id: string;
  name: string;
  walls: Wall[];
  planRooms: PlanRoomLabel[];
};

function boundsOf(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Compact top-down SVG of one story for the multi-floor overview. */
export function FloorPlateThumb({
  floor,
  active,
  onSelect,
}: {
  floor: FloorPlate;
  active?: boolean;
  onSelect: () => void;
}) {
  const { paths, labels, viewBox } = useMemo(() => {
    const wallPts = floor.walls.flatMap((w) => [w.start, w.end]);
    const roomPts = floor.planRooms.flatMap((r) => r.points);
    const b = boundsOf([...wallPts, ...roomPts]);
    const pad = 40;
    const w = Math.max(120, b.maxX - b.minX + pad * 2);
    const h = Math.max(120, b.maxY - b.minY + pad * 2);
    const paths = floor.walls.map((wall) => {
      const x1 = wall.start.x - b.minX + pad;
      const y1 = wall.start.y - b.minY + pad;
      const x2 = wall.end.x - b.minX + pad;
      const y2 = wall.end.y - b.minY + pad;
      return `M${x1} ${y1} L${x2} ${y2}`;
    });
    const labels = floor.planRooms.map((r) => {
      const cx = r.points.reduce((s, p) => s + p.x, 0) / (r.points.length || 1);
      const cy = r.points.reduce((s, p) => s + p.y, 0) / (r.points.length || 1);
      return {
        id: r.id,
        name: r.name,
        x: cx - b.minX + pad,
        y: cy - b.minY + pad,
      };
    });
    return { paths, labels, viewBox: `0 0 ${w} ${h}` };
  }, [floor]);

  const empty = !floor.walls.length && !floor.planRooms.length;

  return (
    <button
      type="button"
      className={`story-plate${active ? ' is-active' : ''}${empty ? ' is-empty' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="story-plate-label">{floor.name}</span>
      {empty ? (
        <span className="story-plate-empty">Empty story · tap to edit</span>
      ) : (
        <svg viewBox={viewBox} className="story-plate-svg" aria-hidden="true">
          {paths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="square" />
          ))}
          {labels.map((l) => (
            <text key={l.id} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize={28} fill="currentColor">
              {l.name}
            </text>
          ))}
        </svg>
      )}
    </button>
  );
}
