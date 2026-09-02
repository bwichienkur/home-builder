import * as pdfjs from 'pdfjs-dist';
import type { TakeoffPage, TakeoffProject } from './types';
import { newId } from './geometry';

// Vite-friendly worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export type PdfLoadProgress = {
  stage: 'reading' | 'parsing' | 'thumbs' | 'done';
  page?: number;
  total?: number;
};

export async function loadPdfProject(
  file: File,
  onProgress?: (p: PdfLoadProgress) => void,
): Promise<TakeoffProject> {
  onProgress?.({ stage: 'reading' });
  const buffer = await file.arrayBuffer();
  onProgress?.({ stage: 'parsing' });
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(pdfBlob);

  const pages: TakeoffPage[] = [];
  const total = pdf.numPages;
  for (let i = 1; i <= total; i += 1) {
    onProgress?.({ stage: 'thumbs', page: i, total });
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const thumbVp = page.getViewport({ scale: 0.25 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(thumbVp.width);
    canvas.height = Math.ceil(thumbVp.height);
    const ctx = canvas.getContext('2d');
    let thumbUrl: string | undefined;
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport: thumbVp }).promise;
      thumbUrl = canvas.toDataURL('image/jpeg', 0.7);
    }
    pages.push({
      id: newId('page'),
      pageIndex: i - 1,
      name: `Page ${i}`,
      widthPt: base.width,
      heightPt: base.height,
      thumbUrl,
    });
  }

  onProgress?.({ stage: 'done', total });
  const now = new Date().toISOString();
  return {
    id: newId('takeoff'),
    name: file.name.replace(/\.pdf$/i, '') || 'Plan set',
    createdAt: now,
    updatedAt: now,
    pdfUrl,
    sourceFileName: file.name,
    pages,
    objects: [],
    warnings: [],
  };
}

/** Render a PDF page to canvas at the given CSS pixel scale relative to 72dpi pts. */
export async function renderPdfPageToCanvas(
  pdfUrl: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale = 1.25,
): Promise<{ width: number; height: number; scale: number }> {
  const pdf = await pdfjs.getDocument(pdfUrl).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { width: viewport.width, height: viewport.height, scale };
}

/** Capture current page as PNG data URL (for AI assist). */
export async function capturePagePng(
  pdfUrl: string,
  pageIndex: number,
  scale = 1,
): Promise<{ dataUrl: string; base64: string }> {
  const canvas = document.createElement('canvas');
  await renderPdfPageToCanvas(pdfUrl, pageIndex, canvas, scale);
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return { dataUrl, base64 };
}

export async function loadDemoStillwaterProject(
  onProgress?: (p: PdfLoadProgress) => void,
): Promise<TakeoffProject> {
  onProgress?.({ stage: 'reading' });
  const res = await fetch('/plan-sheets/stillwater-183/plan-set.pdf');
  if (!res.ok) throw new Error('Could not load Stillwater demo PDF.');
  const blob = await res.blob();
  const file = new File([blob], 'stillwater-183-plan-set.pdf', { type: 'application/pdf' });
  return loadPdfProject(file, onProgress);
}
