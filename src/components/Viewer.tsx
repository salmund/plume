import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DocInfo,
  DocInk,
  DocNotes,
  InkStroke,
  InkTool,
  TextNote,
} from "../types";
import { loadLastZoom, saveLastZoom, useSettings } from "../lib/settings";
import { PageView } from "./PageView";
import type { ImageTarget } from "./ImageLayer";
import { ThumbnailSidebar } from "./ThumbnailSidebar";
import { Toolbar } from "./Toolbar";
import {
  AnnotationBar,
  HL_COLORS,
  HL_WIDTHS,
  PEN_COLORS,
  PEN_WIDTHS,
  TEXT_SIZES,
} from "./AnnotationBar";

/** 1 point PDF = 1/72 pouce ; 100 % = 96 dpi CSS. */
const PT_TO_CSS = 96 / 72;
const PAGE_GAP = 28;
const PAD_X = 48;
const PAD_Y = 36;
const OVERSCAN = 700;
const ZOOM_MIN = 10;
const ZOOM_MAX = 640;

export type Zoom =
  | { mode: "fit-width" }
  | { mode: "fit-page" }
  | { mode: "percent"; value: number };

interface Props {
  doc: DocInfo;
  /** Incrémenté à chaque enregistrement : force le rendu des pages. */
  rev: number;
  ink: DocInk;
  notes: DocNotes;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddStroke: (pageIndex: number, stroke: InkStroke) => void;
  onEraseStrokes: (pageIndex: number, ids: string[]) => void;
  onCreateNote: (pageIndex: number, note: TextNote) => void;
  onUpdateNote: (pageIndex: number, id: string, patch: Partial<TextNote>) => void;
  onDeleteNote: (pageIndex: number, id: string) => void;
  onImageMenu: (target: ImageTarget) => void;
}

export function Viewer({
  doc,
  rev,
  ink,
  notes,
  dirty,
  saving,
  canUndo,
  canRedo,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  onAddStroke,
  onEraseStrokes,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onImageMenu,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const [zoom, setZoom] = useState<Zoom>(() => {
    switch (settings.defaultZoom) {
      case "fit-width":
        return { mode: "fit-width" };
      case "fit-page":
        return { mode: "fit-page" };
      case "last":
        return { mode: "percent", value: loadLastZoom() ?? 100 };
      default:
        return { mode: "percent", value: 100 };
    }
  });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [showThumbs, setShowThumbs] = useState(
    () => localStorage.getItem("plume.thumbs") === "1",
  );

  /* ---------- Annotation ---------- */

  const [tool, setTool] = useState<InkTool | null>(null);
  const lastToolRef = useRef<InkTool>("pen");
  const [penColor, setPenColor] = useState(
    () => localStorage.getItem("plume.penColor") ?? PEN_COLORS[1],
  );
  const [hlColor, setHlColor] = useState(
    () => localStorage.getItem("plume.hlColor") ?? HL_COLORS[0],
  );
  const [penWidth, setPenWidth] = useState(
    () => Number(localStorage.getItem("plume.penWidth")) || PEN_WIDTHS[1],
  );
  const [hlWidth, setHlWidth] = useState(
    () => Number(localStorage.getItem("plume.hlWidth")) || HL_WIDTHS[1],
  );
  const [textColor, setTextColor] = useState(
    () => localStorage.getItem("plume.textColor") ?? PEN_COLORS[3],
  );
  const [textSize, setTextSize] = useState(
    () => Number(localStorage.getItem("plume.textSize")) || TEXT_SIZES[1],
  );

  const selectTool = useCallback((t: InkTool) => {
    setTool(t);
    lastToolRef.current = t;
  }, []);

  const toggleAnnot = useCallback(() => {
    setTool((prev) => (prev === null ? lastToolRef.current : null));
  }, []);

  const activeColor =
    tool === "highlighter" ? hlColor : tool === "text" ? textColor : penColor;
  const activeWidth =
    tool === "highlighter" ? hlWidth : tool === "text" ? textSize : penWidth;

  const remember = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignoré */
    }
  };

  const setColor = useCallback(
    (c: string) => {
      if (tool === "highlighter") {
        setHlColor(c);
        remember("plume.hlColor", c);
      } else if (tool === "text") {
        setTextColor(c);
        remember("plume.textColor", c);
      } else {
        setPenColor(c);
        remember("plume.penColor", c);
      }
    },
    [tool],
  );

  const setWidth = useCallback(
    (w: number) => {
      if (tool === "highlighter") {
        setHlWidth(w);
        remember("plume.hlWidth", String(w));
      } else if (tool === "text") {
        setTextSize(w);
        remember("plume.textSize", String(w));
      } else {
        setPenWidth(w);
        remember("plume.penWidth", String(w));
      }
    },
    [tool],
  );

  const toggleThumbs = useCallback(() => {
    setShowThumbs((prev) => {
      try {
        localStorage.setItem("plume.thumbs", prev ? "0" : "1");
      } catch {
        /* ignoré */
      }
      return !prev;
    });
  }, []);

  // Mémorise le dernier zoom choisi explicitement (réglage « Dernier utilisé »).
  useEffect(() => {
    if (zoom.mode === "percent") saveLastZoom(Math.round(zoom.value));
  }, [zoom]);

  /* ---------- Géométrie ---------- */

  const dpr = window.devicePixelRatio || 1;
  // Cale une dimension CSS sur la grille de pixels physiques : c'est ce qui
  // garantit un mapping bitmap → écran exactement 1:1 (sinon, flou).
  const snap = useCallback((v: number) => Math.round(v * dpr) / dpr, [dpr]);

  const { maxW, maxH } = useMemo(() => {
    let w = 1;
    let h = 1;
    for (const p of doc.pages) {
      if (p.width > w) w = p.width;
      if (p.height > h) h = p.height;
    }
    return { maxW: w, maxH: h };
  }, [doc]);

  const scale = useMemo(() => {
    if (zoom.mode === "percent") return (zoom.value / 100) * PT_TO_CSS;
    if (box.w === 0) return PT_TO_CSS;
    const fitW = (box.w - PAD_X * 2) / maxW;
    if (zoom.mode === "fit-width") return fitW;
    const fitH = (box.h - PAD_Y * 2) / maxH;
    return Math.min(fitW, fitH);
  }, [zoom, box, maxW, maxH]);

  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const layout = useMemo(() => {
    const offsets: number[] = [];
    const heights: number[] = [];
    const widths: number[] = [];
    let y = PAD_Y;
    for (const p of doc.pages) {
      offsets.push(y);
      const h = snap(p.height * scale);
      heights.push(h);
      widths.push(snap(p.width * scale));
      y += h + PAGE_GAP;
    }
    return { offsets, heights, widths, total: y - PAGE_GAP + PAD_Y };
  }, [doc, scale, snap]);

  // Observe la taille du conteneur (fenêtre redimensionnée, etc.).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Zoom autour d'un point d'ancrage : le contenu sous le curseur reste en place.
  const pendingAnchor = useRef<{ cx: number; cy: number; oldScale: number } | null>(
    null,
  );

  const applyZoom = useCallback(
    (next: Zoom, anchor?: { cx: number; cy: number }) => {
      const el = scrollRef.current;
      if (el) {
        pendingAnchor.current = {
          cx: anchor?.cx ?? el.clientWidth / 2,
          cy: anchor?.cy ?? el.clientHeight / 2,
          oldScale: scaleRef.current,
        };
      }
      setZoom(next);
    },
    [],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = pendingAnchor.current;
    if (!el || !a || a.oldScale === 0) return;
    pendingAnchor.current = null;
    const k = scale / a.oldScale;
    if (Math.abs(k - 1) < 1e-6) return;
    el.scrollTop = (el.scrollTop + a.cy) * k - a.cy;
    el.scrollLeft = (el.scrollLeft + a.cx) * k - a.cx;
    setScrollTop(el.scrollTop);
  }, [scale]);

  const percent = Math.round((scale / PT_TO_CSS) * 100);

  const zoomStep = useCallback(
    (factor: number, anchor?: { cx: number; cy: number }) => {
      const current = (scaleRef.current / PT_TO_CSS) * 100;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current * factor));
      applyZoom({ mode: "percent", value: next }, anchor);
    },
    [applyZoom],
  );

  // Ctrl + molette : zoom centré sur le curseur.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomStep(e.deltaY < 0 ? 1.1 : 1 / 1.1, {
        cx: e.clientX - rect.left,
        cy: e.clientY - rect.top,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomStep]);

  // Raccourcis clavier de la visionneuse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Pendant la saisie d'une note, le clavier appartient au champ.
      if (target?.closest("textarea, input")) return;
      if (e.key === "Escape") {
        setTool(null);
        return;
      }
      if (!e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomStep(1.2);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomStep(1 / 1.2);
      } else if (e.key === "0") {
        e.preventDefault();
        applyZoom({ mode: "fit-width" });
      } else if (k === "s") {
        e.preventDefault();
        onSave();
      } else if (k === "e") {
        e.preventDefault();
        toggleAnnot();
      } else if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if (k === "y") {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomStep, applyZoom, onSave, onUndo, onRedo, toggleAnnot]);

  const onScrollTicking = useRef(false);
  const onScroll = useCallback(() => {
    if (onScrollTicking.current) return;
    onScrollTicking.current = true;
    requestAnimationFrame(() => {
      onScrollTicking.current = false;
      const el = scrollRef.current;
      if (el) setScrollTop(el.scrollTop);
    });
  }, []);

  // Pages visibles (+ marge) : les seules réellement rendues.
  const [firstVisible, lastVisible] = useMemo(() => {
    const { offsets, heights } = layout;
    const top = scrollTop - OVERSCAN;
    const bottom = scrollTop + box.h + OVERSCAN;
    let first = 0;
    while (first < offsets.length - 1 && offsets[first] + heights[first] < top) {
      first++;
    }
    let last = first;
    while (last < offsets.length - 1 && offsets[last + 1] < bottom) {
      last++;
    }
    return [first, last];
  }, [layout, scrollTop, box.h]);

  const currentPage = useMemo(() => {
    const { offsets, heights } = layout;
    const anchor = scrollTop + box.h * 0.35;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] + heights[i] > anchor) return i;
    }
    return offsets.length - 1;
  }, [layout, scrollTop, box.h]);

  const jumpTo = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const i = Math.min(Math.max(index, 0), layout.offsets.length - 1);
      el.scrollTop = layout.offsets[i] - 12;
      setScrollTop(el.scrollTop);
    },
    [layout],
  );

  const innerW = Math.max(box.w, maxW * scale + PAD_X * 2);
  const annot = {
    tool,
    color: activeColor,
    width: activeWidth,
    fontSize: textSize,
  };
  const pages = [];
  if (box.w > 0) {
    for (let i = firstVisible; i <= lastVisible; i++) {
      pages.push(
        <PageView
          key={i}
          docId={doc.id}
          pageIndex={i}
          top={layout.offsets[i]}
          left={snap((innerW - layout.widths[i]) / 2)}
          width={layout.widths[i]}
          height={layout.heights[i]}
          scale={scale}
          rev={rev}
          strokes={ink[i] ?? []}
          notes={notes[i] ?? []}
          annot={annot}
          onAddStroke={onAddStroke}
          onEraseStrokes={onEraseStrokes}
          onCreateNote={onCreateNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          onImageMenu={onImageMenu}
        />,
      );
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        pageCount={doc.pageCount}
        currentPage={currentPage}
        percent={percent}
        zoomMode={zoom.mode}
        showThumbs={showThumbs}
        annotActive={tool !== null}
        dirty={dirty}
        onToggleThumbs={toggleThumbs}
        onToggleAnnot={toggleAnnot}
        onOpen={onOpen}
        onJump={jumpTo}
        onZoomIn={() => zoomStep(1.2)}
        onZoomOut={() => zoomStep(1 / 1.2)}
        onZoomReset={() => applyZoom({ mode: "percent", value: 100 })}
        onFitWidth={() => applyZoom({ mode: "fit-width" })}
        onFitPage={() => applyZoom({ mode: "fit-page" })}
      />
      {tool !== null && (
        <AnnotationBar
          tool={tool}
          onToolChange={selectTool}
          color={activeColor}
          onColorChange={setColor}
          width={activeWidth}
          onWidthChange={setWidth}
          dirty={dirty}
          saving={saving}
          onSave={onSave}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {showThumbs && (
          <ThumbnailSidebar
            doc={doc}
            rev={rev}
            current={currentPage}
            onJump={jumpTo}
          />
        )}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="bg-canevas relative flex-1 overflow-auto"
        >
          <div
            className="relative"
            style={{ width: innerW, height: layout.total }}
          >
            {pages}
          </div>
        </div>
      </div>
    </div>
  );
}
