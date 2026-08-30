import {
  Eraser,
  Highlighter,
  PenLine,
  Redo2,
  Save,
  Type,
  Undo2,
} from "lucide-react";
import type { InkTool } from "../types";

export const PEN_COLORS = [
  "#1c1c21",
  "#2547d0",
  "#6b48c8",
  "#d03330",
  "#177245",
];
export const HL_COLORS = [
  "#ffdf3d",
  "#7de35a",
  "#ff7ac8",
  "#7ab8ff",
  "#ffab45",
];
export const PEN_WIDTHS = [1, 2, 3.5];
export const HL_WIDTHS = [6, 10, 16];
export const TEXT_SIZES = [9, 12, 16];

interface Props {
  tool: InkTool;
  onToolChange: (tool: InkTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-md transition-colors ${
        active
          ? "text-violette bg-white/8"
          : "text-sourdine hover:text-papier hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

export function AnnotationBar({
  tool,
  onToolChange,
  color,
  onColorChange,
  width,
  onWidthChange,
  dirty,
  saving,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const colors = tool === "highlighter" ? HL_COLORS : PEN_COLORS;
  const isText = tool === "text";
  const widths = isText
    ? TEXT_SIZES
    : tool === "highlighter"
      ? HL_WIDTHS
      : PEN_WIDTHS;
  const showStyle = tool !== "eraser";

  return (
    <div className="bg-pupitre border-trait flex h-11 shrink-0 items-center gap-1 border-b px-3">
      <ToolButton
        label="Stylo"
        active={tool === "pen"}
        onClick={() => onToolChange("pen")}
      >
        <PenLine size={15} strokeWidth={1.75} />
      </ToolButton>
      <ToolButton
        label="Surligneur"
        active={tool === "highlighter"}
        onClick={() => onToolChange("highlighter")}
      >
        <Highlighter size={15} strokeWidth={1.75} />
      </ToolButton>
      <ToolButton
        label="Texte"
        active={tool === "text"}
        onClick={() => onToolChange("text")}
      >
        <Type size={15} strokeWidth={1.75} />
      </ToolButton>
      <ToolButton
        label="Gomme"
        active={tool === "eraser"}
        onClick={() => onToolChange("eraser")}
      >
        <Eraser size={15} strokeWidth={1.75} />
      </ToolButton>

      {showStyle && (
        <>
          <div className="bg-trait mx-2 h-5 w-px" />
          <div className="flex items-center gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Couleur ${c}`}
                aria-pressed={color === c}
                onClick={() => onColorChange(c)}
                className="grid size-6 place-items-center rounded-full transition-transform hover:scale-110"
                style={{
                  boxShadow:
                    color === c
                      ? "0 0 0 2px var(--color-pupitre), 0 0 0 3.5px var(--color-violette)"
                      : undefined,
                }}
              >
                <span
                  className="block size-4 rounded-full"
                  style={{ background: c, border: "1px solid rgba(255,255,255,0.18)" }}
                />
              </button>
            ))}
          </div>

          <div className="bg-trait mx-2 h-5 w-px" />
          <div className="flex items-center gap-1">
            {widths.map((w, i) => (
              <button
                key={w}
                type="button"
                title={
                  isText
                    ? `Corps ${w} pt`
                    : `Épaisseur ${["fine", "moyenne", "large"][i]}`
                }
                aria-pressed={width === w}
                onClick={() => onWidthChange(w)}
                className={`grid size-8 place-items-center rounded-md transition-colors ${
                  width === w ? "bg-white/8" : "hover:bg-white/5"
                }`}
                style={
                  isText
                    ? {
                        color:
                          width === w
                            ? "var(--color-violette)"
                            : "var(--color-sourdine)",
                        fontSize: 10 + i * 3,
                        lineHeight: 1,
                      }
                    : undefined
                }
              >
                {isText ? (
                  "A"
                ) : (
                  <span
                    className="rounded-full"
                    style={{
                      width: 4 + i * 3.5,
                      height: 4 + i * 3.5,
                      background:
                        width === w
                          ? "var(--color-violette)"
                          : "var(--color-sourdine)",
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="bg-trait mx-2 h-5 w-px" />
      <ToolButton label="Annuler (Ctrl+Z)" active={false} onClick={onUndo}>
        <Undo2
          size={15}
          strokeWidth={1.75}
          className={canUndo ? "" : "opacity-35"}
        />
      </ToolButton>
      <ToolButton label="Rétablir (Ctrl+Y)" active={false} onClick={onRedo}>
        <Redo2
          size={15}
          strokeWidth={1.75}
          className={canRedo ? "" : "opacity-35"}
        />
      </ToolButton>

      <div className="ml-auto flex items-center gap-3">
        {dirty && !saving && (
          <span className="text-sourdine text-[12px]">
            Annotations non enregistrées
          </span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          title="Enregistrer dans le PDF (Ctrl+S)"
          className={`flex h-8 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium transition-colors ${
            dirty && !saving
              ? "bg-violette text-[#14141b] hover:opacity-90"
              : "text-sourdine cursor-default bg-white/5"
          }`}
        >
          <Save size={14} strokeWidth={1.75} />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
