import * as pdfjs from 'pdfjs-dist';
import type { AiClassifyResult, TakeoffPageKind } from './types';

/**
 * Local (no API key) page classification from PDF text content.
 * Used when Claude/OpenAI are not configured so "AI classify" still does something useful.
 */
export async function classifyPageFromPdfText(
  pdfUrl: string,
  pageIndex: number,
): Promise<AiClassifyResult> {
  const pdf = await pdfjs.getDocument(pdfUrl).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  const text = content.items
    .map((it) => ('str' in it ? String(it.str) : ''))
    .join(' ')
    .toUpperCase();

  let pageKind: TakeoffPageKind = 'other';
  let confidence = 0.45;
  let notes = 'Classified from PDF text (local, no AI key).';

  if (/ELEVATION|FRONT ELEV|REAR ELEV|SIDE ELEV|LEFT ELEV|RIGHT ELEV/.test(text)) {
    pageKind = 'elevation';
    confidence = 0.8;
  } else if (/FOUNDATION|FOOTING|SLAB/.test(text)) {
    pageKind = 'floor';
    confidence = 0.7;
    notes = 'Looks like foundation/floor; treated as floor for takeoff.';
  } else if (/FLOOR PLAN|MASTER BEDROOM|GREAT ROOM|GARAGE|KITCHEN|LANAI/.test(text)) {
    pageKind = 'floor';
    confidence = 0.85;
  } else if (/SECTION|DETAIL/.test(text)) {
    pageKind = 'section';
    confidence = 0.7;
  } else if (/SCHEDULE|DOOR SCHED|WINDOW SCHED/.test(text)) {
    pageKind = 'schedule';
    confidence = 0.75;
  } else if (/COVER|INDEX OF DRAWINGS|CONSTRUCTION DOCUMENT/.test(text)) {
    pageKind = 'cover';
    confidence = 0.8;
  }

  const scaleMatch = text.match(/(\d\s*\/\s*\d|\d+)\s*"?\s*=\s*1\s*['′]/);
  const scaleHint = scaleMatch ? scaleMatch[0].replace(/\s+/g, '') : null;

  return { pageKind, scaleHint, confidence, storyHeightFt: null, notes };
}
