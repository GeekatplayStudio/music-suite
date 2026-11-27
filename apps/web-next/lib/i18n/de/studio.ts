import type { Dictionary } from "../index";

/** AI Song Studio main page (components/generation/generate-studio.tsx). */
export const studio: Dictionary["studio"] = {
  header: {
    subtitle: "Beschreibe einen Song, bearbeite den Text und erzeuge ihn auf diesem Rechner. Ergebnisse öffnen sich im Studio-Editor.",
    backToEditor: "Zurück zum Editor"
  },
  tabs: {
    label: "Bereiche des KI-Song-Studios",
    create: "Erstellen",
    live: "Live",
    album: "Album",
    history: "Verlauf",
    settings: "Einstellungen"
  },
  errors: {
    load: "KI-Generierung konnte nicht geladen werden.",
    draftPlan: "Der Plan konnte nicht entworfen werden.",
    estimate: "Die Kosten konnten nicht geschätzt werden.",
    write: "Der Song konnte nicht geschrieben werden.",
    start: "Die Generierung konnte nicht gestartet werden.",
    place: "Der Song wurde erzeugt, konnte aber nicht auf die Timeline gelegt werden. Füge ihn über die Asset-Liste im Editor hinzu.",
    failed: "Generierung fehlgeschlagen.",
    read: "Der Song konnte nicht gelesen werden. Du kannst ihn trotzdem nutzen; fülle das Formular selbst aus.",
    upload: "Der Song konnte nicht hochgeladen werden.",
    analyse: "Der Song konnte nicht an den Analyzer gesendet werden.",
    bringIn: "Der Song konnte nicht hereingeholt werden.",
    history: "Der Verlauf konnte nicht geladen werden.",
    removeEntry: "Der Eintrag konnte nicht entfernt werden.",
    installStart: "Die Installation konnte nicht gestartet werden."
  },
  writer: {
    ollama: "Auf diesem Rechner von {model} geschrieben. Bearbeite alles vor dem Generieren.",
    planner: "Vom Planer der Musik-Engine entworfen. Für ausführlichere Texte richte Ollama in den Einstellungen ein.",
    abcReady: "Der Kompositionsplan ist fertig. Prüfe und bearbeite die ABC-Partitur, dann erzeuge den Song."
  },
  defaults: {
    songTitle: "Erzeugter Song",
    liveTake: "Magenta-Live-Take",
    songName: "Song",
    theSong: "den Song",
    newVersion: "{name} (neue Version)"
  },
  sourceStatus: {
    reading: "Tempo, Tonart und Stil werden gelesen…",
    uploading: "{name} wird hochgeladen…",
    bringing: "{name} wird hereingeholt…"
  },
  send: {
    label: "{name} senden",
    add: "Zu einer Session hinzufügen",
    addTitle: "Auf einer neuen Spur in einer neuen oder vorhandenen Editor-Session hinzufügen",
    split: "In Stems trennen",
    splitTitle: "Zu einer Session hinzufügen und in Gesang, Drums, Bass und den Rest trennen",
    analyse: "Analysieren",
    analyseTitle: "Eine Kopie im Analyzer öffnen und messen",
    startFrom: "Neuen Song daraus machen",
    startFromTitle: "Aus diesem Song einen weiteren machen: neu stylen, verlängern, Stimme hinzufügen…"
  },
  result: {
    label: "Ergebnis: {title}",
    versions: { one: "{n} Version", other: "{n} Versionen" },
    madeIn: "erstellt in {time}",
    openEditor: "Im Studio-Editor öffnen",
    seed: "Seed {seed}",
    play: "{name} abspielen",
    keepSeed: "Diesen Seed für die nächste Version behalten"
  },
  history: {
    label: "Generierungsverlauf",
    loading: "Verlauf wird geladen…",
    empty: "Noch nichts erzeugt. Deine Songs erscheinen hier mit den Einstellungen, mit denen sie entstanden sind.",
    useSettings: "Diese Einstellungen nutzen",
    openProject: "Projekt öffnen",
    removeLabel: "{title} aus dem Verlauf entfernen",
    removeTitle: "Aus dem Verlauf entfernen (das Audio bleibt in seinem Projekt)"
  },
  install: {
    heading: "Ein Schritt vor deinem ersten Song",
    body: "Die lokale Musik-Engine ist noch nicht installiert. Die Installation lädt etwa {gb} GB herunter und dauert ein paar Minuten. Danach entstehen Songs auf diesem Rechner, offline.",
    progress: "Installationsfortschritt",
    retry: "Installation erneut versuchen",
    install: "Lokale Engine installieren"
  },
  generator: {
    label: "Generator",
    notReady: " – nicht bereit"
  },
  idea: {
    heading: "Mit einer Idee beginnen",
    describe: "Beschreibe den Song, den du willst",
    placeholder: "Eine nächtliche Fahrt an der Küste nach einer Trennung, am Ende hoffnungsvoll. Verträumter Synthpop, Frauenstimme.",
    writing: "Wird geschrieben… (etwa 30 s)",
    write: "Stil und Text schreiben",
    hint: "Optional. Füllt das Formular unten aus; du kannst auch alles selbst eintippen."
  },
  form: {
    title: "Songtitel",
    titlePlaceholder: "Unbenannter Song",
    abc: "Bearbeitbare ABC-Partitur entwerfen",
    revise: "Wie der Text geändert werden soll",
    revisePlaceholder: "Text ändern: z. B. „füge eine Bridge hinzu“, „mach den Refrain einfacher“, „übersetze ins Spanische“",
    rewrite: "Neu schreiben"
  },
  bar: {
    working: "Läuft…",
    progress: "Generierungsfortschritt",
    estimate: "Etwa {time} auf diesem Rechner. Ein Song nach dem anderen.",
    notReady: "Noch nicht bereit zum Senden: {error}",
    prices: "Preise mit Stand {date}",
    taskFrom: "{task} aus „{name}“",
    makeIt: "Erzeugen",
    generate: "Generieren",
    generateInStyle: "In seinem Stil generieren",
    generateIntoProject: "In dieses Projekt generieren"
  },
  allOff: "Alle Generatoren sind ausgeschaltet. Schalte einen in den Einstellungen ein."
};
