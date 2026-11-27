import type { Dictionary } from "../index";

/** The analyser (app/page.tsx). */
export const analyser: Dictionary["analyser"] = {
  na: "N/D",
  yes: "oui",
  no: "non",
  idle: "Inactif",
  status: {
    idle: "inactif",
    uploaded: "envoyé",
    queued: "en file d'attente",
    running: "en cours",
    completed: "terminé",
    failed: "échec",
    cancelled: "annulé"
  },
  severity: {
    critical: "critique",
    high: "élevée",
    medium: "moyenne",
    low: "faible",
    info: "info",
    warning: "avertissement",
    error: "erreur"
  },
  chartTitles: {
    waveform: "Forme d'onde + enveloppe",
    loudness: "Volume sonore dans le temps",
    spectrum: "Spectre moyen",
    stereo: "Corrélation stéréo + M/S",
    correlation_meter: "Corrélateur",
    ms_view: "Vue Mid/Side",
    vectorscope: "Vectorscope / goniomètre",
    spectrogram_stft_linear: "Spectrogramme STFT (linéaire)",
    spectrogram_stft_log: "Spectrogramme STFT (log)",
    spectrogram_mel: "Spectrogramme Mel",
    spectrogram_cqt: "Spectrogramme CQT"
  },
  chartHelp: {
    waveform:
      "Montre l'amplitude dans le temps avec les enveloppes crête/RMS. Utile pour repérer les transitoires, une limitation trop dense et la forme de l'enveloppe.",
    loudness:
      "LUFS momentané et court terme dans le temps. Cherchez la régularité, ainsi que les creux et pics par rapport à votre niveau de livraison cible.",
    spectrum:
      "Équilibre fréquentiel moyen. Utile pour vérifier l'inclinaison tonale et repérer trop de sub, de la dureté ou un manque d'air.",
    stereo: "Corrélation et rapport Mid/Side ensemble. Une corrélation négative signale des problèmes de compatibilité mono.",
    correlation_meter:
      "Corrélation de -1 à +1. Les valeurs proches de +1 sont compatibles mono ; celles sous 0 peuvent s'effondrer en mono.",
    ms_view: "Tendances du rapport Mid/Side et de l'équilibre G-D. Aide à détecter un déséquilibre de largeur ou des passages trop chargés en side.",
    vectorscope:
      "Nuage de l'image stéréo gauche contre droite. Une tendance verticale est plutôt mono ; un nuage large indique une image stéréo plus étendue.",
    spectrogram_stft_linear:
      "Énergie temps-fréquence avec un axe des fréquences linéaire. Bien pour une inspection technique détaillée de tout le spectre.",
    spectrogram_stft_log: "STFT sur une échelle de fréquences logarithmique. Plus lisible musicalement, surtout dans le bas du spectre.",
    spectrogram_mel: "Spectrogramme pondéré selon la perception, calé sur la façon dont l'oreille regroupe les bandes de fréquences.",
    spectrogram_cqt: "Spectrogramme à Q constant avec un espacement musical sur les octaves, utile pour la structure des hauteurs et des harmoniques."
  },
  chartHelpMissing: "Description de lecture du graphique indisponible.",
  groups: {
    all: { label: "Toutes les vues", description: "Surface d'analyse complète pour une revue technique." },
    mix: { label: "Revue du mix", description: "Forme d'onde, volume sonore, équilibre tonal et marqueurs de problèmes." },
    stereo: { label: "Focus stéréo", description: "Largeur, compatibilité mono et équilibre spatial." },
    spectral: { label: "Spectral", description: "Inspection temps-fréquence détaillée avec les vues STFT, mel et CQT." }
  },
  guide: {
    title: "Guide : ce que tout signifie",
    intro: "Ce glossaire explique chaque mesure et chaque graphique de cette vue pour interpréter rapidement les résultats.",
    element: "Élément",
    whatItTells: "Ce qu'il vous indique",
    graph: "Graphique",
    howToRead: "Comment le lire",
    rows: {
      compressionLoss: {
        element: "Estimation de perte par compression",
        meaning:
          "À quelle distance sous le haut du spectre audible (20 kHz, ou Nyquist pour les faibles fréquences d'échantillonnage) le contenu mesuré s'arrête. 0 Hz signifie que rien d'audible ne manque ; une grande valeur sur un fichier sans perte suggère qu'il a été transcodé depuis une source avec perte."
      },
      peakToNoise: {
        element: "Détail de plage | Crête/bruit",
        meaning:
          "Écart entre le niveau crête et le bruit de fond mesuré. Des valeurs plus grandes indiquent en général une dynamique plus propre. N/D quand la piste n'a pas de silences où mesurer le bruit de fond."
      },
      peakToLufs: {
        element: "Détail de plage | Crête/LUFS",
        meaning: "Écart entre la crête vraie et le volume sonore intégré. Utile pour situer la marge et le contraste des transitoires."
      },
      compressionAssessment: {
        element: "Évaluation de la compression",
        meaning:
          "Résumé heuristique tiré des métadonnées du codec/conteneur et du comportement spectral. Informatif, mais ce n'est pas un détecteur de codec médico-légal."
      },
      metadataTags: {
        element: "Tags de métadonnées",
        meaning:
          "Tags intégrés comme artiste/titre/album. « Aucun tag intégré détecté » signifie que les tags sont absents ou illisibles dans ce fichier."
      },
      rawMetadata: {
        element: "Afficher le JSON brut des métadonnées",
        meaning: "Métadonnées non filtrées issues de ffprobe et mutagen, pour une inspection technique."
      },
      integratedLufs: {
        element: "LUFS intégré",
        meaning: "Volume sonore perçu global de toute la piste, mesuré avec un modèle de type BS.1770."
      },
      truePeak: {
        element: "Crête vraie dBFS",
        meaning: "Estimation de crête suréchantillonnée, incluant les crêtes inter-échantillons qui peuvent écrêter à la lecture ou à l'encodage."
      },
      crestFactor: {
        element: "Facteur de crête dB",
        meaning: "Contraste crête/RMS. Un facteur de crête plus élevé signifie souvent plus de punch et moins de limitation constante."
      },
      noiseFloor: {
        element: "Bruit de fond dBFS",
        meaning:
          "Niveau du bruit entendu là où la musique s'arrête (fondus, silences, intros calmes). Plus c'est négatif, plus c'est propre. Les pistes denses sans de tels passages affichent N/D, car la musique masque le bruit de fond."
      },
      markersAround: {
        element: "Marqueurs autour de la position actuelle",
        meaning: "Avertissements actifs près du curseur de lecture. « Aucune ligne » signifie aucun avertissement actif à ce point de la timeline."
      },
      stageTicker: {
        element: "Contrôle de session | Étape en cours",
        meaning:
          "Détail en direct de l'étape d'analyse en cours (décodage, balayage, spectrogrammes, génération du rapport). Utile quand le pourcentage semble figé."
      },
      hardReset: {
        element: "Contrôle de session | Réinitialisation forcée",
        meaning: "Efface l'historique des analyses et réinitialise les tâches en file ou en cours pour sortir d'une analyse bloquée."
      },
      masteringBackend: {
        element: "Mastering IA | Backend",
        meaning:
          "Chemin d'exécution du mastering. « auto » choisit le meilleur backend disponible à l'exécution ; les backends indisponibles se replient sans risque."
      },
      masteringReference: {
        element: "Mastering IA | Morceau de référence",
        meaning:
          "ID d'analyse optionnel utilisé comme référence de tonalité/volume sonore (surtout pour le mastering par référence de type matchering)."
      },
      refinePasses: {
        element: "Mastering IA | Passes d'affinage",
        meaning:
          "Nombre maximal de passes correctives guidées par les marqueurs. Plus de passes peuvent régler les problèmes tenaces, mais leur nombre est limité pour éviter les boucles."
      },
      adaptation: {
        element: "Mastering IA | Adaptation à la source",
        meaning:
          "Avant le rendu, AudioQI peut ajuster le de-essing, l'équilibre graves/aigus, la compression, l'attaque du limiteur et la marge de crête selon les problèmes détectés dans la source. Les cibles de volume sonore manuelles restent en place, sauf si une sécurité de crête supplémentaire est nécessaire."
      },
      selfCheckAssessment: {
        element: "Auto-vérification après mastering | Évaluation",
        meaning:
          "Étiquette du résultat global : nette amélioration, amélioration partielle, inchangé ou régression (la protection par retour arrière s'applique)."
      },
      selfCheckScore: {
        element: "Auto-vérification après mastering | Score de problèmes",
        meaning: "Nombre pondéré de classes de problèmes actives avant et après le mastering. Un score plus bas après indique une amélioration."
      },
      selfCheckLists: {
        element: "Auto-vérification après mastering | Restants/Résolus/Aggravés",
        meaning:
          "Classes de problèmes encore présentes, supprimées ou accrues après le mastering. Les problèmes graves restants demandent en général des corrections au mix ou aux stems."
      },
      selfCheckMatch: {
        element: "Auto-vérification après mastering | Concordance avec la recommandation IA",
        meaning: "Compare le mode, le preset et les cibles appliqués aux recommandations de l'analyseur. La concordance ne garantit pas la résolution des problèmes."
      },
      refinementDiagnostics: {
        element: "Diagnostic d'affinage",
        meaning: "Montre les passes acceptées, les retours arrière, le score final de problèmes et si le repli sur les stems a été utilisé."
      },
      proModules: {
        element: "Modules pro",
        meaning: "Disponibilité à l'exécution des intégrations optionnelles (ffmpeg, pedalboard, matchering, pyebur128)."
      },
      naValues: {
        element: "Valeurs N/D",
        meaning:
          "Affiché quand le signal ou les métadonnées ne suffisent pas pour une mesure (p. ex. pas de bruit de fond stable ou métadonnées de codec manquantes)."
      }
    }
  },
  norm: {
    off: { label: "Désactivé (preset/manuel)", help: "Utiliser les valeurs par défaut du preset ou les valeurs LUFS/TP manuelles." },
    youtube: { label: "YouTube", help: "Cible de normalisation YouTube courante." },
    spotify: { label: "Spotify", help: "Alignement typique sur la normalisation Spotify." },
    apple_music: { label: "Apple Music", help: "Volume sonore prudent, façon Apple Music." },
    instagram: { label: "Instagram", help: "Cible équilibrée pour réseaux sociaux et mobile." },
    tiktok: { label: "TikTok", help: "Cible pour plateformes de formats courts." },
    broadcast_ebu: { label: "Diffusion EBU", help: "Livraison pour la diffusion selon EBU R128." },
    podcast_voice: { label: "Voix de podcast", help: "Normalisation de podcast axée sur la parole." }
  },
  bassMono: {
    presetDefault: "Valeur du preset",
    off: "Désactivé"
  },
  readiness: {
    aligned: "Aligné",
    hot: "Trop fort",
    quiet: "Faible",
    safe: "Sûr",
    tight: "Juste",
    risk: "Risque",
    clean: "Propre",
    review: "À revoir",
    attention: "Attention",
    open: "Ouvert",
    controlled: "Maîtrisé",
    dense: "Dense"
  },
  header: {
    title: "Music Suite par Geekatplay Studio",
    stack:
      "Pile backend : FFmpeg/ffprobe, SoundFile (libsndfile), Mutagen, NumPy, SciPy, Librosa, pyloudnorm, Plotly et accélération CUDA optionnelle des spectrogrammes avec torchaudio + nnAudio.",
    configuration: "Configuration",
    refreshRuns: "Actualiser les analyses",
    mapperTitle: "Ouvrir le morceau sélectionné dans Géométrie du morceau",
    needSong: "Sélectionnez ou envoyez d'abord un morceau",
    songFromThisTitle:
      "Créer un nouveau morceau IA à partir de la piste sélectionnée : son tempo, sa tonalité et son style remplissent le formulaire, et vous pouvez le restyler, le prolonger ou lui ajouter des parties",
    newSongTitle: "Écrire et générer un nouveau morceau avec l'IA sur cet ordinateur",
    songFromThis: "En faire un morceau",
    editorAddTitle: "Ajouter le morceau sélectionné à une session de l'Éditeur studio (nouvelle ou existante), éventuellement séparé en stems",
    editorOpenTitle: "Ouvrir l'Éditeur studio multipiste",
    synthTitle: "Créer et jouer des sons de synthé, et parcourir la bibliothèque de Surge XT",
    modelsTitle: "Installer des moteurs et modèles d'IA optionnels : plus de stems, le moteur musical, le parolier",
    helpTitle: "Le manuel d'utilisation : chaque espace de travail et chaque réglage expliqués",
    clearHistory: "Effacer l'historique",
    hardReset: "Réinitialisation forcée",
    hardResetTitle: "Forcer la réinitialisation des workers et effacer toutes les analyses (y compris celles en cours)."
  },
  config: {
    title: "Configuration et mises à jour",
    product: "Produit",
    createdBy: "Créé par Geekatplay Studio",
    installedVersion: "Version installée",
    revision: "Révision {rev}",
    notAvailable: "non disponible",
    officialSource: "Source officielle",
    stableBranch: "Branche stable : main",
    updateAvailable: "Mise à jour disponible",
    upToDate: "Music Suite est à jour",
    readyToCheck: "Prêt à rechercher des mises à jour",
    dirty: "Modifications locales détectées. L'installation est bloquée tant qu'elles ne sont pas validées ou supprimées.",
    officialOnly:
      "Vérifie uniquement le dépôt officiel de Geekatplay Studio. Les mises à jour se font en avance rapide uniquement et n'écrasent jamais les modifications locales.",
    checking: "Vérification...",
    check: "Rechercher des mises à jour",
    installing: "Installation...",
    install: "Installer la mise à jour"
  },
  session: {
    title: "Contrôle de session",
    dropHint: "Glissez-déposez de l'audio ici ou parcourez",
    browse: "Parcourir",
    upload: "Envoyer",
    analyze: "Analyser",
    visualTitle: "Ouvrir les visuels en temps réel du morceau envoyé",
    visual: "Visual AI",
    useGpu: "Utiliser le calcul GPU optionnel des spectrogrammes",
    staleHeartbeat:
      "Le signal de vie de l'étape est anormalement ancien. Les spectrogrammes longs peuvent prendre du temps, mais la protection anti-boucle du backend interrompra quand même automatiquement une analyse vraiment bloquée.",
    stage: "Étape : {stage}",
    stageUpdated: "Étape : {stage} | Mise à jour il y a {n} s",
    exports: "Exports",
    saveReady: "Enregistrer les fichiers prêts ({n})"
  },
  convert: {
    title: "Conversion de format",
    intro: "Convertir le morceau sélectionné dans d'autres formats de livraison, avec suivi de progression.",
    convertSelected: "Convertir la sélection",
    files: "Fichiers convertis",
    none: "Aucun fichier converti pour l'instant."
  },
  mastering: {
    title: "Mastering IA",
    helpLabel: "les réglages de mastering",
    modesIntro: "V1 = chaîne transparente, V2 = variantes de l'optimiseur, V3 = correction tenant compte des stems.",
    preflightIntro:
      "AudioQI applique maintenant une passe d'ajustement préalable adaptée à la source avant le rendu des variantes ou le sauvetage par stems. Utilisez Backend, Passes d'affinage et Morceau de référence pour un contrôle avancé du mastering.",
    suggested: "Suggéré par l'analyse",
    noAdvice: "Aucun conseil",
    mode: "Mode",
    preset: "Preset",
    targetsLine: "LUFS cible {lufs} | Crête vraie {tp} | Variantes {variants} | Backend {backend} | Affinage {refine}",
    issueScore: " | Score de problèmes {n}",
    scorePolicy:
      "Règle de score : les sources denses, avec perte ou sensibles aux crêtes restent en V1 ; les cas correctifs plus propres passent en V2 ; V3 est réservé aux interventions plus fortes sur un matériau récupérable.",
    apply: "Appliquer les réglages suggérés",
    analyzeFirst: "Analysez d'abord une piste pour obtenir le mode, le preset et les cibles de mastering IA recommandés.",
    awaiting: "En attente de la recommandation de l'analyseur",
    settings: "Réglages de mastering",
    normProfile: "Profil de normalisation",
    profileTargets: "Cibles du profil",
    profileTargetsValue: "{lufs} LUFS | {tp} dBFS TP",
    presetTargets: "Cibles du preset/manuelles utilisées",
    backend: "Backend",
    reference: "Morceau de référence (matchering)",
    referenceAria: "Morceau de référence pour matchering",
    none: "Aucun",
    runShort: "Analyse {id}…",
    targetLufs: "LUFS cible",
    truePeak: "Crête vraie dBFS",
    inputGain: "Gain d'entrée (dB)",
    gainStaging: "Structure de gain",
    unity: "Unité (niveau source intact)",
    gainBefore: "{gain} dB avant la chaîne",
    reset: "Réinitialiser",
    bassMono: "Basses en mono",
    stereoWidth: "Largeur stéréo",
    widthPlaceholder: "valeur du preset (1.0)",
    variants: "Variantes V2",
    refinePasses: "Passes d'affinage",
    backendNotes:
      "Notes sur le backend : `internal` est le choix par défaut le plus sûr, `auto` sert à la sélection avancée du backend, et `matchering` nécessite un Morceau de référence valide. Le gain d'entrée (-12..+12 dB) ajuste la source avant le profilage, l'adaptation et chaque passe du backend : il change donc la façon dont la chaîne entend le mix. Basses en mono replie l'énergie side déphasée sous la fréquence de coupure (le mid n'est pas touché) et Largeur stéréo met à l'échelle le canal side ; en les laissant sur la valeur du preset, la passe préalable peut les resserrer quand des marqueurs de compatibilité mono se déclenchent. Les passes d'affinage sont protégées contre les boucles. Le profil de normalisation fixe les cibles des plateformes ; les valeurs LUFS/TP manuelles remplacent celles du profil. L'adaptation à la source peut réduire la dureté, l'énergie sub, la densité ou le risque de crête vraie avant le rendu du master principal.",
    run: "Lancer le mastering",
    bestOutput: "Meilleur résultat : {id}",
    backendSelected: "Backend choisi : {backend}",
    outputHash: "SHA256 du résultat : {hash}...",
    refinement: "Affinage : {accepted} / {max} acceptées",
    finalScore: " | Score final de problèmes {n}",
    rollbacks: " | Retours arrière {n}",
    stemFallback: " | Repli sur les stems appliqué",
    nonRegression: " | Garde-fou anti-régression ({reason})",
    applied: "appliqué",
    proModules: "Modules pro :",
    adaptationTitle: "Adaptation à la source",
    sourceScore: "Score de problèmes de la source : {n}",
    adjustments: " | Ajustements {n}",
    noChanges: "Aucun changement de paramètre préalable n'était nécessaire pour cette source.",
    selfCheckTitle: "Auto-vérification après mastering",
    assessment: "Évaluation :",
    issueScoreLabel: "Score de problèmes :",
    appliedSettings: "Réglages appliqués : {name} | Cible {target} | TP {tp} | Norm. {norm} | Gain d'entrée {gain}",
    stereoStage: "Étage stéréo : basses en mono {bass} | largeur {width}",
    off: "désactivé",
    aiMatch: "Concordance avec la recommandation IA : mode {mode} | preset {preset} | cible {target} | TP {tp}",
    compliance: "Conformité : {result}",
    pass: "conforme",
    reviewRequired: "à vérifier",
    lufsDelta: " | Écart LUFS {n}",
    tpDelta: " | Écart TP {n} dB",
    crestDelta: " | Écart de crête {n} dB",
    complianceIssues: "Problèmes de conformité : {list}",
    rescue: "Sauvetage après vérification : {state}",
    rescueAttempted: "tenté seulement",
    round: " | tour {n}",
    resolved: "Résolus : {list}",
    remaining: "Restants : {list}",
    worsened: "Aggravés : {list}",
    outputs: "Résultats masterisés",
    noOutputs: "Aucun résultat de mastering pour l'instant."
  },
  history: {
    title: "Historique des analyses"
  },
  columns: {
    file: "Fichier",
    status: "Statut",
    stage: "Étape",
    progress: "Progression",
    updated: "Mis à jour",
    type: "Type",
    severity: "Gravité",
    window: "Fenêtre",
    note: "Note",
    format: "Format",
    details: "Détails",
    size: "Taille",
    download: "Télécharger",
    output: "Résultat",
    score: "Score",
    truePeak: "Crête vraie",
    verify: "Vérifier"
  },
  playback: {
    title: "Lecture + timeline",
    playhead: "Tête de lecture",
    rate: "Lecture {rate}x",
    loopOn: "Boucle de sélection active",
    loopOff: "Boucle de sélection désactivée",
    eqOn: "Écoute avec EQ activée",
    eqOff: "EQ contourné",
    segment: "Segment sélectionné (plage de zoom)",
    fullTrack: "Piste entière",
    segmentLine: "Début {start} s | Fin {end} s | Durée {length} s",
    leftMarker: "Marqueur gauche",
    rightMarker: "Marqueur droit",
    markers: "Marqueurs (cliquez pour aller + zoomer)",
    noMarkers: "Aucun marqueur disponible pour l'instant."
  },
  tiles: {
    activeRun: "Analyse active",
    noRun: "Aucune analyse sélectionnée",
    runId: "ID d'analyse {id}",
    copyRunId: "Copier l'ID complet de l'analyse",
    uploadToCreate: "Envoyez un fichier pour créer une analyse.",
    analysisState: "État de l'analyse",
    complete: "{pct} % terminé",
    reviewAssets: "Éléments de revue",
    chartsLoaded: "{loaded}/{total} graphiques chargés",
    markersLine: "{markers} marqueurs détectés | {attention} points d'attention",
    selectionWindow: "Fenêtre de sélection {length} s",
    strategy: "Stratégie de mastering",
    backendProfile: "Backend {backend} | Profil {profile}",
    masteredReady: { one: "{n} résultat masterisé prêt", other: "{n} résultats masterisés prêts" },
    noMastered: "Aucun résultat masterisé pour l'instant"
  },
  overview: {
    title: "Vue d'ensemble",
    pause: "Pause",
    play: "Lecture",
    selectionStart: "Début de sélection",
    loopSelection: "Boucler la sélection",
    speed: "Vitesse",
    setStart: "Début @ {time} s",
    setEnd: "Fin @ {time} s",
    resetRange: "Réinitialiser la plage",
    readiness: "Prêt pour la livraison",
    loudness: "Volume sonore",
    loudnessLine: "{lufs} LUFS pour une cible de {target}",
    truePeak: "Crête vraie",
    peakLine: "{tp} dBFS de plafond actuel",
    markerLoad: "Charge de marqueurs",
    markerLine: { one: "{n} marqueur très important", other: "{n} marqueurs très importants" },
    dynamics: "Dynamique",
    dynamicsLine: "Crête {crest} dB | LRA {lra} LU",
    flatSections: " (sections plates)",
    manualEq: "EQ manuel",
    live: "Direct",
    bypass: "Contourner",
    eqExportNote: "L'export EQ rend un WAV de toute la piste dans le navigateur, sans modifier votre chaîne de traitement backend.",
    guidanceTitle: "Conseils de revue",
    guidance1: "Utilisez la bande de revue pour parcourir rapidement le fichier avant d'ouvrir les graphiques d'analyse complets.",
    guidance2:
      "Gardez le groupe de graphiques sur Revue du mix pour un premier diagnostic, puis passez à Spectral pour chercher la cause.",
    guidance3:
      "Si la livraison n'est pas alignée, appliquez le profil de mastering suggéré avant de lancer une nouvelle passe de mastering.",
    guidance4:
      "Utilisez l'EQ optionnel pour écouter manuellement et exportez la piste entière traitée en WAV si vous voulez garder cette courbe."
  },
  file: {
    title: "Infos sur le fichier",
    titleHelp:
      "Principaux détails d'enregistrement/encodage, contenu fréquentiel estimé, conséquences de la compression et contexte de la plage dynamique.",
    formatHelp: "Le format du conteneur et le codec indiquent comment l'audio a été stocké et encodé.",
    formatCodec: "Format / codec",
    compression: "Compression :",
    freqHelp: "La fréquence d'échantillonnage fixe la limite de Nyquist ; la référence pratique de l'audition va d'environ 20 Hz à 20 kHz.",
    freqRange: "Plage de fréquences",
    estimatedContent: "Contenu estimé :",
    dynHelp: "La plage dynamique combine facteur de crête, plage de volume sonore et écart crête/bruit.",
    dynSnapshot: "Aperçu de la plage dynamique",
    crest: "Crête {n} dB",
    lra: "LRA {n} LU (approx. avec gate)",
    signalHelp: "Le débit et la résolution influencent la qualité possible et la marge.",
    signal: "Propriétés du signal",
    channels: "{rate} Hz, {ch} canaux",
    kbps: "{n} kbps",
    bitrateNa: "Débit N/D",
    bitDepth: "{n} bits",
    bitDepthFloat: "{n} bits flottant",
    bitDepthNa: "Résolution N/D",
    lossHelp: "La perte estimée dans les aigus est déduite du contenu mesuré dans la bande haute par rapport à la limite de Nyquist.",
    lossEstimate: "Estimation de perte par compression",
    lossOfBand: "{pct} % de la bande {band}",
    audible: "audible",
    rangeHelp: "Le rapport crête/volume sonore et l'écart crête/bruit aident à évaluer le punch et la marge dynamique utilisable.",
    rangeDetail: "Détail de plage",
    peakToNoise: "Crête/bruit : {value}",
    peakToLufs: "Crête/LUFS : {value}",
    compressionAssessment: "Évaluation de la compression",
    noAssessment: "Aucune évaluation disponible.",
    whyNa: "Pourquoi certaines valeurs sont N/D",
    metadataTags: "Tags de métadonnées",
    hiddenTags: { one: "{n} tag volumineux ou système masqué", other: "{n} tags volumineux ou système masqués" },
    noTags: "Aucun tag intégré détecté.",
    rawJson: "Afficher le JSON brut des métadonnées"
  },
  hints: {
    lossUnavailable:
      "Estimation de perte par compression indisponible : les métadonnées du codec ou l'estimation spectrale manquent, ou cette analyse est antérieure à l'analyseur actuel (réanalysez pour actualiser).",
    noiseStale:
      "Crête/bruit et bruit de fond sont masqués, car cette analyse est antérieure à l'estimateur de bruit de fond actuel ; réanalysez pour les mesurer.",
    noiseDigital:
      "Crête/bruit est indisponible, car les silences sont du silence numérique : il n'y a pas de bruit de fond à mesurer.",
    noiseMasked:
      "Crête/bruit est indisponible, car la piste n'a pas de passages calmes (fondus, intros, pauses) où lire un bruit de fond ; la musique le masque.",
    peakLufs: "Crête/LUFS est indisponible quand le volume sonore intégré n'est pas défini (contenu très court ou silencieux).",
    noTags: "Aucun tag de métadonnées intégré détecté dans ce fichier.",
    hiddenOnly: {
      one: "Aucun tag descriptif intégré trouvé. {n} tag volumineux ou système masqué ; ouvrez le JSON brut des métadonnées pour l'examiner.",
      other: "Aucun tag descriptif intégré trouvé. {n} tags volumineux ou système masqués ; ouvrez le JSON brut des métadonnées pour les examiner."
    }
  },
  kpi: {
    integratedHelp: "LUFS intégré : volume sonore perçu global sur toute la piste.",
    integrated: "LUFS intégré",
    truePeakHelp: "Crête vraie dBFS : estimation de crête suréchantillonnée incluant les crêtes inter-échantillons.",
    truePeak: "Crête vraie dBFS",
    crestHelp: "Facteur de crête : contraste des transitoires/crêtes par rapport au niveau RMS.",
    crest: "Facteur de crête dB",
    noiseHelp:
      "Bruit de fond lu dans les fondus, silences et intros calmes. Les pistes denses sans de tels passages n'ont pas de bruit de fond mesurable.",
    noise: "Bruit de fond dBFS",
    reanalyze: "Réanalysez pour mesurer",
    digitalSilence: "Les silences sont numériques",
    masked: "Pas de passage calme ; la musique le masque"
  },
  recs: {
    title: "Recommandations de remastering",
    none: "Aucune recommandation de remastering pour l'instant."
  },
  markers: {
    title: "Marqueurs près de la tête de lecture / sélection",
    hint: "Cliquez sur une ligne de marqueur pour y aller et définir la sélection. Le tableau est dédoublonné et trié par proximité avec la tête de lecture."
  },
  chartStudio: {
    title: "Studio de graphiques",
    viewFocus: "Vue",
    showing: { one: "{n} panneau affiché.", other: "{n} panneaux affichés." },
    loadedOf: "{loaded} graphiques chargés sur {total} attendus.",
    quickJump: "Accès rapide",
    timelineTip: "Astuce : clic droit et glisser sur la zone du graphique pour déplacer la fenêtre de temps sélectionnée."
  },
  saveDialog: {
    title: "Résultats prêts à enregistrer",
    intro: "Choisissez où enregistrer chaque fichier converti/masterisé.",
    later: "Plus tard",
    conversion: "Conversion",
    mastering: "Mastering",
    saving: "Enregistrement...",
    saveAs: "Enregistrer sous...",
    quickDownload: "Téléchargement rapide",
    dismiss: "Fermer"
  },
  footer: {
    rights: "© {year} Geekatplay Studio. Tous droits réservés.",
    version: "Music Suite • Créé par Geekatplay Studio • Version 1.0.0"
  },
  msg: {
    pickFile: "Choisissez un fichier audio pour commencer.",
    saved: "{name} enregistré.",
    saveFailed: "Échec de l'enregistrement de {name} : {reason}",
    saveTimedOut: "La boîte d'enregistrement a expiré. Téléchargement de {name} lancé dans le navigateur.",
    fetchRunsFailed: "Impossible de récupérer les analyses.",
    chartsPartial: "{loaded}/{total} graphiques chargés. Nouvel essai pour les manquants : {missing}",
    noStageUpdate: " (aucune mise à jour d'étape depuis {n} s)",
    chartsLoading: "Analyse terminée. Chargement des graphiques ({loaded}/{total})... Manquants : {missing}",
    masteringProgress: "Mastering : {status}... {pct} %",
    conversionProgress: "Conversion : {status}... {pct} %",
    masteringFailed: "Le mastering a échoué.",
    conversionFailed: "La conversion a échoué.",
    analysisComplete: "Analyse terminée.",
    analysisFailed: "L'analyse a échoué.",
    runProgress: "{status}... {pct} % | {ticker}",
    fetchRunFailed: "Impossible de récupérer les détails de l'analyse.",
    outputsReady: {
      one: "Nouveau fichier de résultat prêt. Choisissez où l'enregistrer.",
      other: "Nouveaux fichiers de résultat prêts. Choisissez où enregistrer les {n} fichiers."
    },
    uploading: "Envoi...",
    uploaded: "{name} envoyé. Prêt à analyser.",
    uploadFailed: "L'envoi a échoué.",
    analysisQueued: "Analyse en file d'attente.",
    analysisStartFailed: "Impossible de lancer l'analyse.",
    pickFormat: "Sélectionnez au moins un format cible pour la conversion.",
    queueingConversion: "Mise en file de la conversion...",
    conversionQueued: "Conversion en file d'attente : {formats}",
    conversionStartFailed: "Impossible de lancer la conversion.",
    queueingMastering: "Mise en file du mastering...",
    masteringQueued: "Mastering en file d'attente ({mode}, {preset}, {backend}, norm. : {norm}, gain d'entrée : {gain} dB).",
    masteringStartFailed: "Impossible de lancer le mastering.",
    confirmHardReset:
      "Réinitialiser de force les services et effacer toutes les analyses (y compris les tâches actives/en file) ? Les workers en file seront annulés.",
    confirmClear: "Effacer l'historique de toutes les analyses non actives ?",
    hardResetting: "Réinitialisation forcée des services et effacement de l'historique...",
    clearing: "Effacement de l'historique des analyses...",
    cleared: { one: "{n} analyse effacée.", other: "{n} analyses effacées." },
    keptActive: { one: " ({n} analyse active conservée)", other: " ({n} analyses actives conservées)" },
    jobsReset: " Tâches réinitialisées : {cancelled} annulées, {running} en cours.",
    hardResetFailed: "Impossible de réinitialiser les services.",
    clearFailed: "Impossible d'effacer l'historique des analyses.",
    appliedAdvice: "Réglages de mastering suggérés appliqués ({mode} / {preset} / {backend}).",
    playbackFailed: "La lecture n'a pas pu démarrer.",
    selectRunForEq: "Sélectionnez une analyse avant d'exporter l'audio égalisé.",
    sourceFetchFailed: "Impossible de récupérer l'audio source : {status}",
    noOfflineRendering: "Le rendu hors ligne Web Audio n'est pas disponible dans ce navigateur.",
    eqExported: "Export EQ terminé. WAV traité enregistré.",
    eqExportFailed: "L'export EQ a échoué.",
    updateAvailable: "Une mise à jour de Music Suite est disponible.",
    updateCheckFailed: "La recherche de mises à jour a échoué.",
    updateInstallFailed: "L'installation de la mise à jour a échoué.",
    audioLoadFailed: "L'audio de cette analyse n'a pas pu être chargé pour la lecture."
  },
  popout: {
    visual: "Visual AI",
    visualTitle: "Visual AI",
    charts: "les graphiques",
    chartsTitle: "Graphiques"
  },
};
