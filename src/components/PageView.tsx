import { useEffect, useRef, useState } from "react";
import { renderPage } from "../lib/api";
import type { InkStroke, TextNote } from "../types";
import { AnnotationLayer, type AnnotState } from "./AnnotationLayer";
import { ImageLayer, type ImageTarget } from "./ImageLayer";
import { TextNoteLayer } from "./TextNoteLayer";

interface Props {
  docId: number;
  pageIndex: number;
  top: number;
  left: number;
  width: number;
  height: number;
  /** Pixels CSS par point PDF. */
  scale: number;
  /** Incrémenté à chaque enregistrement : force un nouveau rendu. */
  rev: number;
  strokes: InkStroke[];
  notes: TextNote[];
  annot: AnnotState;
  onAddStroke: (pageIndex: number, stroke: InkStroke) => void;
  onEraseStrokes: (pageIndex: number, ids: string[]) => void;
  onCreateNote: (pageIndex: number, note: TextNote) => void;
  onUpdateNote: (pageIndex: number, id: string, patch: Partial<TextNote>) => void;
  onDeleteNote: (pageIndex: number, id: string) => void;
  onImageMenu: (target: ImageTarget) => void;
}

/**
 * Une page du document. Demande son bitmap au moteur à la résolution exacte
 * de l'écran (largeur CSS × devicePixelRatio) ; pendant un zoom, l'image
 * précédente est étirée en CSS puis remplacée par un rendu net (avec un
 * léger debounce pour ne pas inonder le moteur).
 */
export function PageView({
  docId,
  pageIndex,
  top,
  left,
  width,
  height,
  scale,
  rev,
  strokes,
  notes,
  annot,
  onAddStroke,
  onEraseStrokes,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onImageMenu,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const srcRef = useRef<string | null>(null);

  const targetW = Math.max(16, Math.round(width * (window.devicePixelRatio || 1)));
  const [renderW, setRenderW] = useState(targetW);

  useEffect(() => {
    if (targetW === renderW) return;
    const t = setTimeout(() => setRenderW(targetW), 160);
    return () => clearTimeout(t);
  }, [targetW, renderW]);

  useEffect(() => {
    let cancelled = false;
    renderPage(docId, pageIndex, renderW)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (srcRef.current) URL.revokeObjectURL(srcRef.current);
        srcRef.current = url;
        setSrc(url);
      })
      .catch((err) => {
        if (!cancelled) console.error(`Rendu page ${pageIndex + 1}`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [docId, pageIndex, renderW, rev]);

  useEffect(
    () => () => {
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    },
    [],
  );

  return (
    <div
      className="absolute overflow-hidden rounded-[3px]"
      style={{
        top,
        left,
        width,
        height,
        background: src ? "#fff" : "rgba(255,255,255,0.035)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      {src && (
        <img
          src={src}
          alt={`Page ${pageIndex + 1}`}
          draggable={false}
          className="block h-full w-full"
        />
      )}
      <ImageLayer
        docId={docId}
        pageIndex={pageIndex}
        scale={scale}
        enabled={annot.tool === null}
        rev={rev}
        onContextMenu={onImageMenu}
      />
      <AnnotationLayer
        cssWidth={width}
        cssHeight={height}
        scale={scale}
        strokes={strokes}
        annot={annot}
        onAddStroke={(stroke) => onAddStroke(pageIndex, stroke)}
        onEraseStrokes={(ids) => onEraseStrokes(pageIndex, ids)}
      />
      <TextNoteLayer
        cssWidth={width}
        cssHeight={height}
        scale={scale}
        notes={notes}
        active={annot.tool === "text"}
        color={annot.color}
        fontSize={annot.fontSize}
        onCreate={(note) => onCreateNote(pageIndex, note)}
        onUpdate={(id, patch) => onUpdateNote(pageIndex, id, patch)}
        onDelete={(id) => onDeleteNote(pageIndex, id)}
      />
    </div>
  );
}
