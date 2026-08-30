# Journal des modifications

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versionnage [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Manipulation de pages** — dans le panneau Vignettes : sélection multiple
  (`Ctrl` / `Maj`), réorganisation par glisser-déposer avec repère d'insertion,
  rotation par quart de tour, suppression, extraction d'une sélection vers un
  nouveau PDF, insertion des pages d'un autre document, export d'une page en
  PNG à 200 ppp. Les opérations vivent en mémoire ; `Ctrl+S` les écrit.
- **Enregistrer sous** (`Ctrl+Maj+S`) — écrit le document, annotations et
  modifications comprises, dans un nouveau fichier, et l'onglet bascule dessus.

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

- La réorganisation des pages ne répondait pas : sous Windows, le glisser-
  déposer HTML5 n'est disponible qu'en désactivant `dragDropEnabled`, ce qui
  aurait coûté le dépôt de fichiers depuis l'Explorateur. Le glissement repose
  désormais sur les Pointer Events, qui conservent les deux et fonctionnent
  aussi au stylet.
- La rotation de pages échouait sur « missing field `quarter_turns` » :
  l'annotation `rename_all` de serde ne porte que sur les noms de variantes,
  pas sur leurs champs, qui restaient donc en snake_case face au camelCase du
  frontend. Un test verrouille désormais ce contrat pour chaque opération.
- Un document pouvait s'ouvrir en double au démarrage quand la session
  restaurée et le fichier passé en argument désignaient le même chemin : la
  liste servant à dédoublonner n'était rafraîchie qu'au rendu suivant.
- Le remappage des annotations après une fusion supposait une seule page
  ajoutée ; il se fonde maintenant sur la différence de pagination réelle.
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
