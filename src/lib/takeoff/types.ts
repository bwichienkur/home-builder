/** PDF-first plan takeoff models (PlanSwift-style). */

export type TakeoffPageKind = 'floor' | 'elevation' | 'section' | 'schedule' | 'cover' | 'other';

/** PlanSwift-style measure modes. */
export type TakeoffMeasureMode = 'linear' | 'area' | 'count';

export type TakeoffObjectKind = 'wall' | 'room' | 'door' | 'window' | 'fixture' | 'dimension';

export type TakeoffSource = 'manual' | 'ai' | 'vector';

export type TakeoffPointPx = { x: number; y: number };

export type TakeoffScale = {
  /** PDF page pixels (at render scale 1) per real-world foot. */
  pixelsPerFoot: number;
  /** Optional known length used for calibration (feet). */
  calibratedLengthFt?: number;
  /** Human-readable scale hint, e.g. 1/4" = 1'-0". */
  scaleHint?: string;
  calibratedAt?: string;
};

export type TakeoffPage = {
  id: string;
  pageIndex: number;
  name: string;
  widthPt: number;
  heightPt: number;
  kind?: TakeoffPageKind;
  scale?: TakeoffScale;
  /** Data URL thumbnail (small). */
  thumbUrl?: string;
};

/** Named takeoff row (worksheet item) — quantities accumulate as you digitize. */
export type TakeoffItem = {
  id: string;
  name: string;
  mode: TakeoffMeasureMode;
  color: string;
  /** How digitized geometry maps into CAD / object kind. */
  objectKind: TakeoffObjectKind;
  unit: 'lf' | 'sf' | 'ea';
};

export type TakeoffObject = {
  id: string;
  pageId: string;
  kind: TakeoffObjectKind;
  /** Worksheet item this digitization belongs to. */
  itemId?: string;
  measureMode?: TakeoffMeasureMode;
  /** Polyline / polygon / point in page pixel space (pdf.js viewport scale = 1). */
  points: TakeoffPointPx[];
  label?: string;
  /** Stroke color snapshot from item at digitize time. */
  color?: string;
  lengthFt?: number;
  areaSqFt?: number;
  /** For count mode — usually 1 per click. */
  count?: number;
  source: TakeoffSource;
  confidence?: number;
  createdAt: string;
};

export type TakeoffProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Object URL or public path to PDF bytes available in-browser. */
  pdfUrl: string;
  /** Original file name. */
  sourceFileName: string;
  pages: TakeoffPage[];
  /** PlanSwift-style takeoff items (linear / area / count). */
  items: TakeoffItem[];
  objects: TakeoffObject[];
  warnings: string[];
  /** Optional story height from elevation assist / user. */
  storyHeightFt?: number;
};

export type TakeoffTool =
  | 'select'
  | 'pan'
  | 'calibrate'
  | 'linear'
  | 'area'
  | 'count'
  /** @deprecated Prefer linear/area/count; kept for older drafts. */
  | 'wall'
  | 'room'
  | 'door'
  | 'window'
  | 'fixture';

export type AiClassifyResult = {
  pageKind: TakeoffPageKind;
  scaleHint?: string | null;
  confidence?: number;
  storyHeightFt?: number | null;
  notes?: string;
};
