import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Minus,
  MoveHorizontal,
  PanelLeft,
  PenLine,
  Plus,
  Scan,
} from "lucide-react";

interface Props {
  pageCount: number;
  /** Index 0-based de la page courante. */
  currentPage: number;
  percent: number;
  zoomMode: "fit-width" | "fit-page" | "percent";
  showThumbs: boolean;
  annotActive: boolean;
  dirty: boolean;
  onToggleThumbs: () => void;
  onToggleAnnot: () => void;
  onOpen: () => void;
  onJump: (index: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
}

function IconButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-md transition-colors ${
        active
          ? "text-violette bg-white/5"
          : "text-sourdine hover:text-papier hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  pageCount,
  currentPage,
  percent,
  zoomMode,
  showThumbs,
  annotActive,
  dirty,
  onToggleThumbs,
  onToggleAnnot,
  onOpen,
  onJump,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFitWidth,
  onFitPage,
}: Props) {
  const [pageField, setPageField] = useState(String(currentPage + 1));

  useEffect(() => {
    setPageField(String(currentPage + 1));
  }, [currentPage]);

  const commitPage = () => {
    const n = parseInt(pageField, 10);
    if (Number.isFinite(n)) onJump(n - 1);
    else setPageField(String(currentPage + 1));
  };

  return (
    <div className="bg-pupitre border-trait relative flex h-12 shrink-0 items-center border-b px-2">
      <IconButton
        label="Vignettes des pages"
        onClick={onToggleThumbs}
        active={showThumbs}
      >
        <PanelLeft size={16} strokeWidth={1.75} />
      </IconButton>
      <div className="bg-trait mx-1.5 h-5 w-px" />
      <button
        type="button"
        onClick={onOpen}
        title="Ouvrir un document (Ctrl+O)"
        className="text-sourdine hover:text-papier flex h-8 items-center gap-2 rounded-md px-3 text-[13px] transition-colors hover:bg-white/5"
      >
        <FolderOpen size={15} strokeWidth={1.75} />
        Ouvrir
      </button>
      <div className="bg-trait mx-1.5 h-5 w-px" />
      <IconButton
        label="Annoter (stylet, surligneur, gomme)"
        onClick={onToggleAnnot}
        active={annotActive}
      >
        <span className="relative">
          <PenLine size={16} strokeWidth={1.75} />
          {dirty && (
            <span className="bg-violette absolute -top-1 -right-1 size-1.5 rounded-full" />
          )}
        </span>
      </IconButton>

      {/* Navigation de pages, centrée dans la barre */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
        <IconButton label="Page précédente" onClick={() => onJump(currentPage - 1)}>
          <ChevronUp size={16} strokeWidth={1.75} />
        </IconButton>
        <div className="font-chiffres text-sourdine flex items-baseline gap-1.5 text-[12.5px]">
          <input
            type="number"
            value={pageField}
            min={1}
            max={pageCount}
            onChange={(e) => setPageField(e.target.value)}
            onBlur={commitPage}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label="Numéro de page"
            className="text-papier w-10 rounded-md border border-transparent bg-transparent py-1 text-center transition-colors hover:border-(--color-trait) focus:border-(--color-trait) focus:bg-black/20 focus:outline-none"
          />
          <span>/</span>
          <span>{pageCount}</span>
        </div>
        <IconButton label="Page suivante" onClick={() => onJump(currentPage + 1)}>
          <ChevronDown size={16} strokeWidth={1.75} />
        </IconButton>
      </div>

      {/* Zoom, à droite */}
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton label="Zoom arrière (Ctrl+−)" onClick={onZoomOut}>
          <Minus size={15} strokeWidth={1.75} />
        </IconButton>
        <button
          type="button"
          onClick={onZoomReset}
          title="Réinitialiser à 100 %"
          className="font-chiffres text-sourdine hover:text-papier w-14 rounded-md py-1.5 text-center text-[12.5px] transition-colors hover:bg-white/5"
        >
          {percent}%
        </button>
        <IconButton label="Zoom avant (Ctrl+=)" onClick={onZoomIn}>
          <Plus size={15} strokeWidth={1.75} />
        </IconButton>
        <div className="bg-trait mx-1.5 h-5 w-px" />
        <IconButton
          label="Ajuster à la largeur (Ctrl+0)"
          onClick={onFitWidth}
          active={zoomMode === "fit-width"}
        >
          <MoveHorizontal size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label="Page entière"
          onClick={onFitPage}
          active={zoomMode === "fit-page"}
        >
          <Scan size={15} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
