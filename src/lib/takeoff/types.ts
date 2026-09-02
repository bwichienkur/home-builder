/** PDF-first plan takeoff models (PlanSwift-style). */

export type TakeoffPageKind = 'floor' | 'elevation' | 'section' | 'schedule' | 'cover' | 'other';

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

export type TakeoffObject = {
  id: string;
  pageId: string;
  kind: TakeoffObjectKind;
  /** Polyline in page pixel space (pdf.js viewport scale = 1 → CSS px at 72dpi * device). */
  points: TakeoffPointPx[];
  label?: string;
  lengthFt?: number;
  areaSqFt?: number;
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
  objects: TakeoffObject[];
  warnings: string[];
  /** Optional story height from elevation assist / user. */
  storyHeightFt?: number;
};

export type TakeoffTool =
  | 'select'
  | 'pan'
  | 'calibrate'
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
