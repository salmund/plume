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
  dropBefore,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  docId: number;
  index: number;
  page: PageInfo;
  rev: number;
  active: boolean;
  selected: boolean;
  dropBefore: boolean;
  onSelect: (index: number, event: React.MouseEvent) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
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
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={(e) => onSelect(index, e)}
      className="relative flex cursor-pointer flex-col items-center gap-1.5"
    >
      {dropBefore && (
        <div className="bg-violette absolute -top-2 right-1 left-1 h-0.5 rounded-full" />
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
  const dragFrom = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const lastClicked = useRef(0);

  const handleSelect = (index: number, event: React.MouseEvent) => {
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
          dropBefore={dropAt === i}
          onSelect={handleSelect}
          onDragStart={(index) => {
            dragFrom.current = index;
            // Glisser une page hors sélection redéfinit la sélection.
            if (!selection.includes(index)) onSelectionChange([index]);
          }}
          onDragOver={setDropAt}
          onDrop={() => {
            const from = dragFrom.current;
            const to = dropAt;
            dragFrom.current = null;
            setDropAt(null);
            if (from === null || to === null) return;
            const moving = selection.includes(from) ? selection : [from];
            if (moving.includes(to)) return;
            // La destination s'exprime dans le document privé des pages
            // déplacées : on retranche celles qui passent avant.
            const before = moving.filter((p) => p < to).length;
            onReorder(moving, Math.max(0, to - before));
          }}
        />
      ))}
    </div>
  );
}
