import { init, convertDwgToDxf, CDN_WASM_BASE } from 'dwgdxf';
import { importDxfDrawingPackage } from './dxfDrawingImport';
import type { DrawingImportResult, DrawingPackage } from './drawingPackage';

let wasmReady: Promise<void> | null = null;

async function ensureWasm() {
  if (!wasmReady) {
    wasmReady = init({ wasmBase: CDN_WASM_BASE }).then(() => undefined);
  }
  await wasmReady;
}

export type DrawingImportProgress = {
  stage: 'reading' | 'converting' | 'parsing' | 'done';
  detail?: string;
};

/**
 * Import a DWG or DXF (optional PDF plan set) into a room model + sheet package.
 * Runs entirely in the browser via dwgdxf WASM for DWG→DXF.
 */
export async function importDrawingFiles(
  files: { drawing?: File | null; pdf?: File | null },
  opts?: {
    planName?: string;
    onProgress?: (p: DrawingImportProgress) => void;
  },
): Promise<DrawingImportResult & { pdfBlob?: Blob }> {
  const drawing = files.drawing;
  if (!drawing) throw new Error('Choose a .dwg or .dxf file.');

  const onProgress = opts?.onProgress;
  onProgress?.({ stage: 'reading', detail: drawing.name });

  const lower = drawing.name.toLowerCase();
  let dxfText: string;

  if (lower.endsWith('.dxf')) {
    dxfText = await drawing.text();
  } else if (lower.endsWith('.dwg')) {
    onProgress?.({ stage: 'converting', detail: 'DWG → DXF' });
    await ensureWasm();
    const bytes = new Uint8Array(await drawing.arrayBuffer());
    const dxfBytes = await convertDwgToDxf(bytes);
    dxfText = new TextDecoder('utf-8', { fatal: false }).decode(dxfBytes);
  } else {
    throw new Error('Unsupported drawing type. Use .dwg or .dxf.');
  }

  onProgress?.({ stage: 'parsing', detail: 'Rooms + sheet previews' });
  const result = importDxfDrawingPackage(dxfText, drawing.name, opts?.planName);

  let pdfBlob: Blob | undefined;
  if (files.pdf) {
    pdfBlob = files.pdf;
    const pdfUrl = URL.createObjectURL(files.pdf);
    const withPdf: DrawingPackage = {
      ...result.package,
      pdfFileName: files.pdf.name,
      pdfUrl,
      sheetSource: result.package.sheets.length ? 'mixed' : 'pdf',
    };
    // If we have no DXF sheets, synthesize one entry pointing at the PDF.
    if (!withPdf.sheets.length) {
      withPdf.sheets = [
        {
          id: 'pdf-plan-set',
          name: 'Plan set (PDF)',
          order: 1,
          kind: 'other',
          pdfPageIndex: 0,
        },
      ];
    }
    onProgress?.({ stage: 'done' });
    return { ...result, package: withPdf, pdfBlob };
  }

  onProgress?.({ stage: 'done' });
  return result;
}
