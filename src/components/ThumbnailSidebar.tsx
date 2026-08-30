import { useEffect, useRef, useState } from "react";
import { renderPage } from "../lib/api";
import type { DocInfo, PageInfo } from "../types";

const THUMB_W = 100;

function Thumb({
  docId,
  index,
  page,
  rev,
  active,
  selected,
  dragging,
  dropBefore,
  dropAfter,
  onSelect,
  onPointerDown,
}: {
  docId: number;
  index: number;
  page: PageInfo;
  rev: number;
  active: boolean;
  selected: boolean;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onSelect: (index: number, event: React.MouseEvent) => void;
  onPointerDown: (index: number, event: React.PointerEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const srcRef = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { root: el.closest("[data-thumbs]"), rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    renderPage(
      docId,
      index,
      Math.round(THUMB_W * (window.devicePixelRatio || 1)),
    )
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (srcRef.current) URL.revokeObjectURL(srcRef.current);
        srcRef.current = url;
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, docId, index, rev]);

  useEffect(
    () => () => {
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    },
    [],
  );

  // La vignette active reste visible dans le panneau.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const ring = selected
    ? "0 0 0 2px var(--color-violette), 0 2px 8px rgba(0,0,0,0.5)"
    : active
      ? "0 0 0 2px rgba(161,138,255,0.45), 0 2px 8px rgba(0,0,0,0.5)"
      : "0 0 0 1px rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.4)";

  return (
    <div
      ref={ref}
      data-page={index}
      onPointerDown={(e) => onPointerDown(index, e)}
      onClick={(e) => onSelect(index, e)}
      className="relative flex cursor-pointer flex-col items-center gap-1.5"
      style={{ touchAction: "pan-y", opacity: dragging ? 0.4 : 1 }}
    >
      {dropBefore && (
        <div className="bg-violette absolute -top-2 right-1 left-1 h-0.5 rounded-full" />
      )}
      {dropAfter && (
        <div className="bg-violette absolute -bottom-2 right-1 left-1 h-0.5 rounded-full" />
      )}
      <div
        className="overflow-hidden rounded-[2px] transition-shadow"
        style={{
          width: THUMB_W,
          height: Math.round((THUMB_W * page.height) / page.width),
          background: src ? "#fff" : "rgba(255,255,255,0.035)",
          boxShadow: ring,
        }}
      >
        {src && (
          <img src={src} alt="" draggable={false} className="block h-full w-full" />
        )}
      </div>
      <span
        className={`font-chiffres text-[10.5px] transition-colors ${
          selected || active ? "text-violette" : "text-sourdine"
        }`}
      >
        {index + 1}
      </span>
    </div>
  );
}

export function ThumbnailList({
  doc,
  rev,
  current,
  selection,
  onJump,
  onSelectionChange,
  onReorder,
}: {
  doc: DocInfo;
  rev: number;
  current: number;
  selection: number[];
  onJump: (index: number) => void;
  onSelectionChange: (pages: number[]) => void;
  onReorder: (pages: number[], dest: number) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const lastClicked = useRef(0);

  // Les gestionnaires posés sur `window` pendant un glissement capturent
  // l'état du rendu où ils ont été créés : ces refs leur donnent la valeur
  // courante.
  const dropAtRef = useRef<number | null>(null);
  dropAtRef.current = dropAt;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // Un glissement se termine par un clic qu'il ne faut pas prendre
  // pour une sélection.
  const justDragged = useRef(false);

  /**
   * Réorganisation au pointeur plutôt qu'en glisser-déposer HTML5 : sous
   * Windows, ce dernier n'est disponible qu'en désactivant `dragDropEnabled`,
   * ce qui coûterait le dépôt de fichiers depuis l'Explorateur. Le pointeur
   * fonctionne aussi au stylet.
   */
  const beginDrag = (index: number, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let active = false;

    const onMove = (e: PointerEvent) => {
      if (!active) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        active = true;
        setDragging(index);
        if (!selectionRef.current.includes(index)) onSelectionChange([index]);
      }
      const under = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-page]") as HTMLElement | null;
      if (!under) {
        setDropAt(null);
        return;
      }
      const target = Number(under.dataset.page);
      const rect = under.getBoundingClientRect();
      // Moitié haute : insertion avant ; moitié basse : après.
      setDropAt(e.clientY > rect.top + rect.height / 2 ? target + 1 : target);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const to = dropAtRef.current;
      setDragging(null);
      setDropAt(null);
      if (!active) return;
      justDragged.current = true;
      if (to === null) return;

      const moving = selectionRef.current.includes(index)
        ? [...selectionRef.current]
        : [index];
      // La destination s'exprime dans le document privé des pages déplacées :
      // on retranche celles qui passaient avant le point d'insertion.
      const before = moving.filter((p) => p < to).length;
      const dest = Math.max(0, to - before);
      // Un dépôt qui ne change rien ne mérite pas une réécriture.
      const unchanged =
        moving.length > 0 &&
        moving.every((p, k) => p === moving[0] + k) &&
        moving[0] === dest;
      if (!unchanged) onReorder(moving, dest);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleSelect = (index: number, event: React.MouseEvent) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (event.shiftKey) {
      const [a, b] = [lastClicked.current, index].sort((x, y) => x - y);
      onSelectionChange(
        Array.from({ length: b - a + 1 }, (_, k) => a + k),
      );
    } else if (event.ctrlKey || event.metaKey) {
      onSelectionChange(
        selection.includes(index)
          ? selection.filter((p) => p !== index)
          : [...selection, index].sort((x, y) => x - y),
      );
      lastClicked.current = index;
    } else {
      onSelectionChange([index]);
      lastClicked.current = index;
      onJump(index);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-4">
      {doc.pages.map((page, i) => (
        <Thumb
          key={i}
          docId={doc.id}
          index={i}
          page={page}
          rev={rev}
          active={i === current}
          selected={selection.includes(i)}
          dragging={dragging !== null && selection.includes(i)}
          dropBefore={dropAt === i}
          dropAfter={dropAt === doc.pageCount && i === doc.pageCount - 1}
          onSelect={handleSelect}
          onPointerDown={beginDrag}
        />
      ))}
    </div>
  );
}
