import { FileText } from "lucide-react";
import type { RecentFile } from "../lib/settings";

interface Props {
  dragging: boolean;
  onOpen: () => void;
  recents: RecentFile[];
  onOpenRecent: (path: string) => void;
}

function parentDir(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, "");
}

/**
 * Le pupitre vide : une feuille blanche posée de travers, signée « Plume »
 * à l'encre violette. Elle se redresse quand un document est glissé dessus.
 */
export function EmptyState({ dragging, onOpen, recents, onOpenRecent }: Props) {
  return (
    <div className="bg-canevas flex h-full flex-col items-center justify-center gap-10">
      <div
        className="bg-feuille relative w-[230px] rounded-[4px] transition-transform duration-300 ease-out"
        style={{
          aspectRatio: "8.5 / 11",
          transform: dragging
            ? "rotate(0deg) scale(1.04)"
            : "rotate(-4deg)",
          boxShadow: dragging
            ? "0 18px 50px rgba(0,0,0,0.6), 0 0 0 2px var(--color-violette)"
            : "0 14px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div
              className="font-display italic"
              style={{
                fontSize: "46px",
                color: "#5b48c8",
                transform: "rotate(-2deg)",
              }}
            >
              Plume
            </div>
            {/* Le paraphe sous la signature */}
            <svg
              width="120"
              height="14"
              viewBox="0 0 120 14"
              className="mx-auto -mt-1"
              aria-hidden="true"
            >
              <path
                d="M4 9 C 30 2, 62 13, 88 7 S 112 4, 116 6"
                fill="none"
                stroke="#5b48c8"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.75"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5">
        <p className="text-sourdine text-[14px]">
          {dragging
            ? "Déposez pour ouvrir"
            : "Glissez un document sur le pupitre"}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="bg-violette rounded-lg px-4 py-2 text-[13.5px] font-medium text-[#14141b] transition-opacity hover:opacity-90"
          >
            Ouvrir un document
          </button>
          <span className="text-sourdine text-[12.5px]">
            ou{" "}
            <kbd className="font-chiffres border-trait rounded border bg-white/4 px-1.5 py-0.5 text-[11px]">
              Ctrl
            </kbd>{" "}
            <kbd className="font-chiffres border-trait rounded border bg-white/4 px-1.5 py-0.5 text-[11px]">
              O
            </kbd>
          </span>
        </div>
      </div>

      {recents.length > 0 && (
        <div className="flex w-[400px] flex-col">
          <div className="text-sourdine mb-1.5 px-2.5 text-[11px] font-medium tracking-[0.14em] uppercase">
            Récents
          </div>
          {recents.slice(0, 5).map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => onOpenRecent(r.path)}
              title={r.path}
              className="group flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-white/5"
            >
              <FileText
                size={13}
                strokeWidth={1.75}
                className="text-sourdine shrink-0"
              />
              <span className="text-papier shrink-0 truncate text-[13px]">
                {r.title}
              </span>
              <span className="text-sourdine min-w-0 flex-1 truncate text-[11.5px]">
                {parentDir(r.path)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
