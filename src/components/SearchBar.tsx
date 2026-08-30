import { useEffect, useRef } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Search, X } from "lucide-react";

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  matchCase: boolean;
  onMatchCaseChange: (value: boolean) => void;
  /** Nombre total d'occurrences, null pendant la recherche. */
  total: number | null;
  /** Index de l'occurrence courante, 0-based. */
  current: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function SearchBar({
  query,
  onQueryChange,
  matchCase,
  onMatchCaseChange,
  total,
  current,
  onPrev,
  onNext,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const status =
    query.trim() === ""
      ? ""
      : total === null
        ? "…"
        : total === 0
          ? "Aucun résultat"
          : `${current + 1} / ${total}`;

  return (
    <div className="bg-pupitre border-trait absolute top-3 right-4 z-20 flex items-center gap-1 rounded-lg border px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
      <Search size={14} strokeWidth={1.75} className="text-sourdine ml-1" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Rechercher dans le document"
        aria-label="Rechercher dans le document"
        className="text-papier placeholder:text-sourdine/70 w-56 bg-transparent px-1.5 py-1 text-[13px] outline-none"
      />

      <span className="font-chiffres text-sourdine min-w-[72px] text-center text-[11.5px]">
        {status}
      </span>

      <button
        type="button"
        title="Respecter la casse"
        aria-label="Respecter la casse"
        aria-pressed={matchCase}
        onClick={() => onMatchCaseChange(!matchCase)}
        className={`grid size-7 place-items-center rounded-md transition-colors ${
          matchCase
            ? "text-violette bg-white/8"
            : "text-sourdine hover:text-papier hover:bg-white/5"
        }`}
      >
        <CaseSensitive size={15} strokeWidth={1.75} />
      </button>

      <div className="bg-trait mx-0.5 h-5 w-px" />

      <button
        type="button"
        title="Occurrence précédente (Maj+Entrée)"
        aria-label="Occurrence précédente"
        onClick={onPrev}
        className="text-sourdine hover:text-papier grid size-7 place-items-center rounded-md transition-colors hover:bg-white/5"
      >
        <ChevronUp size={15} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        title="Occurrence suivante (Entrée)"
        aria-label="Occurrence suivante"
        onClick={onNext}
        className="text-sourdine hover:text-papier grid size-7 place-items-center rounded-md transition-colors hover:bg-white/5"
      >
        <ChevronDown size={15} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        title="Fermer la recherche (Échap)"
        aria-label="Fermer la recherche"
        onClick={onClose}
        className="text-sourdine hover:text-papier grid size-7 place-items-center rounded-md transition-colors hover:bg-white/5"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
