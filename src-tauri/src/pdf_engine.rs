//! Moteur PDF : un thread dédié possède l'instance PDFium (non thread-safe)
//! et répond aux requêtes via une file de messages.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Sender};

use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    /// Largeur en points PDF (1/72 pouce).
    pub width: f32,
    pub height: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocInfo {
    pub id: u32,
    pub path: String,
    pub title: String,
    pub page_count: u16,
    pub pages: Vec<PageInfo>,
}

/// Un trait d'encre venu du frontend. Coordonnées en points PDF,
/// origine en haut à gauche (converties ici vers l'origine PDF en bas).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InkStrokeIn {
    /// "pen" ou "highlighter".
    pub tool: String,
    /// Couleur "#rrggbb".
    pub color: String,
    /// Épaisseur de base en points PDF.
    pub width: f32,
    /// Points [x, y, pression 0..1].
    pub points: Vec<[f32; 3]>,
}

/// Une note de texte venue du frontend. Coordonnées en points PDF,
/// origine en haut à gauche.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNoteIn {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub text: String,
    pub font_size: f32,
    pub color: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageAnnotsIn {
    pub page_index: u16,
    #[serde(default)]
    pub strokes: Vec<InkStrokeIn>,
    #[serde(default)]
    pub notes: Vec<TextNoteIn>,
}

/// Un fragment de texte d'une page. Coordonnées en points PDF, origine en
/// haut à gauche : la couche texte du frontend les pose telles quelles.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextSegment {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Une occurrence trouvée dans le document.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub page_index: u16,
    /// Rectangles à surligner (un par ligne quand l'occurrence en enjambe deux).
    pub rects: Vec<TextSegment>,
}

/// Un signet du document (table des matières embarquée dans le PDF).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkNode {
    /// Chemin dans l'arbre, « 0 » ou « 0.2.1 » : identifiant stable pour l'UI.
    pub id: String,
    pub title: String,
    /// Page visée, absente si le signet ne pointe pas vers ce document.
    pub page_index: Option<u16>,
    pub children: Vec<BookmarkNode>,
}

/// Une image détectée sur une page. Coordonnées en points PDF,
/// origine en haut à gauche.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageImageInfo {
    /// Chemin de l'objet, « 3 » ou « 1.13 » pour une image imbriquée
    /// dans un Form XObject.
    pub object_path: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Une opération de structure sur les pages du document.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PageOp {
    /// Quarts de tour horaires (négatif = antihoraire).
    Rotate {
        pages: Vec<u16>,
        quarter_turns: i32,
    },
    Delete {
        pages: Vec<u16>,
    },
    /// Déplace les pages données pour qu'elles commencent à `dest`.
    Move {
        pages: Vec<u16>,
        dest: u16,
    },
    /// Insère les pages d'autres PDF à la position donnée.
    Merge {
        paths: Vec<String>,
        at: u16,
    },
}

pub enum PdfRequest {
    Open {
        path: String,
        reply: oneshot::Sender<Result<DocInfo, String>>,
    },
    Render {
        doc_id: u32,
        page_index: u16,
        width_px: u32,
        reply: oneshot::Sender<Result<Vec<u8>, String>>,
    },
    Save {
        doc_id: u32,
        annots: Vec<PageAnnotsIn>,
        /// Chemin de destination ; `None` remplace le fichier d'origine.
        dest_path: Option<String>,
        reply: oneshot::Sender<Result<DocInfo, String>>,
    },
    PageText {
        doc_id: u32,
        page_index: u16,
        reply: oneshot::Sender<Result<Vec<TextSegment>, String>>,
    },
    Search {
        doc_id: u32,
        query: String,
        match_case: bool,
        /// Nombre maximal d'occurrences renvoyées.
        limit: usize,
        reply: oneshot::Sender<Result<Vec<SearchHit>, String>>,
    },
    EditPages {
        doc_id: u32,
        op: PageOp,
        reply: oneshot::Sender<Result<DocInfo, String>>,
    },
    /// Écrit une sélection de pages dans un nouveau fichier.
    ExtractPages {
        doc_id: u32,
        pages: Vec<u16>,
        dest_path: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    /// Écrit une page en PNG à la résolution demandée.
    ExportPageImage {
        doc_id: u32,
        page_index: u16,
        dpi: u32,
        dest_path: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    ListBookmarks {
        doc_id: u32,
        reply: oneshot::Sender<Result<Vec<BookmarkNode>, String>>,
    },
    ListImages {
        doc_id: u32,
        page_index: u16,
        reply: oneshot::Sender<Result<Vec<PageImageInfo>, String>>,
    },
    ExtractImage {
        doc_id: u32,
        page_index: u16,
        object_path: String,
        reply: oneshot::Sender<Result<Vec<u8>, String>>,
    },
    Close {
        doc_id: u32,
    },
}

struct OpenDoc {
    path: String,
    document: PdfDocument<'static>,
    /// Le document en mémoire diffère du fichier (pages réorganisées,
    /// pivotées, supprimées, fusionnées…).
    dirty: bool,
}

pub fn spawn() -> Sender<PdfRequest> {
    let (tx, rx) = channel::<PdfRequest>();

    std::thread::Builder::new()
        .name("pdf-engine".into())
        .spawn(move || {
            let pdfium: &'static Pdfium = match bind_pdfium() {
                Ok(p) => Box::leak(Box::new(p)),
                Err(err) => {
                    for req in rx.iter() {
                        match req {
                            PdfRequest::Open { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::Render { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::Save { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::EditPages { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::ExtractPages { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::ExportPageImage { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::PageText { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::Search { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::ListBookmarks { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::ListImages { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::ExtractImage { reply, .. } => {
                                let _ = reply.send(Err(err.clone()));
                            }
                            PdfRequest::Close { .. } => {}
                        }
                    }
                    return;
                }
            };

            let mut docs: HashMap<u32, OpenDoc> = HashMap::new();
            let mut next_id: u32 = 1;

            for req in rx.iter() {
                match req {
                    PdfRequest::Open { path, reply } => {
                        let result = pdfium
                            .load_pdf_from_file(&path, None)
                            .map_err(|e| format!("Ouverture impossible : {e}"))
                            .map(|document| {
                                let id = next_id;
                                next_id += 1;
                                let info = doc_info_from(&document, id, &path);
                                docs.insert(
                                    id,
                                    OpenDoc {
                                        path,
                                        document,
                                        dirty: false,
                                    },
                                );
                                info
                            });
                        let _ = reply.send(result);
                    }

                    PdfRequest::Render {
                        doc_id,
                        page_index,
                        width_px,
                        reply,
                    } => {
                        let result = render_page(&docs, doc_id, page_index, width_px);
                        let _ = reply.send(result);
                    }

                    PdfRequest::Save {
                        doc_id,
                        annots,
                        dest_path,
                        reply,
                    } => {
                        let result = save_with_annots(
                            pdfium,
                            &mut docs,
                            doc_id,
                            &annots,
                            dest_path.as_deref(),
                        );
                        let _ = reply.send(result);
                    }

                    PdfRequest::EditPages { doc_id, op, reply } => {
                        let result = edit_pages(pdfium, &mut docs, doc_id, op);
                        let _ = reply.send(result);
                    }

                    PdfRequest::ExtractPages {
                        doc_id,
                        pages,
                        dest_path,
                        reply,
                    } => {
                        let result = extract_pages(pdfium, &docs, doc_id, &pages, &dest_path);
                        let _ = reply.send(result);
                    }

                    PdfRequest::ExportPageImage {
                        doc_id,
                        page_index,
                        dpi,
                        dest_path,
                        reply,
                    } => {
                        let result =
                            export_page_image(&docs, doc_id, page_index, dpi, &dest_path);
                        let _ = reply.send(result);
                    }

                    PdfRequest::PageText {
                        doc_id,
                        page_index,
                        reply,
                    } => {
                        let result = page_text(&docs, doc_id, page_index);
                        let _ = reply.send(result);
                    }

                    PdfRequest::Search {
                        doc_id,
                        query,
                        match_case,
                        limit,
                        reply,
                    } => {
                        let result = search_document(&docs, doc_id, &query, match_case, limit);
                        let _ = reply.send(result);
                    }

                    PdfRequest::ListBookmarks { doc_id, reply } => {
                        let result = list_bookmarks(&docs, doc_id);
                        let _ = reply.send(result);
                    }

                    PdfRequest::ListImages {
                        doc_id,
                        page_index,
                        reply,
                    } => {
                        let result = list_page_images(&docs, doc_id, page_index);
                        let _ = reply.send(result);
                    }

                    PdfRequest::ExtractImage {
                        doc_id,
                        page_index,
                        object_path,
                        reply,
                    } => {
                        let result = extract_image(&docs, doc_id, page_index, &object_path);
                        let _ = reply.send(result);
                    }

                    PdfRequest::Close { doc_id } => {
                        docs.remove(&doc_id);
                    }
                }
            }
        })
        .expect("impossible de démarrer le thread du moteur PDF");

    tx
}

fn doc_info_from(document: &PdfDocument<'_>, id: u32, path: &str) -> DocInfo {
    let pages: Vec<PageInfo> = document
        .pages()
        .iter()
        .map(|page| PageInfo {
            width: page.width().value,
            height: page.height().value,
        })
        .collect();

    let title = PathBuf::from(path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Document".to_string());

    DocInfo {
        id,
        path: path.to_string(),
        title,
        page_count: pages.len() as u16,
        pages,
    }
}

fn render_page(
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
    page_index: u16,
    width_px: u32,
) -> Result<Vec<u8>, String> {
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    let page = open_doc
        .document
        .pages()
        .get(page_index)
        .map_err(|e| format!("Page introuvable : {e}"))?;

    // Borne la largeur pour éviter les explosions mémoire.
    let width_px = width_px.clamp(16, 8192);

    let config = PdfRenderConfig::new()
        .set_target_width(width_px as i32)
        .render_form_data(true)
        .use_lcd_text_rendering(true);

    let bitmap = page
        .render_with_config(&config)
        .map_err(|e| format!("Rendu impossible : {e}"))?;

    encode_png(bitmap.as_image())
}

/// Applique les traits d'encre (annotations `Ink`) et les notes de texte
/// (annotations `Stamp` à objets texte) au document, puis remplace le fichier
/// sur disque et rouvre le document (même identifiant).
fn save_with_annots(
    pdfium: &'static Pdfium,
    docs: &mut HashMap<u32, OpenDoc>,
    doc_id: u32,
    annots: &[PageAnnotsIn],
    dest_path: Option<&str>,
) -> Result<DocInfo, String> {
    let (source_path, bytes) = {
        let open_doc = docs.get_mut(&doc_id).ok_or("Document inconnu".to_string())?;
        let font = open_doc.document.fonts_mut().helvetica();

        for page_annots in annots {
            let mut page = open_doc
                .document
                .pages()
                .get(page_annots.page_index)
                .map_err(|e| format!("Page introuvable : {e}"))?;
            let page_height = page.height().value;

            for stroke in &page_annots.strokes {
                if stroke.points.len() < 2 {
                    continue;
                }
                add_ink_stroke(&open_doc.document, &mut page, page_height, stroke)?;
            }

            for note in &page_annots.notes {
                if note.text.trim().is_empty() {
                    continue;
                }
                add_text_note(&open_doc.document, &mut page, page_height, note, font.token())?;
            }
        }

        let bytes = open_doc
            .document
            .save_to_bytes()
            .map_err(|e| format!("Sérialisation du PDF : {e:?}"))?;
        (open_doc.path.clone(), bytes)
    };

    // Le document rouvert devient celui qu'on vient d'écrire : un
    // « enregistrer sous » bascule l'onglet sur le nouveau fichier.
    let path = dest_path.unwrap_or(&source_path).to_string();

    // Ferme le document (libère le fichier), puis écrit en passant par un
    // fichier temporaire pour ne pas laisser l'original tronqué en cas
    // d'interruption.
    docs.remove(&doc_id);
    let tmp = format!("{path}.plume-tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| format!("Écriture : {e}"))?;
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Remplacement : {e}"))?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| format!("Renommage : {e}"))?;

    let document = pdfium
        .load_pdf_from_file(&path, None)
        .map_err(|e| format!("Réouverture : {e}"))?;
    let info = doc_info_from(&document, doc_id, &path);
    docs.insert(
        doc_id,
        OpenDoc {
            path,
            document,
            dirty: false,
        },
    );
    Ok(info)
}

fn add_ink_stroke(
    document: &PdfDocument<'static>,
    page: &mut PdfPage<'static>,
    page_height: f32,
    stroke: &InkStrokeIn,
) -> Result<(), String> {
    let (r, g, b) = parse_hex(&stroke.color)?;
    let is_highlighter = stroke.tool == "highlighter";
    let alpha = if is_highlighter { 96 } else { 255 };
    let color = PdfColor::new(r, g, b, alpha);

    // L'épaisseur enregistrée reflète la pression moyenne du trait.
    let avg_pressure: f32 =
        stroke.points.iter().map(|p| p[2]).sum::<f32>() / stroke.points.len() as f32;
    let width = if is_highlighter {
        stroke.width
    } else {
        (stroke.width * (0.55 + 0.9 * avg_pressure)).max(0.3)
    };

    let first = stroke.points[0];
    let mut path = PdfPagePathObject::new(
        document,
        PdfPoints::new(first[0]),
        PdfPoints::new(page_height - first[1]),
        Some(color),
        Some(PdfPoints::new(width)),
        None,
    )
    .map_err(|e| format!("Création du tracé : {e:?}"))?;

    for p in stroke.points.iter().skip(1) {
        path.line_to(PdfPoints::new(p[0]), PdfPoints::new(page_height - p[1]))
            .map_err(|e| format!("Segment du tracé : {e:?}"))?;
    }
    path.set_line_cap(PdfPageObjectLineCap::Round)
        .map_err(|e| format!("Extrémités du tracé : {e:?}"))?;
    path.set_line_join(PdfPageObjectLineJoin::Round)
        .map_err(|e| format!("Jonctions du tracé : {e:?}"))?;

    // Rectangle englobant du trait, gonflé de son épaisseur.
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    for p in &stroke.points {
        let y = page_height - p[1];
        min_x = min_x.min(p[0]);
        max_x = max_x.max(p[0]);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    let margin = width + 2.0;

    let mut annotation = page
        .annotations_mut()
        .create_ink_annotation()
        .map_err(|e| format!("Création de l'annotation : {e:?}"))?;
    annotation
        .set_bounds(PdfRect::new(
            PdfPoints::new(min_y - margin),
            PdfPoints::new(min_x - margin),
            PdfPoints::new(max_y + margin),
            PdfPoints::new(max_x + margin),
        ))
        .map_err(|e| format!("Bornes de l'annotation : {e:?}"))?;
    annotation
        .objects_mut()
        .add_path_object(path)
        .map_err(|e| format!("Ajout du tracé à l'annotation : {e:?}"))?;

    Ok(())
}

/// Ajoute une note de texte sous forme d'annotation `Stamp` contenant des
/// objets texte (un par ligne) — le rendu est fidèle dans tous les lecteurs.
fn add_text_note(
    document: &PdfDocument<'static>,
    page: &mut PdfPage<'static>,
    page_height: f32,
    note: &TextNoteIn,
    font: PdfFontToken,
) -> Result<(), String> {
    let (r, g, b) = parse_hex(&note.color)?;
    let color = PdfColor::new(r, g, b, 255);

    let line_height = note.font_size * 1.35;
    let lines: Vec<&str> = note.text.lines().collect();
    if lines.is_empty() {
        return Ok(());
    }
    let box_height = line_height * lines.len() as f32 + 6.0;
    let top_y = page_height - note.y;

    let mut annotation = page
        .annotations_mut()
        .create_stamp_annotation()
        .map_err(|e| format!("Création de la note : {e:?}"))?;
    // Les bornes doivent être posées avant d'ajouter les objets.
    annotation
        .set_bounds(PdfRect::new(
            PdfPoints::new(top_y - box_height),
            PdfPoints::new(note.x - 2.0),
            PdfPoints::new(top_y),
            PdfPoints::new(note.x + note.width + 4.0),
        ))
        .map_err(|e| format!("Bornes de la note : {e:?}"))?;

    for (i, line) in lines.iter().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let mut text_object = PdfPageTextObject::new(
            document,
            line,
            font.token(),
            PdfPoints::new(note.font_size),
        )
        .map_err(|e| format!("Objet texte : {e:?}"))?;
        text_object
            .set_fill_color(color)
            .map_err(|e| format!("Couleur du texte : {e:?}"))?;
        let baseline_y = top_y - 3.0 - note.font_size * 0.85 - line_height * i as f32;
        text_object
            .translate(PdfPoints::new(note.x), PdfPoints::new(baseline_y))
            .map_err(|e| format!("Position du texte : {e:?}"))?;
        annotation
            .objects_mut()
            .add_text_object(text_object)
            .map_err(|e| format!("Ajout du texte à la note : {e:?}"))?;
    }

    Ok(())
}

/// Rectangle englobant (min/max) d'un quadrilatère, en points PDF.
fn quad_bounds(q: &PdfQuadPoints) -> (f32, f32, f32, f32) {
    let xs = [q.x1.value, q.x2.value, q.x3.value, q.x4.value];
    let ys = [q.y1.value, q.y2.value, q.y3.value, q.y4.value];
    let min_x = xs.iter().cloned().fold(f32::MAX, f32::min);
    let max_x = xs.iter().cloned().fold(f32::MIN, f32::max);
    let min_y = ys.iter().cloned().fold(f32::MAX, f32::min);
    let max_y = ys.iter().cloned().fold(f32::MIN, f32::max);
    (min_x, min_y, max_x, max_y)
}

/// Reconstruit le document dans l'ordre de pages donné.
///
/// PDFium sait déplacer des pages en place (`FPDF_MovePages`), mais l'API sûre
/// de `pdfium-render` n'expose pas le handle nécessaire. On passe donc par une
/// sérialisation puis une recopie dans l'ordre voulu : le coût est celui d'un
/// aller-retour mémoire, acceptable pour une action explicite de l'utilisateur.
fn rebuild_with_order(
    pdfium: &'static Pdfium,
    open_doc: &mut OpenDoc,
    order: &[u16],
) -> Result<(), String> {
    let bytes = open_doc
        .document
        .save_to_bytes()
        .map_err(|e| format!("Sérialisation : {e:?}"))?;
    let source = pdfium
        .load_pdf_from_byte_vec(bytes, None)
        .map_err(|e| format!("Relecture : {e}"))?;

    let mut rebuilt = pdfium
        .create_new_pdf()
        .map_err(|e| format!("Création du document : {e}"))?;
    let list = order
        .iter()
        .map(|p| (p + 1).to_string())
        .collect::<Vec<_>>()
        .join(",");
    rebuilt
        .pages_mut()
        .copy_pages_from_document(&source, &list, 0)
        .map_err(|e| format!("Recopie des pages : {e}"))?;

    open_doc.document = rebuilt;
    Ok(())
}

/// Applique une opération de structure sur les pages, en mémoire.
/// Le fichier n'est réécrit qu'à l'enregistrement.
fn edit_pages(
    pdfium: &'static Pdfium,
    docs: &mut HashMap<u32, OpenDoc>,
    doc_id: u32,
    op: PageOp,
) -> Result<DocInfo, String> {
    let open_doc = docs.get_mut(&doc_id).ok_or("Document inconnu".to_string())?;
    let page_count = open_doc.document.pages().len();

    let check = |pages: &[u16]| -> Result<(), String> {
        if pages.is_empty() {
            return Err("Aucune page sélectionnée".to_string());
        }
        if pages.iter().any(|p| *p >= page_count) {
            return Err("Page hors du document".to_string());
        }
        Ok(())
    };

    match op {
        PageOp::Rotate {
            pages,
            quarter_turns,
        } => {
            check(&pages)?;
            for index in pages {
                let mut page = open_doc
                    .document
                    .pages()
                    .get(index)
                    .map_err(|e| format!("Page introuvable : {e}"))?;
                let current = page.rotation().unwrap_or(PdfPageRenderRotation::None);
                let quarters = match current {
                    PdfPageRenderRotation::None => 0,
                    PdfPageRenderRotation::Degrees90 => 1,
                    PdfPageRenderRotation::Degrees180 => 2,
                    PdfPageRenderRotation::Degrees270 => 3,
                };
                let next = (quarters + quarter_turns).rem_euclid(4);
                page.set_rotation(match next {
                    1 => PdfPageRenderRotation::Degrees90,
                    2 => PdfPageRenderRotation::Degrees180,
                    3 => PdfPageRenderRotation::Degrees270,
                    _ => PdfPageRenderRotation::None,
                });
            }
        }

        PageOp::Delete { mut pages } => {
            check(&pages)?;
            if pages.len() >= page_count as usize {
                return Err("Un document doit garder au moins une page".to_string());
            }
            // De la fin vers le début : supprimer décale les index suivants.
            pages.sort_unstable();
            pages.dedup();
            for index in pages.into_iter().rev() {
                let page = open_doc
                    .document
                    .pages()
                    .get(index)
                    .map_err(|e| format!("Page introuvable : {e}"))?;
                page.delete()
                    .map_err(|e| format!("Suppression impossible : {e:?}"))?;
            }
        }

        PageOp::Move { mut pages, dest } => {
            check(&pages)?;
            pages.sort_unstable();
            pages.dedup();
            if dest as usize + pages.len() > page_count as usize {
                return Err("Destination hors du document".to_string());
            }

            // Ordre visé : les pages restantes, avec le bloc déplacé inséré
            // à la position demandée.
            let moved = pages.clone();
            let rest: Vec<u16> = (0..page_count).filter(|p| !moved.contains(p)).collect();
            let mut order = Vec::with_capacity(page_count as usize);
            order.extend_from_slice(&rest[..dest as usize]);
            order.extend_from_slice(&moved);
            order.extend_from_slice(&rest[dest as usize..]);

            rebuild_with_order(pdfium, open_doc, &order)?;
        }

        PageOp::Merge { paths, at } => {
            if at > page_count {
                return Err("Position hors du document".to_string());
            }
            let mut insert_at = at;
            for path in paths {
                let source = pdfium
                    .load_pdf_from_file(&path, None)
                    .map_err(|e| format!("Ouverture de « {path} » impossible : {e}"))?;
                let added = source.pages().len();
                if added == 0 {
                    continue;
                }
                open_doc
                    .document
                    .pages_mut()
                    .copy_page_range_from_document(
                        &source,
                        source.pages().as_range_inclusive(),
                        insert_at,
                    )
                    .map_err(|e| format!("Fusion impossible : {e}"))?;
                insert_at += added;
            }
        }
    }

    open_doc.dirty = true;
    Ok(doc_info_from(&open_doc.document, doc_id, &open_doc.path))
}

/// Écrit une sélection de pages dans un nouveau document.
fn extract_pages(
    pdfium: &'static Pdfium,
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
    pages: &[u16],
    dest_path: &str,
) -> Result<(), String> {
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    if pages.is_empty() {
        return Err("Aucune page sélectionnée".to_string());
    }

    let mut out = pdfium
        .create_new_pdf()
        .map_err(|e| format!("Création du document : {e}"))?;
    // Les numéros sont 1-based côté PDFium pour cette API, et l'ordre donné
    // est respecté : extraire 3,1 produit bien un document [3, 1].
    let list = pages
        .iter()
        .map(|p| (p + 1).to_string())
        .collect::<Vec<_>>()
        .join(",");
    out.pages_mut()
        .copy_pages_from_document(&open_doc.document, &list, 0)
        .map_err(|e| format!("Copie des pages : {e}"))?;
    out.save_to_file(dest_path)
        .map_err(|e| format!("Écriture impossible : {e:?}"))
}

/// Écrit une page en PNG à la résolution demandée (en points par pouce).
fn export_page_image(
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
    page_index: u16,
    dpi: u32,
    dest_path: &str,
) -> Result<(), String> {
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    let page = open_doc
        .document
        .pages()
        .get(page_index)
        .map_err(|e| format!("Page introuvable : {e}"))?;

    let dpi = dpi.clamp(36, 1200);
    let width_px = ((page.width().value / 72.0) * dpi as f32).round() as u32;
    let png = {
        let config = PdfRenderConfig::new()
            .set_target_width(width_px.clamp(16, 20_000) as i32)
            .render_form_data(true);
        let bitmap = page
            .render_with_config(&config)
            .map_err(|e| format!("Rendu impossible : {e}"))?;
        encode_png(bitmap.as_image())?
    };
    std::fs::write(dest_path, &png).map_err(|e| format!("Écriture impossible : {e}"))
}

/// Convertit un rectangle PDF (origine en bas à gauche) en fragment posé
/// depuis le haut de la page, tel que l'attend la couche texte du frontend.
fn segment_from_rect(rect: &PdfRect, page_height: f32, text: String) -> TextSegment {
    TextSegment {
        text,
        x: rect.left().value,
        y: page_height - rect.top().value,
        width: rect.width().value,
        height: rect.height().value,
    }
}

/// Un fragment en cours d'assemblage, en coordonnées PDF.
struct RunBuilder {
    text: String,
    left: f32,
    right: f32,
    top: f32,
    bottom: f32,
    baseline: f32,
    font_size: f32,
    /// Un espace vient d'être ajouté : le prochain caractère peut être plus
    /// loin sans que ce soit un changement de colonne.
    pending_space: bool,
}

impl RunBuilder {
    fn finish(self, page_height: f32) -> Option<TextSegment> {
        if self.text.trim().is_empty() || self.right <= self.left {
            return None;
        }
        // Les espaces de fin ne portent aucune géométrie : les garder
        // fausserait l'étirement horizontal côté frontend.
        let text = self.text.trim_end().to_string();
        Some(TextSegment {
            text,
            x: self.left,
            y: page_height - self.top,
            width: self.right - self.left,
            height: (self.top - self.bottom).max(1.0),
        })
    }
}

/// Extrait le texte d'une page, groupé en lignes positionnées.
///
/// Le découpage se fait caractère par caractère plutôt que par segments
/// PDFium : d'une part on obtient la boîte « em » de chaque glyphe
/// (`loose_bounds`) plutôt que la boîte d'encre, ce qui aligne le surlignage
/// de sélection sur la ligne au lieu de le décaler vers le haut ; d'autre
/// part les caractères contigus se recollent, sans les trous que laissent
/// les segments à chaque changement de style.
fn page_text(
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
    page_index: u16,
) -> Result<Vec<TextSegment>, String> {
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    let page = open_doc
        .document
        .pages()
        .get(page_index)
        .map_err(|e| format!("Page introuvable : {e}"))?;
    let page_height = page.height().value;
    let text = page.text().map_err(|e| format!("Texte illisible : {e:?}"))?;

    let mut segments: Vec<TextSegment> = Vec::new();
    let mut run: Option<RunBuilder> = None;

    for char in text.chars().iter() {
        let Some(glyph) = char.unicode_char() else {
            continue;
        };
        // Les fins de ligne du flux ferment le fragment sans rien y ajouter.
        if glyph == '\r' || glyph == '\n' {
            if let Some(r) = run.take() {
                segments.extend(r.finish(page_height));
            }
            continue;
        }
        if glyph.is_control() {
            continue;
        }

        // Les espaces rejoignent le fragment sans peser sur sa géométrie :
        // PDFium leur attribue parfois des boîtes fantaisistes, et s'y fier
        // couperait chaque ligne à chaque mot.
        if glyph.is_whitespace() {
            if let Some(r) = run.as_mut() {
                r.text.push(' ');
                r.pending_space = true;
            }
            continue;
        }

        let Ok(bounds) = char.loose_bounds().or_else(|_| char.tight_bounds()) else {
            continue;
        };
        let baseline = char.origin_y().map(|p| p.value).unwrap_or(bounds.bottom().value);
        let font_size = char.scaled_font_size().value.abs().max(1.0);

        let left = bounds.left().value;
        let right = bounds.right().value;
        let top = bounds.top().value;
        let bottom = bounds.bottom().value;

        let start_new = match &run {
            None => true,
            Some(r) => {
                // Un espace justifie un écart plus large avant de conclure
                // à un changement de colonne.
                let gap_allowed = if r.pending_space {
                    font_size * 2.5
                } else {
                    font_size * 0.6
                };
                // Changement de ligne, retour arrière, saut horizontal
                // important ou rupture de corps : le fragment se termine.
                (baseline - r.baseline).abs() > font_size * 0.3
                    || left < r.right - font_size * 0.6
                    || left > r.right + gap_allowed
                    || (font_size - r.font_size).abs() > r.font_size * 0.25
            }
        };

        if start_new {
            if let Some(r) = run.take() {
                segments.extend(r.finish(page_height));
            }
            run = Some(RunBuilder {
                text: String::new(),
                left,
                right,
                top,
                bottom,
                baseline,
                font_size,
                pending_space: false,
            });
        }

        let r = run.as_mut().expect("fragment ouvert");
        r.text.push(glyph);
        r.left = r.left.min(left);
        r.right = r.right.max(right);
        r.top = r.top.max(top);
        r.bottom = r.bottom.min(bottom);
        r.pending_space = false;
    }

    if let Some(r) = run {
        segments.extend(r.finish(page_height));
    }
    Ok(segments)
}

/// Cherche une chaîne dans tout le document.
fn search_document(
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
    query: &str,
    match_case: bool,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    let options = PdfSearchOptions::new().match_case(match_case);

    let mut hits = Vec::new();
    'pages: for (index, page) in open_doc.document.pages().iter().enumerate() {
        let page_height = page.height().value;
        let Ok(text) = page.text() else { continue };
        let Ok(search) = text.search(query, &options) else {
            continue;
        };

        for result in search.iter(PdfSearchDirection::SearchForward) {
            // Une occurrence peut enjamber deux lignes : chaque segment
            // devient un rectangle à surligner.
            let rects: Vec<TextSegment> = result
                .iter()
                .filter_map(|segment| {
                    let bounds = segment.bounds();
                    if bounds.width().value <= 0.0 || bounds.height().value <= 0.0 {
                        None
                    } else {
                        Some(segment_from_rect(&bounds, page_height, String::new()))
                    }
                })
                .collect();
            if rects.is_empty() {
                continue;
            }
            hits.push(SearchHit {
                page_index: index as u16,
                rects,
            });
            if hits.len() >= limit {
                break 'pages;
            }
        }
    }
    Ok(hits)
}

/// Profondeur maximale de l'arbre des signets, et nombre total de nœuds.
/// Un PDF malformé peut contenir un cycle : ces bornes évitent la boucle.
const MAX_BOOKMARK_DEPTH: usize = 12;
const MAX_BOOKMARKS: usize = 5_000;

/// Page visée par un signet : la destination directe, sinon celle portée par
/// son action « aller à » interne au document.
fn bookmark_page(bookmark: &PdfBookmark<'_>) -> Option<u16> {
    if let Some(destination) = bookmark.destination() {
        if let Ok(index) = destination.page_index() {
            return Some(index);
        }
    }
    if let Some(PdfAction::LocalDestination(action)) = bookmark.action() {
        if let Ok(destination) = action.destination() {
            if let Ok(index) = destination.page_index() {
                return Some(index);
            }
        }
    }
    None
}

fn collect_bookmarks(
    bookmark: &PdfBookmark<'_>,
    prefix: &str,
    depth: usize,
    budget: &mut usize,
) -> Vec<BookmarkNode> {
    let mut nodes = Vec::new();
    for (index, child) in bookmark.iter_direct_children().enumerate() {
        if *budget == 0 {
            break;
        }
        *budget -= 1;

        let id = if prefix.is_empty() {
            index.to_string()
        } else {
            format!("{prefix}.{index}")
        };
        let children = if depth + 1 < MAX_BOOKMARK_DEPTH {
            collect_bookmarks(&child, &id, depth + 1, budget)
        } else {
            Vec::new()
        };
        nodes.push(BookmarkNode {
            title: child.title().unwrap_or_else(|| "Sans titre".to_string()),
            page_index: bookmark_page(&child),
            id,
            children,
        });
    }
    nodes
}

/// Lit la table des matières embarquée dans le PDF.
fn list_bookmarks(
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
) -> Result<Vec<BookmarkNode>, String> {
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    let bookmarks = open_doc.document.bookmarks();
    let Some(root) = bookmarks.root() else {
        return Ok(Vec::new());
    };

    let mut budget = MAX_BOOKMARKS;
    // `root()` renvoie le premier signet de premier niveau : c'est lui-même un
    // nœud à afficher, au même titre que ses frères.
    let mut nodes = Vec::new();
    for (index, sibling) in root.iter_siblings().enumerate() {
        if budget == 0 {
            break;
        }
        budget -= 1;
        let id = index.to_string();
        let children = collect_bookmarks(&sibling, &id, 1, &mut budget);
        nodes.push(BookmarkNode {
            title: sibling.title().unwrap_or_else(|| "Sans titre".to_string()),
            page_index: bookmark_page(&sibling),
            id,
            children,
        });
    }
    Ok(nodes)
}

/// Transformation affine PDF (a, b, c, d, e, f) appliquée à un point.
#[derive(Clone, Copy)]
struct Transform {
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
    f: f32,
}

impl Transform {
    const IDENTITY: Transform = Transform {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        e: 0.0,
        f: 0.0,
    };

    fn apply(&self, x: f32, y: f32) -> (f32, f32) {
        (
            self.a * x + self.c * y + self.e,
            self.b * x + self.d * y + self.f,
        )
    }

    /// `self` puis `outer` : les coordonnées de l'enfant remontent d'un niveau.
    fn then(&self, outer: &Transform) -> Transform {
        Transform {
            a: self.a * outer.a + self.b * outer.c,
            b: self.a * outer.b + self.b * outer.d,
            c: self.c * outer.a + self.d * outer.c,
            d: self.c * outer.b + self.d * outer.d,
            e: self.e * outer.a + self.f * outer.c + outer.e,
            f: self.e * outer.b + self.f * outer.d + outer.f,
        }
    }
}

/// Profondeur maximale d'imbrication des Form XObject explorée.
const MAX_FORM_DEPTH: usize = 6;

/// En deçà, une image est un filet ou une puce décorative : viser une zone
/// aussi petite n'a pas de sens, et elle encombrerait la page de cibles.
const MIN_IMAGE_SIZE_PT: f32 = 8.0;

/// Deux images dont les rectangles coïncident à cette tolérance près sont
/// considérées comme un même visuel (calques empilés, masque + image).
const DEDUPE_TOLERANCE_PT: f32 = 1.5;

/// Parcourt les objets d'un conteneur et collecte les images, en descendant
/// dans les Form XObject (où les générateurs de PDF placent le plus souvent
/// les illustrations) et en composant leurs matrices au passage.
fn collect_images<'a>(
    objects: impl Iterator<Item = PdfPageObject<'a>>,
    to_page: Transform,
    prefix: &str,
    page_width: f32,
    page_height: f32,
    depth: usize,
    out: &mut Vec<PageImageInfo>,
) {
    for (index, object) in objects.enumerate() {
        let path = if prefix.is_empty() {
            index.to_string()
        } else {
            format!("{prefix}.{index}")
        };

        match &object {
            PdfPageObject::Image(_) => {
                let Ok(quad) = object.bounds() else { continue };
                let (x0, y0, x1, y1) = quad_bounds(&quad);
                // Les quatre coins remontent vers l'espace de la page.
                let corners = [
                    to_page.apply(x0, y0),
                    to_page.apply(x1, y0),
                    to_page.apply(x1, y1),
                    to_page.apply(x0, y1),
                ];
                let min_x = corners.iter().map(|c| c.0).fold(f32::MAX, f32::min);
                let max_x = corners.iter().map(|c| c.0).fold(f32::MIN, f32::max);
                let min_y = corners.iter().map(|c| c.1).fold(f32::MAX, f32::min);
                let max_y = corners.iter().map(|c| c.1).fold(f32::MIN, f32::max);

                // Une image peut déborder de la page : seule la partie visible
                // est cliquable.
                let vis_x0 = min_x.max(0.0);
                let vis_x1 = max_x.min(page_width);
                let vis_y0 = min_y.max(0.0);
                let vis_y1 = max_y.min(page_height);
                if vis_x1 - vis_x0 < MIN_IMAGE_SIZE_PT
                    || vis_y1 - vis_y0 < MIN_IMAGE_SIZE_PT
                {
                    continue; // hors page, ou trop petite pour être visée
                }

                out.push(PageImageInfo {
                    object_path: path,
                    x: vis_x0,
                    y: page_height - vis_y1,
                    width: vis_x1 - vis_x0,
                    height: vis_y1 - vis_y0,
                });
            }

            PdfPageObject::XObjectForm(form) => {
                if depth >= MAX_FORM_DEPTH {
                    continue;
                }
                let inner = match object.matrix() {
                    Ok(m) => Transform {
                        a: m.a(),
                        b: m.b(),
                        c: m.c(),
                        d: m.d(),
                        e: m.e(),
                        f: m.f(),
                    },
                    Err(_) => Transform::IDENTITY,
                };
                collect_images(
                    form.iter(),
                    inner.then(&to_page),
                    &path,
                    page_width,
                    page_height,
                    depth + 1,
                    out,
                );
            }

            _ => {}
        }
    }
}

/// Énumère les images d'une page, y compris celles nichées dans des
/// Form XObject, positions converties vers l'origine haut-gauche.
fn list_page_images(
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
    page_index: u16,
) -> Result<Vec<PageImageInfo>, String> {
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    let page = open_doc
        .document
        .pages()
        .get(page_index)
        .map_err(|e| format!("Page introuvable : {e}"))?;
    let page_width = page.width().value;
    let page_height = page.height().value;

    let mut found = Vec::new();
    collect_images(
        page.objects().iter(),
        Transform::IDENTITY,
        "",
        page_width,
        page_height,
        0,
        &mut found,
    );

    // Les grandes images d'abord : une vignette posée sur un fond reste
    // atteignable même si le fond la recouvre.
    found.sort_by(|a, b| {
        (b.width * b.height)
            .partial_cmp(&(a.width * a.height))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Un même visuel est souvent posé en plusieurs calques superposés (image
    // + son masque, ou doublon d'export) : une seule cible suffit.
    let mut result: Vec<PageImageInfo> = Vec::with_capacity(found.len());
    for image in found {
        let duplicate = result.iter().any(|kept| {
            (kept.x - image.x).abs() <= DEDUPE_TOLERANCE_PT
                && (kept.y - image.y).abs() <= DEDUPE_TOLERANCE_PT
                && (kept.width - image.width).abs() <= DEDUPE_TOLERANCE_PT
                && (kept.height - image.height).abs() <= DEDUPE_TOLERANCE_PT
        });
        if !duplicate {
            result.push(image);
        }
    }
    Ok(result)
}

/// Extrait une image d'une page en PNG, à sa résolution d'origine si possible.
/// `object_path` suit la forme « 3 » ou « 1.13 » (image dans un Form XObject).
fn extract_image(
    docs: &HashMap<u32, OpenDoc>,
    doc_id: u32,
    page_index: u16,
    object_path: &str,
) -> Result<Vec<u8>, String> {
    let open_doc = docs.get(&doc_id).ok_or("Document inconnu".to_string())?;
    let page = open_doc
        .document
        .pages()
        .get(page_index)
        .map_err(|e| format!("Page introuvable : {e}"))?;

    let indices: Vec<usize> = object_path
        .split('.')
        .map(|s| {
            s.parse::<usize>()
                .map_err(|_| "Chemin d'objet invalide".to_string())
        })
        .collect::<Result<_, _>>()?;
    let (first, rest) = indices.split_first().ok_or("Chemin vide".to_string())?;

    let object = page
        .objects()
        .iter()
        .nth(*first)
        .ok_or("Objet introuvable".to_string())?;

    // Un objet imbriqué emprunte à son conteneur : la descente doit se faire
    // par récursion, qui garde chaque parent vivant sur la pile.
    encode_image_at(&object, rest, &open_doc.document)
}

fn encode_image_at(
    object: &PdfPageObject<'_>,
    rest: &[usize],
    document: &PdfDocument<'_>,
) -> Result<Vec<u8>, String> {
    if let Some((index, deeper)) = rest.split_first() {
        let PdfPageObject::XObjectForm(form) = object else {
            return Err("Chemin d'objet incohérent".to_string());
        };
        let child = form
            .iter()
            .nth(*index)
            .ok_or("Objet imbriqué introuvable".to_string())?;
        return encode_image_at(&child, deeper, document);
    }

    let PdfPageObject::Image(image) = object else {
        return Err("Cet objet n'est pas une image".to_string());
    };

    // Résolution native d'abord ; à défaut, l'image après filtres/transformations.
    let dynamic = image
        .get_raw_image()
        .or_else(|_| image.get_processed_image(document))
        .map_err(|e| format!("Extraction impossible : {e:?}"))?;

    let mut out: Vec<u8> = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        std::io::Cursor::new(&mut out),
        image::codecs::png::CompressionType::Default,
        image::codecs::png::FilterType::Adaptive,
    );
    // RGBA : préserve la transparence éventuelle.
    image::DynamicImage::ImageRgba8(dynamic.into_rgba8())
        .write_with_encoder(encoder)
        .map_err(|e| format!("Encodage PNG : {e}"))?;
    Ok(out)
}

fn parse_hex(hex: &str) -> Result<(u8, u8, u8), String> {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return Err(format!("Couleur invalide : {hex}"));
    }
    let parse = |s: &str| u8::from_str_radix(s, 16).map_err(|_| format!("Couleur invalide : {hex}"));
    Ok((parse(&h[0..2])?, parse(&h[2..4])?, parse(&h[4..6])?))
}

fn bind_pdfium() -> Result<Pdfium, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd);
    }

    for dir in &candidates {
        if let Ok(bindings) =
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(dir))
        {
            return Ok(Pdfium::new(bindings));
        }
    }

    Pdfium::bind_to_system_library()
        .map(Pdfium::new)
        .map_err(|e| format!("pdfium.dll introuvable ({e})"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    /// PDFium ne doit être initialisé qu'une fois par processus : tous les
    /// tests partagent le même moteur, comme le fait l'application.
    fn test_engine() -> Sender<PdfRequest> {
        static ENGINE: OnceLock<Mutex<Sender<PdfRequest>>> = OnceLock::new();
        ENGINE
            .get_or_init(|| Mutex::new(spawn()))
            .lock()
            .unwrap()
            .clone()
    }

    /// Test de fumée du pipeline complet : ouvre le PDF pointé par
    /// PLUME_TEST_PDF, rend la première page et vérifie qu'on obtient un PNG.
    #[test]
    fn ouverture_et_rendu() {
        let Ok(path) = std::env::var("PLUME_TEST_PDF") else {
            eprintln!("PLUME_TEST_PDF non défini : test ignoré");
            return;
        };

        let tx = test_engine();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open { path, reply }).unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture du PDF");
        assert!(info.page_count >= 1);
        assert!(info.pages[0].width > 0.0);

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Render {
            doc_id: info.id,
            page_index: 0,
            width_px: 800,
            reply,
        })
        .unwrap();
        let png = rx.blocking_recv().unwrap().expect("rendu de la page");
        assert!(png.len() > 1000, "PNG trop petit : {} octets", png.len());
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\x0a", "signature PNG absente");
    }

    /// Dessine un trait, enregistre, rouvre : l'annotation doit survivre
    /// au cycle complet écriture → relecture.
    #[test]
    fn enregistrement_encre() {
        let Ok(src) = std::env::var("PLUME_TEST_PDF") else {
            eprintln!("PLUME_TEST_PDF non défini : test ignoré");
            return;
        };
        let dst = std::env::temp_dir().join("plume-test-save.pdf");
        std::fs::copy(&src, &dst).expect("copie du PDF de test");
        let path = dst.to_string_lossy().into_owned();

        let tx = test_engine();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open {
            path: path.clone(),
            reply,
        })
        .unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture");

        let stroke = InkStrokeIn {
            tool: "pen".into(),
            color: "#2547d0".into(),
            width: 2.0,
            points: vec![
                [100.0, 100.0, 0.5],
                [180.0, 140.0, 0.8],
                [250.0, 110.0, 0.6],
            ],
        };
        let note = TextNoteIn {
            x: 80.0,
            y: 220.0,
            width: 160.0,
            text: "Note de test\nDeuxième ligne".into(),
            font_size: 13.0,
            color: "#d03330".into(),
        };
        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Save {
            doc_id: info.id,
            annots: vec![PageAnnotsIn {
                page_index: 0,
                strokes: vec![stroke],
                notes: vec![note],
            }],
            dest_path: None,
            reply,
        })
        .unwrap();
        let saved = rx.blocking_recv().unwrap().expect("enregistrement");
        assert_eq!(saved.id, info.id);
        assert_eq!(saved.page_count, info.page_count);

        // Le document rouvert doit toujours se rendre correctement.
        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Render {
            doc_id: info.id,
            page_index: 0,
            width_px: 400,
            reply,
        })
        .unwrap();
        assert!(rx.blocking_recv().unwrap().is_ok());
    }

    /// Diagnostic : liste les images trouvées (imbriquées comprises) sur la
    /// première page du PDF pointé par PLUME_DIAG_PDF, avec leurs positions
    /// ramenées à l'espace de la page. Lancer avec `-- --nocapture`.
    #[test]
    fn diagnostic_images() {
        let Ok(path) = std::env::var("PLUME_DIAG_PDF") else {
            return;
        };
        let tx = test_engine();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open {
            path: path.clone(),
            reply,
        })
        .unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture");
        println!(
            "Page 0 : {:.1} × {:.1} pt",
            info.pages[0].width, info.pages[0].height
        );

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::ListImages {
            doc_id: info.id,
            page_index: 0,
            reply,
        })
        .unwrap();
        let images = rx.blocking_recv().unwrap().expect("liste");
        for img in &images {
            println!(
                "  [{}] ({:.1},{:.1}) {:.1} × {:.1} pt",
                img.object_path, img.x, img.y, img.width, img.height
            );
        }
        println!("{} image(s) dans {path}", images.len());
    }

    /// Extrait le texte d'une page et y retrouve un mot par la recherche.
    #[test]
    fn texte_et_recherche() {
        let Ok(path) = std::env::var("PLUME_TEST_PDF") else {
            eprintln!("PLUME_TEST_PDF non défini : test ignoré");
            return;
        };
        let tx = test_engine();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open { path, reply }).unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture");

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::PageText {
            doc_id: info.id,
            page_index: 0,
            reply,
        })
        .unwrap();
        let segments = rx.blocking_recv().unwrap().expect("texte de la page");
        assert!(!segments.is_empty(), "aucun fragment de texte extrait");
        for segment in &segments {
            assert!(segment.width > 0.0 && segment.height > 0.0);
            assert!(segment.y >= -1.0, "fragment au-dessus de la page");
        }

        // Un mot présent dans le premier fragment doit se retrouver.
        let word = segments
            .iter()
            .flat_map(|s| s.text.split_whitespace())
            .find(|w| w.chars().count() >= 4)
            .expect("aucun mot exploitable")
            .to_string();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Search {
            doc_id: info.id,
            query: word.clone(),
            match_case: false,
            limit: 100,
            reply,
        })
        .unwrap();
        let hits = rx.blocking_recv().unwrap().expect("recherche");
        assert!(!hits.is_empty(), "« {word} » introuvable alors qu'il est là");
        assert!(!hits[0].rects.is_empty(), "occurrence sans rectangle");

        // Une chaîne absurde ne doit rien renvoyer.
        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Search {
            doc_id: info.id,
            query: "zzqxwvk".into(),
            match_case: false,
            limit: 100,
            reply,
        })
        .unwrap();
        assert!(rx.blocking_recv().unwrap().unwrap().is_empty());
    }

    /// Fusion, rotation, déplacement, suppression, extraction : chaque
    /// opération doit laisser un document cohérent.
    #[test]
    fn edition_des_pages() {
        let Ok(src) = std::env::var("PLUME_TEST_PDF") else {
            eprintln!("PLUME_TEST_PDF non défini : test ignoré");
            return;
        };
        let dst = std::env::temp_dir().join("plume-test-edit.pdf");
        std::fs::copy(&src, &dst).expect("copie du PDF de test");
        let path = dst.to_string_lossy().into_owned();

        let tx = test_engine();
        let edit = |id: u32, op: PageOp| -> Result<DocInfo, String> {
            let (reply, rx) = oneshot::channel();
            tx.send(PdfRequest::EditPages {
                doc_id: id,
                op,
                reply,
            })
            .unwrap();
            rx.blocking_recv().unwrap()
        };

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open {
            path: path.clone(),
            reply,
        })
        .unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture");
        let start = info.page_count;

        // Fusion : le document est ajouté à la fin de lui-même.
        let merged = edit(
            info.id,
            PageOp::Merge {
                paths: vec![path.clone()],
                at: start,
            },
        )
        .expect("fusion");
        assert_eq!(merged.page_count, start * 2);

        // Rotation d'un quart de tour : largeur et hauteur s'échangent.
        let before = merged.pages[0].clone();
        let rotated = edit(
            info.id,
            PageOp::Rotate {
                pages: vec![0],
                quarter_turns: 1,
            },
        )
        .expect("rotation");
        assert!(
            (rotated.pages[0].width - before.height).abs() < 1.0,
            "la rotation n'a pas échangé les dimensions"
        );

        // Déplacement de la dernière page en tête.
        let moved = edit(
            info.id,
            PageOp::Move {
                pages: vec![merged.page_count - 1],
                dest: 0,
            },
        )
        .expect("déplacement");
        assert_eq!(moved.page_count, merged.page_count);

        // Suppression d'une page.
        let deleted = edit(
            info.id,
            PageOp::Delete {
                pages: vec![0],
            },
        )
        .expect("suppression");
        assert_eq!(deleted.page_count, moved.page_count - 1);

        // Une suppression totale doit être refusée.
        let all: Vec<u16> = (0..deleted.page_count).collect();
        assert!(edit(info.id, PageOp::Delete { pages: all }).is_err());

        // Extraction de la première page vers un nouveau fichier.
        let out = std::env::temp_dir().join("plume-test-extract.pdf");
        let out_path = out.to_string_lossy().into_owned();
        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::ExtractPages {
            doc_id: info.id,
            pages: vec![0],
            dest_path: out_path.clone(),
            reply,
        })
        .unwrap();
        rx.blocking_recv().unwrap().expect("extraction");

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open {
            path: out_path,
            reply,
        })
        .unwrap();
        let extracted = rx.blocking_recv().unwrap().expect("relecture de l'extrait");
        assert_eq!(extracted.page_count, 1);

        // Export d'une page en image.
        let png = std::env::temp_dir().join("plume-test-page.png");
        let png_path = png.to_string_lossy().into_owned();
        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::ExportPageImage {
            doc_id: info.id,
            page_index: 0,
            dpi: 150,
            dest_path: png_path.clone(),
            reply,
        })
        .unwrap();
        rx.blocking_recv().unwrap().expect("export image");
        let written = std::fs::read(&png_path).expect("lecture du PNG");
        assert_eq!(&written[..8], b"\x89PNG\r\n\x1a\x0a");
    }

    /// Diagnostic : affiche les fragments de texte de la première page du PDF
    /// pointé par PLUME_DIAG_PDF, avec leur géométrie.
    #[test]
    fn diagnostic_texte() {
        let Ok(path) = std::env::var("PLUME_DIAG_PDF") else {
            return;
        };
        let tx = test_engine();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open {
            path: path.clone(),
            reply,
        })
        .unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture");
        println!(
            "Page 0 : {:.1} × {:.1} pt",
            info.pages[0].width, info.pages[0].height
        );

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::PageText {
            doc_id: info.id,
            page_index: 0,
            reply,
        })
        .unwrap();
        let segments = rx.blocking_recv().unwrap().expect("texte");
        for segment in segments.iter().take(14) {
            println!(
                "  ({:6.1},{:6.1}) {:6.1}×{:5.1}  «{}»",
                segment.x,
                segment.y,
                segment.width,
                segment.height,
                segment.text.chars().take(46).collect::<String>()
            );
        }
        println!("{} fragment(s) sur la page 1", segments.len());
    }

    /// Diagnostic : affiche le sommaire du PDF pointé par PLUME_DIAG_PDF.
    #[test]
    fn diagnostic_signets() {
        let Ok(path) = std::env::var("PLUME_DIAG_PDF") else {
            return;
        };
        let tx = test_engine();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open {
            path: path.clone(),
            reply,
        })
        .unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture");

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::ListBookmarks {
            doc_id: info.id,
            reply,
        })
        .unwrap();
        let nodes = rx.blocking_recv().unwrap().expect("signets");

        fn show(nodes: &[BookmarkNode], depth: usize, total: &mut usize) {
            for node in nodes {
                *total += 1;
                let page = node
                    .page_index
                    .map(|p| format!("p.{}", p + 1))
                    .unwrap_or_else(|| "—".to_string());
                println!("{:indent$}• {} ({page})", "", node.title, indent = depth * 2);
                show(&node.children, depth + 1, total);
            }
        }
        let mut total = 0;
        show(&nodes, 1, &mut total);
        println!("{total} signet(s) dans {path}");
    }

    /// Repère les images d'une page et en extrait une en PNG.
    #[test]
    fn extraction_image() {
        let Ok(path) = std::env::var("PLUME_TEST_IMAGE_PDF") else {
            eprintln!("PLUME_TEST_IMAGE_PDF non défini : test ignoré");
            return;
        };

        let tx = test_engine();

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::Open { path, reply }).unwrap();
        let info = rx.blocking_recv().unwrap().expect("ouverture");

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::ListImages {
            doc_id: info.id,
            page_index: 0,
            reply,
        })
        .unwrap();
        let images = rx.blocking_recv().unwrap().expect("liste des images");
        assert!(!images.is_empty(), "aucune image détectée sur la page");

        let first = &images[0];
        assert!(first.width > 0.0 && first.height > 0.0);

        let (reply, rx) = oneshot::channel();
        tx.send(PdfRequest::ExtractImage {
            doc_id: info.id,
            page_index: 0,
            object_path: first.object_path.clone(),
            reply,
        })
        .unwrap();
        let png = rx.blocking_recv().unwrap().expect("extraction de l'image");
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\x0a", "signature PNG absente");
        assert!(png.len() > 500, "PNG trop petit : {} octets", png.len());
    }
}

fn encode_png(image: image::DynamicImage) -> Result<Vec<u8>, String> {
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};

    // Les pages PDF sont opaques : le RGB sans alpha réduit la taille du PNG.
    let rgb = image.into_rgb8();
    let mut out: Vec<u8> = Vec::new();
    let encoder = PngEncoder::new_with_quality(
        std::io::Cursor::new(&mut out),
        CompressionType::Fast,
        FilterType::Sub,
    );
    image::DynamicImage::ImageRgb8(rgb)
        .write_with_encoder(encoder)
        .map_err(|e| format!("Encodage PNG impossible : {e}"))?;
    Ok(out)
}
