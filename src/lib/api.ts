import { invoke } from "@tauri-apps/api/core";
import type {
  BookmarkNode,
  DocInfo,
  InkStroke,
  PageImageInfo,
  TextNote,
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

/** Écrit les annotations dans le PDF ; renvoie le document rechargé. */
export function saveDocument(
  docId: number,
  annots: PageAnnotsPayload[],
): Promise<DocInfo> {
  return invoke<DocInfo>("save_document", { docId, annots });
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
