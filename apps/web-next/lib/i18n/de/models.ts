import type { Dictionary } from "../index";

/** Models & engines (/models). */
export const models: Dictionary["models"] = {
  intro: "Optionale Engines und KI-Modelle. Alles hier läuft auf diesem Rechner; eine Installation ändert nie, was schon installiert ist.",
  working: "Läuft…",
  loadFailed: "Modelle & Engines konnten nicht geladen werden.",
  checking: "Dieser Rechner wird geprüft…",
  installFailed: "Die Installation konnte nicht gestartet werden.",
  installProgress: "Installationsfortschritt",
  readyReload: "Bereit. Lade offene Editor-Seiten neu, um es zu nutzen.",
  computer: {
    heading: "Dieser Rechner",
    gpu: "Grafikkarte",
    gpuNone: "Keine gefunden: KI-Modelle laufen auf dem Prozessor (langsamer)",
    torch: "PyTorch (führt die KI-Modelle aus)",
    usingGpu: " · nutzt die GPU",
    willUseCuda: "Nicht installiert · wird die GPU nutzen ({build})",
    willUseMps: "Nicht installiert · wird die Apple-GPU nutzen",
    willUseCpu: "Nicht installiert · wird den Prozessor nutzen"
  },
  notes: {
    install: "KI-Notentranskription installieren"
  },
  muscriptor: {
    title: "MuScriptor: ein Modell für den ganzen Mix (optional)",
    bodyBefore: "Hört den ganzen Song auf einmal und erkennt bis zu 35 Instrumente. Das Modell ist kostenlos, aber",
    nonCommercial: "nur für nichtkommerzielle Nutzung",
    bodyAfter:
      "(CC BY-NC 4.0), und seine Bedingungen verbieten das Transkribieren von Musik, an der du keine Rechte hast. Sobald es bereit ist, kann „Ganzer Song zu MIDI“ es nutzen; wähle für Arbeiten, die du verkaufst, die Stems-Methode.",
    ready: "Bereit",
    readySize: "Bereit · {size}",
    needsSignIn: "Anmeldung nötig",
    downloadedList: "Heruntergeladen: {list}.",
    signedIn: "Angemeldet; das Modell wird bei der ersten Nutzung heruntergeladen.",
    sizeHint: "Setze MUSIC_SUITE_MUSCRIPTOR_SIZE auf small, medium oder large, um eine Größe zu wählen.",
    stepCode: "Code installieren:",
    stepTerms: "Akzeptiere die Bedingungen für eine Größe auf Hugging Face (jede Größe einzeln), zum Beispiel",
    stepSignIn: "Auf diesem Rechner anmelden:",
    stepSignInAfter: "Nur auf der Website anzumelden reicht nicht.",
    stepRestart: "Music Suite neu starten."
  },
  stems: {
    legend: "Modelle",
    onDemand: "Hier nicht heruntergeladene Modelle werden geladen, wenn eine Trennung sie zum ersten Mal braucht.",
    downloadedSoFar: " Bisher heruntergeladen: {size}.",
    install: "KI-Stem-Trennung installieren",
    downloadFailed: "Das Modell konnte nicht heruntergeladen werden.",
    deleteSize: "{size} löschen",
    deleteFailed: "Die Modelle konnten nicht gelöscht werden.",
    deleteModels: "Heruntergeladene Modelle löschen",
    log: "Installationsprotokoll"
  },
  music: {
    heading: "KI-Musik (KI-Song-Studio)",
    label: "KI-Musik",
    progress: "Installationsfortschritt der Musik-Engine",
    engine: "Musik-Engine (ACE-Step 1.5)",
    engineNote: "Erzeugt komplette Songs mit Gesang, offline. Etwa {gb} GB; braucht CMake und einen C++-Compiler.",
    editing: "Bearbeitungsmodell",
    editingNote: "Ein Instrument herauslösen, eine Stimme hinzufügen, einen Song um eine Stimme bauen. {gb} GB.",
    xl: "Hochwertiges Modell (XL)",
    xlNote: "Bessere Songs, etwas langsamer. {gb} GB.",
    writer: "Texter ({model})",
    writerReady: "Schreibt Songtexte und Stilbeschreibungen mit Ollama.",
    writerMissing: "Braucht Ollama (ollama.com), das auf diesem Rechner läuft.",
    settingsBefore: "Speichergrenzen, Lautheit und Online-Dienste findest du unter",
    settingsLink: "KI-Song-Studio ▸ Einstellungen"
  },
  hardware: {
    vulkan: " Läuft auf der Grafikkarte (Vulkan).",
    cuda: " Läuft auf der Grafikkarte (CUDA).",
    metal: " Läuft auf der Apple-GPU (Metal).",
    cpu: " Läuft auf dem Prozessor.",
    cpuWithGpu:
      " Läuft auf dem Prozessor, obwohl dieser Rechner eine Grafikkarte hat: Setze unter KI-Song-Studio ▸ Einstellungen ▸ Downloads lokaler Modelle bei ACE-Step das Häkchen „Runtime neu bauen“, damit es für die Karte gebaut wird (um ein Vielfaches schneller)."
  },
  instruments: {
    heading: "Instrumente (Studio-Editor)",
    label: "Instrumente",
    intro:
      "Kostenlose Synthesizer, die die Noten eines MIDI-Clips spielen. Jeder Download ist eine feste Release-Datei aus dem Projekt des Instruments, die vor der Installation geprüft und nur für deinen Benutzer installiert wird.",
    download: "Download: {size}.",
    platformOnly: "Nur macOS und Windows",
    progress: "Installationsfortschritt: {name}",
    useBefore: "Um eines zu nutzen, wähle einen MIDI-Clip im",
    useMiddle: "und öffne dessen Bereich „Plugin-Instrument“, oder probiere die Sounds im",
    forDaws: "Auch in meinen anderen Musikprogrammen (DAW) verfügbar machen",
    forDawsHelp: "Installiert es in deinen VST3-Ordner. Ohne Haken bleibt es im Music-Suite-Ordner und kein anderes Programm sieht es.",
    ownCopy: "Im Music-Suite-Ordner installiert: Nur Music Suite sieht diese Kopie.",
    sharedCopy: "In deinem VST3-Ordner installiert: Auch deine anderen Musikprogramme sehen es."
  },
  terminal: {
    heading: "Im Terminal",
    before: "Dieselben Installationen funktionieren aus dem Music-Suite-Ordner:",
    windowsOr: "(Windows) oder",
    mac: "(macOS).",
    list: "zeigt, was installiert ist. Instrumente:"
  }
};
