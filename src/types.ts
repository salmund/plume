export interface PageInfo {
  /** Largeur en points PDF (1/72 pouce). */
  width: number;
  height: number;
}

export interface DocInfo {
  id: number;
  path: string;
  title: string;
  pageCount: number;
  pages: PageInfo[];
}

export type InkTool = "pen" | "highlighter" | "eraser" | "text";

export interface TextNote {
  id: string;
  /** Coin haut-gauche en points PDF. */
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  color: string;
}

/** Opération de structure sur les pages du document. */
export type PageOp =
  | { kind: "rotate"; pages: number[]; quarterTurns: number }
  | { kind: "delete"; pages: number[] }
  | { kind: "move"; pages: number[]; dest: number }
  | { kind: "merge"; paths: string[]; at: number };

/** Fragment de texte positionné, en points PDF depuis le haut de la page. */
export interface TextSegment {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Occurrence trouvée : un rectangle par ligne enjambée. */
export interface SearchHit {
  pageIndex: number;
  rects: TextSegment[];
}

/** Signet du document (table des matières embarquée dans le PDF). */
export interface BookmarkNode {
  id: string;
  title: string;
  pageIndex: number | null;
  children: BookmarkNode[];
}

/** Signet posé par l'utilisateur, conservé localement. */
export interface UserMark {
  pageIndex: number;
  label: string;
}

export interface PageImageInfo {
  /** « 3 », ou « 1.13 » pour une image imbriquée dans un Form XObject. */
  objectPath: string;
  /** Coin haut-gauche en points PDF. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InkStroke {
  id: string;
  tool: "pen" | "highlighter";
  color: string;
  /** Épaisseur de base en points PDF. */
  width: number;
  /** Points [x, y, pression 0..1] en points PDF, origine en haut à gauche. */
  points: [number, number, number][];
}

/** Traits non enregistrés d'un document, par index de page. */
export type DocInk = Record<number, InkStroke[]>;

/** Notes de texte non enregistrées, par index de page. */
export type DocNotes = Record<number, TextNote[]>;
