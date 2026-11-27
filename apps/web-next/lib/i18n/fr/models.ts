import type { Dictionary } from "../index";

/** Models & engines (/models). */
export const models: Dictionary["models"] = {
  intro: "Moteurs et modèles d'IA optionnels. Tout ici fonctionne sur cet ordinateur ; une installation ne modifie jamais ce qui est déjà installé.",
  working: "En cours…",
  loadFailed: "Impossible de charger Modèles et moteurs.",
  checking: "Analyse de cet ordinateur…",
  installFailed: "L'installation n'a pas pu démarrer.",
  installProgress: "Progression de l'installation",
  readyReload: "Prêt. Rechargez les pages de l'éditeur ouvertes pour l'utiliser.",
  computer: {
    heading: "Cet ordinateur",
    gpu: "Carte graphique",
    gpuNone: "Aucune trouvée : les modèles d'IA tournent sur le processeur (plus lent)",
    torch: "PyTorch (fait tourner les modèles d'IA)",
    usingGpu: " · utilise le GPU",
    willUseCuda: "Non installé · utilisera le GPU ({build})",
    willUseMps: "Non installé · utilisera le GPU Apple",
    willUseCpu: "Non installé · utilisera le processeur"
  },
  notes: {
    install: "Installer la transcription des notes par IA"
  },
  muscriptor: {
    title: "MuScriptor : un seul modèle pour tout le mix (optionnel)",
    bodyBefore: "Écoute tout le morceau d'un coup et identifie jusqu'à 35 instruments. Son modèle est gratuit, mais",
    nonCommercial: "pour un usage non commercial uniquement",
    bodyAfter:
      "(CC BY-NC 4.0), et ses conditions interdisent de transcrire de la musique sur laquelle vous n'avez pas de droits. Une fois prêt, « Morceau entier en MIDI » peut l'utiliser ; choisissez la méthode Stems pour les œuvres que vous vendez.",
    ready: "Prêt",
    readySize: "Prêt · {size}",
    needsSignIn: "Connexion requise",
    downloadedList: "Téléchargés : {list}.",
    signedIn: "Connecté ; le modèle se télécharge à sa première utilisation.",
    sizeHint: "Définissez MUSIC_SUITE_MUSCRIPTOR_SIZE à small, medium ou large pour choisir une taille.",
    stepCode: "Installez son code :",
    stepTerms: "Acceptez les conditions d'une taille sur Hugging Face (chaque taille séparément), par exemple",
    stepSignIn: "Connectez-vous sur cet ordinateur :",
    stepSignInAfter: "Se connecter sur le site web ne suffit pas.",
    stepRestart: "Redémarrez Music Suite."
  },
  stems: {
    legend: "Modèles",
    onDemand: "Les modèles non téléchargés ici se téléchargent la première fois qu'une séparation en a besoin.",
    downloadedSoFar: " Téléchargé jusqu'ici : {size}.",
    install: "Installer la séparation en stems par IA",
    downloadFailed: "Le modèle n'a pas pu être téléchargé.",
    deleteSize: "Supprimer {size}",
    deleteFailed: "Les modèles n'ont pas pu être supprimés.",
    deleteModels: "Supprimer les modèles téléchargés",
    log: "Journal d'installation"
  },
  music: {
    heading: "Musique par IA (Studio de chansons IA)",
    label: "Musique par IA",
    progress: "Progression de l'installation du moteur musical",
    engine: "Moteur musical (ACE-Step 1.5)",
    engineNote: "Crée des chansons complètes avec voix, hors ligne. Environ {gb} Go ; nécessite CMake et un compilateur C++.",
    editing: "Modèle d'édition",
    editingNote: "Extraire un instrument, ajouter une partie, construire un morceau autour d'une partie. {gb} Go.",
    xl: "Modèle haute qualité (XL)",
    xlNote: "Meilleures chansons, un peu plus lent. {gb} Go.",
    writer: "Parolier ({model})",
    writerReady: "Écrit les paroles et les descriptions de style avec Ollama.",
    writerMissing: "Nécessite Ollama (ollama.com) en marche sur cet ordinateur.",
    settingsBefore: "Les limites de mémoire, le volume sonore et les services en ligne se trouvent dans",
    settingsLink: "Studio de chansons IA ▸ Réglages"
  },
  hardware: {
    vulkan: " Tourne sur la carte graphique (Vulkan).",
    cuda: " Tourne sur la carte graphique (CUDA).",
    metal: " Tourne sur le GPU Apple (Metal).",
    cpu: " Tourne sur le processeur.",
    cpuWithGpu:
      " Tourne sur le processeur, alors que cet ordinateur a une carte graphique : dans Studio de chansons IA ▸ Réglages ▸ Téléchargements de modèles locaux, cochez « Reconstruire l'environnement » pour ACE-Step afin de le compiler pour la carte (plusieurs fois plus rapide)."
  },
  instruments: {
    heading: "Instruments (Éditeur studio)",
    label: "Instruments",
    intro:
      "Des synthétiseurs gratuits qui jouent les notes d'un clip MIDI. Chaque téléchargement est un fichier de version fixe issu du projet de l'instrument, vérifié avant d'être installé pour votre utilisateur uniquement.",
    download: "Téléchargement : {size}.",
    platformOnly: "macOS et Windows uniquement",
    progress: "Progression de l'installation de {name}",
    useBefore: "Pour en utiliser un, sélectionnez un clip MIDI dans",
    useMiddle: "et ouvrez sa section Instrument plug-in, ou essayez les sons dans",
    forDaws: "Le rendre aussi disponible dans mes autres logiciels de musique (DAW)",
    forDawsHelp: "L'installe dans votre dossier VST3. Sans cette case, il reste dans le dossier de Music Suite et aucun autre logiciel ne le voit.",
    ownCopy: "Installé dans le dossier de Music Suite : seul Music Suite voit cette copie.",
    sharedCopy: "Installé dans votre dossier VST3 : vos autres logiciels de musique le voient aussi."
  },
  terminal: {
    heading: "Depuis un terminal",
    before: "Les mêmes installations fonctionnent depuis le dossier de Music Suite :",
    windowsOr: "(Windows) ou",
    mac: "(macOS).",
    list: "montre ce qui est installé. Instruments :"
  }
};
