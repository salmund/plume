import { useEffect, useState } from "react";
import { BookmarkPlus, ChevronDown, ChevronRight, X } from "lucide-react";
import { listBookmarks } from "../lib/api";
import type { BookmarkNode, UserMark } from "../types";

interface Props {
  docId: number;
  rev: number;
  currentPage: number;
  marks: UserMark[];
  onJump: (pageIndex: number) => void;
  onAddMark: () => void;
  onRemoveMark: (pageIndex: number) => void;
}

function Node({
  node,
  depth,
  currentPage,
  onJump,
}: {
  node: BookmarkNode;
  depth: number;
  currentPage: number;
  onJump: (pageIndex: number) => void;
}) {
  // Les deux premiers niveaux sont dépliés : on voit la structure d'emblée.
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const active = node.pageIndex === currentPage;

  return (
    <div>
      <div
        className={`group flex items-start gap-1 rounded-md py-1 pr-1.5 transition-colors hover:bg-white/5 ${
          active ? "bg-white/6" : ""
        }`}
        style={{ paddingLeft: 4 + depth * 11 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Replier" : "Déplier"}
            aria-expanded={open}
            className="text-sourdine hover:text-papier mt-[3px] grid size-4 shrink-0 place-items-center rounded"
          >
            {open ? (
              <ChevronDown size={12} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} strokeWidth={2} />
            )}
          </button>
        ) : (
          <span className="mt-[3px] size-4 shrink-0" />
        )}

        <button
          type="button"
          onClick={() =>
            node.pageIndex !== null ? onJump(node.pageIndex) : undefined
          }
          disabled={node.pageIndex === null}
          title={node.title}
          className={`min-w-0 flex-1 text-left text-[12.5px] leading-snug ${
            node.pageIndex === null
              ? "text-sourdine cursor-default"
              : active
                ? "text-violette"
                : "text-papier/85 hover:text-papier"
          }`}
        >
          {node.title}
        </button>

        {node.pageIndex !== null && (
          <span className="font-chiffres text-sourdine mt-[2px] shrink-0 text-[10.5px]">
            {node.pageIndex + 1}
          </span>
        )}
      </div>

      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <Node
              key={child.id}
              node={child}
              depth={depth + 1}
              currentPage={currentPage}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BookmarkPanel({
  docId,
  rev,
  currentPage,
  marks,
  onJump,
  onAddMark,
  onRemoveMark,
}: Props) {
  const [nodes, setNodes] = useState<BookmarkNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNodes(null);
    listBookmarks(docId)
      .then((list) => {
        if (!cancelled) setNodes(list);
      })
      .catch(() => {
        if (!cancelled) setNodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [docId, rev]);

  const marked = marks.some((m) => m.pageIndex === currentPage);

  return (
    <div className="flex flex-col gap-4 px-2 py-3">
      <section>
        <div className="text-sourdine mb-1.5 px-2 text-[10.5px] font-medium tracking-[0.14em] uppercase">
          Sommaire du document
        </div>
        {nodes === null ? (
          <div className="text-sourdine px-2 py-1 text-[12px]">Lecture…</div>
        ) : nodes.length === 0 ? (
          <div className="text-sourdine px-2 py-1 text-[12px] leading-relaxed">
            Ce document ne contient pas de sommaire.
          </div>
        ) : (
          nodes.map((node) => (
            <Node
              key={node.id}
              node={node}
              depth={0}
              currentPage={currentPage}
              onJump={onJump}
            />
          ))
        )}
      </section>

      <section className="border-trait border-t pt-3">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <span className="text-sourdine text-[10.5px] font-medium tracking-[0.14em] uppercase">
            Mes signets
          </span>
          <button
            type="button"
            onClick={onAddMark}
            disabled={marked}
            title={
              marked
                ? "Cette page est déjà dans vos signets"
                : "Ajouter la page courante"
            }
            aria-label="Ajouter la page courante aux signets"
            className={`grid size-6 place-items-center rounded transition-colors ${
              marked
                ? "text-sourdine/40 cursor-default"
                : "text-sourdine hover:text-violette hover:bg-white/5"
            }`}
          >
            <BookmarkPlus size={13} strokeWidth={1.75} />
          </button>
        </div>

        {marks.length === 0 ? (
          <div className="text-sourdine px-2 py-1 text-[12px] leading-relaxed">
            Aucun signet. Marquez une page pour la retrouver.
          </div>
        ) : (
          marks.map((mark) => (
            <div
              key={mark.pageIndex}
              className={`group flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2 transition-colors hover:bg-white/5 ${
                mark.pageIndex === currentPage ? "bg-white/6" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onJump(mark.pageIndex)}
                className={`min-w-0 flex-1 truncate text-left text-[12.5px] ${
                  mark.pageIndex === currentPage
                    ? "text-violette"
                    : "text-papier/85 hover:text-papier"
                }`}
              >
                {mark.label}
              </button>
              <button
                type="button"
                onClick={() => onRemoveMark(mark.pageIndex)}
                aria-label={`Retirer le signet ${mark.label}`}
                className="text-sourdine hover:text-papier grid size-5 shrink-0 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
