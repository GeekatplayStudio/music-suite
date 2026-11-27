<a id="music-suite-user-manual"></a>
# Manuel d'utilisation de Music Suite

Music Suite est une station de travail musicale qui fonctionne sur votre propre ordinateur. Elle analyse et masterise des morceaux terminés, les sépare en instruments, transforme l'audio en notes, édite et mixe des sessions multipistes, génère des morceaux avec l'IA, crée des sons de synthé et joue votre musique sur un clavier matériel comme le Roland GO:KEYS 3.

Tout fonctionne en local. Les seules choses qui passent par Internet sont les services d'IA en ligne que vous choisissez d'activer (avec votre propre clé), les téléchargements de modèles facultatifs, la vérification des mises à jour et les plugins de navigateur de la communauté si vous les autorisez.

> **Astuce :** chaque espace de travail a de petits boutons **?** à côté de ses réglages. Ils ouvrent ce manuel à la section qui les explique, dans un nouvel onglet, pour que vous ne perdiez rien de votre travail en cours.

<a id="getting-started"></a>
## Prise en main

<a id="the-workspaces"></a>
### Les espaces de travail

| Espace de travail | Adresse | À quoi il sert |
|---|---|---|
| [Analyse et mastering](#analyser-and-mastering) | `/` | Mesurer un morceau terminé, trouver ses problèmes, le masteriser, le convertir dans d'autres formats. |
| [Éditeur studio](#studio-editor) | `/editor` | Sessions multipistes : importer, séparer en stems, réparer, éditer, enregistrer, écrire des notes, mixer et exporter. |
| [Studio de chansons IA (AI Song Studio)](#ai-song-studio) | `/generate` | Générer des morceaux à partir d'une description ou d'un morceau que vous avez déjà ; albums. |
| [Studio de synthèse (Synth Studio)](#synth-studio) | `/synth` | Créer des sons de synthé et jouer des instruments plug-in comme Surge XT. |
| [Géométrie du morceau](#song-geometry-mapper) | `/mapper` | Une image 3D du son d'un morceau, pour l'explorer et pour la vidéo. |
| [Modèles et moteurs](#models-and-engines) | `/models` | Installer des modèles d'IA et des instruments facultatifs. |
| Aide | `/help` | Ce manuel. |

Les morceaux passent d'un espace de travail à l'autre avec les boutons en haut de chaque page : par exemple, **Éditeur studio** dans l'analyseur ajoute le morceau sélectionné à une session, et **Envoyer le mix à l'analyseur et au mastering** dans le menu Exporter de l'éditeur renvoie un mix.

<a id="language-colours-and-extra-windows"></a>
### Langue, couleurs et fenêtres supplémentaires

Le bouton **Langue et couleurs** (un globe avec la langue actuelle, à côté des boutons d'en-tête dans chaque espace de travail) règle :

- **Langue :** English, Русский, Español, Deutsch, Français ou Українська. Toute l'interface est traduite, y compris les messages des moteurs et ce manuel (la page Aide affiche l'édition française, [USER_MANUAL.fr.md](USER_MANUAL.fr.md), quand l'interface est en français). Certaines choses restent telles quelles, volontairement :
  - les noms des modèles, des plug-ins et des presets ;
  - les unités que les musiciens emploient en anglais (BPM, LUFS, dB) ;
  - le texte envoyé aux modèles musicaux, comme les prompts de style et les noms des sections du plan, car les modèles lisent l'anglais ;
  - les noms de pistes que l'éditeur crée puis reconnaît, comme « Sing-along ».
- **Thème de couleurs :** Cyan minuit (l'original), Studio ambre, Nuit violette, Forêt, Magenta ou **Clair (jour)**. Les couleurs d'état gardent leur sens dans tous les thèmes : rouge pour les erreurs, ambre pour les avertissements, vert pour la réussite. Dans le thème clair, les formes d'onde, le piano roll, les graphiques et les visuels gardent leur zone de dessin sombre.

Les deux sont enregistrés dans ce navigateur.

**Panneaux dans leur propre fenêtre (pour un deuxième écran).** Le bouton **fenêtre séparée** (une boîte avec une flèche) ouvre un panneau dans une fenêtre à part que vous pouvez faire glisser sur un autre écran.

- **Éditeur studio :**
  - l'**inspecteur** (bouton dans l'en-tête) ;
  - le **piano roll, la partition et la vue spectrale** (bouton à côté du bouton de fermeture de chaque panneau) ;
  - le **piano à l'écran** (à côté de *Masquer*).
- **Analyseur :**
  - **Visual AI** (bouton à côté de son bouton plein écran) ;
  - les **graphiques** (bouton sur la ligne d'astuce au-dessus d'eux). Les boutons de groupe et les liens « Accès rapide » du « Studio de graphiques » restent sur la page et agissent sur les graphiques de l'autre fenêtre.

Le panneau fonctionne exactement comme avant, et les touches que vous pressez dans sa fenêtre (Espace, annulation, raccourcis) parviennent toujours à la page. Fermez la fenêtre, ou cliquez sur **Le ramener**, pour le remettre en place.

Chaque fenêtre se souvient de sa position et de sa taille, et s'y rouvre la fois suivante. Avec plusieurs écrans, le navigateur demande une fois si Music Suite peut placer des fenêtres ; autorisez-le, et un panneau s'ouvre sur l'autre écran la première fois, puis revient ensuite sur l'écran où vous l'avez laissé.

La première fois, un message explique que chaque fenêtre supplémentaire consomme davantage de mémoire, de processeur et de puissance graphique. Fonctionne dans Chrome et Edge ; autorisez les fenêtres pop-up pour Music Suite si le navigateur bloque la fenêtre.

**Tous les panneaux peuvent être détachés.** En plus de ceux-là, chaque section d'un espace de travail a le même petit bouton dans son titre : les cartes de l'analyseur, les **pistes et la timeline** de l'éditeur, les sections et onglets d'AI Song Studio, le son, les réglages et les panneaux du plug-in de Synth Studio, et les sections de Modèles et moteurs. Détachez ceux que vous voulez et organisez l'écran à votre façon. Le bouton **langue et couleurs** liste les panneaux de la page actuelle sous **Panneaux de cette page**, avec **Détacher** ou **Ancrer** pour chacun, **Tout ancrer** et **Rouvrir mes panneaux détachés** pour retrouver la disposition de la dernière fois. Cochez **Rouvrir les panneaux détachés avec leur page** pour que cela se fasse tout seul. Il faut autoriser les fenêtres pop-up pour Music Suite ; sinon le navigateur n'ouvre qu'une fenêtre par clic.

**Espaces de travail et onglets dans leurs propres fenêtres.** Le bouton **Langue et couleurs** propose aussi **Ouvrir dans une nouvelle fenêtre** : choisissez un espace (Analyseur, Éditeur studio, Studio de chansons IA, Studio de synthèse, Modèles et moteurs, Géométrie du morceau ou Aide) et il s’ouvre dans sa propre fenêtre. Dans le Studio de chansons IA et le Studio de synthèse, le bouton de fenêtre à côté des onglets ouvre l’onglet actuel dans une nouvelle fenêtre, par exemple l’onglet **Album** sur un écran pendant que vous créez des morceaux sur un autre. Ces fenêtres se souviennent aussi de l’endroit où vous les avez laissées. N’ouvrez chaque session que dans une seule fenêtre de l’éditeur : si la même session est ouverte dans deux fenêtres, les deux le signalent, car chacune enregistrerait par-dessus les modifications de l’autre.

<a id="installing-windows"></a>
### Installation (Windows)

1. Double-cliquez sur **install.bat** dans le dossier de Music Suite. Extrayez d'abord le ZIP téléchargé (clic droit ▸ **Extraire tout...**) : lancé depuis l'intérieur du ZIP, il s'arrête et vous le signale.
2. Il demande **Complete install? [y/N]** (installation complète ?) :
   - **Entrée (Standard) :** l'application avec tout ce qu'il lui faut pour fonctionner. Environ 10 Go d'espace libre suffisent largement.
   - **y (Complète) :** en plus, le moteur local de musique IA et ses modèles, l'auteur de paroles (Ollama), la séparation de stems par IA avec tous les modèles, et le synthé Surge XT. Environ 30 Go de téléchargements ; prévoyez 45 Go libres.
3. Il passe par cinq étapes : les outils (Python, FFmpeg, Node.js, Git), l'environnement Python, l'application web (l'étape la plus lente), les éléments facultatifs et une vérification finale. Chaque outil provient de sa source officielle et est vérifié avant d'être utilisé. Python n'a pas besoin d'être installé : comme la version portable de ComfyUI, Music Suite garde son propre Python dans son dossier, donc rien n'est installé dans Windows et aucun mot de passe administrateur n'est demandé.
4. Quand il affiche **Music Suite is installed!**, double-cliquez sur **start.bat**.

Tout ce qui n'a pas été installé peut être ajouté plus tard depuis [Modèles et moteurs](#models-and-engines) et les Paramètres du Studio de chansons IA. Voir `docs/WINDOWS_INSTALL_GUIDE.md` pour les options de l'installeur.

Avant de télécharger quoi que ce soit, l'installeur vérifie que :

- il peut écrire dans le dossier ;
- il y a assez d'espace disque libre ;
- cet ordinateur peut joindre les serveurs de paquets Python et web.

Si l'une de ces vérifications échoue, il indique quoi faire. Il avertit aussi quand le dossier se trouve dans OneDrive ou a un chemin très long : les deux peuvent faire échouer l'installation, et déplacer le dossier vers un endroit comme `C:\MusicSuite` évite le problème. Un téléchargement interrompu est relancé automatiquement.

**Si l'installation échoue,** l'installeur montre ce qui s'est mal passé. Relancez **install.bat** : il conserve tout ce qui est déjà fait et reprend à partir de là. S'il s'arrête deux fois au même endroit, redémarrez Windows et réessayez une fois. Le journal complet se trouve dans `logs\install.log`.

<a id="starting-and-stopping"></a>
### Démarrer et arrêter

- **start.bat** démarre Music Suite et l'ouvre dans votre navigateur (normalement http://127.0.0.1:3000). S'il manque quelque chose dont il a besoin, il l'installe d'abord. Si Music Suite tourne déjà, il ouvre simplement le navigateur.
- **stop.bat** l'arrête. Il n'arrête que le Music Suite qu'il a démarré, jamais autre chose.
- Si un port est occupé, Music Suite prend le suivant qui est libre et l'indique.
- **Après une mise à jour,** le premier démarrage met les bibliothèques à jour et reconstruit l'application si la nouvelle version l'exige. Cela prend une minute ou deux, une seule fois ; les démarrages suivants prennent quelques secondes.
- Utilisez **Chrome ou Edge** : le MIDI matériel (claviers) ne fonctionne que dans ces navigateurs.

Options de démarrage (lancez `start.ps1` depuis PowerShell) : `-NoBrowser` (ne pas ouvrir le navigateur), `-ApiPort` et `-WebPort` (ports préférés, 8008 et 3000), `-StartupTimeoutSeconds` (300 par défaut), `-NoInstall` (signaler ce qui manque au lieu de l'installer), `-StartComfyUI -ComfyUIPath <folder>` (démarrer aussi ComfyUI pour MusicGen).

<a id="updating"></a>
### Mise à jour

Sur la page de l'analyseur, cliquez sur **Configuration** :

- **Rechercher des mises à jour** consulte uniquement le dépôt officiel de Music Suite.
- **Installer la mise à jour** la récupère quand il y en a une. Elle n'écrase jamais les modifications que vous avez faites vous-même ; s'il y en a, elle refuse et le signale.
- Redémarrez ensuite Music Suite. Les nouvelles dépendances sont installées au démarrage.

Les mises à jour depuis l'application nécessitent que Music Suite ait été installé avec Git (un clone), et non depuis un ZIP.

<a id="where-your-work-is-kept"></a>
### Où votre travail est conservé

| Quoi | Où |
|---|---|
| Sessions de l'éditeur, leur audio et leurs stems | `data\editor\<session id>\` |
| Morceaux analysés, masters, conversions et rapports | `data\runs\` et `data\uploads\` |
| Paramètres, historique et albums du Studio de chansons IA | `data\generation\` |
| Le moteur local de musique IA et ses modèles | `data\engines\acestep.cpp\` |
| Modèles de séparation de stems | `data\models\audio-separator\` |
| Journaux (quand quelque chose ne va pas) | `logs\` (`api.log`, `web.log`, `install.log`) et `data\generation\engine.log` |
| Clés des services en ligne | Gestionnaire d'identification Windows (« Music Suite ») |
| Surge XT | `data\plugins\VST3\` (Windows), ou votre propre dossier VST3 si vous avez choisi de le partager avec d'autres logiciels de musique |
| Python, FFmpeg, Node.js et Git propres à Music Suite | `.tools\` |
| Caches de téléchargement (bibliothèques, modèles) | `.cache\` et `data\cache\` |
| Vos sons de synthé, plugins favoris, choix MIDI, presets du mapper | Le stockage de votre navigateur : pas dans le dossier de Music Suite, et pas inclus dans les fichiers de projet |

**Tout reste dans ce dossier.** Comme ComfyUI Portable, Music Suite n'installe rien dans Windows : son Python, ses outils, ses téléchargements et ses caches vivent dans son dossier, donc supprimer le dossier le retire entièrement. Seuls sont gardés ailleurs les clés des services en ligne (Gestionnaire d'identification Windows), ce que stocke votre navigateur (ci-dessus), Surge XT si vous avez choisi de le partager avec d'autres logiciels de musique et, uniquement avec l'installation complète, Ollama et les outils de compilation du moteur musical IA.

Pour sauvegarder ou déplacer une session, utilisez **Exporter → Projet entier** dans l'éditeur (voir [Enregistrement, fichiers de projet et annulation](#saving-project-files-and-undo)).

<a id="analyser-and-mastering"></a>
## Analyse et mastering

La page d'accueil (`/`) analyse en profondeur un morceau terminé, vous dit ce qui ne va pas et le masterise pour la diffusion. Rien ici ne modifie votre fichier original : chaque résultat est un nouveau fichier.

La page comporte une colonne de commandes à gauche (« Contrôle de session », « Conversion de format », « Mastering IA », « Historique des analyses », « Lecture + timeline ») et une colonne de résultats à droite (tuiles d'état, « Vue d'ensemble », « Infos sur le fichier », mesures, recommandations, marqueurs et graphiques). Sur un écran étroit, la colonne de gauche vient en premier.

<a id="the-workflow-in-short"></a>
### Le déroulement en bref

1. **Envoyer :** faites glisser un fichier sur la zone de dépôt ou cliquez sur **Parcourir**. Il est envoyé immédiatement et devient l'*analyse* sélectionnée (un morceau et tout ce qui en est tiré).
2. **Analyser :** cliquez sur **Analyser**. Un morceau typique prend de moins d'une minute à quelques minutes.
3. **Examiner :** lisez les tuiles, les recommandations, les marqueurs et les graphiques.
4. **Masteriser :** cliquez sur **Appliquer les réglages suggérés** (ou réglez les vôtres) puis sur **Lancer le mastering**.
5. **Enregistrer :** à la fin, la boîte de dialogue **Résultats prêts à enregistrer** demande où enregistrer les fichiers.

> **Astuce :** ne cliquez pas sur **Envoyer** après avoir déposé un fichier : le fichier est déjà envoyé, et « Envoyer » en crée une deuxième copie dans l'historique des analyses.

<a id="header-buttons"></a>
### Boutons d'en-tête

| Bouton | Ce qu'il fait |
|---|---|
| Configuration | Affiche la version installée et recherche les mises à jour (voir [Mise à jour](#updating)). |
| Actualiser les analyses | Recharge la liste des analyses. |
| Géométrie du morceau | Ouvre le morceau sélectionné dans [Géométrie du morceau](#song-geometry-mapper). |
| En faire un morceau / Studio de chansons IA | Ouvre le [Studio de chansons IA](#ai-song-studio), avec le tempo, la tonalité et le style du morceau sélectionné déjà remplis. |
| Éditeur studio | Ajoute le morceau sélectionné à une session de l'[Éditeur studio](#studio-editor), éventuellement séparé en stems. |
| Studio de synthèse, Modèles et moteurs | Ouvrent ces espaces de travail. |
| Effacer l'historique | Supprime toutes les analyses qui ne sont pas en cours de traitement, y compris celles qui ont échoué. Demande confirmation. |
| Réinitialisation forcée | Annule tout le travail en file d'attente, redémarre les processus d'arrière-plan et supprime toutes les analyses, y compris celles en cours. À n'utiliser que lorsque quelque chose est bloqué. Demande confirmation. |

<a id="session-control"></a>
### Contrôle de session

- **Zone de dépôt / Parcourir :** accepte WAV, FLAC, MP3, AAC, OGG, M4A et AIFF, jusqu'à 500 Mo et 15 minutes par défaut (les deux limites peuvent être modifiées, voir [Référence des réglages](#settings-reference)).
- **Analyser :** mesure le morceau. Le relancer sur un morceau déjà traité l'analyse à nouveau.
- **Visual AI :** ouvre le panneau Sonic Visual AI au-dessus de la page : visuels en direct **Spectre**, **Orbite** et **Forme d'onde** avec des indicateurs de graves, de médiums et d'aigus et un bouton plein écran. Il a son propre lecteur. Il reste ouvert jusqu'à ce que vous rechargiez la page.
- **Utiliser le calcul GPU optionnel des spectrogrammes** (désactivé) : calcule le spectrogramme linéaire avec la carte graphique. Il faut les bibliothèques GPU ; sans elles, l'analyse continue sur le processeur et le signale.
- **Zone d'état :** l'état de l'analyse (importée, en attente, en cours, terminée, échec), une barre de progression et une ligne qui dit ce qui se passe en ce moment (voir [Étapes de l'analyse](#analysis-stages)). Un avertissement ambre apparaît si rien n'a changé pendant cinq minutes : une longue étape de spectrogramme peut durer aussi longtemps, et une analyse vraiment bloquée est arrêtée automatiquement au bout de dix minutes.
- **Exports : JSON, HTML, PDF :** les mesures sous forme de données, et un rapport complet en page web ou en PDF. Ils existent une fois l'analyse terminée. Le PDF nécessite WeasyPrint ; sans lui, seul le rapport HTML est produit.

<a id="format-conversion"></a>
### Conversion de format

Crée des copies du morceau sélectionné dans d'autres formats.

| Réglage | Plage | Par défaut |
|---|---|---|
| Formats | MP3, WAV, FLAC, AAC, OGG, M4A | MP3, WAV, FLAC |
| MP3 kbps | 96–320 | 320 |
| AAC kbps (aussi utilisé pour M4A) | 96–320 | 256 |

**Convertir la sélection** lance la conversion. Les copies WAV sont en 16 bits ; le FLAC est sans perte ; l'OGG est en Vorbis qualité 5. La conversion nécessite ffmpeg (installé avec Music Suite). Après l'analyse, les copies sont faites à partir de la version analysée à 48 kHz et s'appellent `canonical.mp3`, `canonical.wav` et ainsi de suite. Convertir à nouveau remplace les copies précédentes.

<a id="ai-mastering"></a>
### Mastering IA

Masterise le morceau pour sa destination : règle le volume, maîtrise les crêtes, équilibre le timbre et corrige les problèmes trouvés par l'analyse.

<a id="suggested-from-analysis"></a>
#### Suggestion de l'analyse

Après l'analyse, ce bloc suggère un mode, un preset, un volume cible et un plafond de crête, avec les raisons. **Appliquer les réglages suggérés** les copie dans le formulaire ci-dessous (sans toucher au gain d'entrée, aux basses en mono, à la largeur stéréo ni au morceau de référence).

Comment il décide :

- **V1** pour les sources denses, compressées avec pertes, écrêtées ou sensibles aux crêtes ; **V2** pour les morceaux plus propres qui ont plusieurs problèmes ; **V3** pour une correction plus forte sur un matériau qui la supporte.
- **film** pour un matériau très dynamique ou calme, **voice** pour un matériau surtout parlé, **club** pour un matériau riche en basses qui a de la marge, sinon **streaming**.

<a id="mastering-settings"></a>
#### Réglages du mastering

| Réglage | Choix / plage | Par défaut | Ce qu'il fait |
|---|---|---|---|
| Mode | V1, V2, V3 | V1 | **V1 :** une passe de mastering soignée, puis un affinage. Le plus sûr. **V2 :** essaie plusieurs variantes des réglages, note chacune et garde la meilleure. **V3 :** sépare le son en quatre bandes de fréquences (basses, médiums, transitoires, le reste), traite chacune puis les recombine. Ce sont des bandes de fréquences, pas des stems IA. |
| Preset | streaming, club, film, voice | streaming | Le point de départ de la chaîne : compression, de-essing, impact et jusqu'où les basses sont passées en mono. Voir le tableau ci-dessous. |
| Profil de normalisation | Désactivé, YouTube, Spotify, Apple Music, Instagram, TikTok, Broadcast EBU, Podcast Voice | Désactivé | Remplit « LUFS cible » et True Peak avec les valeurs de cette plateforme. |
| Moteur | internal, auto, ffmpeg, pedalboard, matchering | internal | Une étape de traitement supplémentaire facultative. Voir [Moteurs de traitement](#backends). |
| Morceau de référence | Aucun, ou n'importe quel autre morceau de l'historique des analyses | Aucun | Avec matchering : fait sonner le master comme ce morceau. |
| LUFS cible | −30 à −6 | −14 | Le volume global du master. |
| True Peak dBFS | −6 à 0 | −1 | La crête la plus haute autorisée, y compris les crêtes entre les échantillons. |
| Gain d'entrée (dB) | −12 à +12 | 0 | Monte ou baisse la source avant le mastering, ce qui change l'intensité du travail de la chaîne. **Réinitialiser** le remet à 0. |
| Basses en mono | Défaut du preset, Désactivé, 80, 100, 120, 150 Hz | Défaut du preset | Passe en mono tout ce qui est sous cette fréquence : le bas du spectre est plus serré et reste sûr sur des haut-parleurs mono. « Défaut du preset » laisse le mastering relever la fréquence s'il trouve des problèmes de phase ; tout autre choix la verrouille. |
| Largeur stéréo | 0,5–1,5, ou vide | vide (1,0) | Rétrécit (sous 1) ou élargit (au-dessus de 1) l'image stéréo. Laisser vide permet au mastering de la rétrécir s'il trouve des problèmes de phase. |
| Variantes V2 | 2–8 | 4 | Combien de variantes V2 essaie. Plus, c'est une recherche plus large mais plus lente. Utilisé seulement en V2. |
| Passes d'affinage | 1–5 | 2 | Combien de passes de réparation peuvent suivre la passe principale. Une passe n'est gardée que si elle améliore le résultat sans rien dégrader d'autre. |

> **Important :** les champs « LUFS cible » et True Peak l'emportent toujours sur le preset. Choisir **club** en laissant −14 et −1 dans les champs masterise à −14 LUFS, pas aux −9 de club. Pour utiliser le volume propre d'un preset, videz les deux champs, ou utilisez « Appliquer les réglages suggérés » ou un profil de normalisation.

Ce que vise chaque preset (quand les champs sont vides) :

| Preset | Volume | Plafond de crête | Caractère |
|---|---|---|---|
| streaming | −14 LUFS | −1 dBTP | Équilibré, compression douce, basses en mono sous 110 Hz. |
| club | −9 LUFS | −0,5 dBTP | Plus fort et plus dense, compression plus ferme, basses en mono sous 120 Hz. |
| film | −18 LUFS | −2 dBTP | Le plus dynamique, compression légère, basses en mono sous 80 Hz. |
| voice | −16 LUFS | −1,5 dBTP | Voix intelligible, de-essing le plus fort, basses en mono sous 120 Hz. |

Profils de plateforme : YouTube, Spotify, Instagram et TikTok −14 LUFS / −1 dBTP ; Apple Music −16 / −1 ; Broadcast EBU −23 / −1 ; Podcast Voice −16 / −1,5.

<a id="backends"></a>
#### Moteurs de traitement

| Moteur | Ce qu'il ajoute | Nécessite |
|---|---|---|
| internal | Rien de plus : seulement la chaîne intégrée. Le plus sûr, le plus rapide, et celui par défaut. | Rien |
| ffmpeg | Une deuxième passe de filtrage, compression, normalisation du volume et limitation. | ffmpeg (installé) |
| pedalboard | Une deuxième passe de filtrage, compression et limitation. | La bibliothèque Pedalboard |
| matchering | Aligne le timbre et le volume sur ceux d'un morceau de référence. | La bibliothèque Matchering **et** un morceau de référence |
| auto | Choisit matchering (s'il est disponible et qu'il y a une référence), sinon pedalboard, sinon internal. Jamais ffmpeg. | |

Si un moteur n'est pas installé, le mastering utilise **internal** à la place, sans prévenir. Regardez la ligne « Moteur sélectionné » dans la zone de progression pour voir ce qui a été utilisé, et « Modules Pro » pour voir ce qui est installé.

Sur un ordinateur plus lent, les moteurs supplémentaires peuvent prendre plusieurs minutes par morceau, là où **internal** prend bien moins d'une minute. La tuile **Analyse active** affiche l'identifiant complet de l'analyse du morceau avec un bouton de copie, si vous en avez besoin ailleurs.

Il n'y a qu'une passe de mastering à la fois par morceau. Cliquer à nouveau sur **Lancer le mastering** pendant qu'une passe est en cours le signale et ne change rien ; attendez la fin, puis relancez avec les nouveaux réglages.

<a id="running-and-reading-the-results"></a>
#### Lancer et lire les résultats

**Lancer le mastering** démarre le traitement ; masteriser à nouveau remplace les masters précédents de ce morceau. La zone de progression affiche l'étape, la meilleure sortie, le moteur utilisé et une empreinte (SHA-256) du résultat.

- **Affinage :** combien de passes de réparation ont été acceptées, le score final des problèmes et combien de passes ont été annulées. « Garde-fou anti-régression » signifie que le résultat affiné était pire que la source : le mastering est donc reparti de la source, plus doucement.
- **Adaptation à la source :** ce que le mastering a changé avant de commencer, et pourquoi. Par exemple, il baisse le plafond de crête pour une source qui écrête déjà, renforce le de-essing pour une source agressive, ou réduit la largeur quand il trouve des problèmes de phase. Les réglages que vous avez verrouillés (basses en mono, largeur stéréo) ne sont pas touchés.
- **Auto-vérification après mastering :** mesure le master et le compare à la source.
  - *Évaluation :* nette amélioration, amélioration partielle, inchangé ou régression.
  - *Score des problèmes avant → après :* plus il est bas, mieux c'est. Chaque type de problème ajoute des points (écrêtage, risque de crête, trop fort, problèmes en mono, plage de volume aplatie : 3 ; dureté, sub-basses, creux, trop faible, trop dense : 2). *Plage de volume aplatie* signifie que le master a gardé moins de la moitié de la plage de volume du morceau : les passages calmes et forts se retrouvent presque au même niveau.
  - *Conformité : réussie* signifie que le volume est à moins de 0,75 LU de la cible, que les crêtes ne dépassent pas le plafond de plus de 0,1 dB, qu'il n'y a pas d'écrêtage et que la musique garde de l'impact (un facteur de crête suffisant). Si le premier résultat échoue, jusqu'à deux tentatives plus strictes sont faites automatiquement (« Rattrapage après contrôle »).
  - *Résolus / Restants / Aggravés :* quels problèmes ont changé, et des *corrections recommandées* pour ceux qui restent.
- **Résultats masterisés :** chaque fichier produit, avec son volume, sa crête et (en V2) son score, où plus bas est mieux. Tous sont en WAV 32 bits à virgule flottante, 48 kHz.

| Mode | Fichiers |
|---|---|
| V1 | `master_v1.wav` |
| V2 | `master_v2_variant_1…N.wav` et `master_v2_best.wav` |
| V3 | `master_v3.wav` plus les quatre fichiers de bandes `stem_bass`, `stem_vocals`, `stem_drums`, `stem_other` |

<a id="outputs-ready-to-save"></a>
### Résultats prêts à enregistrer

Quand une conversion ou un mastering lancé depuis cette page se termine, une boîte de dialogue liste les nouveaux fichiers (pour le mastering, seulement le meilleur master ; les autres sont dans le tableau « Résultats masterisés »).

- **Enregistrer sous...** vous laisse choisir où enregistrer. Les navigateurs sans sélecteur d'emplacement téléchargent à la place.
- **Téléchargement rapide** télécharge dans votre dossier habituel.
- **Ignorer** retire la ligne.
- **Plus tard** ferme la boîte de dialogue ; **Enregistrer les fichiers prêts (N)** dans « Contrôle de session » la rouvre.

La liste est perdue si vous rechargez la page ; les fichiers eux-mêmes restent dans les tableaux.

<a id="run-history"></a>
### Historique des analyses

Tous les morceaux importés, du plus récent au plus ancien (jusqu'à 50). Cliquez sur une ligne pour la sélectionner. Changer de morceau arrête la lecture et réinitialise l'égaliseur, la vitesse et la boucle ; les réglages de mastering sont conservés.

<a id="playback-and-the-timeline"></a>
### Lecture et timeline

Le lecteur joue le **fichier importé d'origine** (il n'y a pas de comparaison A/B intégrée avec les masters ; téléchargez-les, ou ouvrez les deux dans l'Éditeur studio).

- **Tête de lecture :** faites-la glisser pour vous déplacer dans le morceau.
- **Segment sélectionné :** **Marqueur gauche** et **Marqueur droit** choisissent une fenêtre (au moins 0,25 s). Les graphiques temporels zooment dessus. **Piste entière** sélectionne tout.
- **Marqueurs :** une pastille par problème trouvé ; cliquez sur l'une d'elles pour y aller et zoomer dessus.
- **Vue d'ensemble :**
  - **Bande de revue de la forme d'onde :** cliquez pour vous y déplacer. Les barres colorées en bas sont des marqueurs : rouge pour une gravité élevée, ambre pour moyenne, bleu pour faible.
  - **Transport :** **Lecture/Pause**, **−5s / +5s**, **Début de sélection**, **Boucler la sélection**, **Vitesse** (0,75–1,5×), **Définir le début / Définir la fin** à la tête de lecture, et **Réinitialiser la plage** (morceau entier, boucle désactivée).
  - **Clavier :** Espace lance et met en pause ; les flèches gauche et droite sautent de 5 s.

<a id="delivery-readiness"></a>
### Prêt pour la livraison

| Tuile | Affiche |
|---|---|
| Volume | **Aligné** à moins de 1,5 LU de la cible du profil de normalisation choisi (−14 LUFS s'il est désactivé), sinon **Trop fort** ou **Faible**. |
| True Peak | **Sûr** à −1 dBFS ou moins, **Juste** jusqu'à −0,2, sinon **Risque**. |
| Marqueurs | **Propre** sans marqueur sérieux, **À revoir** avec jusqu'à 3, **Attention** au-delà. |
| Dynamique | **Ouverte** avec un facteur de crête de 8 dB ou plus, **Maîtrisée** à partir de 5 dB, sinon **Dense**. |

Avant l'analyse, toutes les valeurs sont à zéro : ces tuiles affichent donc « Trop fort », « Risque » et « Dense » tant que le morceau n'a pas été analysé.

<a id="manual-eq"></a>
### Égaliseur manuel

Un égaliseur 20 bandes (de 20 Hz à 16 kHz, ±12 dB chacune) pour écouter à travers le lecteur de la page. Cochez d'abord **Activer l'EQ** ; les curseurs n'ont aucun effet tant qu'il est désactivé. **Réinitialiser l'EQ** le remet à plat. **Exporter le WAV égalisé** calcule tout le morceau à travers l'égaliseur dans votre navigateur et enregistre un WAV 16 bits nommé `<song>_eq.wav`. Égaliseur désactivé, l'export est une copie non traitée. L'égaliseur n'a pas d'effet sur le mastering.

<a id="file-intelligence"></a>
### Infos sur le fichier

| Tuile | Ce qu'elle vous apprend |
|---|---|
| Format / Codec | Le type de fichier, et s'il est avec pertes (MP3, AAC…) ou sans perte. |
| Plage de fréquences | La plage que le fichier peut contenir, et celle qui contient réellement du son. |
| Aperçu de la dynamique | Facteur de crête (impact) et plage de volume (LRA, à quel point le volume varie). |
| Propriétés du signal | Fréquence d'échantillonnage, canaux, débit et résolution. |
| Estimation de la perte de compression | À quelle distance sous 20 kHz le son s'arrête. Un fichier « sans perte » dont le son s'arrête à 16 kHz a probablement été fait à partir d'un MP3. |
| Détail des plages | Crête par rapport au bruit de fond, et crête par rapport au volume. |

**Évaluation de la compression** résume tout cela en une phrase. **Pourquoi certaines valeurs sont N/D** explique toute tuile vide ; le plus souvent, le morceau n'a pas de silences où mesurer le bruit, ou il a été analysé par une ancienne version (cliquez à nouveau sur Analyser). **Tags de métadonnées** liste les tags du fichier ; **Afficher le JSON brut des métadonnées** les montre tous. **Guide : ce que tout signifie** est un aide-mémoire directement sur la page.

<a id="measurements-recommendations-and-markers"></a>
### Mesures, recommandations et marqueurs

| Mesure | Ce qu'elle signifie | Bonnes valeurs |
|---|---|---|
| Integrated LUFS | Le volume global. | −14 pour le streaming, −9 à −8 pour le club, −23 pour la diffusion radio/TV |
| True Peak dBFS | La crête la plus haute, y compris entre les échantillons. | −1 ou moins |
| Crest Factor dB | L'écart entre les crêtes et le niveau moyen : l'impact. | 8 dB ou plus pour une musique qui respire |
| Noise Floor dBFS | Le bruit de fond dans les silences. | aussi bas que possible ; vide s'il n'y a pas de silences |

Les **Recommandations de remastering** listent chaque problème avec une priorité (élevée, moyenne, faible) et ce qu'il faut faire, par exemple : écrêtage, crêtes au-dessus de −1 dBTP, trop fort ou trop faible, trop compressé, problèmes en mono, sibilance, dureté, trop de sub-basses, manque d'aigus, ou décalage DC.

Les **marqueurs** sont les moments où les problèmes se produisent :

| Marqueur | Détecté quand | Gravité |
|---|---|---|
| clipping | Trois échantillons ou plus d'affilée à pleine échelle | élevée s'il dure 5 ms ou plus |
| true_peak_risk | Crêtes à −1 dBFS ou plus | élevée |
| mono_incompatibility | La gauche et la droite s'annulent (corrélation sous −0,1) | élevée |
| loudness_dip | Le niveau tombe de 8 LU ou plus sous la moyenne du morceau | moyenne |
| sibilance | Des « s » trop marqués (6–10 kHz) | moyenne |
| harshness_band | Trop de 3–9 kHz | moyenne |
| sub_bass_heavy | Trop de 20–80 Hz | moyenne |
| dc_offset | La forme d'onde est décalée par rapport au centre | moyenne |

Le tableau **Marqueurs près de la tête de lecture / sélection** les liste, les plus proches de la tête de lecture en premier ; cliquez sur une ligne pour y aller.

<a id="charts"></a>
### Graphiques

Le **Studio de graphiques** filtre les graphiques : **Toutes les vues**, **Revue du mix**, **Focus stéréo** ou **Spectral**. **Accès rapide** fait défiler jusqu'à un graphique. Chaque graphique se zoome avec la molette de la souris, se réinitialise d'un double-clic et s'enregistre en image avec l'icône d'appareil photo. Faites un clic droit et glissez sur un graphique temporel pour déplacer la fenêtre sélectionnée. Les graphiques temporels suivent le segment sélectionné.

| Graphique | Comment le lire |
|---|---|
| Waveform + Envelope | La forme du son, avec le niveau de crête et le niveau moyen dans le temps. Des sommets plats signifient une forte limitation ou de l'écrêtage. |
| Loudness Timeline | Le volume d'instant en instant (0,4 s) et de phrase en phrase (3 s), comparé au volume global du morceau. |
| Average Spectrum | La quantité d'énergie à chaque fréquence : pente, trop de basses, dureté, manque d'air. |
| Stereo Correlation + M/S | Sous zéro, la gauche et la droite s'annulent quand on écoute en mono. |
| Correlation Meter | La même chose dans le temps : le vert est sûr, le rouge risque de disparaître en mono. |
| Mid/Side View | Ce qui est au centre par rapport aux côtés, et l'équilibre gauche-droite. |
| Vectorscope / Goniometer | Une ligne verticale, c'est du mono ; un nuage large, une stéréo large ; une forme horizontale, un déphasage. |
| STFT Spectrogram (Linear / Log) | Le temps en fonction de la fréquence ; la luminosité indique le niveau. L'échelle Log est plus facile à lire musicalement. |
| Mel Spectrogram | Les fréquences espacées comme l'oreille les regroupe. |
| CQT Spectrogram | Les fréquences espacées en notes de musique : montre les hauteurs et les harmoniques. |

Les fichiers mono n'ont pas de graphiques stéréo.

<a id="analysis-stages"></a>
### Étapes de l'analyse

La ligne d'état passe par : importé, en attente, initialisation, lecture des métadonnées, décodage, balayage, mesure du volume et de la dynamique, détection des marqueurs, calcul des spectrogrammes, construction des graphiques, création du rapport (HTML, puis PDF), et terminé. Si rien ne change pendant 10 minutes, l'analyse est arrêtée avec un message « Loop guard triggered » ; cliquez sur **Réinitialisation forcée** si une analyse semble toujours bloquée après cela.

<a id="studio-editor"></a>
## Éditeur studio

L'Éditeur studio est un éditeur multipiste audio et MIDI. Chaque travail est une *session* (on dit aussi un projet) qui s'enregistre toute seule au fur et à mesure.

<a id="sessions"></a>
### Sessions

La page `/editor` affiche vos sessions :

- **Nouvelle session :** tapez un nom (ou laissez vide pour obtenir « Session sans titre ») et cliquez sur **Nouvelle session** ou appuyez sur Entrée.
- **Ouvrir un fichier de projet… :** ouvre un fichier `.musicsuite.zip` enregistré avec « Exporter → Projet entier », comme nouvelle session. Vos sessions existantes ne sont pas touchées.
- **Liste des sessions :** cliquez sur une session pour l'ouvrir. L'icône de corbeille demande **Supprimer** ou **Garder**. **La suppression d'une session est définitive** : elle ne peut pas être annulée.

Quand un morceau est envoyé ici depuis un autre espace de travail, la page demande **Où placer « nom » ?** :

- **Le séparer en stems à l'ouverture**, et **jusqu'où** : autant que cet ordinateur le permet, 2, 4 ou 6 stems, ou « Tout » (12 stems avec les éléments de la batterie et la voix lead/les chœurs, ce qui nécessite la séparation de stems par IA).
- **Nouvelle session « nom »**, ou **Ajouter ici** sur une session existante. Le morceau est ajouté sur une nouvelle piste à 0:00 ; rien de ce qui s'y trouve déjà n'est remplacé.

<a id="the-editor-screen"></a>
### L'écran de l'éditeur

De gauche à droite, en haut :

| Commande | Ce qu'elle fait | Raccourci |
|---|---|---|
| ← | Retour à la liste des sessions. | |
| Nom du projet | Renommer la session. En dessous : « Enregistré », « Enregistrement… » ou « Échec de l'enregistrement — nouvel essai à la prochaine modification ». | |
| ✦ | Générer un morceau avec l'IA dans cette session (ouvre le Studio de chansons IA). | |
| Retour au début / Lecture / Boucle | Transport. La boucle utilise la plage surlignée s'il y en a une. | Home / Space / L |
| Enregistrer (microphone) | Enregistre de l'audio, ou des notes quand un clavier MIDI est connecté (voir [Enregistrement](#recording)). Son info-bulle indique lequel. | |
| Icône de clavier MIDI | Connecte un clavier MIDI pour jouer et enregistrer des notes. | |
| **Assistant** | L'[Assistant clavier](#keyboard-wizard). | |
| **Clavier** | Votre clavier matériel : jouez de la musique dessus, choisissez son son, enregistrez par lui (voir [Votre clavier matériel](#your-hardware-keyboard)). | |
| Icône de piano | Affiche un piano à l'écran pour la piste d'instrument sélectionnée. | |
| Horloge | La position de la tête de lecture. Cliquez pour faire passer la règle du temps (m:ss) aux mesures (mesure.temps). | |
| Niveau et volume | L'indicateur de niveau du master, ainsi que le tempo, la signature rythmique et la tonalité. Pendant la lecture : le volume intégré, à court terme et instantané (LUFS) et le true peak le plus haut. Il devient rose si la crête dépasse la limite. | |
| Outils Sélection / Cutter / Plage | Comment la souris modifie la timeline (voir ci-dessous). | V / C / R |
| Aimant | Magnétisme activé ou désactivé (activé au départ). | N |
| Automation | Affiche sur les pistes le volume, puis le panoramique, puis plus d'automation. La liste déroulante à côté choisit n'importe quelle courbe : volume, panoramique, dosage de la réverb, dosage du delay, réinjection du delay, seuil du compresseur, gains de l'égaliseur. | A |
| Vue spectrale | Affiche les fréquences du clip sélectionné dans le temps. | W |
| Signet | Ajoute un marqueur à la tête de lecture. | K |
| Annuler / Rétablir | Jusqu'à 200 étapes. | Ctrl+Z / Ctrl+Shift+Z |
| Zoom arrière / avant / ajuster | | − / + / F |
| **Importer** / **Exporter** | Faire entrer des fichiers ; sortir votre travail (voir ci-dessous). | |
| Clavier | La liste des raccourcis clavier. | ? |

Certaines de ces commandes sont masquées dans les fenêtres étroites ; élargissez la fenêtre pour toutes les voir.

Sous la timeline, la ligne d'état montre ce qui est en cours de traitement, une notification (avec **Ignorer**) ou une astuce pour l'outil actuel, et à droite le nombre de pistes, de clips et la durée de la session.

Le panneau de droite est l'[inspecteur](#editor-tools-the-inspector).

<a id="the-timeline"></a>
### La timeline

**Outils :**

- **Sélection (V) :** faites glisser un clip pour le déplacer (y compris vers une autre piste), faites glisser ses bords pour le raccourcir, faites glisser les petites poignées carrées près de ses coins supérieurs pour faire un fondu. Maj+clic ou Ctrl+clic pour en sélectionner plusieurs. Clic droit pour un menu.
- **Cutter (C) :** cliquez sur un clip pour le couper à cet endroit.
- **Plage (R) :** faites glisser sur le temps pour le surligner sur toutes les pistes. Ensuite, appuyez sur Suppr pour l'effacer, sur Maj+Suppr pour l'effacer et refermer le trou, ou sur L pour le mettre en boucle.

Le **magnétisme** (N, activé au départ) attire les modifications vers la grille, la tête de lecture, les marqueurs, les bords des sections et ceux des autres clips. Une ligne jaune s'affiche quand il s'aimante à autre chose que la grille. Maintenez **Alt** en faisant glisser pour placer librement.

**La règle :** cliquez pour déplacer la tête de lecture, faites glisser pour vous déplacer, **Maj+glisser** pour dessiner une boucle. La bande du haut montre les sections et les marqueurs : cliquez sur une section pour la surligner, cliquez sur un marqueur pour y aller, faites glisser un marqueur pour le déplacer, Alt+clic sur un marqueur pour le supprimer.

**Édition :**

| Action | Comment |
|---|---|
| Couper à la tête de lecture | S (ou Ctrl+E). Sans sélection, coupe tous les clips sous la tête de lecture. |
| Supprimer | Suppr. Sans clip sélectionné, supprime la plage surlignée. |
| Suppression avec décalage | Maj+Suppr : supprime et décale vers la gauche tout ce qui suit pour refermer le trou. |
| Dupliquer | Ctrl+D : une copie juste après le clip. |
| Copier / couper / coller | Ctrl+C / X / V. Le collage se fait à la tête de lecture. |
| Tout sélectionner | Ctrl+A |
| Décaler | ← / → déplacent les clips sélectionnés d'un pas de grille (ou la tête de lecture, quand rien n'est sélectionné). |
| Surligner la durée d'un clip | Double-cliquez dessus. |
| Épingler un marqueur de warp | Alt+clic sur un clip audio sélectionné, puis faites glisser la ligne pointillée là où ce moment doit tomber ; appliquez-le dans la section Warp de l'inspecteur. |

**Menu du clic droit :** sur un clip : Couper ici, Dupliquer, Inverser / Lire à l'endroit, Couper le son du clip / Rétablir le son du clip, Copier, Supprimer, Suppression avec décalage. Dans un espace vide : Coller ici, Déplacer la tête de lecture ici, Ajouter une piste, et avec une plage surlignée : Boucle, Supprimer la plage, Supprimer la plage avec décalage.

Les **clips qui se chevauchent** se mélangent avec un fondu enchaîné (désactivez-le dans les Paramètres du projet de l'inspecteur).

**Automation :** quand une courbe est affichée, cliquez sur la ligne jaune pour ajouter un point, faites glisser un point pour le déplacer, double-cliquez sur un point pour le retirer.

**Marqueurs et sections :** K ajoute un marqueur ; [ et ] sautent au précédent et au suivant. Maj+R transforme la plage surlignée en section. Nommez, répétez et coupez les sections dans l'inspecteur.

<a id="tracks"></a>
### Pistes

**+** au-dessus des en-têtes de pistes (ou Maj+T) ajoute une piste. Chaque en-tête de piste comporte :

| Commande | Plage | Ce qu'elle fait |
|---|---|---|
| Nom | jusqu'à 60 caractères | |
| M | | Muet (M). |
| S | | Solo (Maj+S) : seules les pistes en solo sont entendues. |
| Vol | −60 à +6 dB, 0 par défaut | Niveau de la piste. |
| Pan | de gauche à droite, centre par défaut | Position stéréo. |
| ˄ ˅ | | Monter ou descendre la piste. |
| × | | Supprime la piste et ses clips. **Sans confirmation**, mais Annuler la fait revenir. |

Cliquez sur un en-tête pour sélectionner la piste. Son égaliseur, sa largeur, sa sortie, ses départs, sa couleur, ses effets et son instrument sont dans l'[inspecteur](#track-effects-and-buses).

<a id="recording"></a>
### Enregistrement

**Audio** (le bouton du microphone) :

- **Prise normale :** enregistre à partir de la tête de lecture sur la piste sélectionnée. Si ce passage de la piste contient déjà un clip, ou si aucune piste n'est sélectionnée, la prise va sur une nouvelle piste appelée « Recording » : un enregistrement ne se fait jamais par-dessus de l'audio existant.
- **Punch-in :** surlignez d'abord une plage. L'enregistrement commence 2 s plus tôt (pour que vous puissiez entrer à temps), ne garde que ce qui se trouve dans la plage et s'arrête juste après.
- **Prises en boucle :** avec la boucle activée, chaque passage devient sa propre prise sur sa propre piste ; c'est la dernière qu'on entend. Choisissez la meilleure prise, ou le meilleur passage de chacune, dans la section **Prises** de l'inspecteur.
- Appuyez de nouveau sur enregistrer, ou sur Espace, pour arrêter.
- Les enregistrements sont en WAV 24 bits à 48 kHz, avec le traitement d'appel du navigateur (annulation d'écho, suppression du bruit, gain automatique) désactivé pour que le son reste intact. Le bouton de la barre d'outils enregistre votre entrée par défaut ; pour enregistrer depuis une entrée précise (comme l'audio USB du clavier), utilisez le panneau **Clavier**.

**Notes depuis un clavier MIDI :** quand un clavier MIDI est connecté (ou que le piano à l'écran est ouvert) et que la piste sélectionnée est une piste d'instrument avec un clip de notes, le bouton d'enregistrement enregistre des notes au lieu de l'audio. La pédale de sustain et la molette de pitch bend fonctionnent. Avec la boucle activée, chaque passage s'ajoute à la même prise. Le nouveau clip s'appelle « Played HH:MM:SS » ; avec le magnétisme activé, il est élargi à des mesures entières.

**Le panneau du clavier MIDI** (l'icône de clavier) : **Connecter**, puis **Écouter** tous les claviers connectés ou un seul. Il indique quelle piste le clavier joue et si l'enregistrement capturera des notes. **Ajouter une piste d'instrument** crée une nouvelle piste d'instrument avec un clip vide de quatre mesures, prête à recevoir votre jeu.

**Le piano à l'écran :** joue la piste d'instrument sélectionnée à la souris ou au toucher, exactement comme un clavier MIDI.

<a id="piano-roll-sheet-music-and-spectral-view"></a>
### Piano roll, partition et vue spectrale

Une seule de ces vues s'affiche à la fois, sous la timeline.

**Piano roll** (s'ouvre quand vous sélectionnez un clip de notes ; P l'affiche ou le masque) :

- Cliquez dans un espace vide pour ajouter une note ; continuez à faire glisser pour régler sa durée. Faites glisser une note pour la déplacer ; faites glisser son bord droit pour la redimensionner. Maj+glisser pour en sélectionner plusieurs. **Clic droit sur une note pour la supprimer.**
- **Vélocité** (la force avec laquelle les notes sélectionnées sont jouées, 6–127), **Copier**, **Coller** (à la tête de lecture), **Supprimer**.
- **Saisie de notes :** tapez des notes avec les touches A W S E D F T G Y H U J K (de C4 à C5) ou avec un clavier MIDI ; chaque note se place à la tête de lecture et la fait avancer.
- − / + pour zoomer (ou Ctrl+molette). Les clips de batterie affichent une grille de batterie avec des lignes nommées.

> **Attention :** appuyer sur la touche Suppr quand le piano roll est ouvert supprime tout le clip de la timeline, pas les notes sélectionnées. Utilisez plutôt le bouton **Supprimer** du piano roll ou le clic droit. Annuler fait revenir le clip.

**Partition** (inspecteur → Afficher en partition) : les notes sous forme de partition sur deux portées, arrondies aux doubles croches ou aux triolets. Cliquez sur une mesure pour y déplacer la tête de lecture. Choisissez **A4** ou **US Letter**, puis **Imprimer** ou enregistrez en **PDF**.

**Vue spectrale** (W) : les fréquences du clip sélectionné dans le temps, de 50 Hz à 20 kHz. Tracez un cadre autour d'un son indésirable (une toux, un grincement, un téléphone), puis :

- **Atténuer** baisse ce cadre de la valeur choisie (−6 à −96 dB, −24 par défaut).
- **Réparer** le remplace par un mélange du son juste avant et juste après.

<a id="importing"></a>
### Importer

**Importer** accepte les fichiers WAV, FLAC, MP3, AAC, OGG, M4A, AIFF et MIDI (.mid), plusieurs à la fois. Chaque fichier va sur une nouvelle piste à 0:00. Pour choisir la position ou la piste, faites plutôt glisser les fichiers sur la timeline.

Les fichiers MIDI sont lus dans votre navigateur. Chaque partie devient une piste d'instrument réglée sur l'instrument demandé par le fichier, et le canal 10 devient une piste de batterie. Importer un fichier MIDI ne change pas le tempo de la session.

<a id="exporting"></a>
### Exporter

Tout l'audio est rendu en stéréo 48 kHz à travers le mix complet, effets et leurs queues compris.

| Élément du menu Exporter | Ce que vous obtenez |
|---|---|
| Projet entier · un fichier à rouvrir plus tard | `<name>.musicsuite.zip` : la session et tous ses enregistrements. Ouvrez-le sur la page des sessions avec **Ouvrir un fichier de projet…** |
| Morceau à partir de pistes choisies · WAV, FLAC ou MP3… | Cochez les pistes voulues et choisissez WAV 24 bits, WAV 32 bits flottant, FLAC ou MP3 320 kbps. Les pistes actuellement muettes sont décochées au départ. Vos mutes et solos ne sont pas modifiés. |
| Mixage final · WAV 24 bits / WAV 32 bits flottant / FLAC / MP3 320 kbps | Tout le mix tel que vous l'entendez (pistes muettes exclues). |
| Plage surlignée · WAV 24 bits | Seulement la sélection faite avec l'outil Plage. |
| Chaque piste · WAV 24 bits | Un fichier par piste. |
| Piste sélectionnée · WAV 24 bits / fichier MIDI | Seulement la piste sur laquelle vous avez cliqué (le menu affiche son nom). |
| Tous les instruments · fichier MIDI | Un seul fichier MIDI avec toutes les pistes de notes, le tempo et la signature rythmique. |
| Envoyer le mix à l'analyseur et au mastering → | Analyse le mix sur la [page de l'analyseur](#analyser-and-mastering), prêt à être masterisé. |
| Créer un morceau IA à partir du mix → | Ouvre le Studio de chansons IA en partant du mix. |

<a id="saving-project-files-and-undo"></a>
### Enregistrement, fichiers de projet et annulation

- **Les sessions s'enregistrent toutes seules** moins d'une seconde après chaque modification. Rien n'est à enregistrer à la main.
- **Annuler** (Ctrl+Z) et **Rétablir** (Ctrl+Shift+Z) couvrent jusqu'à 200 étapes, y compris le tempo, les bus, les marqueurs et la boucle. Faire glisser un curseur ou taper un nom compte pour une seule étape. L'historique d'annulation est perdu quand vous rechargez la page ; renommer la session ne peut pas être annulé.
- Le zoom, la position de défilement, l'outil actuel et la sélection ne sont pas enregistrés.
- Les **fichiers de projet** (Exporter → Projet entier) contiennent la session et tout son audio. Utilisez-les pour les sauvegardes et pour déplacer une session vers un autre ordinateur. Les sons de synthé et les plugins favoris conservés dans votre navigateur ne sont pas inclus.

<a id="keyboard-shortcuts"></a>
### Raccourcis clavier

| Touches | Action |
|---|---|
| Espace | Lecture / pause |
| Home / End | Aller au début / à la fin |
| V · C · R | Outil Sélection · Cutter · Plage |
| S ou Ctrl+E | Couper à la tête de lecture |
| Suppr (ou Retour arrière) | Supprimer les clips, ou la plage surlignée |
| Maj+Suppr | Suppression avec décalage (refermer le trou) |
| Ctrl+D | Dupliquer |
| Ctrl+C · X · V | Copier · couper · coller à la tête de lecture |
| Ctrl+A | Sélectionner tous les clips |
| Ctrl+Z · Ctrl+Shift+Z (ou Ctrl+Y) | Annuler · rétablir |
| ← / → | Décaler les clips, ou avancer la tête de lecture pas à pas |
| M · Maj+S | Muet · solo sur la piste sélectionnée |
| L | Boucle (utilise la plage s'il y en a une de surlignée) |
| N | Magnétisme activé/désactivé (maintenez Alt en faisant glisser pour l'ignorer) |
| + / − / F | Zoom avant · arrière · ajuster |
| Ctrl+molette / Maj+molette | Zoomer au pointeur / défiler horizontalement |
| Maj+glisser sur la règle | Dessiner une zone de boucle |
| Maj+T | Ajouter une piste |
| W · P · A | Vue spectrale · piano roll · courbe d'automation |
| K · [ · ] | Ajouter un marqueur · marqueur précédent · suivant |
| Maj+R | Transformer la plage surlignée en section |
| Échap | Fermer les menus et effacer la sélection |
| ? | Afficher la liste des raccourcis |

Les raccourcis sont ignorés pendant que vous tapez dans un champ.

<a id="editor-tools-the-inspector"></a>
## Outils de l'éditeur : l'inspecteur

L'inspecteur est le panneau à droite de l'Éditeur studio. Ce qu'il affiche dépend de ce qui est sélectionné :

| Sélection | L'inspecteur affiche |
|---|---|
| Un clip audio | Clip, Séparer en stems, Réparation, Prises (prises en boucle seulement), Warp, Restauration, Hauteur et durée, Adaptation IA, Plugins, Composition, Modification IA, Générer une partie, Favoris, puis la piste du clip et ses effets |
| Un clip MIDI (de notes) | Clip, Clip MIDI, Instrument, Instrument plug-in, puis la piste et ses effets |
| Rien | Paramètres du projet, Écrire un arrangement, Créer un morceau, Phasemètre, Bus, Sections, Marqueurs et Médias |

<a id="how-processing-works"></a>
### Comment fonctionne le traitement

- **Les résultats remplacent le son du clip.** Un outil comme Réduire le bruit produit un nouveau fichier, et le clip sélectionné passe à la lecture de celui-ci. Le nom du clip reçoit une mention de ce qui a été fait, par exemple « Vocal (denoised, declicked) ». Le fichier original est conservé dans **Médias**, et **Annuler** (Ctrl+Z) le fait revenir.
- **Certains outils ajoutent plutôt des pistes :** Séparer en stems, Convertir en MIDI, Morceau entier en MIDI, Générer une partie, le rendu d'un instrument plug-in, et les modifications IA Extraire, Ajouter une partie et Construire. Ils laissent l'original à sa place.
- **La liste Traitements** en haut de l'inspecteur affiche chaque tâche en cours avec une barre de progression et l'étape où elle en est. Les tâches terminées disparaissent au bout de quelques secondes ; celles qui ont échoué restent, avec la raison en rouge, jusqu'à ce que vous les fermiez avec ×.
- **Plusieurs clips à la fois :** sélectionnez plus d'un clip, et la plupart des outils audio s'appliquent à tous. L'en-tête du clip indique « Clip (N sélectionnés) ». Warp, Adaptation IA, Générer une partie, Modification IA, Morceau entier en MIDI et la réparation spectrale ne s'appliquent qu'au premier clip sélectionné. Les clips de notes sont ignorés par les outils audio.
- **Curseurs :** double-cliquez sur n'importe quel curseur pour le remettre à sa valeur par défaut. Survolez-le pour voir sa valeur.
- Si Music Suite est redémarré pendant qu'une tâche tourne, la tâche échoue avec « La tâche a été interrompue avant la fin. Relancez-la. »

<a id="clip"></a>
### Clip

| Commande | Plage / choix | Par défaut | Ce qu'elle fait |
|---|---|---|---|
| Nom du clip | jusqu'à 80 caractères | nom du fichier | Le nom sur la timeline. |
| Gain | −24 à +24 dB | 0 | Monte ou baisse ce clip avant le fader de la piste. |
| Fondu d'entrée / Fondu de sortie | 0 à 10 s | 0 | Fait un fondu sur le début ou la fin du clip. |
| Forme du fondu | Linéaire, Puissance constante, Courbe en S | Linéaire | Puissance constante garde un niveau égal pendant un fondu enchaîné ; la courbe en S adoucit l'entrée et la sortie. |
| Inverser | activé / désactivé | désactivé | Joue le clip à l'envers. |
| Couper le son du clip | activé / désactivé | désactivé | Rend muet ce clip seulement. |
| Couper (S) | | | Coupe le clip en deux à la tête de lecture. |
| Dupliquer (Ctrl+D) | | | Place une copie juste après. |
| Supprimer le clip (Suppr) | | | Le retire de la timeline (Annuler le fait revenir). |

<a id="midi-clip"></a>
### Clip MIDI

Affiché pour un clip de notes. Il joue l'instrument de la piste.

- **Ouvrir le piano roll (P) :** éditer les notes.
- **Afficher en partition :** les notes sous forme de partition.
- **Transposition −12, −1, +1, +12 :** déplace toutes les notes d'autant de demi-tons.
- **Quantifier les notes à la 1/16 :** cale le début de chaque note sur la double croche la plus proche au tempo du projet.
- **Exporter en fichier .mid :** enregistre seulement les notes de ce clip.

<a id="separate-stems"></a>
### Séparer en stems

Sépare un enregistrement en ses instruments. Chacun arrive sur sa propre piste sous l'original, aligné avec lui ; le clip original est rendu muet, pas supprimé.

| Commande | Choix | Ce qu'elle fait |
|---|---|---|
| Nombre de stems | 2 : voix + instrumental · 4 : voix, batterie, basse, autres · 6 : ajoute guitare et piano | Plus de stems, ce sont des parties plus fines. 6 stems nécessitent la séparation de stems par IA. |
| Séparer la batterie en grosse caisse, caisse claire, toms, charleston, ride et crash | activé / désactivé | Transforme le stem de batterie en six pistes. Nécessite 4 ou 6 stems et la séparation de stems par IA. |
| Séparer les voix en lead et chœurs | activé / désactivé | Transforme le stem de voix en deux pistes. Nécessite la séparation de stems par IA. |

Sur un clip qui est déjà un stem, deux autres boutons peuvent apparaître : **Séparer ce stem de batterie en éléments** et **Séparer ce stem vocal en lead et chœurs**.

Le moteur utilisé est indiqué en haut de la section. Avec le pack **Séparation de stems par IA** de [Modèles et moteurs](#models-and-engines), l'application utilise des modèles d'IA (RoFormer, htdemucs et DrumSep) ; sans lui, un séparateur intégré simple ne donne que 2 ou 4 stems approximatifs.

Pour une séparation plus détaillée, installez **MVSep Mega 53** depuis **Modèles et moteurs**, sélectionnez un clip, puis choisissez **Extraire les stems d'origine → MVSep Mega 53 → Extraire les pistes d'instruments**. La première utilisation télécharge les poids. Le modèle estime chaque catégorie, si bien que certaines pistes peuvent contenir du silence ou de la repisse. Un morceau long peut produire plusieurs gigaoctets d'audio.

Pour un seul son, installez **Meta SAM Audio** et authentifiez le compte du backend de Music Suite auprès de Hugging Face après avoir obtenu l'accès à `facebook/sam-audio-small`. Choisissez **Meta SAM Audio**, saisissez une description comme `muted trumpet`, puis sélectionnez **Extraire le son et le reste**.

Pour générer une interprétation de remplacement, sélectionnez un stem extrait et ouvrez **Modification IA → Reconstruire ce stem par IA** avec un générateur qui prend en charge le changement de style. Vérifiez la description et les réglages de génération proposés, puis lancez l'édition. Le clip extrait sert de référence. Écoutez bien les changements de notes, de phrasé et de placement rythmique.

> **Astuce :** pour transformer un morceau en notes, 4 stems valent mieux que 6. La séparation en six stems devine si chaque son appartient à la guitare, au piano ou aux « autres », et change d'avis d'un instant à l'autre, ce qui éparpille un même instrument sur trois pistes.

<a id="repair"></a>
### Réparation

| Commande | Plage | Par défaut | Ce qu'elle fait |
|---|---|---|---|
| Intensité + **Réduire le bruit** | 10–100 % | 60 % | Retire le souffle, le ronflement et le bruit de fond. Plus haut en retire davantage, mais peut donner un son « aquatique ». |
| Volume + **Normaliser le volume sonore** | −30 à −6 LUFS | −14 LUFS | Monte ou baisse tout le clip jusqu'à ce volume, en gardant les crêtes sous −1 dBTP. Un clip avec beaucoup de crêtes peut finir un peu moins fort que demandé. |

> **Astuce :** pour la réduction de bruit la plus propre, utilisez d'abord l'outil Plage (R) pour surligner un passage de bruit pur à l'intérieur du clip. Ce passage sert d'« empreinte de bruit » (au moins 0,1 s). Sans lui, la partie la plus calme de chaque bande de fréquences est traitée comme du bruit.

La même valeur de volume sert aussi de cible à l'option Volume de l'Adaptation IA.

<a id="takes"></a>
### Prises

Affiché sur les clips créés par l'enregistrement en boucle.

- **Utiliser cette prise :** fait de cette prise celle qu'on entend sur tout son passage et rend les autres muettes à cet endroit.
- **Utiliser cette prise dans la plage surlignée :** pareil, mais seulement à l'intérieur de la sélection faite avec l'outil Plage, pour construire une seule interprétation à partir des meilleurs passages de plusieurs prises.

<a id="warp"></a>
### Warp

Déplace des moments d'un enregistrement dans le temps sans changer sa hauteur. Affiché pour un seul clip qui n'est pas inversé.

1. Placez la tête de lecture sur un moment (un coup de batterie, un mot) et cliquez sur **Ajouter un marqueur à la tête de lecture**.
2. Tapez où il doit tomber, ou déplacez-y la tête de lecture et cliquez sur **Ici**.
3. Cliquez sur **Appliquer le warp**. L'audio entre les marqueurs est étiré ou compressé pour tenir.

Chaque étirement doit rester entre un quart et quatre fois sa durée d'origine.

- **Quantifier les temps à N BPM :** trouve les temps joués et les ramène sur la grille du tempo du projet. Cela fonctionne quand le tempo joué est entre la moitié et le double du tempo du projet.
- **Étirer à la durée de la plage surlignée :** rend le clip exactement aussi long que la sélection faite avec l'outil Plage.

<a id="restore"></a>
### Restauration

Des corrections pour les enregistrements abîmés. **Quantité** (10–100 %, 50 % par défaut) règle l'intensité du travail de DeClick et DeReverb.

| Bouton | Ce qu'il corrige |
|---|---|
| DeClick | Clics, pops et craquements de vinyle. Une Quantité plus haute attrape des clics plus discrets. |
| DeHum | Le ronflement du secteur à 50 ou 60 Hz et ses harmoniques, trouvés automatiquement. |
| DeClip | Les crêtes aplaties par un enregistrement trop fort : reconstruit leur forme, puis baisse le niveau pour laisser de la marge. |
| DeReverb | L'écho de la pièce. Une Quantité plus haute donne un son plus sec, mais parfois plus maigre. |

Pour une toux isolée ou un grincement de chaise, ouvrez plutôt la vue spectrale (W) en bas et tracez un cadre autour (voir [Éditeur studio](#studio-editor)).

<a id="pitch-and-time"></a>
### Hauteur et durée

| Commande | Plage | Par défaut | Ce qu'elle fait |
|---|---|---|---|
| Hauteur + **Appliquer le changement de hauteur** | −12 à +12 demi-tons | 0 | Change la tonalité ; la durée reste la même. |
| Vitesse + **Appliquer l'étirement temporel** | 50–200 % | 100 % | Change la durée ; la hauteur reste la même. |

La qualité dépend du moteur indiqué en haut : Rubber Band (installé avec les extras de l'éditeur) est le meilleur ; la solution intégrée de secours fonctionne mais de façon plus grossière.

<a id="ai-match"></a>
### Adaptation IA

Adapte un clip au projet, ou à un autre clip, en tempo, en tonalité et en volume.

- **Détecter tempo et tonalité :** analyse le clip et affiche « Détecté : 120 BPM · la mineur · −12 LUFS ». L'audio n'est pas modifié.
- **Appliquer au projet :** copie ce tempo et cette tonalité dans le projet et passe la règle en mesures.
- **Adapter à :** le projet, ou n'importe quel autre clip de la session.
- **Tempo / Tonalité / Volume** (Tempo et Tonalité activés par défaut) : ce qu'il faut adapter. Le tempo prend le plus proche entre tempo normal, moitié ou double, et doit rester entre la moitié et le double. La tonalité bouge du plus petit écart, au plus six demi-tons ; une tonalité relative (la mineur vers do majeur) ne demande aucun changement.
- **Adapter le clip :** produit la version adaptée et aligne son premier temps fort sur la mesure la plus proche.

<a id="plugins"></a>
### Plugins

Affiché quand l'hébergement de plugins est installé et que des plugins d'effet VST3 ont été trouvés sur cet ordinateur.

1. Choisissez un plugin. Ses commandes apparaissent sous forme de curseurs (les 64 premières).
2. **Écouter 8 s depuis la tête de lecture** pour l'entendre sans rien changer.
3. **Rendre à travers le plug-in** pour l'appliquer. Le résultat est coupé à la durée du clip, donc une queue de réverb qui dépasse la fin est perdue.

<a id="compose"></a>
### Composition

| Bouton | Ce qu'il fait |
|---|---|
| Convertir en notes MIDI | Transcrit les notes de ce clip sur une nouvelle piste d'instrument. Avec le pack **Transcription de notes par IA**, il suit les accords ; sans lui, il écrit une note à la fois, ce qui convient aux voix, aux basses et aux lignes mélodiques. |
| Morceau entier en MIDI (tous les instruments) | Sépare un morceau complet et écrit une piste de notes par instrument. Voir [Transformer l'audio en notes](#turning-audio-into-notes). |
| Détecter les sections du morceau | Trouve où le morceau change et marque les sections sur la règle (Section A, B…), en donnant la même lettre aux parties répétées. Nécessite au moins 8 s de son. |

<a id="ai-edit"></a>
### Modification IA

Modifie un clip avec l'IA, sur cet ordinateur (ACE-Step 1.5) ou avec un service en ligne que vous avez configuré dans le [Studio de chansons IA](#ai-song-studio). Chaque modification peut être annulée.

| Tâche | Ce qu'elle fait | Nécessite |
|---|---|---|
| Régénérer une section | Refait seulement la partie surlignée et garde exactement le reste. | Une sélection faite avec l'outil Plage d'au moins 1 s à l'intérieur du clip. |
| Prolonger | Ajoute 10, 20, 30 ou 60 s de nouvelle musique après la fin ou avant le début. | |
| Changer de style | Le même morceau dans un nouveau style. **Conserver** (5–100 %, 50 % par défaut) règle à quel point il reste proche de l'original. | |
| Extraire un instrument | Recrée un instrument sur sa propre piste. Pour des stems exacts, utilisez plutôt Séparer. | Le modèle d'édition d'ACE-Step (2,4 Go) |
| Ajouter une partie | Écrit une nouvelle partie d'instrument qui va avec le clip. | Le modèle d'édition d'ACE-Step |
| Construire un morceau complet autour | Un groupe autour, par exemple, d'un stem de voix. L'original est rendu muet. | Le modèle d'édition d'ACE-Step |

- **Style :** une courte description du son voulu (au moins 3 caractères).
- **Paroles (optionnel) :** pour Régénérer, Prolonger et Changer de style. Vide donne un instrumental.
- **Versions (1–4) :** la première version remplace ou ajoute le clip ; les autres vont sur des pistes muettes pour que vous puissiez comparer.
- Les services en ligne vous demandent l'autorisation d'envoyer le clip et affichent le coût avant de lancer.

<a id="generate-a-part"></a>
### Générer une partie

Génère une nouvelle partie instrumentale à partir d'un prompt texte (par exemple « warm upright bass, walking line ») avec MusicGen via ComfyUI sur cet ordinateur, au tempo et dans la tonalité du projet. Durée 4–60 s, 15 s par défaut. Il faut que ComfyUI tourne avec les nœuds Sonic Holodeck ; la section le signale quand ce n'est pas le cas.

<a id="favourites"></a>
### Favoris

Enregistre une chaîne d'étapes de traitement pour pouvoir la relancer d'un seul clic.

- **Relancer :** répète l'une de vos trois dernières étapes.
- **Dernières 1 / 2 / 3, Nom, Enregistrer :** enregistre vos dernières étapes sous un nom. Un favori enregistré exécute chaque étape dans l'ordre, chacune sur le résultat de la précédente.

Les favoris sont conservés dans ce navigateur. La séparation, le warp, l'adaptation, la transcription et les outils d'IA ne peuvent pas être enregistrés comme étapes.

<a id="project"></a>
### Projet

Affiché quand rien n'est sélectionné.

| Réglage | Plage | Par défaut | Ce qu'il fait |
|---|---|---|---|
| Tempo | 40–240 BPM | 120 | La vitesse du projet : la grille, les mesures, le métronome et les parties générées la suivent. |
| Temps / mesure, Unité de temps | 2–12, noire ou croche | 4/4 | La signature rythmique. |
| Tonalité | n'importe quelle tonalité majeure ou mineure | Non définie | Utilisée par l'adaptation, les harmonies et les parties générées. |
| Master | −60 à +6 dB | 0 | Le niveau de sortie global. |
| Limiteur true peak sur le master | activé / désactivé | activé | Empêche le mix de dépasser le plafond, même entre les échantillons, pour que les exports ne saturent jamais. |
| Plafond | −6 à −0,1 dBTP | −1 | Le niveau le plus haut que le limiteur autorise. |
| Fondu enchaîné des clips qui se chevauchent | activé / désactivé | activé | Les clips qui se chevauchent se mélangent en douceur au lieu de se couper. |

**Ajouter une piste d'instrument (MIDI)** ajoute un clip de notes de quatre mesures à la tête de lecture et ouvre le piano roll.

<a id="write-an-arrangement"></a>
### Écrire un arrangement

Écrit sous forme de notes une batterie, une basse, des accords, une mélodie et plus encore, sur cet ordinateur. Affiché quand l'arrangeur est activé.

| Réglage | Choix | Par défaut |
|---|---|---|
| Décrivez-le (optionnel) | jusqu'à 400 caractères ; utilisé seulement quand Ollama tourne | |
| Style | Pop, Rock, Ballad, Folk, Electronic, Lo-fi, Hip-hop, Funk, Jazz, Cinematic, Metal, Waltz | Pop |
| Forme | verse-chorus, pop, short, loop, AABA, build, instrumental | verse-chorus |
| Tonalité, Tempo | n'importe laquelle, ou Auto (d'après le style) | Auto |
| Longueur | 4–200 mesures | 32 |
| Parties | Batterie, Basse, Accords, Mélodie, Nappe, Arpège | toutes activées |
| Densité | 0–1 | 0,5 |
| Graine | un nombre, ou Auto | Auto : un résultat différent à chaque fois |

**Écrire les parties** place une piste d'instrument par partie à la tête de lecture et marque les sections sur la règle. Un projet vide prend aussi le tempo, la tonalité et la signature rythmique de l'arrangement.

<a id="track-effects-and-buses"></a>
### Piste, effets et bus

**Piste** (toute piste sélectionnée) :

| Commande | Plage | Par défaut | Ce qu'elle fait |
|---|---|---|---|
| Graves / Médiums / Aigus | −12 à +12 dB | 0 | Égaliseur trois bandes. |
| Largeur | 0 (mono) à 200 % | 100 % | Rétrécit ou élargit l'image stéréo. |
| Régler les fréquences et la largeur (Q) de l'égaliseur… | Graves 30–600 Hz, Médiums 150 Hz–8 kHz, Q des médiums 0,2–8, Aigus 1,5–16 kHz | 160 Hz, 1,2 kHz, 0,8, 6 kHz | Où agit chaque bande de l'égaliseur. |
| Sortie | Master ou un bus | Master | Où va la piste. |
| Départs | −48 à +6 dB par bus | −12 dB à l'activation | Envoie une copie vers un bus de réverb ou de delay, après le fader. |
| Couleur | 8 couleurs | | La couleur du clip sur la timeline. |

Les **effets** s'appliquent dans cet ordre : égaliseur, gate, voix, distorsion, compresseur, puis delay et réverb en parallèle du son sec. On les entend en direct et ils sont inclus dans les exports.

| Effet | Réglages (par défaut) | À utiliser pour |
|---|---|---|
| Gate | Seuil −45 dB, Attaque 2 ms, Maintien 60 ms, Relâchement 150 ms | Rendre silencieux le bruit entre les phrases. |
| Distorsion | Drive 40 %, Mix 100 % | Ajouter du grain ou de la chaleur. |
| Compresseur | Seuil −18 dB, Ratio 3:1, Attaque 10 ms, Relâchement 200 ms, Gain de compensation 0 dB | Égaliser les moments forts et les moments calmes. |
| Delay | Temps 375 ms, Réinjection 35 %, Mix 25 % | Des échos. |
| Réverb | Taille 1,8 s, Mix 20 % | L'espace d'une pièce ou d'une salle. |

**Voix** transforme une voix en autre chose :

- **Presets :** Robot singer, Deep vocoder, Monotone robot, Chipmunk (+12), Helium (+5), Monster (−7), Octave harmony, Ring-mod robot, Metallic robot, Synth voice, 8-bit voice, Vox distortion (megaphone), Old radio.
- **Type :**
  - Vocodeur (chanteur robot)
  - Transposition (voix d'écureuil ou de monstre)
  - Robot (modulateur en anneau)
  - Voix de synthé (suit votre hauteur)
  - Distorsion vocale
- **Notes** (vocodeur et voix de synthé) : suivre le chant, calé sur les demi-tons, avec une transposition de −24 à +24 ; ou tenir une seule note (C1–C6). Tenir des touches sur un clavier MIDI pendant que la piste joue vous permet de choisir les notes vous-même, accords compris.
- **Dosage :** 0–100 % (100 % par défaut).

Le vocodeur et la voix de synthé fonctionnent le mieux sur une voix seule ; sur un mix complet, ils suivent la note la plus forte, quelle qu'elle soit.

**Bus** (rien de sélectionné) : **+ Réverb**, **+ Delay** et **+ Groupe** ajoutent un effet partagé ou une piste de groupe. Chaque bus a un niveau, un bouton muet et ses propres effets. Envoyez-y des pistes avec leurs départs.

**Plug-in dans le navigateur :** des plugins Web Audio de la communauté, provenant de webaudiomodules.com. C'est la seule partie de l'application qui charge du code depuis Internet ; elle reste donc désactivée jusqu'à ce que vous cliquiez sur **Autoriser les plug-ins Internet dans ce navigateur**.

<a id="sections-markers-and-media"></a>
### Sections, marqueurs et médias

Affiché quand rien n'est sélectionné.

- **Sections :** **Ajouter une section depuis la plage surlignée** (Maj+R). Chaque section peut être sélectionnée, dupliquée avec **Répéter** (une copie est insérée juste après) ou retirée avec **Couper** (elle est supprimée et le trou est refermé).
- **Marqueurs :** appuyez sur K pour en ajouter un à la tête de lecture ; cliquez sur l'un d'eux pour y aller.
- **Médias :** chaque fichier et chaque prise rendue du projet, y compris les originaux remplacés par un traitement. Cliquez sur l'un d'eux pour l'ajouter sur une nouvelle piste à la tête de lecture.
- **Phasemètre :** montre si la gauche et la droite sont en phase. Le vert, c'est bon ; le rouge signifie que des parties s'annulent quand on écoute en mono.

<a id="instruments-and-sounds"></a>
## Instruments et sons

Chaque piste d'instrument (MIDI) joue ses notes à travers un instrument. Choisissez-le dans l'inspecteur avec un clip de notes sélectionné.

<a id="instrument-types"></a>
### Types d'instruments

- **Type :** *Synthé (notes avec hauteur)* ou *Kit de batterie*. Le kit de batterie intégré joue la grosse caisse (note 36 et en dessous), la caisse claire (37, 38, 40), le clap (39), la charleston fermée (42, 44), la charleston ouverte (46), les cymbales (49, et 51 et au-dessus) et les toms pour les notes intermédiaires. La durée des notes est ignorée pour la batterie.
- **Son de :** *Le son de synthé propre à cette piste*, ou l'un des 128 instruments General MIDI (pianos, orgues, guitares, basses, cordes, cuivres, nappes, etc.). Le choix General MIDI est aussi écrit dans les fichiers MIDI exportés.
- **SoundFont (.sf2) :** chargez-en une avec **Charger une SoundFont** pour entendre les instruments General MIDI avec de vrais échantillons. Sans elle, le synthé intégré joue son son le plus proche. Une SoundFont s'applique à toutes les pistes, reste uniquement dans ce navigateur et n'est jamais envoyée. **Retirer** l'oublie.

<a id="the-built-in-synth"></a>
### Le synthé intégré

Commandes rapides dans l'inspecteur :

| Commande | Plage | Par défaut | Ce qu'elle fait |
|---|---|---|---|
| Son | 17 presets d'usine et vos propres sons | Init | Analog bass, Acid bass, Sub bass, Wobble bass, Supersaw lead, Mono lead, Pluck, Warm pad, Sweep pad, Strings, Brass, Organ, FM bell, FM electric piano, Noise riser, Chip square. |
| Brillance | 60 Hz – 18 kHz | 3,2 kHz | Plus brillant ou plus sourd (la fréquence de coupure du filtre). |
| Attaque | 1 ms – 2 s | 10 ms | La vitesse à laquelle une note apparaît. |
| Relâchement | 5 ms – 4 s | 200 ms | Combien de temps une note résonne après que vous l'avez lâchée. |

**Éditer le son…** ouvre l'éditeur de son complet, le même que dans le [Studio de synthèse](#synth-studio) : trois oscillateurs, filtre, bruit et FM, deux enveloppes, deux LFO et jusqu'à huit routages de modulation. **Enregistrer dans mes sons** garde un son pour toutes les pistes et pour le Studio de synthèse ; **Exporter** et **Importer** déplacent des sons entre ordinateurs sous forme de fichiers `.mssound`.

<a id="plugin-instruments-vst3"></a>
### Instruments plug-in (VST3)

Les instruments plug-in comme **Surge XT** (gratuit, installé depuis [Modèles et moteurs](#models-and-engines)) tournent sur cet ordinateur, en dehors du navigateur.

- **Instrument plug-in :** *Aucun* (le synthé intégré joue) ou l'un des instruments trouvés sur cet ordinateur.
- **Sons :** pour Surge XT, une liste de ses sons d'usine avec recherche. Mettez une étoile à un son pour le garder dans **★ Favoris**.
- **Lecture :** joue le clip en boucle à travers le plugin pour que vous l'entendiez. **Stop** l'arrête.
- **En jouer depuis votre clavier MIDI :** démarre le plugin pour que votre clavier le joue en direct (l'enregistrement capture les notes).
- **Ouvrir l'interface complète de <name> :** ouvre la fenêtre propre au plugin sur le bureau (elle peut se trouver derrière le navigateur). **Garder ce son et fermer la fenêtre** enregistre ce que vous y avez façonné.
- **Rendre ce clip avec <name> :** transforme les notes en audio sur une nouvelle piste sous la piste d'instrument et rend muet le clip de notes, pour qu'on ne l'entende pas deux fois.
- **Exporter le son / Importer un son :** enregistrer ou charger un son de plugin sous forme de fichier.

Les notes atteignent un instrument plug-in 15 à 25 ms après que vous les jouez ; un casque Bluetooth ajoute son propre retard.

<a id="turning-audio-into-notes"></a>
## Transformer l'audio en notes

Music Suite peut transcrire en MIDI les notes d'un enregistrement : un clip, ou un morceau entier avec une piste par instrument.

<a id="ways-to-do-it"></a>
### Les façons de le faire

| Où | À utiliser pour |
|---|---|
| Inspecteur → Composition → **Convertir en notes MIDI** | Un seul clip : une voix, une ligne de basse, un piano, un stem. |
| Inspecteur → Composition → **Morceau entier en MIDI (tous les instruments)** | Un mix complet : une piste de notes par instrument. |
| L'[Assistant clavier](#keyboard-wizard), étape Morceau | La même chose, avec les meilleurs réglages choisis pour vous. |

<a id="what-kind-of-recording-it-is"></a>
### Quel type d'enregistrement c'est

L'assistant demande ce qu'est l'enregistrement. C'est plus important que tout autre réglage :

| Choix | Ce qui se passe | Idéal pour |
|---|---|---|
| Un morceau complet, ou je ne sais pas | Séparé en quatre stems (voix, batterie, basse, autres), chacun transcrit avec le modèle qui lui convient, puis nettoyé. Si un stem contient 90 % ou plus du son, l'enregistrement est reconnu comme un seul instrument et transcrit d'un bloc à la place. | Les mix, et tout ce dont vous n'êtes pas sûr |
| Seulement un piano | Transcrit directement par un modèle réservé au piano, sans séparation. | Le piano seul : l'option la plus précise |
| Un seul autre instrument | Transcrit directement, accords compris. | Une guitare, un synthé ou un orgue seul |
| Une seule voix ou ligne mélodique | Transcrit une note à la fois. | Un chanteur, un sifflement, une ligne mélodique, une ligne de basse |

Séparer l'enregistrement d'un seul instrument le met en morceaux : un piano seul séparé en six est revenu avec 6 % de ses notes. Dire à l'application ce qu'est l'enregistrement évite cela.

<a id="which-engines-write-the-notes"></a>
### Quels moteurs transcrivent les notes

| Partie | Moteur | Nécessite |
|---|---|---|
| Piano | Transkun, un modèle réservé au piano | Pack de transcription de notes par IA |
| Accords et autres instruments | basic-pitch | Pack de transcription de notes par IA |
| Voix, basse, lignes simples | basic-pitch (une note à la fois), ou pYIN sans le pack | |
| Batterie | Les coups trouvés sur chaque élément de batterie séparé (grosse caisse, caisse claire, toms, charleston, ride, crash) | La séparation de stems par IA pour les éléments de batterie ; sans elle, seulement grosse caisse, caisse claire et charleston |
| Tout le mix d'un coup (facultatif) | MuScriptor : nomme jusqu'à 35 instruments | Installation manuelle ; usage non commercial uniquement |

**Méthode** (affichée quand MuScriptor est installé) : *La meilleure disponible* (la méthode par stems, qui a obtenu de meilleures mesures), *MuScriptor : un seul modèle écoute tout le mix*, ou *Stems : séparer d'abord, puis un modèle par instrument*.

<a id="how-the-notes-are-cleaned-up"></a>
### Comment les notes sont nettoyées

- **Chaque note est vérifiée par rapport à l'audio.** Une note qu'on n'entend pas dans l'enregistrement à ce moment-là est supprimée. Cela retire la plupart des « notes bizarres sans rapport ».
- Les notes hors de ce qu'une voix ou une basse peut produire sont supprimées.
- Les notes courtes et faibles hors de la tonalité du morceau sont supprimées, mais seulement quand la tonalité est détectée avec certitude.
- Le son qui a débordé d'un instrument dans le stem d'un autre est retiré.
- Les stems silencieux sont ignorés, et un morceau sans batterie n'a pas de partie de batterie.
- Le début des notes est aligné sur la pulsation propre au morceau (doubles croches ou triolets).
- Les notes gardent la durée pendant laquelle elles sont tenues dans l'enregistrement.

<a id="how-accurate-it-is"></a>
### Quelle précision

Mesurée sur une pièce pour piano de 47 notes connues :

| Chemin | Notes justes | Notes inventées | Durée tenue |
|---|---|---|---|
| Seulement un piano | 92 % | aucune | 101 % de l'écrit |
| Un morceau complet, ou je ne sais pas (reconnu comme un seul instrument) | 92 % | aucune | 101 % |
| La même pièce jouée sur un Roland GO:KEYS 3, enregistrée et transcrite | 96 % | aucune | 100 % |

Les parties claires (une voix lead, une ligne de basse, un instrument seul) sortent très proches. Les mix denses sont approximatifs, car la séparation elle-même mélange les instruments : sur un morceau complet, les notes qui ont pu être confirmées dans l'audio étaient d'environ 95 % pour les voix, 91 % pour la guitare, 80 % pour la basse et 71 % pour le stem « autres ». Vérifiez les résultats à l'oreille, et corrigez les fausses notes dans le piano roll.

> **Astuce :** pour les meilleurs résultats, installez à la fois **Séparation de stems par IA** et **Transcription de notes par IA** depuis [Modèles et moteurs](#models-and-engines).

<a id="your-hardware-keyboard"></a>
## Votre clavier matériel

Un clavier matériel connecté en USB (par exemple un Roland GO:KEYS 3) peut jouer votre musique avec ses propres sons, et son son peut être réenregistré directement dans une session. Tout se trouve sous le bouton **Clavier** de l'éditeur.

<a id="connecting-the-keyboard"></a>
### Connecter le clavier

1. Branchez le clavier à l'ordinateur avec un câble USB et allumez-le. Réglez son volume aux trois quarts environ.
2. Ouvrez Music Suite dans **Chrome ou Edge** (les autres navigateurs ne peuvent pas communiquer avec du matériel MIDI).
3. Dans l'éditeur, cliquez sur **Clavier**, puis sur **Connecter**, et autorisez le MIDI quand le navigateur le demande.
4. Choisissez le clavier sous **Clavier**, ainsi que son **Canal**. Un GO:KEYS 3 écoute **uniquement sur le canal 4** ; la plupart des autres claviers réglés sur « recevoir tout » répondent sur n'importe quel canal.
5. **Tester la sortie : jouer trois notes :** vous devriez les entendre sur le clavier.

Un GO:KEYS 3 apparaît comme « Roland Digital Piano » pour le MIDI et « Line (Roland Digital Piano) » pour l'audio.

<a id="play-my-music-on-the-keyboard"></a>
### Jouer ma musique sur le clavier

**Ce que joue le clavier pendant la lecture du morceau :**

- *Rien :* les notes sont jouées sur l'ordinateur.
- *Toutes les parties ensemble :* toutes les pistes de notes.
- *Une partie :* une seule piste.

Les notes choisies sont envoyées au clavier pendant la lecture normale, et leur son sur l'ordinateur est coupé pour qu'on ne les entende pas deux fois. Seules les pistes qui ont des notes sont listées ; convertissez d'abord l'audio en notes (voir [Transformer l'audio en notes](#turning-audio-into-notes)) ou utilisez l'Assistant.

**Notes simultanées :** *Toutes*, ou une limite de 1, 2, 3, 4 ou 6. Certains sons du clavier, surtout les sons à caractère, transforment beaucoup de notes simultanées en bouillie ; une limite garde les notes les plus fortes et laisse tomber les autres.

<a id="choosing-the-keyboards-voice"></a>
### Choisir le son du clavier

**Son du clavier** choisit n'importe quel son du clavier :

1. Choisissez une **banque**.
2. Parcourez ses sons avec **◀ ▶**, ou tapez le numéro du son. Chaque changement est envoyé au clavier et joué : ce que vous voyez est ce que vous entendez.
3. **Écouter** joue un court accord avec le son actuel.

Vous pouvez aussi appuyer sur un bouton de son sur le clavier lui-même ; quand le clavier le signale, l'application le prend en compte.

Banques du GO:KEYS 3 :

| Banque | Ce qu'elle contient |
|---|---|
| Extra voices (71/99) | D'autres sons absents de la liste de sons publiée par Roland ; sur l'édition Minion, c'est là que se trouvent ses voix de personnages. |
| Preset A, B, C (71/96, 71/97, 71/98) | La liste de sons principale : pianos (Preset A, numéro 1, est le piano à queue), orgues, cordes, synthés, etc. |
| Common 1–7 (87/85 à 87/91) | D'autres sons de style General MIDI. |
| Drum kits (86/65) | Des kits de batterie. |

Le clavier joue un seul son à la fois : un morceau à plusieurs parties est donc enregistré une partie après l'autre.

<a id="recording-a-part-through-the-keyboard"></a>
### Enregistrer une partie par le clavier

1. **Entrée audio :** **Trouver les entrées**, puis choisissez la sortie propre au clavier (pour un GO:KEYS 3, « Line (Roland Digital Piano) »). **Tester l'entrée** montre si le son arrive.
2. **Synchronisation :** **Mesurer le retard**. Le clavier répond avec quelques dizaines de millisecondes de retard ; le mesurer une fois permet à chaque prise de tomber exactement en place.
3. **Enregistrer un passage :** choisissez la partie et cliquez sur **Enregistrer … par le clavier**. La partie est envoyée au clavier, et ce qui revient est enregistré sur une nouvelle piste appelée « <part> (keyboard) ». La piste de notes reste telle quelle, pour que vous puissiez l'enregistrer à nouveau.

**Niveau automatique :** avant chaque prise, l'application joue l'accord le plus fort de la partie, tenu aussi longtemps que la partie le tient (jusqu'à environ 1,6 seconde, pour mesurer aussi les sons qui enflent), mesure ce qui revient et règle le volume du clavier par MIDI pour que ce moment se situe à environ un tiers de la pleine échelle. Cela laisse de la marge pour les accords tenus qui se chevauchent et les sons qui continuent d'enfler, si bien qu'une prise entière reste sous la saturation. Cela ajoute quelques secondes d'accords de test avant chaque prise. Un son très faible peut rester sous la cible même à plein volume.

**Vérifications après chaque prise :**

- *Silencieuse :* la prise n'est pas enregistrée, et on vous signale que le clavier a cessé de répondre (voir [Dépannage](#troubleshooting)).
- *Saturée :* la prise est quand même enregistrée et on vous le signale. Dans l'assistant, elle est réenregistrée toute seule, à chaque fois environ 6 dB plus bas, jusqu'à trois essais ; c'est seulement si même un volume MIDI bas sature qu'on vous demande de baisser le bouton de volume du clavier lui-même.

<a id="keyboard-wizard"></a>
## Assistant clavier

Le bouton **Assistant** de l'éditeur fait passer un morceau entièrement par le clavier, étape par étape : soit pour lui ajouter une nouvelle voix, soit pour rejouer ses parties avec d'autres sons. Chaque étape dit ce qu'elle fait pendant qu'elle le fait.

<a id="step-1-song"></a>
### Étape 1 : Morceau

Dites ce qu'est l'enregistrement : *Un morceau complet, ou je ne sais pas*, *Seulement un piano*, *Un seul autre instrument* ou *Une seule voix ou ligne mélodique* (voir [Transformer l'audio en notes](#turning-audio-into-notes) pour ce que fait chaque choix). Puis **Charger un fichier audio…**, ou **Utiliser celui-ci** pour un morceau déjà sur la timeline. L'assistant le sépare si nécessaire et transcrit ses notes ; un morceau de trois minutes prend quelques minutes.

Si la session a déjà des pistes de notes, **Passer** va directement plus loin.

<a id="step-2-keyboard"></a>
### Étape 2 : Clavier

**Vérifier le clavier** trouve le MIDI du clavier, trouve son entrée audio, joue une note de test et mesure le temps que met le son à revenir. Il affiche les trois quand tout fonctionne. Autorisez le MIDI et le microphone quand le navigateur le demande : le son du clavier arrive comme une entrée audio.

<a id="step-3-voices"></a>
### Étape 3 : Sons

Choisissez quoi faire :

**Ajouter une voix au morceau** (par défaut). Le morceau reste exactement tel quel, et une nouvelle partie est écrite pour l'accompagner :

| Ce que fait la nouvelle voix | Comment elle est construite |
|---|---|
| Chanter l'air | La mélodie du morceau, une note à la fois, ramenée dans une tessiture chantable. Prise dans la partie vocale s'il y en a une, sinon dans la ligne la plus haute des autres parties. |
| Chanter une harmonie | Une tierce au-dessus de la mélodie, dans la tonalité du morceau. |
| Tenir les accords | Des notes longues qui suivent les accords du morceau mesure par mesure, trois à la fois, comme un chœur d'accompagnement. |

Cochez-en un ou plusieurs. Chaque style coché devient sa propre partie, enregistrée à son tour, et les prises jouent ensemble : l'air, son harmonie et les accords tenus en dessous. Les accords tenus deviennent trois parties (grave, médium, aigu), car les voix Minion ne sonnent qu'une note à la fois. Cliquez sur **Écrire la partie à chanter**. Elle est construite à partir des notes du morceau lui-même : sa tonalité, son tempo et ses accords viennent donc du morceau. **La réécrire** la remplace, par exemple après avoir choisi un autre style. La nouvelle partie commence sur la banque **Extra voices** du clavier, là où l'édition Minion du GO:KEYS 3 range ses voix de personnages ; parcourez-la pour trouver celle que vous voulez. Cela double, harmonise ou accompagne la mélodie existante du morceau ; cela ne compose pas de nouvelle contre-mélodie, et le résultat ne vaut que ce que valent les notes transcrites à l'étape 1.

**Rejouer les parties du morceau avec d'autres sons.** Les parties propres au morceau sont jouées par le clavier avec les sons que vous choisissez. Cochez les parties à inclure. **Couper ce que le clavier remplace** rend muette chaque partie d'origine une fois sa prise au clavier enregistrée ; si la case n'est pas cochée, l'original continue de jouer en entier sous les prises.

Pour chaque partie :

| Réglage | Choix | Par défaut | Ce qu'il fait |
|---|---|---|---|
| Son | N'importe quelle banque et n'importe quel son, ou le son actuel du clavier | Parties de piano : le piano à queue ; sing-along : Extra voices | Le son avec lequel le clavier joue la partie. |
| Notes simultanées | 1 (mélodie), 2, 3, 4, Toutes | Voix, basse et lignes mélodiques : 1 ; accords du sing-along : 3 ; tout le reste : Toutes | Allège les accords pour les sons qui les brouillent. |
| Octave | Tessiture chantable, 2 au-dessus, 1 au-dessus, Comme écrit, 1 en dessous | Lignes : Tessiture chantable ; autres : Comme écrit | Déplace la partie d'octaves entières. Tessiture chantable la centre autour du sol au-dessus du do central. |
| Durée des notes | Tenue jusqu'à la suivante, Place pour parler, Comme écrit | Lignes : Tenue jusqu'à la suivante ; autres : Comme écrit | *Tenue jusqu'à la suivante* relie les notes (un long silence reste un silence) ; *Place pour parler* donne aux notes courtes au moins un quart de seconde. |
| Une note à la fois | activé / désactivé | Activé pour la banque Extra voices du clavier (les voix Minion) ; désactivé sinon | Mesuré sur le GO:KEYS 3 : ces voix ne sonnent qu'une note à la fois, et une nouvelle note coupe le mot en train d'être prononcé. Avec cette option, aucune note ne commence avant que la précédente ait eu sa durée minimale, et chaque couche est enregistrée comme une prise séparée. |
| Note la plus courte | 0 à 2 secondes | Parties sing-along chantées : 0,6 s ; autres : selon la mise en forme | Chaque note dure au moins ce temps. Une voix qui dit un mot (une voix Minion) est coupée quand sa note se termine : laissez-lui assez de temps pour le mot. |
| Quand une note empiète sur la suivante | Sauter la note suivante (les mots se terminent), Les laisser se chevaucher | Sing-along : Sauter | *Sauter* supprime une note courte qui commencerait pendant qu'un mot est encore prononcé : moins de notes sont chantées, mais chaque mot est entier. *Se chevaucher* garde toutes les notes et les laisse résonner les unes sur les autres. Les accords tenus ne sont jamais sautés. |
| Monter d'une tierce | activé / désactivé | désactivé | Joue une tierce au-dessus de la partie au lieu de la partie elle-même. |
| Ajouter des couches | Tierce au-dessus, Quinte en dessous, Octave au-dessus, Octave en dessous | aucune | Des notes ajoutées à chaque note de la partie, un peu moins fort ; la tierce et la quinte suivent la tonalité du morceau. Avec *Une note à la fois* activé, chaque couche est enregistrée comme sa propre prise sur le même rythme, sur sa propre piste ; sinon, elles sont jouées ensemble dans une seule prise. |

Certaines voix Minion disent un mot court qui se termine tout seul (environ 0,3 à 0,8 seconde, mesuré), quelle que soit la durée pendant laquelle la touche est tenue. Une *Note la plus courte* plus longue n'allonge pas ce mot ; elle lui laisse le temps de finir avant la note suivante.

<a id="step-4-record"></a>
### Étape 4 : Enregistrement

**Enregistrer une partie à la fois** (recommandé). Pour chaque partie :

1. Vérifiez ou changez son son et ses réglages, puis **Enregistrer cette partie**, ou **La passer**.
2. Écoutez avec **L'écouter seule** ou **L'écouter avec le morceau**. Cela change seulement ce que vous entendez ; rien ne change dans la session.
3. **Réenregistrer** après avoir modifié quelque chose (la nouvelle prise remplace l'ancienne), ou **La garder, partie suivante**.

**Tout enregistrer sans s'arrêter** enregistre chaque partie à son tour sans vous attendre.

Avant chaque prise, le niveau du clavier est réglé automatiquement (voir [Votre clavier matériel](#your-hardware-keyboard)). Si une prise revient saturée, l'assistant réenregistre cette partie tout seul, environ 6 dB plus bas à chaque fois, jusqu'à trois essais, et c'est seulement ensuite qu'il vous demande de baisser le bouton de volume du clavier lui-même. Si une prise revient silencieuse, l'assistant s'arrête au lieu d'enregistrer des pistes vides.

<a id="step-5-done"></a>
### Étape 5 : Terminé

Chaque prise gardée se trouve sur sa propre piste nommée d'après sa partie, et les pistes de notes sont rendues muettes. En mode *Ajouter une voix*, rien d'autre n'est modifié ; en mode *Rejouer*, les parties remplacées sont rendues muettes si vous avez coché cette option. **Écouter le résultat** joue tout le morceau depuis le début. Ajustez les faders et exportez comme d'habitude (Exporter → Mixage final, ou Morceau à partir de pistes choisies).

<a id="ai-song-studio"></a>
## Studio de chansons IA (AI Song Studio)

Sous **Paramètres → Téléchargements de modèles locaux**, sélectionnez un moteur d'exécution, vérifiez ses exigences et confirmez le téléchargement. Après l'installation, sélectionnez le moteur dans le formulaire de génération. HeartMuLa et MiniMax Music 3 acceptent des paroles. DiffRhythm utilise des paroles horodatées et propose des rendus de 95 et 285 secondes. Magenta RealTime 2 produit des instrumentaux hors ligne. Stable Audio 3 fonctionne aussi à partir d'un clip de l'éditeur. Sélectionnez le clip et ouvrez **Modification IA** pour changer son style, régénérer une zone surlignée ou continuer au-delà de la fin de la source. Chaque moteur d'exécution a ses propres dépendances. Certains poids sont téléchargés lors de la première génération.

Génère des morceaux avec l'IA : sur cet ordinateur avec ACE-Step 1.5, ou avec un service en ligne que vous activez avec votre propre clé. Les résultats s'ouvrent dans l'Éditeur studio. La page a quatre onglets : **Créer**, **Album**, **Historique** et **Paramètres**.

<a id="generators"></a>
### Générateurs

| Générateur | Où il tourne | Nécessite | Remarques |
|---|---|---|---|
| ACE-Step 1.5 (sur cet ordinateur) | Votre ordinateur | Le moteur local (environ 5,3 Go, installé depuis les Paramètres) | Activé par défaut. Des morceaux complets avec voix, hors ligne. Fait aussi les modifications IA. |
| ACE-Step 1.5 (votre propre serveur Python) | Votre ordinateur | Le serveur propre à ACE-Step, déjà lancé | Désactivé par défaut. Idéal sur NVIDIA. |
| YuE2 (sur cet ordinateur, non commercial) | Votre ordinateur | Un GPU NVIDIA avec environ 24 Go et une installation séparée de YuE2 | Désactivé par défaut. Licence CC BY-NC 4.0 : pas d'usage commercial. |
| MusicGen via ComfyUI | Votre ordinateur | ComfyUI lancé, avec les nœuds Sonic Holodeck | De courtes parties instrumentales, jusqu'à 120 s. |
| ElevenLabs Music | En ligne | Votre clé ElevenLabs | Environ 0,15 $ par minute (prix de 2026-11). Plans de morceau. |
| fal.ai : MiniMax Music, Lyria | En ligne | Votre clé fal.ai | Environ 0,08–0,15 $ par morceau. |
| Google Lyria | En ligne | Votre clé Gemini | Environ 0,04–0,08 $ par morceau. Chaque morceau porte le filigrane SynthID de Google. |

Suno est listé mais pas disponible : il n'a pas d'API publique, et les connecteurs non officiels enfreignent ses conditions d'utilisation. L'arrangeur (qui écrit des notes, pas de l'audio) s'utilise depuis l'inspecteur de l'Éditeur studio.

<a id="create"></a>
### Créer

1. **Installer le moteur local** si la carte le demande (la première fois seulement ; environ 5,3 Go et quelques minutes).
2. **Générateur :** affiché quand plusieurs sont prêts.
3. Soit **Partir d'une idée** : décrivez le morceau en une phrase ou deux et cliquez sur **Écrire le style et les paroles** (environ 30 s). Cela remplit le titre, le style, les paroles, le tempo, la tonalité, la signature rythmique, la langue et la durée. Modifiez ce que vous voulez avant de générer. Avec Ollama installé, les paroles sont plus riches.
4. Soit **Partir d'un morceau :** **Choisir un fichier audio** (ou prenez-en un que vous avez analysé). Son tempo, sa tonalité, sa signature rythmique, sa durée et son feeling sont mesurés et remplis. Choisissez ensuite ce que vous voulez en faire :

| Choix | Ce que cela produit |
|---|---|
| Nouveau morceau dans son style | Un nouveau morceau avec les mêmes tempo, tonalité, durée et feeling. |
| Changer de style | Le même morceau dans un nouveau style. |
| Prolonger | Plus de musique avant le début ou après la fin. |
| Extraire un instrument | Un instrument du morceau, sur sa propre piste. |
| Ajouter une partie | Une nouvelle partie (batterie, basse, guitare…) qui va par-dessus. |
| Construire un morceau complet autour | Un arrangement autour, par exemple, d'une voix ou d'un riff. |

Extraire, Ajouter une partie et Construire nécessitent le modèle d'édition (2,4 Go, depuis les Paramètres). Avec *Nouveau morceau dans son style* et *Changer de style*, la piste de l'original est rendue muette dans la session.

5. Remplissez le formulaire et cliquez sur **Générer** (ou **Générer dans ce projet** quand vous venez de l'éditeur).

**Réglages d'ACE-Step :**

| Réglage | Plage | Par défaut | Ce qu'il fait |
|---|---|---|---|
| Description du style | 3–1500 caractères | | Genre, ambiance, instruments, voix et production, en mots simples. Obligatoire. |
| Instrumental (sans voix) | activé / désactivé | désactivé | Pas de chant. |
| Durée | 10–600 s | Auto | Laissez sur Auto pour laisser le modèle choisir. |
| Paroles | jusqu'à 6000 caractères | vide | Utilisez des balises comme [Verse] et [Chorus] (les boutons + Verse, + Chorus… les insèrent). Vide laisse le modèle les écrire. |
| Langue | Auto et 21 langues | Auto | |
| Tempo / Tonalité / Signature rythmique | 30–300 BPM / n'importe quelle tonalité / 4/4, 3/4, 2/4, 6/8 | Auto | |
| Versions à produire | 1–4 | 1 | Chaque version supplémentaire prend du temps en plus. |
| Graine | −1 ou un nombre | −1 | −1 est aléatoire. Réutilisez une graine pour obtenir à nouveau le même résultat. |

**Avancé** (replié) :

- **Planifier d'abord le morceau :** activé par défaut ; ajoute environ 15 s.
- **Laisser le planificateur réécrire le style.**
- **Température, guidage, top-p et top-k du planificateur :** à quel point le plan est audacieux.
- **Styles à éviter.**
- **Étapes de diffusion :** Auto vaut 8 pour les modèles rapides et 50 pour le modèle de base.
- **Guidage de diffusion, Schedule shift et Solveur.**
- **Modèle musical et modèle planificateur :** Auto utilise le modèle XL haute qualité quand il est installé et activé.
- **Adaptateur LoRA et intensité :** affichés seulement quand des adaptateurs sont installés.

**Réécrire** (sous les paroles) modifie les paroles à la demande, par exemple « add a bridge » ou « translate to Spanish ». Il faut Ollama.

**Rimes et syllabes** (sous les paroles) affiche chaque vers chanté avec son nombre de syllabes et une lettre de rime : les vers de même lettre riment, ce qui montre le schéma (AABB, ABAB…) d'un coup d'œil. Un nombre ambré signale un vers bien plus long ou plus court que le reste de sa section, qui ne tiendra pas sur la même mélodie. Fonctionne sans Ollama et se met à jour pendant la frappe. Les rimes sont exactes en espagnol et, une fois son dictionnaire de prononciation téléchargé (3,6 Mo, la première fois), en anglais ; en russe, ukrainien, allemand et français, elles sont jugées sur l'orthographe : prenez-les comme une indication.

**Variantes** (à côté d'un vers) propose d'autres versions de ce vers qui gardent sa rime et sa longueur. Choisissez avec quoi il doit rimer (son vers partenaire, un autre vers ou sans rime), indiquez éventuellement quoi changer, puis appuyez sur **Proposer**. Chaque proposition est vérifiée par les mêmes règles : une coche signifie qu'elle rime vraiment et a le bon nombre de syllabes. **Utiliser** la met à la place du vers. Il faut Ollama. Les petits modèles locaux riment bien en anglais et en espagnol, moins sûrement en russe et en ukrainien : c'est pourquoi chaque proposition est vérifiée plutôt que crue sur parole.

**Améliorer la description** (sous la description du style) la réécrit pour la rendre plus claire et plus concrète pour le modèle musical : genre, ambiance, tempo, instruments, voix et production, en gardant votre idée. Elle est rédigée en anglais, que les modèles musicaux comprennent le mieux. **Annuler** rétablit votre texte.

La barre du bas indique combien de temps cela prendra (en local) ou combien cela coûtera (en ligne). Pendant la génération, elle affiche chaque étape et un bouton **Annuler**. Les services en ligne ne peuvent plus être annulés une fois la requête envoyée.

**Résultats :** chaque version a un lecteur, avec son tempo, sa tonalité, son volume et sa graine. Les boutons sont :

- **Ouvrir dans l'Éditeur studio**
- **Ajouter à une session**
- **Séparer en stems**
- **Analyser**
- **En faire un nouveau morceau**
- **Garder cette graine pour la version suivante**

Chaque version va sur sa propre piste ; les versions supplémentaires sont rendues muettes pour que vous puissiez les comparer.

**Plan de morceau ElevenLabs :** un plan facultatif section par section, jusqu'à 30 sections et 10 minutes au total. Chaque section a :

- un nom et une durée (3–120 s) ;
- à quel point elle suit ses voisines ;
- ses paroles, une ligne par ligne chantée ;
- ses styles et ce qu'il faut éviter.

**Ébaucher un plan (gratuit)** en crée un pour vous. Les styles de la première section fixent le genre. Avec un plan, Durée et Paroles ne sont pas utilisés.

<a id="album"></a>
### Album

Produit jusqu'à 20 morceaux en arrière-plan, l'un après l'autre. La production continue après un redémarrage.

- **Titre de l'album**, **Générateur**, **Le sujet de l'album** et **Style commun**.
- **Morceaux, une idée par ligne.**
- **Chaque morceau dure environ** (30–300 s, 150 par défaut).
- **Instrumental**, et **Écrire les paroles et le style de chaque morceau** (activé).
- **Produire N morceaux.**

Chaque album devient sa propre session. Quand la mémoire manque ou que le générateur est occupé, un morceau attend et réessaie toutes les minutes pendant deux heures au maximum. **Ouvrir dans l'Éditeur studio** place les morceaux terminés les uns après les autres ; **Arrêter** annule le reste.

> **Astuce :** utilisez ACE-Step ou un service en ligne pour les albums. MusicGen et YuE2 prennent des réglages différents, et un album fait avec eux risque fort d'échouer.

<a id="history"></a>
### Historique

Chaque morceau que vous avez créé, avec les réglages qui l'ont produit. **Utiliser ces réglages** remplit à nouveau le formulaire ; **Ouvrir le projet** l'ouvre dans l'éditeur ; l'icône de corbeille retire l'entrée (l'audio reste dans sa session).

<a id="settings"></a>
### Paramètres

| Carte | Réglages |
|---|---|
| Moteur musical local | **Installer le moteur local**, **Télécharger le modèle haute qualité (4,9 Go)** (de meilleurs morceaux, environ 25 % plus lent), **Télécharger le modèle d'édition (2,4 Go)** (nécessaire pour Extraire, Ajouter une partie et Construire), **Décharger maintenant**, et **Utiliser le modèle haute qualité (XL) pour les nouveaux morceaux** (activé). |
| Auteur de paroles et de style | Utilise Ollama (de ollama.com) avec le modèle de votre choix ; **Télécharger** le récupère (gemma4:12b, environ 8 Go). Sans Ollama, le planificateur propre au moteur musical écrit un brouillon plus simple. |
| Garder votre ordinateur réactif | **Ne pas démarrer en dessous de** 5–80 % de mémoire libre (25 % par défaut). **Décharger le moteur après** 1–240 minutes d'inactivité (10 par défaut). |
| Volume des nouveaux morceaux | **Ajuster le niveau de chaque nouveau morceau à l'import** (activé), à un **Volume sonore cible** de −30 à −6 LUFS (−14 par défaut), avec des crêtes jamais au-dessus de −1 dBTP. Non appliqué aux modifications IA ni à MusicGen. |
| Services en ligne | Collez votre clé d'API puis **Enregistrer la clé** pour activer un service ; **Supprimer la clé** le désactive. Les clés sont conservées dans le Gestionnaire d'identification Windows. Chacun a un lien **Conditions et tarifs**. |
| Générateurs | Activez ou désactivez chaque générateur. |

<a id="synth-studio"></a>
## Studio de synthèse (Synth Studio)

Créez des sons de synthé et jouez-les ; les sons enregistrés ici apparaissent dans « Mes sons » sur les pistes d'instrument de l'Éditeur studio. Le bouton **MIDI** en haut connecte un clavier MIDI, qui joue l'onglet ouvert (la vélocité, la pédale de sustain et le pitch bend fonctionnent).

<a id="music-suite-synth"></a>
### Synthé Music Suite

Le synthé intégré, qui tourne dans votre navigateur.

- **Barre du son :** le nom du son, **Charger un preset…** (sons d'usine et Mes sons), **Enregistrer dans mes sons** (conservé dans ce navigateur, jusqu'à 200), **Oublier**, **Exporter** / **Importer** (fichiers `.mssound`) et **Nouveau son** (retour à Init).
- **Piano :** jouez à la souris, au toucher, ou avec les touches de l'ordinateur A W S E D F T G Y H U J K O L P ; **Z / X** changent d'octave. Jusqu'à 12 notes à la fois.

| Section | Commandes (par défaut) |
|---|---|
| Oscillateurs 1, 2, 3 | **Activé** (seul le 1 est activé au départ). **Onde :** Saw, Square, Pulse 25%, Pulse 12%, Triangle, Sine, Organ, Hollow, Bright. **Octave** ±3, **Demi-tons** ±12, **Fin** ±100 cents, **Niveau** (80 %). **Unisson** 1–7 voix avec **Désaccord** et **Étalement stéréo**, pour un son plus épais. |
| Filtre | **Type :** passe-bas, passe-haut, passe-bande, coupe-bande. **Pente :** 12 ou 24 dB/oct. **Coupure** (3,2 kHz) : la brillance. **Résonance** (10 %) : une bosse à la fréquence de coupure. **Saturation** : du grain. **Suivi de clavier** (30 %) : les notes aiguës sont plus brillantes. **Quantité env. 2** : jusqu'où l'enveloppe 2 balaie le filtre. |
| Bruit, FM et voix | **Bruit**. **FM (osc 2 → 1)** : des timbres de cloche et de piano électrique. **Voix :** Poly (accords) ou Mono (une note, avec glissés) avec la durée de **Portamento**. **Vélocité** (60 %) : à quel point jouer plus fort rend le son plus fort. **Volume**. |
| Enveloppe 1 (Volume) | **Attaque** (10 ms), **Déclin** (300 ms), **Maintien** (80 %), **Relâchement** (200 ms) : comment une note commence, se stabilise et se termine. |
| Enveloppe 2 (Modulation) | Les mêmes quatre, pour les balayages de filtre et les routages de modulation. |
| LFO 1 et 2 | **Forme :** sinus, triangle, dent de scie, carré, paliers aléatoires. **Sync :** libre (avec une **Vitesse** de 0,05–20 Hz) ou calé sur le tempo (de 1 mesure à 1/16, triolets). Un mouvement lent et régulier pour le vibrato, le wobble et les balayages. |
| Modulation | Jusqu'à 8 routages d'une **source** (LFO 1, LFO 2, Enveloppe 2, Vélocité, Note) vers une **destination** (hauteur, hauteur ou niveau d'un oscillateur, bruit, quantité de FM, coupure, résonance, volume, panoramique) avec une **Quantité** de ±100 %. À pleine quantité, la hauteur bouge d'une octave et la coupure de quatre octaves. |

<a id="surge-xt-and-plugins"></a>
### Surge XT et plugins

Joue les plugins d'instrument VST3 installés sur cet ordinateur, comme Surge XT (installez-le gratuitement depuis [Modèles et moteurs](#models-and-engines)).

- **Instrument :** quel plugin. Désactivez-le pour en choisir un autre.
- **Ouvrir l'interface complète de <name> :** la fenêtre propre au plugin, sur le bureau. La fermer conserve le son.
- **Lecture** joue en boucle une courte phrase de démonstration ; **Stop** l'arrête.
- **Sons :** une liste avec recherche (Surge XT seulement), avec des favoris ★. Les flèches du clavier passent d'un son à l'autre.
- **Éteindre <name>.**
- **Exporter le son / Importer un son.**
- **Le piano :** la première touche pressée active l'instrument.

Pour utiliser un son dans un morceau, mettez-lui une étoile ici, puis choisissez-le sur une piste d'instrument dans l'éditeur.

<a id="song-geometry-mapper"></a>
## Géométrie du morceau

Transforme un morceau en un nuage 3D animé : chaque tranche de son devient un point placé selon son caractère (brillance, étalement, énergie, etc.), relié à ses voisins dans le temps et dans le son. Utilisez-le pour voir la structure d'un morceau, ou pour faire des visuels et des vidéos.

Ouvrez-le avec le bouton **Géométrie du morceau** de l'analyseur (le morceau sélectionné se charge et s'analyse automatiquement), ou chargez un fichier directement dans le mapper. L'interface du mapper lui-même est encore en anglais : les noms ci-dessous sont donc ceux qui y sont affichés.

- **Barre du haut :** **About** (comment ça marche), **Song Info**, **Waveform** (cliquez pour vous déplacer), **Math HUD** (les mesures derrière l'image), et en direct le RMS, le centroïde et l'étalement. **H** masque les superpositions.
- **Se déplacer :** faites glisser pour tourner autour, la molette pour zoomer, les flèches pour décaler la vue, **F** pour tout cadrer, **Space** pour lire, **[** et **]** pour changer la vitesse.
- **Aide au survol :** laissez le pointeur une demi-seconde sur n'importe quelle commande pour voir ce qu'elle fait.

| Onglet | Ce qu'il contient |
|---|---|
| Session (S) | **Analysis Model :** Classic (dans le navigateur), Voice ou Deep (sur l'ordinateur, nécessite la séparation de stems par IA ; revient à Classic sinon). **Voice Focus :** voix, mix complet, batterie, basse ou autres. **Load Audio File** (ou un JSON d'analyse enregistré). Lecteur, **Playback Speed** (0,05–2×), **Preserve pitch**. **AI Music Style :** une description écrite du style du morceau, mesurée et éventuellement rédigée par Ollama. Interrupteurs d'affichage : connexions, étiquettes, effets cinéma, nœuds seuls. |
| Mapping (M) | Comment les points sont placés : **Mapping Mode** (Manifold, Time Spine, Hybrid Flow, Helix Orbit), **3D Frequency Spread**, décalages, comment les points sont reliés (**Edge Mode**, **Neighbor Links**), **Camera Preset** (Static, Drift, Orbit, Pulse, Dive) et **Display Decimation** (moins de points pour plus de vitesse). |
| Visual (V) | Taille, opacité et profondeur des points ; style des connexions (Wave, Straight, Ribbon), intensité et traînées ; couches de temps et de structure (brouillard, couches fantômes, tube temporel, arcs de sections) ; mouvement et pulsation. |
| Post FX (FX) | **Visual Preset** (Cinematic, Observatory, Neon, Aurora…), lueur, bloom, brouillard, reflet d'objectif, **Color Metric** (ce que montrent les couleurs) et palette. Enregistrez vos propres presets. |

**Export** (onglet Post FX) :

- **Export Analysis JSON :** recharger l'analyse plus tard sans analyser à nouveau.
- **Export 3D OBJ :** le nuage visible sous forme de modèle 3D.
- **Capture Still :** un PNG ; choisissez **4K Still** pour l'impression.
- **Start Video / Stop Video :** un enregistrement WebM.
- **Copy MP4 Command :** une commande ffmpeg qui convertit cet enregistrement en MP4.

<a id="models-and-engines"></a>
## Modèles et moteurs

Des moteurs et modèles d'IA facultatifs. Tout ici tourne sur cet ordinateur, et installer quelque chose ne change jamais ce qui est déjà installé.

**Cet ordinateur** affiche votre carte graphique et indique si les modèles d'IA l'utiliseront. Une carte NVIDIA rend la séparation et la transcription beaucoup plus rapides. S'il est indiqué de mettre à jour le pilote NVIDIA, faites-le pour utiliser le GPU.

| Pack | Ce qu'il ajoute | Taille |
|---|---|---|
| Séparation de stems par IA | De meilleures séparations en 2 et 4 stems, 6 stems (ajoute guitare et piano), les éléments de la batterie (grosse caisse, caisse claire, toms, charleston, ride, crash), voix lead et chœurs, détection des temps par IA. Choisissez les modèles à télécharger ; ceux qui ne sont pas téléchargés sont récupérés la première fois qu'on en a besoin. **Supprimer les modèles téléchargés** libère l'espace. | Environ 3 Go avec la prise en charge NVIDIA (1 Go sans), plus les modèles |
| Transcription de notes par IA | Morceau entier en MIDI, le piano par un modèle réservé au piano (Transkun), les accords dans Convertir en notes MIDI (basic-pitch). Fonctionne mieux avec la séparation de stems installée aussi. | Environ 120 Mo |
| MuScriptor (facultatif, manuel) | Un transcripteur du mix complet qui nomme jusqu'à 35 instruments. Usage non commercial uniquement. La page liste les étapes d'installation (un pip install, l'acceptation de ses conditions sur Hugging Face, la connexion). | Dépend de la taille choisie |
| Moteur musical (ACE-Step 1.5) | Des morceaux complets avec voix, hors ligne, dans le Studio de chansons IA. Nécessite un compilateur C++ et CMake, que l'installeur récupère. | Environ 5,3 Go |
| Modèle d'édition | Extraire un instrument, ajouter une partie, construire un morceau autour d'une partie. | 2,4 Go |
| Modèle haute qualité (XL) | De meilleurs morceaux, un peu plus lent. | 4,9 Go |
| Auteur de paroles | Paroles et descriptions de style avec Ollama. Nécessite qu'Ollama tourne. | Environ 8 Go |
| Surge XT | Un synthétiseur hybride gratuit avec des milliers de sons d'usine, pour les pistes d'instrument et le Studio de synthèse. Sous Windows, il reste dans le dossier de Music Suite, où vos autres logiciels de musique ne le voient pas, sauf si vous cochez **Le rendre aussi disponible dans mes autres logiciels de musique (DAW)**. | Environ 300 Mo à télécharger |

Quand un pack est terminé, rechargez les pages de l'éditeur ouvertes pour l'utiliser. **Journal d'installation** montre ce que l'installeur a fait si quelque chose échoue.

Depuis un terminal : `.venv\Scripts\python -m audioqi.addons install stems` et `python -m audioqi.editor.instruments install surge-xt`. Ajoutez `--for-daws` pour mettre Surge XT dans votre dossier VST3.

<a id="settings-reference"></a>
## Référence des réglages

La plupart des réglages se trouvent dans l'application elle-même et sont expliqués là où ils apparaissent dans ce manuel :

| Réglages | Où | Voir |
|---|---|---|
| Mastering | Page de l'analyseur → Mastering IA | [Analyse et mastering](#analyser-and-mastering) |
| Tempo, tonalité, niveau du master, limiteur, fondus enchaînés du projet | Éditeur → inspecteur sans rien de sélectionné | [Projet](#project) |
| Égaliseur, largeur, départs et effets de piste | Éditeur → inspecteur avec une piste sélectionnée | [Piste, effets et bus](#track-effects-and-buses) |
| Instruments | Éditeur → inspecteur avec un clip de notes sélectionné | [Instruments et sons](#instruments-and-sounds) |
| Canal MIDI, son du clavier, notes simultanées, entrée audio | Éditeur → Clavier | [Votre clavier matériel](#your-hardware-keyboard) |
| Moteurs d'IA, mémoire, volume des nouveaux morceaux, clés en ligne | Studio de chansons IA → Paramètres | [Studio de chansons IA](#settings) |
| Modèles facultatifs | Modèles et moteurs | [Modèles et moteurs](#models-and-engines) |

<a id="advanced-environment-variables"></a>
### Avancé : variables d'environnement

Pour ce que l'application ne propose pas comme réglage, définissez une variable d'environnement Windows avant de lancer start.bat (Propriétés système → Variables d'environnement, puis redémarrez Music Suite). Il n'y a pas de fichier de réglages pour celles-ci.

| Variable | Par défaut | Ce qu'elle change |
|---|---|---|
| `AUDIOQI_DATA_DIR` | `data` dans le dossier de Music Suite | Où sont conservés toutes les sessions, tous les morceaux et tous les modèles. |
| `MUSIC_SUITE_MAX_UPLOAD_BYTES` | 524288000 (500 Mo) | Le plus gros fichier que vous pouvez importer ou générer. |
| `MUSIC_SUITE_MAX_AUDIO_DURATION_SECONDS` | 900 (15 minutes) | Le morceau le plus long que vous pouvez charger. |
| `AUDIOQI_SAMPLE_RATE` | 48000 | La fréquence d'échantillonnage à laquelle les morceaux sont analysés. |
| `AUDIOQI_JOB_WORKERS` | 2 | Combien d'analyses tournent en même temps. |
| `AUDIOQI_ANALYSIS_STALL_TIMEOUT_SECONDS` | 600 | Combien de temps une analyse peut rester sans progresser avant d'être arrêtée. |
| `AUDIOQI_REPORT_MAX_SECONDS` | 300 | Limite de temps pour produire le rapport ; 0 signifie sans limite. |
| `AUDIOQI_FFMPEG_TIMEOUT_SECONDS` | 900 | Limite de temps pour les conversions et pour la génération en ligne, avec ComfyUI et avec Lyria. |
| `AUDIOQI_SKIP_PDF_EXPORT` | désactivé | Mettez 1 pour ne pas produire le rapport PDF. |
| `MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS` | 300 | Combien de temps start.bat attend que Music Suite démarre. |
| `MUSIC_SUITE_ELEVENLABS_API_KEY`, `MUSIC_SUITE_FAL_KEY`, `MUSIC_SUITE_GEMINI_API_KEY` | | Les clés des services en ligne, au lieu de les enregistrer dans l'application. |
| `MUSIC_SUITE_COMFYUI_URL` | http://127.0.0.1:8188 | Où se trouve ComfyUI, pour MusicGen. |
| `MUSIC_SUITE_ACESTEP_DIR`, `MUSIC_SUITE_ACESTEP_URL` | | Le dossier du moteur local ; l'adresse de votre propre serveur ACE-Step. |
| `MUSIC_SUITE_YUE2_PYTHON`, `MUSIC_SUITE_YUE2_DEVICE` | , cuda | L'installation de YuE2. |
| `MUSIC_SUITE_MUSCRIPTOR_SIZE` | | small, medium ou large. |

<a id="troubleshooting"></a>
## Dépannage

<a id="the-keyboard"></a>
### Le clavier

| Problème | Que faire |
|---|---|
| « Aucun clavier n'a été trouvé en MIDI » | Vérifiez le câble USB et que le clavier est allumé. Utilisez Chrome ou Edge, et autorisez le MIDI quand on vous le demande. |
| On n'entend pas les notes de test | Vérifiez le **Canal** (4 pour un GO:KEYS 3) et le volume du clavier. |
| Une prise revient silencieuse, ou le clavier cesse de répondre au milieu d'une session | La connexion de Windows au MIDI du clavier est bloquée. Débranchez le câble USB du clavier, attendez cinq secondes et rebranchez-le (ou éteignez et rallumez le clavier), puis cliquez à nouveau sur **Vérifier le clavier**. S'il ne répond toujours pas, redémarrez l'ordinateur. |
| Une prise sonne saturée | L'assistant la réenregistre tout seul plus bas (jusqu'à trois essais). S'il le signale encore, le bouton de volume du clavier lui-même est très haut : baissez-le à la moitié environ et réenregistrez. |
| La prise est en retard ou en avance | Cliquez à nouveau sur **Mesurer le retard**, sans rien d'autre en lecture. |
| Le clavier joue le mauvais son | Choisissez le son dans l'application plutôt que sur le clavier, et cliquez sur **Écouter** avant d'enregistrer. |

<a id="notes"></a>
### Notes

| Problème | Que faire |
|---|---|
| Des notes bizarres, sans rapport | Dites à l'assistant ce qu'est l'enregistrement (*Seulement un piano*, *Une seule voix*…). Installez la séparation de stems par IA et la transcription de notes par IA. Vérifiez le résultat à l'oreille et corrigez-le dans le piano roll. |
| Les notes sont trop courtes | Elles gardent la durée tenue dans l'enregistrement. Pour les voix chantées, choisissez **Durée des notes : Tenue jusqu'à la suivante** dans l'assistant. |
| Un piano revient éparpillé sur plusieurs pistes | Choisissez *Seulement un piano* ; ou utilisez 4 stems plutôt que 6. |
| Une partie de batterie inventée | Corrigé : un morceau sans batterie n'en reçoit plus. Supprimez la piste si une ancienne session en a une. |

<a id="the-editor"></a>
### L'éditeur

| Problème | Que faire |
|---|---|
| « Échec de l'enregistrement — nouvel essai à la prochaine modification » | Le service d'arrière-plan de Music Suite ne répond pas. Faites une petite modification pour réessayer ; si cela échoue encore, redémarrez avec stop.bat et start.bat. Votre dernier état enregistré est en sécurité. |
| Un outil dit qu'un moteur manque | Installez-le depuis [Modèles et moteurs](#models-and-engines), puis rechargez la page de l'éditeur. |
| La touche Suppr a retiré un clip entier | Annulez (Ctrl+Z). Dans le piano roll, supprimez les notes avec le clic droit ou le bouton **Supprimer**. |
| L'enregistrement est refusé | Autorisez le microphone pour la page dans la barre d'adresse du navigateur. |
| Un export ne contient pas un plugin du navigateur | Certains plugins de la communauté ne peuvent pas tourner pendant l'export ; la notification les nomme. |

<a id="analysis-and-mastering"></a>
### Analyse et mastering

| Problème | Que faire |
|---|---|
| L'analyse est bloquée au même pourcentage | Les longs spectrogrammes peuvent prendre du temps. Après dix minutes sans progression, elle s'arrête d'elle-même ; si une analyse semble toujours bloquée, utilisez **Réinitialisation forcée**. |
| Pas de rapport PDF | Le PDF nécessite WeasyPrint ; le rapport HTML a le même contenu. |
| Choisir un preset n'a pas changé le volume | Les champs « LUFS cible » et True Peak l'emportent. Videz-les, ou utilisez « Appliquer les réglages suggérés » ou un profil de normalisation. |
| « Moteur sélectionné : internal » alors que vous en avez choisi un autre | Ce moteur n'est pas installé ; le mastering a utilisé la chaîne intégrée à la place. |
| Une erreur affiche du texte brut comme `{"detail": …}` | Le message à l'intérieur de « detail » est la raison. |

<a id="generating-songs"></a>
### Générer des morceaux

| Problème | Que faire |
|---|---|
| « Pas encore installé » | Paramètres → **Installer le moteur local**. |
| « Seulement N % de la mémoire est libre… » | Fermez d'autres applications ou onglets du navigateur, ou baissez **Ne pas démarrer en dessous de** dans les Paramètres. |
| « Nécessite le modèle d'édition » | Paramètres → **Télécharger le modèle d'édition**. |
| ElevenLabs refuse la clé ou n'a plus de crédit | Vérifiez la clé et votre compte ElevenLabs. |
| « Le moteur d'IA s'est arrêté au démarrage » | Voir `data\generation\engine.log`. |

<a id="starting-music-suite"></a>
### Démarrer Music Suite

| Problème | Que faire |
|---|---|
| « did not open port N within S seconds » | L'ordinateur met du temps à le démarrer : lancez `.\start.ps1 -StartupTimeoutSeconds 600`. |
| « Impossible de joindre l'API de Music Suite » | Le service d'arrière-plan de Music Suite s'est arrêté : lancez stop.bat, puis start.bat. |
| Autre chose | Regardez dans le dossier `logs` : `api.error.log` et `web.error.log` disent généralement pourquoi. |

<a id="glossary"></a>
## Glossaire

| Terme | Signification |
|---|---|
| **Bus (bus)** | Une piste partagée vers laquelle plusieurs pistes envoient leur signal, pour une réverb ou un delay communs, ou pour les grouper. |
| **Clip (clip)** | Un morceau d'audio ou de notes sur la timeline. |
| **Crest factor (facteur de crête)** | L'écart entre les crêtes d'un morceau et son niveau moyen. Plus il est grand, plus le son a d'impact et respire. |
| **dBFS / dBTP** | Le niveau par rapport à la pleine échelle ; le true peak (dBTP) inclut les crêtes qui se produisent entre les échantillons. |
| **LRA** | Plage de volume : à quel point le volume varie au cours d'un morceau. |
| **LUFS** | Le volume tel que l'oreille le perçoit. Les services de streaming diffusent les morceaux à environ −14 LUFS. |
| **MIDI** | Des notes sous forme d'instructions (quelle touche, quand, avec quelle force) plutôt que du son. |
| **Mono compatibility (compatibilité mono)** | Si un morceau sonne toujours bien quand la gauche et la droite sont mélangées (téléphones, sonos de club). |
| **Normalise (normaliser)** | Monter ou baisser l'ensemble jusqu'à un niveau cible. |
| **Run (analyse)** | Un morceau importé dans l'analyseur, et tout ce qui en est tiré. |
| **Session / project (session / projet)** | Un travail dans l'Éditeur studio. |
| **Stem (stem)** | Un instrument isolé d'un mix : voix, batterie, basse, autres… |
| **Take (prise)** | Une tentative enregistrée. |
| **Velocity (vélocité)** | La force avec laquelle une note est jouée. |
| **Voice (son du clavier)** | Un son d'un clavier matériel : un piano, un chœur, une voix Minion. |

