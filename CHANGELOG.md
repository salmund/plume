# Journal des modifications

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versionnage [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Sélection et copie de texte** — couche de texte transparente calée sur le
  bitmap : sélection, glisser et `Ctrl+C` sont ceux du navigateur, sans code
  maison. Chaque fragment est étiré pour que sa largeur rendue corresponde
  exactement à celle mesurée par PDFium, sinon la sélection dériverait.
- **Recherche plein document** (`Ctrl+F`) — barre flottante, compteur
  d'occurrences, navigation `Entrée` / `Maj+Entrée`, respect de la casse en
  option ; l'occurrence courante est surlignée en violet, les autres en jaune,
  et le défilement l'amène au tiers supérieur de la vue.
- **Signets** — barre latérale à deux onglets (Vignettes / Signets). Le sommaire
  embarqué du PDF est lu avec sa hiérarchie et ses pages de destination ;
  chaque entrée est repliable et la page courante y est mise en évidence.
- **Signets personnels** — marquer une page (`Ctrl+D` ou l'icône de la barre
  d'outils) pour la retrouver, conservé par document.
- **Réglages d'images** — l'encadré de survol et l'infobulle se désactivent
  indépendamment ; le clic droit reste disponible dans tous les cas.

### Corrigé

- La sélection de texte se découpait à chaque espace (193 rectangles pour un
  CV d'une page, au lieu de 55) et se décalait au-dessus de la ligne. Les
  fragments sont désormais assemblés caractère par caractère à partir des
  boîtes « em » de PDFium, les espaces ne pesant plus sur la géométrie ; le
  corps et l'interligne du calque sont calculés à partir des métriques
  mesurées de la police pour que le surlignage épouse exactement la ligne.

### Modifié

- Détection d'images affinée : rognage à la surface visible de la page, seuil
  minimal porté à 8 pt, et fusion des calques superposés qui décrivent un même
  visuel (image + masque, doublons d'export).

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
