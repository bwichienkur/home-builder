import { useEffect, useRef, useState } from 'react';
import type { TakeoffObject, TakeoffPointPx, TakeoffTool } from '../../lib/takeoff';
import { renderPdfPageToCanvas } from '../../lib/takeoff';

type Props = {
  pdfUrl: string;
  pageIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
  objects: TakeoffObject[];
  draftPoints: TakeoffPointPx[];
  tool: TakeoffTool;
  onCanvasClick: (point: TakeoffPointPx, event: React.MouseEvent) => void;
  onCanvasDoubleClick?: () => void;
};

const RENDER_SCALE = 1.25;

const KIND_STROKE: Record<string, string> = {
  wall: '#1e405a',
  room: '#2f6f4e',
  door: '#b45309',
  window: '#0369a1',
  fixture: '#7c3aed',
  dimension: '#9a3412',
};

export function PdfTakeoffCanvas({
  pdfUrl,
  pageIndex,
  pageWidthPt,
  pageHeightPt,
  objects,
  draftPoints,
  tool,
  onCanvasClick,
  onCanvasDoubleClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderScale, setRenderScale] = useState(RENDER_SCALE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setReady(false);
    setError('');
    void renderPdfPageToCanvas(pdfUrl, pageIndex, canvas, RENDER_SCALE)
      .then((info) => {
        if (cancelled) return;
        setRenderScale(info.scale);
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not render PDF page.');
      });
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageIndex]);

  const width = pageWidthPt * renderScale;
  const height = pageHeightPt * renderScale;

  const toPagePx = (clientX: number, clientY: number, el: SVGSVGElement): TakeoffPointPx => {
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * pageWidthPt;
    const y = ((clientY - rect.top) / rect.height) * pageHeightPt;
    return { x, y };
  };

  return (
    <div className="takeoff-canvas-wrap">
      {error ? <p className="takeoff-error">{error}</p> : null}
      <canvas ref={canvasRef} style={{ opacity: ready ? 1 : 0.35 }} />
      <svg
        className="takeoff-overlay"
        viewBox={`0 0 ${pageWidthPt} ${pageHeightPt}`}
        width={width}
        height={height}
        style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
        onClick={(e) => {
          if (tool === 'pan' || tool === 'select') return;
          const pt = toPagePx(e.clientX, e.clientY, e.currentTarget);
          onCanvasClick(pt, e);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          onCanvasDoubleClick?.();
        }}
      >
        {objects.map((obj) => {
          if (obj.points.length < 1) return null;
          const stroke = KIND_STROKE[obj.kind] ?? '#334155';
          if (obj.kind === 'fixture') {
            const p = obj.points[0]!;
            return (
              <g key={obj.id}>
                <circle cx={p.x} cy={p.y} r={6} fill={stroke} opacity={0.85} />
              </g>
            );
          }
          if (obj.kind === 'room' && obj.points.length >= 3) {
            const d =
              obj.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + ' Z';
            return (
              <path
                key={obj.id}
                d={d}
                fill={stroke}
                fillOpacity={0.12}
                stroke={stroke}
                strokeWidth={2}
              />
            );
          }
          if (obj.points.length < 2) return null;
          const d = obj.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
          return (
            <path
              key={obj.id}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={obj.kind === 'door' || obj.kind === 'window' ? 3.5 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {draftPoints.length > 0 ? (
          <g>
            {draftPoints.length >= 2 ? (
              <path
                d={draftPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')}
                fill="none"
                stroke="#c2410c"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            ) : null}
            {draftPoints.map((p, i) => (
              <circle key={`d-${i}`} cx={p.x} cy={p.y} r={4} fill="#c2410c" />
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
