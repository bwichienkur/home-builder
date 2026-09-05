/** Display fidelity presets for CAD Studio 3D (Plan7-style “how 3D”). */

export type CadDisplayFidelity =
  | 'sketch'
  | 'massing'
  | 'dollhouse'
  | 'presentation'
  | 'photoreal';

export type CadDisplayFidelityConfig = {
  id: CadDisplayFidelity;
  label: string;
  hint: string;
  /** Prefer massing shell over live extrude. */
  preferMassing: boolean;
  /** Soften / ghost upper walls and hide roof for dollhouse cutaway. */
  dollhouseCutaway: boolean;
  shadows: boolean;
  /** Richer paint / bump materials. */
  realisticMaterials: boolean;
  /** Site lawn / drive / context props. */
  siteContext: boolean;
  /** Stronger HDRI / sky. */
  richEnvironment: boolean;
  /** Default sun hour when switching into this preset. */
  sunHour: number;
};

export const CAD_DISPLAY_FIDELITY: CadDisplayFidelityConfig[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    hint: 'Clay volumes · fast edit',
    preferMassing: false,
    dollhouseCutaway: false,
    shadows: false,
    realisticMaterials: false,
    siteContext: false,
    richEnvironment: false,
    sunHour: 14,
  },
  {
    id: 'massing',
    label: 'Massing',
    hint: 'Solid form · roof profile',
    preferMassing: true,
    dollhouseCutaway: false,
    shadows: true,
    realisticMaterials: false,
    siteContext: false,
    richEnvironment: false,
    sunHour: 14,
  },
  {
    id: 'dollhouse',
    label: 'Dollhouse',
    hint: 'Cutaway interiors',
    preferMassing: false,
    dollhouseCutaway: true,
    shadows: true,
    realisticMaterials: true,
    siteContext: false,
    richEnvironment: false,
    sunHour: 11,
  },
  {
    id: 'presentation',
    label: 'Presentation',
    hint: 'Site + materials',
    preferMassing: false,
    dollhouseCutaway: false,
    shadows: true,
    realisticMaterials: true,
    siteContext: true,
    richEnvironment: true,
    sunHour: 15,
  },
  {
    id: 'photoreal',
    label: 'Photoreal',
    hint: 'HDRI · glass · entourage',
    preferMassing: false,
    dollhouseCutaway: false,
    shadows: true,
    realisticMaterials: true,
    siteContext: true,
    richEnvironment: true,
    sunHour: 16,
  },
];

export function displayFidelityConfig(id: CadDisplayFidelity): CadDisplayFidelityConfig {
  return CAD_DISPLAY_FIDELITY.find((f) => f.id === id) ?? CAD_DISPLAY_FIDELITY[0]!;
}
