import { invoke } from "@tauri-apps/api/core";
import type {
  BookmarkNode,
  DocInfo,
  InkStroke,
  PageImageInfo,
  PageOp,
  SearchHit,
  TextNote,
  TextSegment,
} from "../types";

export function openDocument(path: string): Promise<DocInfo> {
  return invoke<DocInfo>("open_document", { path });
}

export async function renderPage(
  docId: number,
  pageIndex: number,
  widthPx: number,
): Promise<Blob> {
  const bytes = await invoke<ArrayBuffer>("render_page", {
    docId,
    pageIndex,
    widthPx,
  });
  return new Blob([bytes], { type: "image/png" });
}

export function closeDocument(docId: number): Promise<void> {
  return invoke("close_document", { docId });
}

export interface PageAnnotsPayload {
  pageIndex: number;
  strokes: InkStroke[];
  notes: TextNote[];
}

/**
 * Écrit annotations et modifications de structure ; renvoie le document
 * rechargé. Sans `destPath`, le fichier d'origine est remplacé.
 */
export function saveDocument(
  docId: number,
  annots: PageAnnotsPayload[],
  destPath?: string,
): Promise<DocInfo> {
  return invoke<DocInfo>("save_document", { docId, annots, destPath });
}

/** Applique une opération de structure ; renvoie le document mis à jour. */
export function editPages(docId: number, op: PageOp): Promise<DocInfo> {
  return invoke<DocInfo>("edit_pages", { docId, op });
}

/** Écrit une sélection de pages dans un nouveau PDF. */
export function extractPages(
  docId: number,
  pages: number[],
  destPath: string,
): Promise<void> {
  return invoke("extract_pages", { docId, pages, destPath });
}

/** Écrit une page en PNG à la résolution demandée. */
export function exportPageImage(
  docId: number,
  pageIndex: number,
  dpi: number,
  destPath: string,
): Promise<void> {
  return invoke("export_page_image", { docId, pageIndex, dpi, destPath });
}

/** Fragments de texte d'une page, pour la couche de sélection. */
export function pageText(
  docId: number,
  pageIndex: number,
): Promise<TextSegment[]> {
  return invoke<TextSegment[]>("page_text", { docId, pageIndex });
}

/** Cherche une chaîne dans tout le document. */
export function searchDocument(
  docId: number,
  query: string,
  matchCase: boolean,
): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_document", { docId, query, matchCase });
}

/** Table des matières embarquée dans le PDF (vide s'il n'en a pas). */
export function listBookmarks(docId: number): Promise<BookmarkNode[]> {
  return invoke<BookmarkNode[]>("list_bookmarks", { docId });
}

/** Images présentes sur une page, avec leurs positions en points PDF. */
export function listPageImages(
  docId: number,
  pageIndex: number,
): Promise<PageImageInfo[]> {
  return invoke<PageImageInfo[]>("list_page_images", { docId, pageIndex });
}

export function exportImage(
  docId: number,
  pageIndex: number,
  objectPath: string,
  destPath: string,
): Promise<void> {
  return invoke("export_image", { docId, pageIndex, objectPath, destPath });
}

export function copyImageToClipboard(
  docId: number,
  pageIndex: number,
  objectPath: string,
): Promise<void> {
  return invoke("copy_image_to_clipboard", { docId, pageIndex, objectPath });
}
