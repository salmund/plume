import { useState } from "react";
import type { DocInfo, UserMark } from "../types";
import { BookmarkPanel } from "./BookmarkPanel";
import { ThumbnailList } from "./ThumbnailSidebar";

export type SidebarTab = "thumbs" | "bookmarks";

interface Props {
  doc: DocInfo;
  rev: number;
  current: number;
  marks: UserMark[];
  onJump: (index: number) => void;
  onAddMark: () => void;
  onRemoveMark: (pageIndex: number) => void;
}

export function Sidebar({
  doc,
  rev,
  current,
  marks,
  onJump,
  onAddMark,
  onRemoveMark,
}: Props) {
  const [tab, setTab] = useState<SidebarTab>(() => {
    const saved = localStorage.getItem("plume.sidebarTab");
    return saved === "bookmarks" ? "bookmarks" : "thumbs";
  });

  const select = (next: SidebarTab) => {
    setTab(next);
    try {
      localStorage.setItem("plume.sidebarTab", next);
    } catch {
      /* ignoré */
    }
  };

  return (
    <div className="bg-pupitre border-trait flex w-[184px] shrink-0 flex-col border-r">
      <div className="border-trait flex shrink-0 border-b p-1.5">
        {(
          [
            ["thumbs", "Vignettes"],
            ["bookmarks", "Signets"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            aria-pressed={tab === value}
            className={`flex-1 rounded-md py-1.5 text-[12px] transition-colors ${
              tab === value
                ? "text-papier bg-white/7"
                : "text-sourdine hover:text-papier hover:bg-white/4"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div data-thumbs className="min-h-0 flex-1 overflow-y-auto">
        {tab === "thumbs" ? (
          <ThumbnailList doc={doc} rev={rev} current={current} onJump={onJump} />
        ) : (
          <BookmarkPanel
            docId={doc.id}
            rev={rev}
            currentPage={current}
            marks={marks}
            onJump={onJump}
            onAddMark={onAddMark}
            onRemoveMark={onRemoveMark}
          />
        )}
      </div>
    </div>
  );
}
