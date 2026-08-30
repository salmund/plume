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
  onClick,
}: {
  docId: number;
  index: number;
  page: PageInfo;
  rev: number;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
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

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={`Aller à la page ${index + 1}`}
      aria-current={active ? "page" : undefined}
      className="group flex flex-col items-center gap-1.5"
    >
      <div
        className="overflow-hidden rounded-[2px] transition-shadow"
        style={{
          width: THUMB_W,
          height: Math.round((THUMB_W * page.height) / page.width),
          background: src ? "#fff" : "rgba(255,255,255,0.035)",
          boxShadow: active
            ? "0 0 0 2px var(--color-violette), 0 2px 8px rgba(0,0,0,0.5)"
            : "0 0 0 1px rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            className="block h-full w-full"
          />
        )}
      </div>
      <span
        className={`font-chiffres text-[10.5px] transition-colors ${
          active ? "text-violette" : "text-sourdine group-hover:text-papier"
        }`}
      >
        {index + 1}
      </span>
    </button>
  );
}

export function ThumbnailList({
  doc,
  rev,
  current,
  onJump,
}: {
  doc: DocInfo;
  rev: number;
  current: number;
  onJump: (index: number) => void;
}) {
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
          onClick={() => onJump(i)}
        />
      ))}
    </div>
  );
}
