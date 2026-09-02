import { platformConfig } from '../platform/config';
import type { AiClassifyResult, TakeoffPageKind } from './types';

function apiBase() {
  return platformConfig.apiUrl.replace(/\/$/, '');
}

export type AiAssistTask = 'classify' | 'scale_hint' | 'elevation_heights';

export async function requestTakeoffAi(options: {
  task: AiAssistTask;
  imageBase64: string;
  mimeType?: string;
}): Promise<AiClassifyResult> {
  const response = await fetch(`${apiBase()}/api/takeoff/ai`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      task: options.task,
      imageBase64: options.imageBase64,
      mimeType: options.mimeType ?? 'image/png',
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    pageKind?: TakeoffPageKind;
    scaleHint?: string | null;
    confidence?: number;
    storyHeightFt?: number | null;
    notes?: string;
  };
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `AI assist failed (HTTP ${response.status}).`);
  }
  return {
    pageKind: body.pageKind ?? 'other',
    scaleHint: body.scaleHint,
    confidence: body.confidence,
    storyHeightFt: body.storyHeightFt,
    notes: body.notes,
  };
}
