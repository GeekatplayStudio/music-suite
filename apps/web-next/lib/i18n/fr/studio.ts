import type { Dictionary } from "../index";

/** AI Song Studio main page (components/generation/generate-studio.tsx). */
export const studio: Dictionary["studio"] = {
  header: {
    subtitle: "Décrivez un morceau, modifiez les paroles et générez-le sur cet ordinateur. Les résultats s'ouvrent dans l'Éditeur studio.",
    backToEditor: "Retour à l'éditeur"
  },
  tabs: {
    label: "Sections du Studio de chansons IA",
    create: "Créer",
    live: "Direct",
    album: "Album",
    history: "Historique",
    settings: "Réglages"
  },
  errors: {
    load: "La génération par IA n'a pas pu être chargée.",
    draftPlan: "Le plan n'a pas pu être rédigé.",
    estimate: "Le coût n'a pas pu être estimé.",
    write: "Le morceau n'a pas pu être écrit.",
    start: "La génération n'a pas pu démarrer.",
    place: "Le morceau a été généré, mais n'a pas pu être placé sur la timeline. Ajoutez-le depuis la liste des ressources de l'éditeur.",
    failed: "La génération a échoué.",
    read: "Le morceau n'a pas pu être lu. Vous pouvez quand même l'utiliser ; remplissez le formulaire vous-même.",
    upload: "Le morceau n'a pas pu être envoyé.",
    analyse: "Le morceau n'a pas pu être envoyé à l'analyseur.",
    bringIn: "Le morceau n'a pas pu être importé.",
    history: "L'historique n'a pas pu être chargé.",
    removeEntry: "L'entrée n'a pas pu être supprimée.",
    installStart: "L'installation n'a pas pu démarrer."
  },
  writer: {
    ollama: "Écrit sur cet ordinateur par {model}. Modifiez ce que vous voulez avant de générer.",
    planner: "Ébauche du planificateur du moteur musical. Pour des paroles plus complètes, configurez Ollama dans les Réglages.",
    abcReady: "Le plan de composition est prêt. Relisez et modifiez la partition ABC, puis générez le morceau."
  },
  defaults: {
    songTitle: "Morceau généré",
    liveTake: "Prise Magenta en direct",
    songName: "Morceau",
    theSong: "le morceau",
    newVersion: "{name} (nouvelle version)"
  },
  sourceStatus: {
    reading: "Lecture du tempo, de la tonalité et du style…",
    uploading: "Envoi de {name}…",
    bringing: "Import de {name}…"
  },
  send: {
    label: "Envoyer {name}",
    add: "Ajouter à une session",
    addTitle: "L'ajouter sur une nouvelle piste dans une session de l'éditeur, nouvelle ou existante",
    split: "Séparer en stems",
    splitTitle: "L'ajouter à une session et le séparer en voix, batterie, basse et le reste",
    analyse: "Analyser",
    analyseTitle: "Ouvrir une copie dans l'analyseur et la mesurer",
    startFrom: "En faire un nouveau morceau",
    startFromTitle: "Créer un autre morceau à partir de celui-ci : restyler, prolonger, ajouter une partie…"
  },
  result: {
    label: "Résultat : {title}",
    versions: { one: "{n} version", other: "{n} versions" },
    madeIn: "créé en {time}",
    openEditor: "Ouvrir dans l'Éditeur studio",
    seed: "graine {seed}",
    play: "Lire {name}",
    keepSeed: "Garder cette graine pour la version suivante"
  },
  history: {
    label: "Historique des générations",
    loading: "Chargement de l'historique…",
    empty: "Rien de généré pour l'instant. Les morceaux que vous créez apparaissent ici avec les réglages utilisés.",
    useSettings: "Utiliser ces réglages",
    openProject: "Ouvrir le projet",
    removeLabel: "Retirer {title} de l'historique",
    removeTitle: "Retirer de l'historique (l'audio reste dans son projet)"
  },
  install: {
    heading: "Une étape avant votre premier morceau",
    body: "Le moteur musical local n'est pas encore installé. L'installation télécharge environ {gb} Go et prend quelques minutes. Ensuite, les morceaux sont créés sur cet ordinateur, hors ligne.",
    progress: "Progression de l'installation",
    retry: "Relancer l'installation",
    install: "Installer le moteur local"
  },
  generator: {
    label: "Générateur",
    notReady: " — pas prêt"
  },
  idea: {
    heading: "Partir d'une idée",
    describe: "Décrivez le morceau que vous voulez",
    placeholder: "Une virée nocturne le long de la côte après une rupture, pleine d'espoir à la fin. Synth-pop rêveuse, voix féminine.",
    writing: "Écriture… (environ 30 s)",
    write: "Écrire le style et les paroles",
    hint: "Optionnel. Remplit le formulaire ci-dessous ; vous pouvez aussi tout saisir vous-même."
  },
  form: {
    title: "Titre du morceau",
    titlePlaceholder: "Morceau sans titre",
    abc: "Ébaucher une partition ABC modifiable",
    revise: "Comment modifier les paroles",
    revisePlaceholder: "Modifier les paroles : p. ex. « ajoute un pont », « simplifie le refrain », « traduis en espagnol »",
    rewrite: "Réécrire"
  },
  bar: {
    working: "En cours…",
    progress: "Progression de la génération",
    estimate: "Environ {time} sur cet ordinateur. Un morceau à la fois.",
    notReady: "Pas encore prêt à envoyer : {error}",
    prices: "Tarifs au {date}",
    taskFrom: "{task} à partir de « {name} »",
    makeIt: "Créer",
    generate: "Générer",
    generateInStyle: "Générer dans son style",
    generateIntoProject: "Générer dans ce projet"
  },
  style: {
    improve: "Améliorer la description",
    improveTitle: "Réécrit la description du style pour la rendre plus claire et plus concrète pour le modèle musical, en gardant votre idée. Annulable.",
    improving: "Amélioration…",
    undo: "Annuler",
    byModel: "Améliorée par {model}. Modifiez-la à votre guise.",
    byPlanner: "Améliorée par le planificateur du moteur musical.",
    failed: "La description du style n'a pas pu être améliorée."
  },
  lyricsHelper: {
    heading: "Rimes et syllabes",
    lines: { one: "{n} vers", other: "{n} vers" },
    help: "Chaque vers chanté avec son nombre de syllabes et une lettre de rime : les vers de même lettre riment (AABB, ABAB…). Un nombre ambré est bien plus long ou plus court que le reste de sa section.",
    approximate: "Dans cette langue, les rimes sont jugées sur l'orthographe : prenez-les comme une indication.",
    rhymeTitle: "Rime avec les autres vers « {letter} »",
    noRhyme: "Ne rime avec aucun autre vers de cette section",
    offTitle: "{n} syllabes ; la plupart des vers de cette section en ont environ {typical}",
    syllables: { one: "{n} syllabe", other: "{n} syllabes" },
    alternatives: "Variantes",
    alternativesTitle: "Proposer d'autres versions de ce vers qui gardent sa rime et sa longueur",
    rhymeWith: "Rimer avec",
    rhymeAuto: "Son vers partenaire (automatique)",
    rhymeNone: "Sans rime",
    ideaPlaceholder: "Facultatif : quoi changer (p. ex. « plus optimiste »)",
    suggest: "Proposer",
    suggesting: "Recherche…",
    failed: "Aucune variante n'a pu être proposée.",
    target: "Objectif : {n} syllabes, rime avec « {word} ». Une coche signifie que le vers rime vraiment et convient.",
    targetFree: "Objectif : {n} syllabes. Une coche signifie que le vers convient.",
    noRhymeMark: "Ne rime pas",
    lengthMark: "{n} syllabes : ne colle pas à la mélodie",
    goodMark: "Rime et convient",
    use: "Utiliser",
    none: "Le modèle n'a donné aucun vers utilisable. Réessayez.",
    noneGood: "Aucun ne rime et ne convient à la fois. Appuyez de nouveau sur Proposer, ou prenez le plus proche et retouchez-le."
  },
  allOff: "Tous les générateurs sont désactivés. Activez-en un dans les Réglages."
};
