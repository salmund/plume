import { Feather, Plus, Settings, X } from "lucide-react";
import type { DocInfo } from "../types";

interface Props {
  docs: DocInfo[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  onOpen: () => void;
  onSettings: () => void;
}

export function Tabs({
  docs,
  activeId,
  onSelect,
  onClose,
  onOpen,
  onSettings,
}: Props) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-2.5">
      <div className="mr-2 flex items-center gap-2 pl-1.5">
        <Feather size={16} strokeWidth={1.75} className="text-violette" />
        <span className="font-display text-papier text-[17px] tracking-wide">
          Plume
        </span>
      </div>

      {docs.map((doc) => {
        const active = doc.id === activeId;
        return (
          <div
            key={doc.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => onSelect(doc.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(doc.id);
            }}
            onAuxClick={(e) => {
              // Clic molette : fermer l'onglet
              if (e.button === 1) onClose(doc.id);
            }}
            title={doc.path}
            className={`group flex h-8 max-w-52 min-w-0 cursor-default items-center gap-1.5 rounded-md pr-1.5 pl-3 text-[13px] transition-colors ${
              active
                ? "bg-pupitre text-papier"
                : "text-sourdine hover:bg-white/4 hover:text-papier"
            }`}
          >
            <span className="truncate">{doc.title}</span>
            <button
              type="button"
              aria-label={`Fermer ${doc.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(doc.id);
              }}
              className={`grid size-5 shrink-0 place-items-center rounded transition-opacity hover:bg-white/10 ${
                active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:group-hover:opacity-100"
              }`}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        );
      })}

      {docs.length > 0 && (
        <button
          type="button"
          onClick={onOpen}
          title="Ouvrir un document (Ctrl+O)"
          aria-label="Ouvrir un document"
          className="text-sourdine hover:text-papier grid size-7 place-items-center rounded-md transition-colors hover:bg-white/5"
        >
          <Plus size={15} strokeWidth={1.75} />
        </button>
      )}

      <button
        type="button"
        onClick={onSettings}
        title="Paramètres (Ctrl+,)"
        aria-label="Paramètres"
        className="text-sourdine hover:text-papier ml-auto grid size-8 place-items-center rounded-md transition-colors hover:bg-white/5"
      >
        <Settings size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
