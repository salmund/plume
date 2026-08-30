mod pdf_engine;

use std::sync::Mutex;

use pdf_engine::{
    BookmarkNode, DocInfo, PageAnnotsIn, PageImageInfo, PageOp, PdfRequest, SearchHit,
    TextSegment,
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

struct Engine(Mutex<std::sync::mpsc::Sender<PdfRequest>>);

fn engine_send(state: &State<'_, Engine>, req: PdfRequest) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|_| "Moteur PDF corrompu".to_string())?
        .send(req)
        .map_err(|_| "Moteur PDF indisponible".to_string())
}

#[tauri::command]
async fn open_document(state: State<'_, Engine>, path: String) -> Result<DocInfo, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(&state, PdfRequest::Open { path, reply })?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

#[tauri::command]
async fn render_page(
    state: State<'_, Engine>,
    doc_id: u32,
    page_index: u16,
    width_px: u32,
) -> Result<tauri::ipc::Response, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        &state,
        PdfRequest::Render {
            doc_id,
            page_index,
            width_px,
            reply,
        },
    )?;
    let png = rx.await.map_err(|_| "Moteur PDF interrompu".to_string())??;
    Ok(tauri::ipc::Response::new(png))
}

#[tauri::command]
fn close_document(state: State<'_, Engine>, doc_id: u32) -> Result<(), String> {
    engine_send(&state, PdfRequest::Close { doc_id })
}

/// Écrit les annotations et les modifications de structure dans le PDF.
/// Sans `dest_path`, le fichier d'origine est remplacé.
#[tauri::command]
async fn save_document(
    state: State<'_, Engine>,
    doc_id: u32,
    annots: Vec<PageAnnotsIn>,
    dest_path: Option<String>,
) -> Result<DocInfo, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        &state,
        PdfRequest::Save {
            doc_id,
            annots,
            dest_path,
            reply,
        },
    )?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Applique une opération de structure (rotation, suppression, déplacement,
/// fusion) au document en mémoire.
#[tauri::command]
async fn edit_pages(
    state: State<'_, Engine>,
    doc_id: u32,
    op: PageOp,
) -> Result<DocInfo, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(&state, PdfRequest::EditPages { doc_id, op, reply })?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Écrit une sélection de pages dans un nouveau PDF.
#[tauri::command]
async fn extract_pages(
    state: State<'_, Engine>,
    doc_id: u32,
    pages: Vec<u16>,
    dest_path: String,
) -> Result<(), String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        &state,
        PdfRequest::ExtractPages {
            doc_id,
            pages,
            dest_path,
            reply,
        },
    )?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Écrit une page en PNG à la résolution demandée.
#[tauri::command]
async fn export_page_image(
    state: State<'_, Engine>,
    doc_id: u32,
    page_index: u16,
    dpi: u32,
    dest_path: String,
) -> Result<(), String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        &state,
        PdfRequest::ExportPageImage {
            doc_id,
            page_index,
            dpi,
            dest_path,
            reply,
        },
    )?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Fragments de texte d'une page, positionnés en points PDF depuis le haut.
#[tauri::command]
async fn page_text(
    state: State<'_, Engine>,
    doc_id: u32,
    page_index: u16,
) -> Result<Vec<TextSegment>, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        &state,
        PdfRequest::PageText {
            doc_id,
            page_index,
            reply,
        },
    )?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Cherche une chaîne dans tout le document.
#[tauri::command]
async fn search_document(
    state: State<'_, Engine>,
    doc_id: u32,
    query: String,
    match_case: bool,
) -> Result<Vec<SearchHit>, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        &state,
        PdfRequest::Search {
            doc_id,
            query,
            match_case,
            limit: 2_000,
            reply,
        },
    )?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Lit la table des matières (signets) embarquée dans le PDF.
#[tauri::command]
async fn list_bookmarks(
    state: State<'_, Engine>,
    doc_id: u32,
) -> Result<Vec<BookmarkNode>, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(&state, PdfRequest::ListBookmarks { doc_id, reply })?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Énumère les images d'une page (positions en points PDF, origine haut-gauche).
#[tauri::command]
async fn list_page_images(
    state: State<'_, Engine>,
    doc_id: u32,
    page_index: u16,
) -> Result<Vec<PageImageInfo>, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        &state,
        PdfRequest::ListImages {
            doc_id,
            page_index,
            reply,
        },
    )?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

async fn extract_image_bytes(
    state: &State<'_, Engine>,
    doc_id: u32,
    page_index: u16,
    object_path: String,
) -> Result<Vec<u8>, String> {
    let (reply, rx) = tokio::sync::oneshot::channel();
    engine_send(
        state,
        PdfRequest::ExtractImage {
            doc_id,
            page_index,
            object_path,
            reply,
        },
    )?;
    rx.await.map_err(|_| "Moteur PDF interrompu".to_string())?
}

/// Extrait une image de la page et l'écrit en PNG au chemin choisi.
#[tauri::command]
async fn export_image(
    state: State<'_, Engine>,
    doc_id: u32,
    page_index: u16,
    object_path: String,
    dest_path: String,
) -> Result<(), String> {
    let png = extract_image_bytes(&state, doc_id, page_index, object_path).await?;
    std::fs::write(&dest_path, &png).map_err(|e| format!("Écriture impossible : {e}"))
}

/// Copie une image de la page dans le presse-papiers.
#[tauri::command]
async fn copy_image_to_clipboard(
    app: tauri::AppHandle,
    state: State<'_, Engine>,
    doc_id: u32,
    page_index: u16,
    object_path: String,
) -> Result<(), String> {
    let png = extract_image_bytes(&state, doc_id, page_index, object_path).await?;
    let decoded = image::load_from_memory(&png)
        .map_err(|e| format!("Décodage : {e}"))?
        .into_rgba8();
    let (width, height) = decoded.dimensions();
    let img = tauri::image::Image::new_owned(decoded.into_raw(), width, height);
    app.clipboard()
        .write_image(&img)
        .map_err(|e| format!("Presse-papiers : {e}"))
}

/// Fichiers passés en argument (« Ouvrir avec », ligne de commande).
#[tauri::command]
fn startup_files() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|a| {
            a.to_lowercase().ends_with(".pdf") && std::path::Path::new(a).exists()
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Une seule instance : un double-clic sur un PDF dans l'Explorateur
        // rejoint la fenêtre existante au lieu d'en ouvrir une nouvelle.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths: Vec<String> = args
                .iter()
                .skip(1)
                .filter(|a| a.to_lowercase().ends_with(".pdf"))
                .cloned()
                .collect();
            let _ = app.emit("open-files", paths);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Engine(Mutex::new(pdf_engine::spawn())))
        .invoke_handler(tauri::generate_handler![
            open_document,
            render_page,
            close_document,
            save_document,
            edit_pages,
            extract_pages,
            export_page_image,
            page_text,
            search_document,
            list_bookmarks,
            list_page_images,
            export_image,
            copy_image_to_clipboard,
            startup_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
