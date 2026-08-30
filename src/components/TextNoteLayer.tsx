import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { TextNote } from "../types";

interface Props {
  cssWidth: number;
  cssHeight: number;
  /** Pixels CSS par point PDF. */
  scale: number;
  notes: TextNote[];
  /** Outil texte actif : la couche accepte les clics de création. */
  active: boolean;
  color: string;
  fontSize: number;
  onCreate: (note: TextNote) => void;
  onUpdate: (id: string, patch: Partial<TextNote>) => void;
  onDelete: (id: string) => void;
}

const DEFAULT_WIDTH_PT = 180;

function NoteBox({
  note,
  scale,
  editing,
  onStartEdit,
  onEndEdit,
  onUpdate,
  onDelete,
}: {
  note: TextNote;
  scale: number;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onUpdate: (patch: Partial<TextNote>) => void;
  onDelete: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  useEffect(() => {
    if (editing) {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  // La hauteur suit le contenu saisi.
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [note.text, editing, scale]);

  const style: React.CSSProperties = {
    left: note.x * scale,
    top: note.y * scale,
    width: note.width * scale,
    fontSize: note.fontSize * scale,
    lineHeight: 1.35,
    color: note.color,
  };

  return (
    <div
      className="absolute"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          value={note.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          onBlur={onEndEdit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") onEndEdit();
          }}
          className="block w-full resize-none overflow-hidden rounded-[3px] bg-white/92 px-1 py-0.5 outline-none"
          style={{
            font: "inherit",
            color: "inherit",
            lineHeight: "inherit",
            boxShadow: "0 0 0 1.5px var(--color-violette)",
          }}
        />
      ) : (
        <div
          onDoubleClick={onStartEdit}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = {
              x: e.clientX,
              y: e.clientY,
              ox: note.x,
              oy: note.y,
            };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            onUpdate({
              x: d.ox + (e.clientX - d.x) / scale,
              y: d.oy + (e.clientY - d.y) / scale,
            });
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          title="Double-cliquez pour modifier · glissez pour déplacer"
          className="group relative cursor-move rounded-[3px] px-1 py-0.5 whitespace-pre-wrap"
          style={{ boxShadow: "0 0 0 1px rgba(161,138,255,0.35)" }}
        >
          {note.text || " "}
          <button
            type="button"
            aria-label="Supprimer la note"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="bg-pupitre text-sourdine hover:text-papier absolute -top-2.5 -right-2.5 grid size-5 place-items-center rounded-full opacity-0 shadow transition-opacity group-hover:opacity-100"
          >
            <Trash2 size={11} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

export function TextNoteLayer({
  cssWidth,
  cssHeight,
  scale,
  notes,
  active,
  color,
  fontSize,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!active && notes.length === 0) return null;

  return (
    <div
      className="absolute inset-0"
      style={{
        width: cssWidth,
        height: cssHeight,
        pointerEvents: active || notes.length > 0 ? "auto" : "none",
        cursor: active ? "text" : "default",
      }}
      onPointerDown={(e) => {
        // Clic sur le fond : création d'une note, ou sortie d'édition.
        if (!active || e.button !== 0) return;
        if (editingId) {
          setEditingId(null);
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        const note: TextNote = {
          id: crypto.randomUUID(),
          x,
          y,
          width: Math.min(DEFAULT_WIDTH_PT, cssWidth / scale - x - 8),
          text: "",
          fontSize,
          color,
        };
        onCreate(note);
        setEditingId(note.id);
      }}
    >
      {notes.map((note) => (
        <NoteBox
          key={note.id}
          note={note}
          scale={scale}
          editing={editingId === note.id}
          onStartEdit={() => setEditingId(note.id)}
          onEndEdit={() => {
            setEditingId(null);
            // Une note laissée vide est retirée.
            if (!note.text.trim()) onDelete(note.id);
          }}
          onUpdate={(patch) => onUpdate(note.id, patch)}
          onDelete={() => onDelete(note.id)}
        />
      ))}
    </div>
  );
}
