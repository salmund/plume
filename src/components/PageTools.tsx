import {
  Copy,
  FileOutput,
  FilePlus2,
  Image,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";

interface Props {
  /** Pages sélectionnées, 0-based et triées. */
  selection: number[];
  pageCount: number;
  busy: boolean;
  onRotate: (quarterTurns: number) => void;
  onDelete: () => void;
  onExtract: () => void;
  onMerge: () => void;
  onExportImage: () => void;
  onSelectAll: () => void;
}

function Action({
  icon,
  label,
  title,
  onClick,
  disabled,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
        disabled
          ? "text-sourdine/40 cursor-default"
          : danger
            ? "text-sourdine hover:bg-[#d03330]/15 hover:text-[#ff8b88]"
            : "text-sourdine hover:text-papier hover:bg-white/6"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function PageTools({
  selection,
  pageCount,
  busy,
  onRotate,
  onDelete,
  onExtract,
  onMerge,
  onExportImage,
  onSelectAll,
}: Props) {
  const n = selection.length;
  const none = n === 0 || busy;
  // Un document doit garder au moins une page.
  const canDelete = !none && n < pageCount;

  return (
    <div className="border-trait shrink-0 border-t px-2 py-2">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="text-sourdine text-[10.5px] font-medium tracking-[0.14em] uppercase">
          Pages
        </span>
        <button
          type="button"
          onClick={onSelectAll}
          className="text-sourdine hover:text-papier text-[11px] transition-colors"
        >
          {n === 0 ? "Tout sélectionner" : `${n} sélectionnée${n > 1 ? "s" : ""}`}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-0.5">
        <Action
          icon={<RotateCcw size={13} strokeWidth={1.75} />}
          label="Gauche"
          title="Pivoter d'un quart de tour à gauche"
          onClick={() => onRotate(-1)}
          disabled={none}
        />
        <Action
          icon={<RotateCw size={13} strokeWidth={1.75} />}
          label="Droite"
          title="Pivoter d'un quart de tour à droite"
          onClick={() => onRotate(1)}
          disabled={none}
        />
        <Action
          icon={<FileOutput size={13} strokeWidth={1.75} />}
          label="Extraire"
          title="Enregistrer les pages choisies dans un nouveau PDF"
          onClick={onExtract}
          disabled={none}
        />
        <Action
          icon={<Image size={13} strokeWidth={1.75} />}
          label="Image"
          title="Exporter la page en PNG (une seule page à la fois)"
          onClick={onExportImage}
          disabled={none || n !== 1}
        />
        <Action
          icon={<FilePlus2 size={13} strokeWidth={1.75} />}
          label="Insérer"
          title="Insérer les pages d'un autre PDF après la page courante"
          onClick={onMerge}
          disabled={busy}
        />
        <Action
          icon={<Trash2 size={13} strokeWidth={1.75} />}
          label="Retirer"
          title="Supprimer les pages choisies"
          onClick={onDelete}
          disabled={!canDelete}
          danger
        />
      </div>

      <p className="text-sourdine/70 mt-2 px-1 text-[10.5px] leading-snug">
        <Copy size={9} strokeWidth={2} className="mr-1 inline align-[-1px]" />
        Ctrl ou Maj pour sélectionner plusieurs pages, glissez pour réordonner.
      </p>
    </div>
  );
}
