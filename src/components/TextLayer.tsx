import { useEffect, useRef, useState } from "react";
import { pageText } from "../lib/api";
import type { SearchHit, TextSegment } from "../types";

interface Props {
  docId: number;
  pageIndex: number;
  /** Pixels CSS par point PDF. */
  scale: number;
  rev: number;
  /** Désactivée pendant l'annotation, pour ne pas gêner le stylet. */
  enabled: boolean;
  /** Occurrences de la recherche sur cette page. */
  hits: SearchHit[];
  /** Index de l'occurrence active dans `hits`, ou -1. */
  activeHit: number;
}

/**
 * Texte invisible calé sur le bitmap de la page : la sélection, le copier et
 * le glisser du curseur sont ceux du navigateur, sans code maison.
 *
 * Chaque fragment est posé à sa position PDF puis étiré horizontalement pour
 * que sa largeur rendue corresponde exactement à celle mesurée par PDFium —
 * sans quoi la sélection dériverait le long de la ligne.
 */
function Segment({ segment, scale }: { segment: TextSegment; scale: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [stretch, setStretch] = useState(1);

  const targetWidth = segment.width * scale;
  const fontSize = segment.height * scale;

  useEffect(() => {
    const el = ref.current;
    if (!el || targetWidth <= 0) return;
    // scrollWidth est la largeur naturelle du texte, hors transformation.
    const natural = el.scrollWidth;
    if (natural > 0) setStretch(targetWidth / natural);
  }, [segment.text, targetWidth, fontSize]);

  return (
    <span
      ref={ref}
      style={{
        position: "absolute",
        left: segment.x * scale,
        top: segment.y * scale,
        fontSize,
        lineHeight: 1,
        whiteSpace: "pre",
        transformOrigin: "0 0",
        transform: `scaleX(${stretch})`,
        color: "transparent",
        cursor: "text",
        // Seuls les glyphes captent la souris : ailleurs, les clics
        // atteignent les images en dessous.
        pointerEvents: "auto",
      }}
    >
      {segment.text}
    </span>
  );
}

export function TextLayer({
  docId,
  pageIndex,
  scale,
  rev,
  enabled,
  hits,
  activeHit,
}: Props) {
  const [segments, setSegments] = useState<TextSegment[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    pageText(docId, pageIndex)
      .then((list) => {
        if (!cancelled) setSegments(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [docId, pageIndex, enabled, rev]);

  return (
    <>
      {/* Surlignage des occurrences : sous le texte, au-dessus du bitmap. */}
      {hits.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          {hits.map((hit, hitIndex) =>
            hit.rects.map((rect, rectIndex) => (
              <div
                key={`${hitIndex}-${rectIndex}`}
                style={{
                  position: "absolute",
                  left: rect.x * scale,
                  top: rect.y * scale,
                  width: rect.width * scale,
                  height: rect.height * scale,
                  background:
                    hitIndex === activeHit
                      ? "rgba(161,138,255,0.55)"
                      : "rgba(255,223,61,0.38)",
                  borderRadius: 2,
                  mixBlendMode: "multiply",
                }}
              />
            )),
          )}
        </div>
      )}

      {enabled && segments.length > 0 && (
        <div
          className="absolute inset-0 select-text"
          style={{
            // Une famille connue rend `scrollWidth` prévisible ; le texte
            // étant transparent, la police n'a aucun effet visuel.
            fontFamily: "sans-serif",
            pointerEvents: "none",
          }}
        >
          {segments.map((segment, i) => (
            <Segment key={i} segment={segment} scale={scale} />
          ))}
        </div>
      )}
    </>
  );
}
