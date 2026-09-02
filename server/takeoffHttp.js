/**
 * Optional Claude / GPT assist for Plan Takeoff.
 * Keys: ANTHROPIC_API_KEY or OPENAI_API_KEY (server only).
 */
import { readJsonBodySync } from '../buildertrend/vercelRefresh.js';
import { saveTakeoffProject, loadTakeoffProject } from '../takeoffStore.js';

const CLASSIFY_SCHEMA_HINT = `Return JSON only with keys:
pageKind: one of floor|elevation|section|schedule|cover|other
scaleHint: string or null (e.g. 1/4" = 1'-0")
confidence: number 0-1
storyHeightFt: number or null (for elevations)
notes: short string`;

function pickProvider() {
  if (String(process.env.ANTHROPIC_API_KEY || '').trim()) return 'anthropic';
  if (String(process.env.OPENAI_API_KEY || '').trim()) return 'openai';
  return null;
}

async function callAnthropic({ imageBase64, mimeType, task }) {
  const key = process.env.ANTHROPIC_API_KEY;
  const prompt =
    task === 'elevation_heights'
      ? `This is a building elevation sheet. Infer plate/story height in feet if labeled. ${CLASSIFY_SCHEMA_HINT}`
      : task === 'scale_hint'
        ? `Find the drawing scale in the title block if visible. ${CLASSIFY_SCHEMA_HINT}`
        : `Classify this construction plan sheet. ${CLASSIFY_SCHEMA_HINT}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_TAKEOFF_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType || 'image/png', data: imageBase64 },
            },
          ],
        },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data?.error?.message || `Anthropic HTTP ${response.status}`), {
      status: response.status,
    });
  }
  const text = Array.isArray(data.content)
    ? data.content.map((c) => c.text || '').join('\n')
    : '';
  return parseModelJson(text);
}

async function callOpenAi({ imageBase64, mimeType, task }) {
  const key = process.env.OPENAI_API_KEY;
  const prompt =
    task === 'elevation_heights'
      ? `This is a building elevation sheet. Infer plate/story height in feet if labeled. ${CLASSIFY_SCHEMA_HINT}`
      : task === 'scale_hint'
        ? `Find the drawing scale in the title block if visible. ${CLASSIFY_SCHEMA_HINT}`
        : `Classify this construction plan sheet. ${CLASSIFY_SCHEMA_HINT}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TAKEOFF_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You assist residential plan takeoff. Reply with JSON only.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType || 'image/png'};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data?.error?.message || `OpenAI HTTP ${response.status}`), {
      status: response.status,
    });
  }
  const text = data.choices?.[0]?.message?.content || '';
  return parseModelJson(text);
}

function parseModelJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw Object.assign(new Error('Model returned non-JSON. Try again.'), { status: 502 });
  }
  const kinds = new Set(['floor', 'elevation', 'section', 'schedule', 'cover', 'other']);
  const pageKind = kinds.has(parsed.pageKind) ? parsed.pageKind : 'other';
  return {
    pageKind,
    scaleHint: typeof parsed.scaleHint === 'string' ? parsed.scaleHint : null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
    storyHeightFt: typeof parsed.storyHeightFt === 'number' ? parsed.storyHeightFt : null,
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
  };
}

export async function handleTakeoffAi(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST.' });
  }
  const provider = pickProvider();
  if (!provider) {
    return res.status(503).json({
      ok: false,
      error:
        'AI assist is not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY on the server (Vercel env).',
      code: 'ai_not_configured',
    });
  }
  try {
    const body = readJsonBodySync(req);
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const task = typeof body?.task === 'string' ? body.task : 'classify';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/png';
    if (!imageBase64) {
      return res.status(400).json({ ok: false, error: 'imageBase64 is required.', code: 'bad_body' });
    }
    const result =
      provider === 'anthropic'
        ? await callAnthropic({ imageBase64, mimeType, task })
        : await callOpenAi({ imageBase64, mimeType, task });
    return res.status(200).json({ ok: true, provider, ...result });
  } catch (err) {
    const status = Number(err?.status) || 500;
    return res.status(status).json({
      ok: false,
      error: err?.message || 'AI assist failed',
      code: 'ai_failed',
    });
  }
}

export async function handleTakeoffProject(req, res) {
  try {
    if (req.method === 'GET') {
      const id = String(req.query?.id || req.query?.__id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      const { payload, backend } = await loadTakeoffProject(id);
      if (!payload) return res.status(404).json({ ok: false, error: 'Not found', backend });
      return res.json({ ok: true, backend, project: payload });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = readJsonBodySync(req);
      const project = body?.project;
      if (!project?.id) return res.status(400).json({ ok: false, error: 'project.id required' });
      // Drop pdf blob URLs — client must keep local file; store metadata + objects only.
      const toStore = {
        ...project,
        pdfUrl: project.pdfUrl?.startsWith('blob:') ? '' : project.pdfUrl,
        updatedAt: new Date().toISOString(),
      };
      const result = await saveTakeoffProject(project.id, toStore);
      return res.json({ ok: true, ...result, id: project.id });
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'Takeoff project failed' });
  }
}

export function mountTakeoffRoutes(app) {
  app.all('/api/takeoff/ai', (req, res) => void handleTakeoffAi(req, res));
  app.all('/api/takeoff/project', (req, res) => void handleTakeoffProject(req, res));
}
