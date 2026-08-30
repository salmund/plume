import { useEffect, useRef } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import type { ImageTarget } from "./ImageLayer";

interface Props {
  target: ImageTarget;
  onClose: () => void;
  onSave: () => void;
  onCopy: () => void;
  onShare: () => void;
}

const MENU_W = 220;
const MENU_H = 132;

function Item({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-papier flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-white/6"
    >
      <span className="text-sourdine">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-sourdine text-[11.5px]">{hint}</span>}
    </button>
  );
}

export function ImageMenu({ target, onClose, onSave, onCopy, onShare }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  // Le menu reste dans la fenêtre.
  const left = Math.min(target.clientX, window.innerWidth - MENU_W - 8);
  const top = Math.min(target.clientY, window.innerHeight - MENU_H - 8);
  const { width, height } = target.image;

  return (
    <div
      ref={ref}
      role="menu"
      className="bg-pupitre border-trait fixed z-40 rounded-lg border p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
      style={{ left, top, width: MENU_W }}
    >
      <div className="text-sourdine px-2.5 pt-1 pb-2 text-[11px] tracking-[0.12em] uppercase">
        Image · {Math.round(width)} × {Math.round(height)} pt
      </div>
      <Item
        icon={<Download size={14} strokeWidth={1.75} />}
        label="Enregistrer sous…"
        onClick={onSave}
      />
      <Item
        icon={<Copy size={14} strokeWidth={1.75} />}
        label="Copier l'image"
        onClick={onCopy}
      />
      <Item
        icon={<Share2 size={14} strokeWidth={1.75} />}
        label="Partager…"
        onClick={onShare}
      />
    </div>
  );
}
