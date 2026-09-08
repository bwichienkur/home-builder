import type { CadOpeningHintFt } from './types';

export type OpeningMarkLayout = {
  index: number;
  /** Opening midpoint (plan ft). */
  anchorX: number;
  anchorY: number;
  /** Label position in local opening frame (before scale(1,-1) text flip). */
  labelLocalX: number;
  labelLocalY: number;
  /** Whether to draw a short leader from midpoint to the label. */
  leader: boolean;
  visible: boolean;
};

type Box = { x: number; y: number; w: number; h: number };

function boxesOverlap(a: Box, b: Box, pad: number): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

/**
 * Place D/W/G marks so nearby openings don't stack into an illegible blob.
 * Offsets along the wall normal, then walks along the wall tangent on collision.
 * When zoomed far out, marks hide (schedule / select still work).
 */
export function layoutOpeningMarks(
  openings: Array<Pick<CadOpeningHintFt, 'x1' | 'y1' | 'x2' | 'y2' | 'mark' | 'kind'>>,
  opts?: {
    fontFt?: number;
    /** Plan-space view span (larger = more zoomed out). */
    viewSpanFt?: number;
    /** Hide all marks when view is wider than this (ft). */
    hideWhenWiderThanFt?: number;
  },
): OpeningMarkLayout[] {
  const fontFt = opts?.fontFt ?? 1;
  const viewSpan = opts?.viewSpanFt ?? 40;
  const hideWider = opts?.hideWhenWiderThanFt ?? 95;
  const showMarks = viewSpan <= hideWider;

  const charW = fontFt * 0.55;
  const placed: OpeningMarkLayout[] = [];
  const boxes: Box[] = [];

  openings.forEach((o, index) => {
    if (!o.mark || !showMarks) {
      placed.push({
        index,
        anchorX: (o.x1 + o.x2) / 2,
        anchorY: (o.y1 + o.y2) / 2,
        labelLocalX: 0,
        labelLocalY: -fontFt * 1.1,
        leader: false,
        visible: false,
      });
      return;
    }

    const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) || 1;
    const ux = (o.x2 - o.x1) / len;
    const uy = (o.y2 - o.y1) / len;
    const nx = -uy;
    const ny = ux;
    const mx = (o.x1 + o.x2) / 2;
    const my = (o.y1 + o.y2) / 2;
    const textW = Math.max(charW * 2, o.mark.length * charW);
    const textH = fontFt * 1.15;
    // Alternate default side so stacks split up/down.
    const side = index % 2 === 0 ? 1 : -1;
    const baseOff = fontFt * (1.35 + (index % 3) * 0.15);

    let localX = 0;
    let localY = -baseOff * side;
    let leader = false;
    let found = false;

    // Try normal offsets, then slide along the wall.
    for (let ring = 0; ring < 6 && !found; ring++) {
      const off = baseOff + ring * fontFt * 0.95;
      const candidates: Array<{ lx: number; ly: number; lead: boolean }> = [
        { lx: 0, ly: -off * side, lead: ring > 0 },
        { lx: 0, ly: off * side, lead: true },
        { lx: off * 0.85, ly: -off * 0.55 * side, lead: true },
        { lx: -off * 0.85, ly: -off * 0.55 * side, lead: true },
        { lx: (ring + 1) * fontFt * 1.1 * (index % 2 === 0 ? 1 : -1), ly: -off * side, lead: true },
      ];
      for (const c of candidates) {
        // Convert local (along ux / -ny screen after text flip) to plan for collision.
        // Label is drawn in translate(mx,my) scale(1,-1), so local +y is plan -y.
        const planX = mx + ux * c.lx - nx * c.ly;
        const planY = my + uy * c.lx - ny * c.ly;
        const box: Box = {
          x: planX - textW / 2,
          y: planY - textH / 2,
          w: textW,
          h: textH,
        };
        if (boxes.every((b) => !boxesOverlap(box, b, fontFt * 0.15))) {
          localX = c.lx;
          localY = c.ly;
          leader = c.lead;
          boxes.push(box);
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // Last resort: park farther out with a leader; still mark as visible for selected zoom.
      localX = (index % 5) * fontFt * 0.8;
      localY = -baseOff * side - fontFt * 2.2;
      leader = true;
      const planX = mx + ux * localX - nx * localY;
      const planY = my + uy * localX - ny * localY;
      boxes.push({
        x: planX - textW / 2,
        y: planY - textH / 2,
        w: textW,
        h: textH,
      });
    }

    placed.push({
      index,
      anchorX: mx,
      anchorY: my,
      labelLocalX: localX,
      labelLocalY: localY,
      leader,
      visible: true,
    });
  });

  return placed;
}
