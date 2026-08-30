# Plume

**Lecteur et éditeur de documents PDF — rapide, moderne, sans friction.**

Une alternative libre à Acrobat Pro, pensée pour la lecture au quotidien et
l'annotation au stylet. Moteur natif PDFium, interface qui ne rame jamais.

> Version 0.1.0 · Windows · MIT · par [@salmund](https://github.com/salmund)

## Ce que Plume sait faire

**Lire** — Défilement virtualisé : seules les pages visibles sont rendues, un
document de 2 000 pages s'ouvre aussi vite qu'un de 2. Zoom ancré sur le curseur
(Ctrl+molette), ajustement largeur ou page entière, pages calées sur la grille de
pixels physiques pour un rendu net à toute échelle. Onglets, glisser-déposer,
session restaurée au démarrage, vignettes, fichiers récents.

**Annoter** — Stylo sensible à la pression du stylet, surligneur, gomme, outil
texte avec notes éditées en place et déplaçables. Annuler/rétablir sur 200
niveaux. À l'enregistrement, tout devient de véritables annotations PDF (`Ink` et
`Stamp`) que Firefox, Acrobat et les autres lecteurs affichent normalement.

**Extraire** — Les images d'une page deviennent des zones survolables, y compris
celles nichées dans des Form XObject (la majorité des PDF issus d'outils de mise
en page). Clic droit : enregistrer en PNG à la résolution native, copier dans le
presse-papiers, partager.

## Installation

```powershell
git clone https://github.com/salmund/plume.git
cd plume
npm install
npm run setup          # récupère le binaire PDFium de votre plateforme
npm run tauri build    # produit l'installateur dans src-tauri/target/release/bundle/
```

L'installateur enregistre l'association `.pdf`. Pour faire de Plume le lecteur
par défaut : Réglages Windows → Applications → Applications par défaut → Plume.

## Raccourcis

| Action | Raccourci |
| --- | --- |
| Ouvrir un document | `Ctrl+O` |
| Fermer l'onglet | `Ctrl+W` |
| Zoom | `Ctrl+molette` · `Ctrl+±` |
| Ajuster à la largeur | `Ctrl+0` |
| Mode annotation | `Ctrl+E` · `Échap` |
| Enregistrer les annotations | `Ctrl+S` |
| Annuler · Rétablir | `Ctrl+Z` · `Ctrl+Y` |
| Paramètres | `Ctrl+,` |

## Stack

- **Coquille** : [Tauri v2](https://tauri.app) — fenêtre WebView2, IPC binaire
  zéro-copie (les pages transitent en PNG brut, sans base64)
- **Moteur PDF** : [PDFium](https://pdfium.googlesource.com/pdfium/), le moteur
  de Chrome, via [`pdfium-render`](https://crates.io/crates/pdfium-render)
- **Interface** : React 19 + TypeScript + Tailwind CSS v4 + Vite

## Architecture

```
src-tauri/src/pdf_engine.rs   Thread dédié possédant PDFium (non thread-safe),
                              piloté par une file de messages : Open, Render,
                              Save, ListImages, ExtractImage, Close.
src-tauri/src/lib.rs          Commandes Tauri, presse-papiers, instance unique.
src/components/Viewer.tsx     Défilement virtualisé (± 700 px), zoom ancré,
                              état des outils d'annotation.
src/components/PageView.tsx   Une page = un bitmap à largeur CSS × DPR, empilé
                              avec ses couches images / encre / notes.
src/components/AnnotationLayer.tsx  Canvas de dessin : pression du stylet,
                              événements coalescés, lissage par points médians.
```

Convention de zoom : 100 % = 96 dpi CSS (1 pt PDF = 4/3 px CSS).
Les traits et les notes sont stockés en points PDF, donc indépendants du zoom.

## Développement

```powershell
npm run tauri dev      # HMR côté web, rebuild Rust à la demande
npm run icon           # régénère les icônes depuis app-icon.svg

# Tests du moteur (dans src-tauri/) :
$env:PLUME_TEST_PDF = "chemin\vers\un.pdf"          # rendu + écriture d'annotations
$env:PLUME_TEST_IMAGE_PDF = "chemin\vers\image.pdf" # énumération + extraction d'images
$env:PLUME_DIAG_PDF = "chemin\vers\un.pdf"          # diagnostic : images détectées
cargo test --lib -- --nocapture
```

Un test sans sa variable d'environnement s'ignore de lui-même.

> Après avoir ajouté une dépendance npm, redémarrer `npm run dev` : un serveur
> Vite déjà lancé sert des dépendances pré-bundlées périmées et la fenêtre reste
> blanche.

## Feuille de route

1. **Annotation, suite** — sélection et déplacement de traits existants, relecture
   des annotations déjà présentes dans le PDF en objets éditables
   (`FPDFAnnot_GetInkListPath`), formes (flèches, rectangles), notes collantes.
2. **Boîte à outils** — rotation, suppression et réorganisation de pages par
   glisser-déposer dans les vignettes, fusion et découpe de documents,
   remplissage de formulaires, signatures.
3. **Recherche et texte** — extraction de texte PDFium, recherche plein document,
   sélection et copie (couche texte au-dessus du bitmap).
4. **Multi-formats** — trait `DocumentEngine` côté Rust : images, EPUB, CBZ/CBR,
   Markdown.
5. **Confort** — position de lecture restaurée par document, mode clair, tuiles
   de rendu pour les très grands zooms, plein écran.

## Licence

MIT — voir [LICENSE](LICENSE).

PDFium est distribué sous licence BSD 3-Clause par le projet Chromium ; les
binaires proviennent de [pdfium-binaries](https://github.com/bblanchon/pdfium-binaries).
