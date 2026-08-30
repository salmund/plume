# Journal des modifications

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versionnage [SemVer](https://semver.org/lang/fr/).

## [0.1.0] — 2026-08-30

Première version publique.

### Lecture

- Moteur PDFium natif (celui de Chrome) sur un thread dédié : l'interface n'est
  jamais bloquée par un rendu.
- Défilement virtualisé — seules les pages visibles sont rendues, un document de
  2 000 pages s'ouvre aussi vite qu'un de 2.
- Zoom ancré sur le curseur (Ctrl+molette), ajustement largeur / page entière,
  rendu net garanti par le calage des pages sur la grille de pixels physiques et
  le rendu de texte LCD.
- Onglets multiples, glisser-déposer, session restaurée au démarrage, fichiers
  récents, panneau de vignettes à rendu paresseux.

### Annotation

- Stylo sensible à la pression du stylet (événements coalescés, lissage par
  points médians), surligneur, gomme par trait.
- Outil texte : notes créées au clic, éditées en place, déplaçables au glisser.
- Annuler / rétablir sur 200 niveaux, par document.
- Enregistrement en véritables annotations PDF (`Ink` et `Stamp`), relues par
  Firefox, Acrobat et les autres lecteurs.

### Images

- Détection des images d'une page, y compris celles nichées dans des
  Form XObject (cas de la majorité des PDF issus d'outils de mise en page).
- Clic droit : enregistrer en PNG à la résolution native, copier dans le
  presse-papiers, partager via l'Explorateur.

### Système

- Association de fichiers `.pdf` et instance unique : un double-clic dans
  l'Explorateur rejoint la fenêtre existante.
- Paramètres (Ctrl+,) : zoom par défaut, restauration de session, raccourcis.

[0.1.0]: https://github.com/salmund/plume/releases/tag/v0.1.0
