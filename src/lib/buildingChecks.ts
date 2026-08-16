import type { FurnitureItem, SiteSetback, Wall } from '../types';

export type BuildingCheck = {
  id: string;
  severity: 'info' | 'warn';
  title: string;
  detail: string;
};

const FT = 0.3048;

/** Soft residential checks — advisory only, never blocks editing. */
export function evaluateBuildingChecks(input: {
  walls: Wall[];
  furniture: FurnitureItem[];
  siteSetback: SiteSetback;
  storyHeightM?: number;
}): BuildingCheck[] {
  const checks: BuildingCheck[] = [];
  const story = input.storyHeightM ?? input.walls[0]?.height ?? 2.7;

  for (const item of input.furniture.filter((f) => f.placementKind === 'stair')) {
    const rise = item.stair?.riseM ?? item.height ?? story;
    const run = item.stair?.runM ?? Math.max(0.5, item.depth - (item.stair?.landingM ?? 0));
    const steps = Math.max(1, item.stair?.steps ?? 12);
    const riser = rise / steps;
    const tread = run / steps;

    // Common IRC-ish soft targets (advisory): riser ≤ 7¾", tread ≥ 10"
    if (riser > 7.75 * 0.0254) {
      checks.push({
        id: `stair-riser-${item.id}`,
        severity: 'warn',
        title: 'Stair riser tall',
        detail: `${(riser / 0.0254).toFixed(1)}″ average riser — many codes cap near 7¾″. Lower rise or add steps.`,
      });
    }
    if (tread < 10 * 0.0254) {
      checks.push({
        id: `stair-tread-${item.id}`,
        severity: 'warn',
        title: 'Stair tread short',
        detail: `${(tread / 0.0254).toFixed(1)}″ average tread — many codes want ≥ 10″. Lengthen the run.`,
      });
    }
    if (item.width < 0.9) {
      checks.push({
        id: `stair-width-${item.id}`,
        severity: 'info',
        title: 'Narrow stair',
        detail: `Stair width ${(item.width / FT).toFixed(1)}′ — confirm clear width for your jurisdiction.`,
      });
    }
  }

  if (input.siteSetback.frontM < 3) {
    checks.push({
      id: 'setback-front',
      severity: 'info',
      title: 'Tight front setback',
      detail: `${input.siteSetback.frontM.toFixed(1)} m front setback — verify against local zoning.`,
    });
  }
  if (input.siteSetback.sideM < 1) {
    checks.push({
      id: 'setback-side',
      severity: 'warn',
      title: 'Side setback under 1 m',
      detail: 'Side yard looks tight for many single-family zones.',
    });
  }

  const exterior = input.walls.filter((w) => (w.assembly ?? 'interior') === 'exterior');
  if (input.walls.length && exterior.length === 0) {
    checks.push({
      id: 'no-exterior',
      severity: 'info',
      title: 'No exterior walls tagged',
      detail: 'Mark perimeter walls as Exterior for schedules and exports.',
    });
  }

  return checks.slice(0, 6);
}

export const WALL_ASSEMBLY_PRESETS: Record<
  'exterior' | 'interior' | 'party',
  { label: string; thicknessM: number; hint: string }
> = {
  exterior: { label: 'Exterior', thicknessM: 0.18, hint: '~7″ wood frame + sheathing' },
  interior: { label: 'Interior', thicknessM: 0.12, hint: '~5″ partition' },
  party: { label: 'Party', thicknessM: 0.25, hint: '~10″ demising / fire separation' },
};
