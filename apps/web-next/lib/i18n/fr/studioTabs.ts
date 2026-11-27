import type { Dictionary } from "../index";

/** The AI Song Studio's other tabs and forms: settings, AI edit, album, plan editor, form fields. */
export const studioTabs: Dictionary["studioTabs"] = {
  settings: {
    failed: "Cela n'a pas fonctionné. Veuillez réessayer.",
    onThisComputer: "Sur cet ordinateur",
    optional: "Optionnel",
    keySources: {
      environment: "dans une variable d'environnement",
      keychain: "dans le trousseau de cet ordinateur",
      file: "dans un fichier privé sur cet ordinateur (aucun trousseau n'était disponible)"
    },
    online: {
      terms: "Conditions et tarifs",
      on: "Activé. Clé enregistrée {source}. {message}",
      off:
        "Désactivé. Ajouter votre clé l'active. Votre texte de style et vos paroles sont alors envoyés à ce service lorsque vous le choisissez comme générateur ; il facture votre compte. L'audio d'un clip n'est envoyé que si vous cochez « Autoriser l'envoi » pour le modifier avec ElevenLabs.",
      fromEnvironment: "Pour la modifier, changez la variable d'environnement {env}.",
      keyLabel: "Clé API {name}",
      pasteNew: "Collez une nouvelle clé pour la remplacer",
      paste: "Collez votre clé API",
      replace: "Remplacer la clé",
      save: "Enregistrer la clé",
      remove: "Supprimer la clé"
    },
    engine: {
      title: "Moteur musical local",
      intro: "ACE-Step 1.5 génère des chansons complètes avec voix sur cet ordinateur. Rien de ce que vous écrivez ou générez n'en sort.",
      editingReady:
        "Modèle d'édition installé : les modifications IA de l'Éditeur studio peuvent extraire des instruments, ajouter des parties et construire des morceaux autour d'une partie.",
      editingMissing:
        "Régénérer, prolonger et restyler fonctionnent déjà. Extraire un instrument, ajouter une partie ou construire un morceau autour d'une partie nécessite le modèle d'édition ci-dessous.",
      installed: "Installé. Il démarre tout seul quand vous générez et se décharge après {minutes} minutes d'inactivité.",
      installedLoaded: "Installé et chargé. Il démarre tout seul quand vous générez et se décharge après {minutes} minutes d'inactivité.",
      builtNoModels: "Le moteur est compilé, mais ses modèles manquent.",
      notInstalled: "Pas encore installé.",
      installSize: "L'installation télécharge environ {gb} Go et prend quelques minutes.",
      progress: "Progression de l'installation",
      keepUsing: "Vous pouvez continuer à utiliser Music Suite pendant ce temps.",
      retry: "Relancer l'installation",
      install: "Installer le moteur local",
      qualityTitle: "Un modèle musical plus grand pour les nouveaux morceaux : environ 25 % plus lent et 0,6 Go de mémoire en plus",
      quality: "Télécharger le modèle haute qualité ({gb} Go)",
      editingTitle: "Nécessaire dans l'Éditeur studio pour extraire un instrument, ajouter une partie ou construire un morceau autour d'une partie",
      editing: "Télécharger le modèle d'édition ({gb} Go)",
      unload: "Décharger maintenant",
      useQuality: "Utiliser le modèle haute qualité (XL) pour les nouveaux morceaux",
      useQualityHelp:
        "Mesuré ici : un morceau de 2 minutes en 80 s au lieu de 63 s, avec 5,0 Go au lieu de 4,4 Go. Les modifications IA gardent le modèle standard.",
      sources:
        "L'installation récupère le code source du moteur sur GitHub (une version fixe) et ses modèles sur Hugging Face, et vérifie chaque fichier de modèle avec une empreinte connue. Ensuite, tout fonctionne hors ligne."
    },
    writer: {
      title: "Rédacteur de paroles et de style",
      intro: "Un modèle de langage qui tourne dans Ollama transforme une idée en description de style et en paroles.",
      ready: "Prêt, avec {model}.",
      noModel: "Ollama tourne, mais le modèle « {model} » n'est pas encore téléchargé (environ 8 Go).",
      noOllama:
        "Ollama ne tourne pas. Sans lui, le planificateur du moteur musical écrit une ébauche plus simple. Téléchargez Ollama sur ollama.com, lancez-le, puis revenez ici.",
      model: "Modèle",
      notDownloaded: "{model} (non téléchargé)",
      download: "Télécharger {model}",
      sizeNote: "Les modèles bien plus gros que 12 Go ne tiendront pas en mémoire à côté du moteur musical sur un ordinateur de 24 Go."
    },
    memory: {
      title: "Garder votre ordinateur réactif",
      unknown: "La mémoire libre n'a pas pu être lue sur ce système.",
      free: "{percent} % de la mémoire est libre en ce moment.",
      oneAtATime: "Un seul morceau est généré à la fois, et le modèle de paroles est déchargé avant que la musique commence.",
      minLabel: "Ne pas démarrer en dessous de",
      minHelp: "Si la mémoire libre est inférieure à cette valeur, la génération attend, puis s'arrête avec un message.",
      minUnit: "% de mémoire libre",
      idleLabel: "Décharger le moteur après",
      idleHelp: "Le moteur rend sa mémoire lorsqu'il n'a pas servi pendant ce temps.",
      idleUnit: "minutes d'inactivité"
    },
    loudness: {
      title: "Volume sonore des nouveaux morceaux",
      level: "Ajuster le niveau de chaque nouveau morceau à l'import",
      levelHelp: "Un seul changement de gain vers la cible, sans jamais laisser les crêtes dépasser −1 dBTP. La dynamique n'est pas touchée.",
      target: "Volume sonore cible",
      targetHelp: "−14 LUFS convient aux services de streaming."
    },
    services: {
      title: "Services en ligne",
      intro:
        "Ils tournent sur les serveurs du fournisseur avec votre propre compte. Chacun reste désactivé tant que vous n'avez pas ajouté sa clé. Les clés sont conservées sur cet ordinateur et ne sont plus jamais affichées, même ici."
    },
    generators: {
      title: "Générateurs",
      on: "Activé",
      online: "Service en ligne"
    }
  },
  aiEdit: {
    title: "Modification IA",
    hint: "Modifiez ce clip avec l'IA, sur cet ordinateur ou avec un service en ligne que vous avez configuré. Chaque changement peut être annulé.",
    noEngine: "Le moteur d'IA local n'est pas disponible.",
    installFromStudio: "Installez-le depuis le Studio de chansons IA.",
    openStudio: "Ouvrir le Studio de chansons IA",
    openSettings: "Ouvrir les Réglages du Studio de chansons IA",
    hints: {
      restyle: "Recréer cet enregistrement avec le son décrit.",
      inpaint: "Régénérer la zone surlignée d'après la description.",
      continue: "Générer de la musique supplémentaire après l'enregistrement source.",
      reference: "Utiliser le son de cet enregistrement pour guider une nouvelle performance Magenta.",
      repaint: "Régénère la partie surlignée de ce clip et garde tout ce qui l'entoure exactement tel quel.",
      extend: "Ajoute avant ou après ce clip une nouvelle musique qui le prolonge.",
      cover: "Joue le même morceau dans un nouveau style.",
      extract: "Recrée un instrument de ce clip sur sa propre piste. Pour des stems exacts, utilisez plutôt Séparer.",
      add_layer: "Écrit une nouvelle partie d'instrument adaptée à ce clip, sur sa propre piste.",
      complete:
        "Construit un arrangement complet autour de cette partie, par exemple un groupe autour d'une voix. Fonctionne mieux sur une seule partie, comme un stem issu de Séparer.",
      stem: "Générer une performance de remplacement à partir de ce stem. Les notes et le placement peuvent changer."
    },
    titles: {
      repaint: "régénéré",
      extend: "prolongé",
      cover: "restylé",
      extract: "extrait",
      add_layer: "nouvelle partie",
      complete: "morceau complet"
    },
    extractedTitle: "{instrument} (de {clip})",
    newPartTitle: "Nouvelle partie {instrument}",
    reconstruct: "Reconstruire ce stem par IA",
    generator: "Générateur",
    generatorLabel: "Générateur pour la modification IA",
    whatToDo: "Que faire",
    needsEditing: " (nécessite le modèle d'édition)",
    abc: "Mélodie source vérifiée (partition ABC)",
    abcLabel: "Partition ABC de la mélodie de la reprise",
    abcHelp: "YuE2 suit cette partition. Vérifiez la mélodie source, les accords et le phrasé des paroles avant le rendu.",
    abcTerms: "Mon utilisation respecte les conditions du modèle YuE2 et les autorisations des créateurs",
    unreverse: "Annulez d'abord l'inversion du clip.",
    needSelection: "Surlignez au moins une seconde de ce clip avec l'outil Plage (R), puis revenez ici.",
    section: "Section : de {start} s à {end} s de l'audio du clip",
    instrumentOut: "Instrument à extraire",
    partToAdd: "Partie à ajouter",
    clipIs: "Ce clip est",
    instrument: "Instrument",
    newStyle: "Nouveau style",
    describeOptional: "Décrivez-le (optionnel)",
    style: "Style",
    styleLabel: "Style pour la modification IA",
    coverPlaceholder: "p. ex. lo-fi hip hop, dusty drums, mellow piano",
    stylePlaceholder: "p. ex. warm acoustic folk, male vocal",
    lyrics: "Paroles (optionnel)",
    lyricsLabel: "Paroles pour la modification IA",
    lyricsPlaceholder: "Laissez vide pour une partie instrumentale",
    checkpointLimit: "Ce checkpoint accepte au plus {seconds} secondes.",
    diffLimit: "DiffRhythm accepte au plus 285 secondes.",
    modelControls: "Commandes du modèle",
    add: "Ajouter",
    where: "Où",
    afterEnd: "Après la fin",
    beforeStart: "Avant le début",
    keep: "Garder",
    faithful: "Rester proche de l'original (garde la mélodie et le placement, change la production)",
    faithfulSection: "Rester proche de la section d'origine",
    allowUpload:
      "Autoriser l'envoi de l'audio de ce clip à {service} s'il n'y a pas été créé. L'envoi est facturé comme la génération de la même durée.",
    prices: "Tarifs au {date}",
    versions: "Versions",
    versionsHelp: "La première version remplace ou ajoute le clip ; les autres vont sur des pistes en sourdine pour comparer."
  },
  album: {
    status: {
      queued: "En attente",
      writing: "Écriture",
      generating: "Génération",
      done: "Terminé",
      failed: "Échec",
      cancelled: "Annulé",
      running: "En cours",
      partial: "Terminé en partie"
    },
    untitled: "Album sans titre",
    startFailed: "L'album n'a pas pu démarrer.",
    placeFailed: "Les morceaux n'ont pas pu être placés dans l'éditeur.",
    cancelFailed: "Impossible d'annuler.",
    removeFailed: "Impossible de supprimer.",
    newAlbum: "Nouvel album",
    make: "Créer un album",
    intro:
      "Donnez une idée par morceau. Les morceaux sont écrits et générés l'un après l'autre en arrière-plan : vous pouvez fermer cette page ou la laisser tourner toute la nuit ; un album continue aussi après un redémarrage de Music Suite.",
    noGenerator: "Aucun générateur n'est prêt. Installez le moteur local ou ajoutez un service en ligne dans les Réglages.",
    albumTitle: "Titre de l'album",
    titlePlaceholder: "Virées nocturnes",
    generator: "Générateur",
    about: "Le sujet de l'album",
    aboutPlaceholder: "Un album synth-pop sur une virée en voiture dans la ville la nuit, du départ jusqu'au lever du soleil.",
    sharedStyle: "Style commun",
    stylePlaceholder: "dreamy synth-pop, airy female vocal, analog synths",
    songs: "Morceaux, une idée par ligne ({count} sur {max} max.)",
    songsLabel: "Morceaux, une idée par ligne",
    songsPlaceholder: "Laisser les lumières de la ville derrière soi\nLa route côtière déserte\nUne station-service à 3 h du matin\nLe lever du soleil sur le pont",
    eachAbout: "Chaque morceau dure environ",
    lengthLabel: "Durée de chaque morceau en secondes",
    seconds: "secondes",
    instrumental: "Instrumental",
    writeLyrics: "Écrire les paroles et le style de chaque morceau",
    onlineCost: {
      one: "Environ {usd} $ pour {n} morceau sur votre compte (tarifs au {date}).",
      other: "Environ {usd} $ pour {n} morceaux sur votre compte (tarifs au {date})."
    },
    localTime: {
      one: "Environ {n} minute sur cet ordinateur, un morceau à la fois.",
      other: "Environ {n} minutes sur cet ordinateur, un morceau à la fois."
    },
    makeSongs: {
      one: "Créer {n} morceau",
      other: "Créer {n} morceaux"
    },
    makeNone: "Créer les morceaux",
    albums: "Albums",
    loading: "Chargement des albums…",
    none: "Aucun album pour l'instant.",
    albumLabel: "Album {title}",
    ready: "{status} · {done} morceaux prêts sur {total}",
    openEditor: "Ouvrir dans l'Éditeur studio",
    stop: "Arrêter",
    removeLabel: "Retirer l'album {title} de la liste",
    removeTitle: "Retirer de la liste (le projet et les morceaux sont conservés)",
    footer: "Chaque album est un projet à part. En l'ouvrant, les morceaux terminés sont placés l'un après l'autre sur des pistes séparées.",
    allProjects: "Tous les projets"
  },
  form: {
    auto: "Auto",
    timestamp: "Horodater les paroles",
    timestampHelp: "Les minutages provisoires se basent sur la longueur des lignes. Vérifiez l'horodatage et le phrasé avant de générer.",
    insertSection: "Insérer une balise de section",
    lyricsPlaceholder: "[Verse]\nVos paroles ici…\n\n[Chorus]\n…",
    settingsCount: {
      one: "{n} réglage",
      other: "{n} réglages"
    }
  },
  plan: {
    title: "Plan du morceau",
    intro: "Optionnel. Façonnez le morceau section par section. Avec un plan, les champs Durée et Paroles ci-dessus ne sont pas utilisés.",
    draftAgain: "Refaire l'ébauche",
    draft: "Ébaucher un plan (gratuit)",
    clear: "Effacer le plan",
    section: "Section",
    seconds: "Secondes",
    follow: "Suivre les voisines",
    closely: "De près",
    somewhat: "Un peu",
    loosely: "De loin",
    moveUp: "Monter la section {n}",
    moveDown: "Descendre la section {n}",
    remove: "Supprimer la section {n}",
    lyrics: "Paroles (une ligne par ligne chantée ; laissez vide pour un instrumental)",
    styles: "Styles",
    stylesFirst: "Styles (définit le genre — mettez-en plusieurs)",
    stylesPlaceholder: "p. ex. dream pop, airy female vocal, analog synths",
    avoid: "Éviter",
    avoidPlaceholder: "p. ex. distorted guitars",
    add: "Ajouter une section",
    total: {
      one: "{n} section · {length} sur {max} min max.",
      other: "{n} sections · {length} sur {max} min max."
    }
  }
};
