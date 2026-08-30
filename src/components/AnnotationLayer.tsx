import { useCallback, useEffect, useRef } from "react";
import type { InkStroke, InkTool } from "../types";

export interface AnnotState {
  /** null = navigation (la couche laisse passer les événements). */
  tool: InkTool | null;
  color: string;
  /** Épaisseur de base en points PDF. */
  width: number;
  /** Corps du texte en points PDF (outil texte). */
  fontSize: number;
}

interface Props {
  cssWidth: number;
  cssHeight: number;
  /** Pixels CSS par point PDF. */
  scale: number;
  strokes: InkStroke[];
  annot: AnnotState;
  onAddStroke: (stroke: InkStroke) => void;
  onEraseStrokes: (ids: string[]) => void;
}

const ERASER_RADIUS_PT = 4;

function strokeWidthAt(base: number, pressure: number): number {
  return Math.max(0.35, base * (0.55 + 0.9 * pressure));
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  k: number,
) {
  const pts = stroke.points;
  if (pts.length === 0) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;

  if (stroke.tool === "highlighter") {
    ctx.globalAlpha = 0.38;
    ctx.globalCompositeOperation = "multiply";
    ctx.lineWidth = stroke.width * k;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  // Stylo : largeur variable selon la pression, courbes par points médians.
  if (pts.length === 1) {
    const [x, y, p] = pts[0];
    ctx.beginPath();
    ctx.fillStyle = stroke.color;
    ctx.arc(x * k, y * k, (strokeWidthAt(stroke.width, p) * k) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  for (let i = 1; i < pts.length; i++) {
    const [x0, y0, p0] = pts[i - 1];
    const [x1, y1, p1] = pts[i];
    const prev = i >= 2 ? pts[i - 2] : pts[i - 1];
    // Segment lissé : du milieu (précédent, courant-1) au milieu (courant-1, courant),
    // en passant par courant-1 comme point de contrôle.
    const m0x = (prev[0] + x0) / 2;
    const m0y = (prev[1] + y0) / 2;
    const m1x = (x0 + x1) / 2;
    const m1y = (y0 + y1) / 2;
    ctx.beginPath();
    ctx.lineWidth = strokeWidthAt(stroke.width, (p0 + p1) / 2) * k;
    ctx.moveTo(m0x * k, m0y * k);
    ctx.quadraticCurveTo(x0 * k, y0 * k, m1x * k, m1y * k);
    ctx.stroke();
  }
  // Dernier demi-segment jusqu'au point final.
  const [xa, ya] = pts[pts.length - 2];
  const [xb, yb, pb] = pts[pts.length - 1];
  ctx.beginPath();
  ctx.lineWidth = strokeWidthAt(stroke.width, pb) * k;
  ctx.moveTo(((xa + xb) / 2) * k, ((ya + yb) / 2) * k);
  ctx.lineTo(xb * k, yb * k);
  ctx.stroke();
}

function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

export function AnnotationLayer({
  cssWidth,
  cssHeight,
  scale,
  strokes,
  annot,
  onAddStroke,
  onEraseStrokes,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<InkStroke | null>(null);
  const erasingRef = useRef(false);

  const dpr = window.devicePixelRatio || 1;
  const deviceW = Math.round(cssWidth * dpr);
  const deviceH = Math.round(cssHeight * dpr);
  // Pixels du canvas par point PDF.
  const k = scale * dpr;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) drawStroke(ctx, stroke, k);
    if (liveRef.current) drawStroke(ctx, liveRef.current, k);
  }, [strokes, k]);

  useEffect(() => {
    redraw();
  }, [redraw, deviceW, deviceH]);

  const toPage = useCallback(
    (e: { clientX: number; clientY: number; pressure: number }) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      const p = e.pressure > 0 ? Math.min(e.pressure, 1) : 0.5;
      return [x, y, p] as [number, number, number];
    },
    [scale],
  );

  const eraseAt = useCallback(
    (x: number, y: number) => {
      const hit: string[] = [];
      for (const stroke of strokes) {
        const r = ERASER_RADIUS_PT + stroke.width / 2;
        const rSq = r * r;
        const pts = stroke.points;
        for (let i = 1; i < pts.length; i++) {
          if (
            distToSegmentSq(
              x,
              y,
              pts[i - 1][0],
              pts[i - 1][1],
              pts[i][0],
              pts[i][1],
            ) <= rSq
          ) {
            hit.push(stroke.id);
            break;
          }
        }
      }
      if (hit.length > 0) onEraseStrokes(hit);
    },
    [strokes, onEraseStrokes],
  );

  // Le dessin ne concerne que les outils d'encre ; la couche reste montée
  // sans outil actif tant qu'il y a des traits à afficher.
  const drawing =
    annot.tool === "pen" ||
    annot.tool === "highlighter" ||
    annot.tool === "eraser";
  if (!drawing && strokes.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={deviceW}
      height={deviceH}
      className="absolute inset-0"
      style={{
        width: cssWidth,
        height: cssHeight,
        touchAction: "none",
        pointerEvents: drawing ? "auto" : "none",
        cursor: annot.tool === "eraser" ? "cell" : "crosshair",
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (annot.tool === "eraser") {
          erasingRef.current = true;
          const [x, y] = toPage(e);
          eraseAt(x, y);
          return;
        }
        liveRef.current = {
          id: crypto.randomUUID(),
          tool: annot.tool as "pen" | "highlighter",
          color: annot.color,
          width: annot.width,
          points: [toPage(e)],
        };
        redraw();
      }}
      onPointerMove={(e) => {
        if (erasingRef.current) {
          const [x, y] = toPage(e);
          eraseAt(x, y);
          return;
        }
        const live = liveRef.current;
        if (!live) return;
        // Les événements coalescés restituent la trajectoire complète du stylet.
        const events =
          "getCoalescedEvents" in e.nativeEvent
            ? e.nativeEvent.getCoalescedEvents()
            : [e.nativeEvent];
        for (const ev of events.length > 0 ? events : [e.nativeEvent]) {
          live.points.push(toPage(ev));
        }
        redraw();
      }}
      onPointerUp={() => {
        if (erasingRef.current) {
          erasingRef.current = false;
          return;
        }
        const live = liveRef.current;
        liveRef.current = null;
        if (live && live.points.length >= 2) onAddStroke(live);
        else redraw();
      }}
      onPointerCancel={() => {
        erasingRef.current = false;
        liveRef.current = null;
        redraw();
      }}
    />
  );
}
