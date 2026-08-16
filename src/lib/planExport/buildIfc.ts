import type { Opening, PlanRoomLabel, Point, UnitSystem, Wall } from '../../types';
import { PIXELS_PER_METER } from '../geometry/snapping';
import { wallLengthM } from './drawFloorPlan';

export type IfcExportInput = {
  name?: string;
  floorName?: string;
  walls: Wall[];
  openings: Opening[];
  planRooms: PlanRoomLabel[];
  unitSystem?: UnitSystem;
  /** When set, emit one IFCBUILDINGSTOREY per entry (multi-floor). */
  floors?: Array<{
    floorName: string;
    walls: Wall[];
    openings: Opening[];
    planRooms: PlanRoomLabel[];
    elevationM?: number;
  }>;
};

function boundsOf(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function gid() {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let out = '';
  for (let i = 0; i < 22; i++) out += alphabet[Math.floor(Math.random() * 64)]!;
  return out;
}

/**
 * Minimal IFC4 STEP export with walls, openings, and spaces in meters.
 * Sufficient for CAD/BIM tools to ingest axes + spaces from Mahnikka.
 */
export function buildPlanIfc(input: IfcExportInput): string {
  const wallPts = input.walls.flatMap((w) => [w.start, w.end]);
  const roomPts = input.planRooms.flatMap((r) => r.points);
  const b = boundsOf([...wallPts, ...roomPts]);
  const origin = { x: b.minX, y: b.minY };
  const toM = (p: Point) => ({
    x: (p.x - origin.x) / PIXELS_PER_METER,
    y: -((p.y - origin.y) / PIXELS_PER_METER),
  });

  let n = 1;
  const id = () => n++;
  const rows: string[] = [];
  const add = (body: string) => {
    const i = id();
    rows.push(`#${i}=${body}`);
    return i;
  };

  const person = add("IFCPERSON($,$,'Planner',$,$,$,$,$)");
  const org = add("IFCORGANIZATION($,'Mahnikka',$,$,$)");
  const app = add(`IFCAPPLICATION(#${org},'2.0','Mahnikka Planner','Mahnikka')`);
  const owner = add(`IFCOWNERHISTORY(#${app},$,.ADDED.,$,$,$,$,${Math.floor(Date.now() / 1000)})`);
  const metre = add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
  const units = add(`IFCUNITASSIGNMENT((#${metre}))`);
  const originPt = add('IFCCARTESIANPOINT((0.,0.,0.))');
  const dirZ = add('IFCDIRECTION((0.,0.,1.))');
  const dirX = add('IFCDIRECTION((1.,0.,0.))');
  const worldAxis = add(`IFCAXIS2PLACEMENT3D(#${originPt},#${dirZ},#${dirX})`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${worldAxis},$)`);
  const bodyCtx = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${ctx},$,.MODEL_VIEW.,$)`);
  const project = add(
    `IFCPROJECT('${gid()}',#${owner},'${esc(input.name || 'Project')}',$,$,$,$,(#${ctx}),#${units})`,
  );
  const sitePlace = add(`IFCLOCALPLACEMENT($,#${worldAxis})`);
  const site = add(`IFCSITE('${gid()}',#${owner},'Site',$,$,#${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`);
  const building = add(`IFCBUILDING('${gid()}',#${owner},'Building',$,$,#${sitePlace},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES('${gid()}',#${owner},$,$,#${project},(#${site}))`);
  add(`IFCRELAGGREGATES('${gid()}',#${owner},$,$,#${site},(#${building}))`);

  const levels =
    input.floors && input.floors.length
      ? input.floors
      : [
          {
            floorName: input.floorName || 'Level 1',
            walls: input.walls,
            openings: input.openings,
            planRooms: input.planRooms,
            elevationM: 0,
          },
        ];

  const storeyIds: number[] = [];
  for (let li = 0; li < levels.length; li++) {
    const level = levels[li]!;
    const elev = level.elevationM ?? li * 3;
    const elevPt = add(`IFCCARTESIANPOINT((0.,0.,${elev.toFixed(4)}))`);
    const elevAxis = add(`IFCAXIS2PLACEMENT3D(#${elevPt},#${dirZ},#${dirX})`);
    const elevPlace = add(`IFCLOCALPLACEMENT(#${sitePlace},#${elevAxis})`);
    const storey = add(
      `IFCBUILDINGSTOREY('${gid()}',#${owner},'${esc(level.floorName)}',$,$,#${elevPlace},$,$,.ELEMENT.,${elev.toFixed(4)})`,
    );
    storeyIds.push(storey);
    const contained: number[] = [];

    for (const wall of level.walls) {
      const a = toM(wall.start);
      const bPt = toM(wall.end);
      const len = Math.max(0.05, wallLengthM(wall));
      const ang = Math.atan2(bPt.y - a.y, bPt.x - a.x);
      const wallPt = add(`IFCCARTESIANPOINT((${a.x.toFixed(4)},${a.y.toFixed(4)},0.))`);
      const wallDir = add(`IFCDIRECTION((${Math.cos(ang).toFixed(6)},${Math.sin(ang).toFixed(6)},0.))`);
      const wallAxis = add(`IFCAXIS2PLACEMENT3D(#${wallPt},#${dirZ},#${wallDir})`);
      const wallPlace = add(`IFCLOCALPLACEMENT(#${elevPlace},#${wallAxis})`);
      const profile = add(
        `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${len.toFixed(4)},${(wall.thickness || 0.15).toFixed(4)})`,
      );
      const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${worldAxis},#${dirZ},${wall.height.toFixed(4)})`);
      const shape = add(`IFCSHAPEREPRESENTATION(#${bodyCtx},'Body','SweptSolid',(#${solid}))`);
      const rep = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`);
      const wallId = add(
        `IFCWALLSTANDARDCASE('${gid()}',#${owner},'${esc(wall.id)}',$,$,#${wallPlace},#${rep},$)`,
      );
      contained.push(wallId);

      for (const opening of level.openings.filter((o) => o.wallId === wall.id)) {
        const ox = (opening.offset - 0.5) * len;
        const openPt = add(`IFCCARTESIANPOINT((${ox.toFixed(4)},0.,${opening.sill.toFixed(4)}))`);
        const openAxis = add(`IFCAXIS2PLACEMENT3D(#${openPt},#${dirZ},#${dirX})`);
        const openPlace = add(`IFCLOCALPLACEMENT(#${wallPlace},#${openAxis})`);
        const openProf = add(
          `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${opening.width.toFixed(4)},${(wall.thickness || 0.15).toFixed(4)})`,
        );
        const openSolid = add(
          `IFCEXTRUDEDAREASOLID(#${openProf},#${worldAxis},#${dirZ},${opening.height.toFixed(4)})`,
        );
        const openShape = add(`IFCSHAPEREPRESENTATION(#${bodyCtx},'Body','SweptSolid',(#${openSolid}))`);
        const openRep = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${openShape}))`);
        const openId = add(
          `IFCOPENINGELEMENT('${gid()}',#${owner},'${esc(opening.id)}',$,$,#${openPlace},#${openRep},$)`,
        );
        add(`IFCRELVOIDSELEMENT('${gid()}',#${owner},$,$,#${wallId},#${openId})`);

        if (opening.type === 'door' || opening.type === 'window') {
          const typed =
            opening.type === 'door'
              ? add(
                  `IFCDOOR('${gid()}',#${owner},'${esc(opening.id)}',$,$,#${openPlace},#${openRep},$,$,$)`,
                )
              : add(
                  `IFCWINDOW('${gid()}',#${owner},'${esc(opening.id)}',$,$,#${openPlace},#${openRep},$,$,$)`,
                );
          contained.push(typed);
          add(`IFCRELFILLSELEMENT('${gid()}',#${owner},$,$,#${openId},#${typed})`);
        }
      }
    }

    // Floor slab for the storey footprint (axis-aligned bounds of rooms/walls).
    {
      const pts = [
        ...level.walls.flatMap((w) => [w.start, w.end]),
        ...level.planRooms.flatMap((r) => r.points),
      ];
      if (pts.length >= 2) {
        const xs = pts.map((p) => toM(p).x);
        const ys = pts.map((p) => toM(p).y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const w = Math.max(0.5, maxX - minX);
        const d = Math.max(0.5, maxY - minY);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const slabPt = add(`IFCCARTESIANPOINT((${cx.toFixed(4)},${cy.toFixed(4)},0.))`);
        const slabAxis = add(`IFCAXIS2PLACEMENT3D(#${slabPt},#${dirZ},#${dirX})`);
        const slabPlace = add(`IFCLOCALPLACEMENT(#${elevPlace},#${slabAxis})`);
        const slabProf = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${w.toFixed(4)},${d.toFixed(4)})`);
        const slabSolid = add(`IFCEXTRUDEDAREASOLID(#${slabProf},#${worldAxis},#${dirZ},0.2)`);
        const slabShape = add(`IFCSHAPEREPRESENTATION(#${bodyCtx},'Body','SweptSolid',(#${slabSolid}))`);
        const slabRep = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${slabShape}))`);
        const slabId = add(
          `IFCSLAB('${gid()}',#${owner},'${esc(level.floorName + ' slab')}',$,$,#${slabPlace},#${slabRep},$,.FLOOR.)`,
        );
        contained.push(slabId);
      }
    }

    for (const room of level.planRooms) {
      if (room.points.length < 3) continue;
      const height =
        level.walls.find((w) => w.height > 0)?.height ??
        level.walls[0]?.height ??
        2.7;
      const polyPts = room.points.map((p) => {
        const m = toM(p);
        return add(`IFCCARTESIANPOINT((${m.x.toFixed(4)},${m.y.toFixed(4)}))`);
      });
      // Close the polyline for IFCARBITRARYCLOSEDPROFILEDEF.
      const loopIds = [...polyPts, polyPts[0]!];
      const poly = add(`IFCPOLYLINE((${loopIds.map((i) => `#${i}`).join(',')}))`);
      const profile = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly})`);
      const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${worldAxis},#${dirZ},${height.toFixed(4)})`);
      const shape = add(`IFCSHAPEREPRESENTATION(#${bodyCtx},'Body','SweptSolid',(#${solid}))`);
      const rep = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`);
      const spaceId = add(
        `IFCSPACE('${gid()}',#${owner},'${esc(room.name)}',$,$,#${elevPlace},#${rep},$,.ELEMENT.,.INTERNAL.,$)`,
      );
      contained.push(spaceId);
    }

    if (contained.length) {
      add(
        `IFCRELCONTAINEDINSPATIALSTRUCTURE('${gid()}',#${owner},$,$,(${contained.map((c) => `#${c}`).join(',')}),#${storey})`,
      );
    }
  }

  add(`IFCRELAGGREGATES('${gid()}',#${owner},$,$,#${building},(${storeyIds.map((s) => `#${s}`).join(',')}))`);

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('${esc(input.name || 'plan')}.ifc','${new Date().toISOString()}',('Mahnikka'),('Mahnikka'),'Mahnikka Planner','Mahnikka Planner','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...rows.map((r) => `${r};`),
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');
}

export function downloadPlanIfc(input: IfcExportInput, filename: string) {
  const blob = new Blob([buildPlanIfc(input)], { type: 'application/x-step' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Lightweight IFC inspection / partial read for import UX. */
export function inspectIfc(text: string): { ok: boolean; message: string; spaces?: string[]; walls?: number } {
  if (text.length > 40_000_000) {
    return { ok: false, message: 'IFC file is too large to inspect in the browser (>40 MB).' };
  }
  if (!/ISO-10303-21/i.test(text) && !/FILE_SCHEMA\s*\(\s*\('IFC/i.test(text)) {
    return { ok: false, message: 'File does not look like an IFC STEP exchange file.' };
  }
  const spaces = [...text.matchAll(/IFCSPACE\([^,]*,[^,]*,'([^']*)'/gi)].map((m) => m[1]!).filter(Boolean);
  const walls = (text.match(/IFCWALL/gi) || []).length;
  const doors = (text.match(/IFCDOOR/gi) || []).length;
  const windows = (text.match(/IFCWINDOW/gi) || []).length;
  return {
    ok: true,
    message: `IFC inspected — ${walls} wall${walls === 1 ? '' : 's'}, ${doors} door${doors === 1 ? '' : 's'}, ${windows} window${
      windows === 1 ? '' : 's'
    }, ${spaces.length} space${spaces.length === 1 ? '' : 's'}${
      spaces.length ? ` (${spaces.slice(0, 6).join(', ')})` : ''
    }. Geometry import isn’t available yet — use DXF/JSON for editable rooms, or export IFC4 from Build.`,
    spaces,
    walls,
  };
}
