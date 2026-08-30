import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  DocInfo,
  DocInk,
  DocNotes,
  InkStroke,
  PageOp,
  TextNote,
} from "./types";
import {
  closeDocument,
  copyImageToClipboard,
  editPages,
  exportImage,
  exportPageImage,
  extractPages,
  openDocument,
  saveDocument,
} from "./lib/api";
import {
  loadRecents,
  loadSession,
  pushRecent,
  saveSession,
  useSettings,
  type RecentFile,
} from "./lib/settings";
import { Tabs } from "./components/Tabs";
import { Viewer } from "./components/Viewer";
import { EmptyState } from "./components/EmptyState";
import { SettingsDialog } from "./components/SettingsDialog";
import { ImageMenu } from "./components/ImageMenu";
import type { ImageTarget } from "./components/ImageLayer";

/** Un état d'annotations complet : encre + notes de texte. */
interface AnnotSnapshot {
  ink: DocInk;
  notes: DocNotes;
}

interface AnnotHistory {
  past: AnnotSnapshot[];
  future: AnnotSnapshot[];
}

const HISTORY_MAX = 200;

export default function App() {
  const { settings } = useSettings();
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [recents, setRecents] = useState<RecentFile[]>(loadRecents);

  // Annotations non enregistrées, par document puis par page.
  const [inkByDoc, setInkByDoc] = useState<Record<number, DocInk>>({});
  const [notesByDoc, setNotesByDoc] = useState<Record<number, DocNotes>>({});
  const [revs, setRevs] = useState<Record<number, number>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [imageTarget, setImageTarget] = useState<ImageTarget | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // L'historique vit dans une ref (les updaters React doivent rester purs) ;
  // ce compteur force le re-rendu de canUndo/canRedo.
  const historyRef = useRef<Record<number, AnnotHistory>>({});
  const [, setHistTick] = useState(0);

  const docsRef = useRef(docs);
  docsRef.current = docs;
  const inkRef = useRef(inkByDoc);
  inkRef.current = inkByDoc;
  const notesRef = useRef(notesByDoc);
  notesRef.current = notesByDoc;
  // Session telle qu'elle était au lancement, capturée avant toute écriture.
  const initialSession = useRef(loadSession());
  const startedRef = useRef(false);
  const openingRef = useRef<Set<string>>(new Set());

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  /* ---------- Encre : mutations et historique ---------- */

  const snapshot = useCallback(
    (docId: number): AnnotSnapshot => ({
      ink: inkRef.current[docId] ?? {},
      notes: notesRef.current[docId] ?? {},
    }),
    [],
  );

  const pushHistory = useCallback(
    (docId: number) => {
      const history = (historyRef.current[docId] ??= { past: [], future: [] });
      history.past.push(snapshot(docId));
      if (history.past.length > HISTORY_MAX) history.past.shift();
      history.future = [];
      setHistTick((t) => t + 1);
    },
    [snapshot],
  );

  const restore = useCallback((docId: number, state: AnnotSnapshot) => {
    setInkByDoc((prev) => ({ ...prev, [docId]: state.ink }));
    setNotesByDoc((prev) => ({ ...prev, [docId]: state.notes }));
    setHistTick((t) => t + 1);
  }, []);

  const addStroke = useCallback(
    (docId: number, pageIndex: number, stroke: InkStroke) => {
      pushHistory(docId);
      const current = inkRef.current[docId] ?? {};
      setInkByDoc((prev) => ({
        ...prev,
        [docId]: {
          ...current,
          [pageIndex]: [...(current[pageIndex] ?? []), stroke],
        },
      }));
    },
    [pushHistory],
  );

  const eraseStrokes = useCallback(
    (docId: number, pageIndex: number, ids: string[]) => {
      if (ids.length === 0) return;
      pushHistory(docId);
      const current = inkRef.current[docId] ?? {};
      setInkByDoc((prev) => ({
        ...prev,
        [docId]: {
          ...current,
          [pageIndex]: (current[pageIndex] ?? []).filter(
            (s) => !ids.includes(s.id),
          ),
        },
      }));
    },
    [pushHistory],
  );

  const createNote = useCallback(
    (docId: number, pageIndex: number, note: TextNote) => {
      pushHistory(docId);
      const current = notesRef.current[docId] ?? {};
      setNotesByDoc((prev) => ({
        ...prev,
        [docId]: {
          ...current,
          [pageIndex]: [...(current[pageIndex] ?? []), note],
        },
      }));
    },
    [pushHistory],
  );

  const updateNote = useCallback(
    (
      docId: number,
      pageIndex: number,
      id: string,
      patch: Partial<TextNote>,
    ) => {
      // La frappe et le glissement ne créent pas un point d'annulation par
      // caractère : l'historique a déjà été empilé à la création.
      const current = notesRef.current[docId] ?? {};
      setNotesByDoc((prev) => ({
        ...prev,
        [docId]: {
          ...current,
          [pageIndex]: (current[pageIndex] ?? []).map((n) =>
            n.id === id ? { ...n, ...patch } : n,
          ),
        },
      }));
    },
    [],
  );

  const deleteNote = useCallback(
    (docId: number, pageIndex: number, id: string) => {
      pushHistory(docId);
      const current = notesRef.current[docId] ?? {};
      setNotesByDoc((prev) => ({
        ...prev,
        [docId]: {
          ...current,
          [pageIndex]: (current[pageIndex] ?? []).filter((n) => n.id !== id),
        },
      }));
    },
    [pushHistory],
  );

  const undo = useCallback(
    (docId: number) => {
      const history = historyRef.current[docId];
      if (!history || history.past.length === 0) return;
      const previous = history.past.pop()!;
      history.future.push(snapshot(docId));
      restore(docId, previous);
    },
    [snapshot, restore],
  );

  const redo = useCallback(
    (docId: number) => {
      const history = historyRef.current[docId];
      if (!history || history.future.length === 0) return;
      const next = history.future.pop()!;
      history.past.push(snapshot(docId));
      restore(docId, next);
    },
    [snapshot, restore],
  );

  const docIsDirty = useCallback((docId: number) => {
    const ink = inkRef.current[docId];
    const notes = notesRef.current[docId];
    const hasInk = !!ink && Object.values(ink).some((s) => s.length > 0);
    const hasNotes =
      !!notes &&
      Object.values(notes).some((list) =>
        list.some((n) => n.text.trim().length > 0),
      );
    return hasInk || hasNotes;
  }, []);

  const saveDoc = useCallback(
    async (docId: number, destPath?: string) => {
      const ink = inkRef.current[docId] ?? {};
      const notes = notesRef.current[docId] ?? {};
      const pages = new Set([
        ...Object.keys(ink).map(Number),
        ...Object.keys(notes).map(Number),
      ]);
      const payload = [...pages]
        .map((pageIndex) => ({
          pageIndex,
          strokes: ink[pageIndex] ?? [],
          notes: (notes[pageIndex] ?? []).filter((n) => n.text.trim()),
        }))
        .filter((p) => p.strokes.length > 0 || p.notes.length > 0);
      // Un enregistrement sans annotation reste utile : les modifications de
      // structure vivent en mémoire jusqu'ici.
      if (payload.length === 0 && !destPath && !structuralRef.current.has(docId)) {
        return;
      }

      setSavingId(docId);
      try {
        const info = await saveDocument(docId, payload, destPath);
        structuralRef.current.delete(docId);
        setDocs((prev) => prev.map((d) => (d.id === docId ? info : d)));
        setInkByDoc((prev) => ({ ...prev, [docId]: {} }));
        setNotesByDoc((prev) => ({ ...prev, [docId]: {} }));
        historyRef.current[docId] = { past: [], future: [] };
        setHistTick((t) => t + 1);
        setRevs((prev) => ({ ...prev, [docId]: (prev[docId] ?? 0) + 1 }));
        flash("Annotations enregistrées dans le PDF.");
      } catch (e) {
        flash(String(e));
      } finally {
        setSavingId(null);
      }
    },
    [flash],
  );

  /* ---------- Structure des pages ---------- */

  /** Documents dont la structure a changé sans être encore enregistrée. */
  const structuralRef = useRef<Set<number>>(new Set());

  /**
   * Réindexe les annotations en attente après une opération de structure :
   * `mapping[ancienIndex]` donne le nouvel index, ou `undefined` si la page
   * a disparu.
   */
  const remapPending = useCallback(
    (docId: number, mapping: Map<number, number>) => {
      const move = <T,>(byPage: Record<number, T[]>): Record<number, T[]> => {
        const next: Record<number, T[]> = {};
        for (const [page, items] of Object.entries(byPage)) {
          const to = mapping.get(Number(page));
          if (to !== undefined && items.length > 0) next[to] = items;
        }
        return next;
      };
      setInkByDoc((prev) => ({ ...prev, [docId]: move(prev[docId] ?? {}) }));
      setNotesByDoc((prev) => ({ ...prev, [docId]: move(prev[docId] ?? {}) }));
      // Les états antérieurs ne correspondent plus à la nouvelle pagination.
      historyRef.current[docId] = { past: [], future: [] };
      setHistTick((t) => t + 1);
    },
    [],
  );

  /** Ce que devient chaque page après l'opération. */
  const mappingFor = useCallback(
    (op: PageOp, pageCount: number): Map<number, number> => {
      const mapping = new Map<number, number>();
      if (op.kind === "delete") {
        const removed = new Set(op.pages);
        let shift = 0;
        for (let i = 0; i < pageCount; i++) {
          if (removed.has(i)) shift++;
          else mapping.set(i, i - shift);
        }
      } else if (op.kind === "move") {
        const moving = [...op.pages].sort((a, b) => a - b);
        const rest = Array.from({ length: pageCount }, (_, i) => i).filter(
          (i) => !moving.includes(i),
        );
        const order = [
          ...rest.slice(0, op.dest),
          ...moving,
          ...rest.slice(op.dest),
        ];
        order.forEach((from, to) => mapping.set(from, to));
      } else if (op.kind === "merge") {
        for (let i = 0; i < pageCount; i++) {
          mapping.set(i, i < op.at ? i : i + 1);
        }
      } else {
        // Rotation : la pagination ne bouge pas.
        for (let i = 0; i < pageCount; i++) mapping.set(i, i);
      }
      return mapping;
    },
    [],
  );

  const applyPageOp = useCallback(
    async (docId: number, op: PageOp) => {
      const doc = docsRef.current.find((d) => d.id === docId);
      if (!doc) return;
      setBusyId(docId);
      try {
        const info = await editPages(docId, op);
        // Le remappage se fait sur la pagination d'avant l'opération ; pour
        // une fusion, seul le décalage compte, pas le nombre exact ajouté.
        remapPending(docId, mappingFor(op, doc.pageCount));
        setDocs((prev) => prev.map((d) => (d.id === docId ? info : d)));
        structuralRef.current.add(docId);
        setRevs((prev) => ({ ...prev, [docId]: (prev[docId] ?? 0) + 1 }));
      } catch (e) {
        flash(String(e));
      } finally {
        setBusyId(null);
      }
    },
    [flash, remapPending, mappingFor],
  );

  const extractSelection = useCallback(
    async (docId: number, pages: number[]) => {
      if (pages.length === 0) return;
      const doc = docsRef.current.find((d) => d.id === docId);
      const dest = await save({
        defaultPath: `${doc?.title ?? "extrait"} - pages.pdf`,
        filters: [{ name: "Documents PDF", extensions: ["pdf"] }],
      });
      if (!dest) return;
      try {
        await extractPages(docId, pages, dest);
        flash(`${pages.length} page(s) extraite(s).`);
      } catch (e) {
        flash(String(e));
      }
    },
    [flash],
  );

  const mergeInto = useCallback(
    async (docId: number, at: number) => {
      const chosen = await open({
        multiple: true,
        filters: [{ name: "Documents PDF", extensions: ["pdf"] }],
      });
      if (!chosen) return;
      const paths = Array.isArray(chosen) ? chosen : [chosen];
      await applyPageOp(docId, { kind: "merge", paths, at });
    },
    [applyPageOp],
  );

  const exportPageAsImage = useCallback(
    async (docId: number, pageIndex: number) => {
      const doc = docsRef.current.find((d) => d.id === docId);
      const dest = await save({
        defaultPath: `${doc?.title ?? "page"} - p${pageIndex + 1}.png`,
        filters: [{ name: "Image PNG", extensions: ["png"] }],
      });
      if (!dest) return;
      try {
        await exportPageImage(docId, pageIndex, 200, dest);
        flash("Page exportée en image.");
      } catch (e) {
        flash(String(e));
      }
    },
    [flash],
  );

  /* ---------- Images ---------- */

  const saveImage = useCallback(
    async (docId: number, target: ImageTarget) => {
      const dest = await save({
        defaultPath: `image-p${target.pageIndex + 1}.png`,
        filters: [{ name: "Image PNG", extensions: ["png"] }],
      });
      if (!dest) return;
      try {
        await exportImage(
          docId,
          target.pageIndex,
          target.image.objectPath,
          dest,
        );
        flash("Image enregistrée.");
      } catch (e) {
        flash(String(e));
      }
    },
    [flash],
  );

  const copyImage = useCallback(
    async (docId: number, target: ImageTarget) => {
      try {
        await copyImageToClipboard(
          docId,
          target.pageIndex,
          target.image.objectPath,
        );
        flash("Image copiée dans le presse-papiers.");
      } catch (e) {
        flash(String(e));
      }
    },
    [flash],
  );

  // « Partager » : l'image est écrite puis révélée dans l'Explorateur, d'où
  // Windows offre son propre menu de partage.
  const shareImage = useCallback(
    async (docId: number, target: ImageTarget) => {
      const dest = await save({
        defaultPath: `image-p${target.pageIndex + 1}.png`,
        filters: [{ name: "Image PNG", extensions: ["png"] }],
      });
      if (!dest) return;
      try {
        await exportImage(
          docId,
          target.pageIndex,
          target.image.objectPath,
          dest,
        );
        await revealItemInDir(dest);
        flash("Image prête à partager dans l'Explorateur.");
      } catch (e) {
        flash(String(e));
      }
    },
    [flash],
  );

  /* ---------- Ouverture / fermeture ---------- */

  const openPaths = useCallback(
    async (paths: string[], opts?: { silent?: boolean }) => {
      const pdfPaths = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
      if (pdfPaths.length === 0 && paths.length > 0 && !opts?.silent) {
        flash("Seuls les PDF sont pris en charge pour l'instant.");
        return;
      }
      for (const path of pdfPaths) {
        const existing = docsRef.current.find((d) => d.path === path);
        if (existing) {
          setActiveId(existing.id);
          continue;
        }
        if (openingRef.current.has(path)) continue;
        openingRef.current.add(path);
        try {
          const info = await openDocument(path);
          setDocs((prev) => [...prev, info]);
          setActiveId(info.id);
          pushRecent({ path: info.path, title: info.title });
          setRecents(loadRecents());
        } catch (e) {
          if (!opts?.silent) flash(String(e));
        } finally {
          openingRef.current.delete(path);
        }
      }
    },
    [flash],
  );

  const openViaDialog = useCallback(async () => {
    const chosen = await open({
      multiple: true,
      filters: [{ name: "Documents PDF", extensions: ["pdf"] }],
    });
    if (chosen) openPaths(Array.isArray(chosen) ? chosen : [chosen]);
  }, [openPaths]);

  const saveAs = useCallback(
    async (docId: number) => {
      const doc = docsRef.current.find((d) => d.id === docId);
      const dest = await save({
        defaultPath: `${doc?.title ?? "document"}.pdf`,
        filters: [{ name: "Documents PDF", extensions: ["pdf"] }],
      });
      if (dest) await saveDoc(docId, dest);
    },
    [saveDoc],
  );

  const closeTab = useCallback(
    async (id: number) => {
      if (docIsDirty(id) || structuralRef.current.has(id)) {
        const confirmed = await ask(
          "Ce document contient des modifications non enregistrées.\nFermer sans enregistrer ?",
          { title: "Plume", kind: "warning" },
        );
        if (!confirmed) return;
      }
      closeDocument(id).catch(() => {});
      structuralRef.current.delete(id);
      delete historyRef.current[id];
      setInkByDoc((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotesByDoc((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDocs((prev) => {
        const idx = prev.findIndex((d) => d.id === id);
        const next = prev.filter((d) => d.id !== id);
        setActiveId((current) => {
          if (current !== id) return current;
          if (next.length === 0) return null;
          return next[Math.min(idx, next.length - 1)].id;
        });
        return next;
      });
    },
    [docIsDirty],
  );

  // Démarrage : fichiers passés en argument + session précédente.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const args = await invoke<string[]>("startup_files").catch(
        () => [] as string[],
      );
      const session = settings.restoreSession
        ? initialSession.current
        : { paths: [], activePath: null };
      // La session se rouvre en silence : un fichier déplacé ne mérite pas d'erreur.
      await openPaths(session.paths, { silent: true });
      await openPaths(args);
      if (args.length === 0 && session.activePath) {
        const doc = docsRef.current.find(
          (d) => d.path === session.activePath,
        );
        if (doc) setActiveId(doc.id);
      }
    })();
    // Ne doit tourner qu'une fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  // La session en cours est sauvegardée à chaque changement d'onglets.
  useEffect(() => {
    if (!startedRef.current) return;
    saveSession({
      paths: docs.map((d) => d.path),
      activePath: activeDoc?.path ?? null,
    });
  }, [docs, activeDoc]);

  // Titre de la fenêtre : le document actif.
  useEffect(() => {
    getCurrentWindow()
      .setTitle(activeDoc ? `${activeDoc.title} — Plume` : "Plume")
      .catch(() => {});
  }, [activeDoc]);

  // Fichiers transmis par une seconde instance (double-clic dans l'Explorateur).
  useEffect(() => {
    const unlisten = listen<string[]>("open-files", (event) => {
      openPaths(event.payload ?? []);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openPaths]);

  // Glisser-déposer natif (fichiers venant de l'Explorateur)
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter") setDragging(true);
      else if (event.payload.type === "leave") setDragging(false);
      else if (event.payload.type === "drop") {
        setDragging(false);
        openPaths(event.payload.paths);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openPaths]);

  // Raccourcis globaux
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        openViaDialog();
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        setActiveId((current) => {
          if (current !== null) closeTab(current);
          return current;
        });
      } else if (e.key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
      } else if (e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setActiveId((current) => {
          if (current !== null) saveAs(current);
          return current;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openViaDialog, closeTab, saveAs]);

  // Comportements navigateur qui n'ont pas leur place dans une vraie app :
  // zoom du WebView (Ctrl+molette hors visionneuse) et menu contextuel.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea")) return;
      e.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  const activeHistory = activeId !== null ? historyRef.current[activeId] : null;

  return (
    <div className="flex h-full flex-col">
      <Tabs
        docs={docs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closeTab}
        onOpen={openViaDialog}
        onSettings={() => setShowSettings(true)}
      />

      <div className="relative min-h-0 flex-1">
        {activeDoc ? (
          <Viewer
            key={activeDoc.id}
            doc={activeDoc}
            rev={revs[activeDoc.id] ?? 0}
            ink={inkByDoc[activeDoc.id] ?? {}}
            notes={notesByDoc[activeDoc.id] ?? {}}
            dirty={docIsDirty(activeDoc.id) || structuralRef.current.has(activeDoc.id)}
            saving={savingId === activeDoc.id}
            busy={busyId === activeDoc.id}
            onEditPages={(op) => applyPageOp(activeDoc.id, op)}
            onExtract={(pages) => extractSelection(activeDoc.id, pages)}
            onMerge={(at) => mergeInto(activeDoc.id, at)}
            onExportImage={(page) => exportPageAsImage(activeDoc.id, page)}
            canUndo={(activeHistory?.past.length ?? 0) > 0}
            canRedo={(activeHistory?.future.length ?? 0) > 0}
            onOpen={openViaDialog}
            onSave={() => saveDoc(activeDoc.id)}
            onUndo={() => undo(activeDoc.id)}
            onRedo={() => redo(activeDoc.id)}
            onAddStroke={(page, stroke) => addStroke(activeDoc.id, page, stroke)}
            onEraseStrokes={(page, ids) => eraseStrokes(activeDoc.id, page, ids)}
            onCreateNote={(page, note) => createNote(activeDoc.id, page, note)}
            onUpdateNote={(page, id, patch) =>
              updateNote(activeDoc.id, page, id, patch)
            }
            onDeleteNote={(page, id) => deleteNote(activeDoc.id, page, id)}
            onImageMenu={setImageTarget}
          />
        ) : (
          <EmptyState
            dragging={dragging}
            onOpen={openViaDialog}
            recents={recents}
            onOpenRecent={(path) => openPaths([path])}
          />
        )}

        {/* Liseré d'encre pendant un glisser-déposer sur un document ouvert */}
        {dragging && activeDoc && (
          <div className="border-violette pointer-events-none absolute inset-0 z-10 border-2" />
        )}
      </div>

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {imageTarget && activeDoc && (
        <ImageMenu
          target={imageTarget}
          onClose={() => setImageTarget(null)}
          onSave={() => {
            setImageTarget(null);
            saveImage(activeDoc.id, imageTarget);
          }}
          onCopy={() => {
            setImageTarget(null);
            copyImage(activeDoc.id, imageTarget);
          }}
          onShare={() => {
            setImageTarget(null);
            shareImage(activeDoc.id, imageTarget);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="bg-pupitre border-trait text-papier absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border px-4 py-2.5 text-[13px] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
