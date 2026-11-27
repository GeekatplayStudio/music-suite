import type { Dictionary } from "../index";

/** The AI Song Studio's other tabs and forms: settings, AI edit, album, plan editor, form fields. */
export const studioTabs: Dictionary["studioTabs"] = {
  settings: {
    failed: "Das hat nicht geklappt. Bitte versuche es erneut.",
    onThisComputer: "Auf diesem Rechner",
    optional: "Optional",
    keySources: {
      environment: "aus einer Umgebungsvariablen",
      keychain: "im Schlüsselbund dieses Rechners",
      file: "in einer privaten Datei auf diesem Rechner (kein Schlüsselbund verfügbar)"
    },
    online: {
      terms: "Bedingungen und Preise",
      on: "An. Schlüssel gespeichert {source}. {message}",
      off:
        "Aus. Mit deinem Schlüssel wird es eingeschaltet. Dein Stiltext und dein Songtext werden dann an diesen Dienst gesendet, wenn du ihn als Generator wählst; er rechnet über dein Konto ab. Das Audio eines Clips wird nur hochgeladen, wenn du „Hochladen erlauben“ anhakst, um ihn mit ElevenLabs zu bearbeiten.",
      fromEnvironment: "Zum Ändern bearbeite die Umgebungsvariable {env}.",
      keyLabel: "API-Schlüssel für {name}",
      pasteNew: "Neuen Schlüssel einfügen, um ihn zu ersetzen",
      paste: "API-Schlüssel einfügen",
      replace: "Schlüssel ersetzen",
      save: "Schlüssel speichern",
      remove: "Schlüssel entfernen"
    },
    engine: {
      title: "Lokale Musik-Engine",
      intro: "ACE-Step 1.5 erzeugt komplette Songs mit Gesang auf diesem Rechner. Nichts, was du schreibst oder erzeugst, verlässt ihn.",
      editingReady:
        "Bearbeitungsmodell installiert: KI-Bearbeitungen im Studio-Editor können Instrumente herauslösen, Stimmen hinzufügen und Songs um eine Stimme bauen.",
      editingMissing:
        "Neu generieren, verlängern und neu stylen funktionieren schon. Ein Instrument herauslösen, eine Stimme hinzufügen oder einen Song um eine Stimme bauen braucht das Bearbeitungsmodell unten.",
      installed: "Installiert. Startet beim Generieren von selbst und wird nach {minutes} Minuten Leerlauf entladen.",
      installedLoaded: "Installiert und geladen. Startet beim Generieren von selbst und wird nach {minutes} Minuten Leerlauf entladen.",
      builtNoModels: "Die Engine ist gebaut, aber ihre Modelle fehlen.",
      notInstalled: "Noch nicht installiert.",
      installSize: "Die Installation lädt etwa {gb} GB herunter und dauert ein paar Minuten.",
      progress: "Installationsfortschritt",
      keepUsing: "Du kannst Music Suite währenddessen weiter nutzen.",
      retry: "Installation erneut versuchen",
      install: "Lokale Engine installieren",
      qualityTitle: "Ein größeres Musikmodell für neue Songs: etwa 25 % langsamer und 0,6 GB mehr Speicher",
      quality: "Hochwertiges Modell laden ({gb} GB)",
      editingTitle: "Im Studio-Editor nötig, um ein Instrument herauszulösen, eine Stimme hinzuzufügen oder einen Song um eine Stimme zu bauen",
      editing: "Bearbeitungsmodell laden ({gb} GB)",
      unload: "Jetzt entladen",
      useQuality: "Hochwertiges Modell (XL) für neue Songs nutzen",
      useQualityHelp:
        "Hier gemessen: ein 2-Minuten-Song in 80 s statt 63 s, mit 5,0 GB statt 4,4 GB. KI-Bearbeitungen nutzen weiter das Standardmodell.",
      sources:
        "Die Installation holt den Quellcode der Engine von GitHub (eine feste Version) und ihre Modelle von Hugging Face und prüft jede Modelldatei gegen einen bekannten Fingerabdruck. Danach funktioniert sie offline."
    },
    writer: {
      title: "Text- und Stil-Autor",
      intro: "Ein Sprachmodell in Ollama macht aus einer Idee eine Stilbeschreibung und einen Songtext.",
      ready: "Bereit, nutzt {model}.",
      noModel: "Ollama läuft, aber das Modell „{model}“ ist noch nicht heruntergeladen (etwa 8 GB).",
      noOllama:
        "Ollama läuft nicht. Ohne Ollama schreibt der Planer der Musik-Engine einen einfacheren Entwurf. Hol dir Ollama von ollama.com, starte es und komm dann hierher zurück.",
      model: "Modell",
      notDownloaded: "{model} (nicht heruntergeladen)",
      download: "{model} herunterladen",
      sizeNote: "Modelle deutlich über 12 GB passen auf einem 24-GB-Rechner nicht neben der Musik-Engine in den Speicher."
    },
    memory: {
      title: "Damit dein Rechner reaktionsschnell bleibt",
      unknown: "Der freie Speicher konnte auf diesem System nicht gelesen werden.",
      free: "Gerade sind {percent}% des Speichers frei.",
      oneAtATime: "Es wird immer nur ein Song erzeugt, und das Textmodell wird entladen, bevor die Musik beginnt.",
      minLabel: "Nicht starten unter",
      minHelp: "Ist weniger Speicher frei, wartet die Generierung und stoppt dann mit einer Meldung.",
      minUnit: "% freier Speicher",
      idleLabel: "Engine entladen nach",
      idleHelp: "Die Engine gibt ihren Speicher frei, wenn sie so lange nicht genutzt wurde.",
      idleUnit: "Minuten Leerlauf"
    },
    loudness: {
      title: "Lautheit neuer Songs",
      level: "Jeden neuen Song beim Import angleichen",
      levelHelp: "Eine einzige Gain-Änderung Richtung Ziel, Spitzen nie über −1 dBTP. Die Dynamik bleibt unberührt.",
      target: "Ziel-Lautheit",
      targetHelp: "−14 LUFS passt für Streamingdienste."
    },
    services: {
      title: "Online-Dienste",
      intro:
        "Diese laufen auf den Servern des Anbieters mit deinem eigenen Konto. Jeder bleibt aus, bis du seinen Schlüssel hinzufügst. Schlüssel bleiben auf diesem Rechner und werden nie wieder angezeigt, auch hier nicht."
    },
    generators: {
      title: "Generatoren",
      on: "An",
      online: "Online-Dienst"
    }
  },
  aiEdit: {
    title: "KI-Bearbeitung",
    hint: "Ändere diesen Clip mit KI, auf diesem Rechner oder mit einem eingerichteten Online-Dienst. Jede Änderung lässt sich rückgängig machen.",
    noEngine: "Die lokale KI-Engine ist nicht verfügbar.",
    installFromStudio: "Installiere sie im KI-Song-Studio.",
    openStudio: "KI-Song-Studio öffnen",
    openSettings: "Einstellungen des KI-Song-Studios öffnen",
    hints: {
      restyle: "Diese Aufnahme mit dem beschriebenen Sound neu erschaffen.",
      inpaint: "Den markierten Bereich anhand der Beschreibung neu generieren.",
      continue: "Zusätzliche Musik nach der Quellaufnahme generieren.",
      reference: "Den Sound dieser Aufnahme nutzen, um eine neue Magenta-Performance zu steuern.",
      repaint: "Generiert den markierten Teil dieses Clips neu und lässt alles drumherum genau so, wie es ist.",
      extend: "Fügt vor oder nach diesem Clip neue Musik hinzu, die ihn fortsetzt.",
      cover: "Spielt denselben Song in einem neuen Stil.",
      extract: "Erschafft ein Instrument aus diesem Clip auf eigener Spur neu. Für exakte Stems nutze stattdessen die Stem-Trennung.",
      add_layer: "Schreibt eine neue, passende Instrumentenstimme auf eigener Spur.",
      complete:
        "Baut ein volles Arrangement um diese Stimme, z. B. eine Band um einen Gesang. Am besten mit einer einzelnen Stimme, etwa einem Stem aus der Stem-Trennung.",
      stem: "Eine Ersatz-Performance aus diesem Stem generieren. Noten und Timing können sich ändern."
    },
    titles: {
      repaint: "neu generiert",
      extend: "verlängert",
      cover: "neu gestylt",
      extract: "extrahiert",
      add_layer: "neue Stimme",
      complete: "ganzer Song"
    },
    extractedTitle: "{instrument} (aus {clip})",
    newPartTitle: "Neue Stimme: {instrument}",
    reconstruct: "Diesen Stem mit KI rekonstruieren",
    generator: "Generator",
    generatorLabel: "Generator für die KI-Bearbeitung",
    whatToDo: "Was tun",
    needsEditing: " (braucht das Bearbeitungsmodell)",
    abc: "Geprüfte Ausgangsmelodie (ABC-Partitur)",
    abcLabel: "ABC-Partitur der Cover-Melodie",
    abcHelp: "YuE2 folgt dieser Partitur. Prüfe Ausgangsmelodie, Akkorde und Textphrasierung vor dem Rendern.",
    abcTerms: "Meine Nutzung entspricht den Bedingungen des YuE2-Modells und den Rechten der Urheber",
    unreverse: "Hebe zuerst die Umkehrung des Clips auf.",
    needSelection: "Markiere mit dem Bereichswerkzeug (R) mindestens eine Sekunde dieses Clips und komm dann hierher zurück.",
    section: "Abschnitt: {start} s bis {end} s des Clip-Audios",
    instrumentOut: "Herauszulösendes Instrument",
    partToAdd: "Hinzuzufügende Stimme",
    clipIs: "Dieser Clip ist",
    instrument: "Instrument",
    newStyle: "Neuer Stil",
    describeOptional: "Beschreibe es (optional)",
    style: "Stil",
    styleLabel: "Stil für die KI-Bearbeitung",
    coverPlaceholder: "z. B. lo-fi hip hop, dusty drums, mellow piano",
    stylePlaceholder: "z. B. warm acoustic folk, male vocal",
    lyrics: "Songtext (optional)",
    lyricsLabel: "Songtext für die KI-Bearbeitung",
    lyricsPlaceholder: "Leer lassen für eine Instrumentalstimme",
    checkpointLimit: "Dieser Checkpoint unterstützt höchstens {seconds} Sekunden.",
    diffLimit: "DiffRhythm unterstützt höchstens 285 Sekunden.",
    modelControls: "Modellregler",
    add: "Hinzufügen",
    where: "Wo",
    afterEnd: "Nach dem Ende",
    beforeStart: "Vor dem Anfang",
    keep: "Behalten",
    faithful: "Nah am Original bleiben (behält Melodie und Timing, ändert die Produktion)",
    faithfulSection: "Nah am Originalabschnitt bleiben",
    allowUpload:
      "Hochladen des Clip-Audios zu {service} erlauben, falls er nicht dort erstellt wurde. Das Hochladen wird wie das Generieren derselben Länge abgerechnet.",
    prices: "Preise mit Stand {date}",
    versions: "Versionen",
    versionsHelp: "Die erste Version ersetzt den Clip oder kommt hinzu; die anderen landen zum Vergleichen auf stummen Spuren."
  },
  album: {
    status: {
      queued: "Wartet",
      writing: "Schreibt",
      generating: "Generiert",
      done: "Fertig",
      failed: "Fehlgeschlagen",
      cancelled: "Abgebrochen",
      running: "Läuft",
      partial: "Teilweise fertig"
    },
    untitled: "Unbenanntes Album",
    startFailed: "Das Album konnte nicht gestartet werden.",
    placeFailed: "Die Songs konnten nicht in den Editor gelegt werden.",
    cancelFailed: "Abbrechen nicht möglich.",
    removeFailed: "Entfernen nicht möglich.",
    newAlbum: "Neues Album",
    make: "Album erstellen",
    intro:
      "Gib eine Idee pro Song an. Die Songs werden nacheinander im Hintergrund geschrieben und erzeugt – du kannst diese Seite schließen oder sie über Nacht laufen lassen; ein Album läuft auch nach einem Neustart von Music Suite weiter.",
    noGenerator: "Kein Generator bereit. Installiere die lokale Engine oder füge in den Einstellungen einen Online-Dienst hinzu.",
    albumTitle: "Albumtitel",
    titlePlaceholder: "Nachtfahrten",
    generator: "Generator",
    about: "Worum es im Album geht",
    aboutPlaceholder: "Ein Synthpop-Album über eine nächtliche Fahrt durch die Stadt, vom Aufbruch bis zum Sonnenaufgang.",
    sharedStyle: "Gemeinsamer Stil",
    stylePlaceholder: "dreamy synth-pop, airy female vocal, analog synths",
    songs: "Songs, eine Idee pro Zeile ({count} von bis zu {max})",
    songsLabel: "Songs, eine Idee pro Zeile",
    songsPlaceholder: "Die Lichter der Stadt hinter sich lassen\nDie leere Küstenstraße\nEine Tankstelle um 3 Uhr nachts\nSonnenaufgang über der Brücke",
    eachAbout: "Jeder Song etwa",
    lengthLabel: "Länge jedes Songs in Sekunden",
    seconds: "Sekunden",
    instrumental: "Instrumental",
    writeLyrics: "Text und Stil für jeden Song schreiben",
    onlineCost: {
      one: "Etwa ${usd} für {n} Song auf deinem Konto (Preise mit Stand {date}).",
      other: "Etwa ${usd} für {n} Songs auf deinem Konto (Preise mit Stand {date})."
    },
    localTime: {
      one: "Ungefähr {n} Minute auf diesem Rechner, ein Song nach dem anderen.",
      other: "Ungefähr {n} Minuten auf diesem Rechner, ein Song nach dem anderen."
    },
    makeSongs: {
      one: "{n} Song erstellen",
      other: "{n} Songs erstellen"
    },
    makeNone: "Songs erstellen",
    albums: "Alben",
    loading: "Alben werden geladen…",
    none: "Noch keine Alben.",
    albumLabel: "Album {title}",
    ready: "{status} · {done} von {total} Songs fertig",
    openEditor: "Im Studio-Editor öffnen",
    stop: "Stopp",
    removeLabel: "Album {title} aus der Liste entfernen",
    removeTitle: "Aus der Liste entfernen (Projekt und Songs bleiben erhalten)",
    footer: "Jedes Album ist ein eigenes Projekt. Beim Öffnen werden die fertigen Songs nacheinander auf getrennte Spuren gelegt.",
    allProjects: "Alle Projekte"
  },
  form: {
    auto: "Auto",
    timestamp: "Text mit Zeitstempeln",
    timestampHelp: "Die Entwurfs-Timings richten sich nach der Zeilenlänge. Prüfe Zeitstempel und Phrasierung vor dem Generieren.",
    insertSection: "Abschnitts-Tag einfügen",
    lyricsPlaceholder: "[Verse]\nDein Text hier…\n\n[Chorus]\n…",
    settingsCount: {
      one: "{n} Einstellung",
      other: "{n} Einstellungen"
    }
  },
  plan: {
    title: "Songplan",
    intro: "Optional. Gestalte den Song Abschnitt für Abschnitt. Mit einem Plan werden die Felder Länge und Songtext oben nicht verwendet.",
    draftAgain: "Neu entwerfen",
    draft: "Plan entwerfen (kostenlos)",
    clear: "Plan löschen",
    section: "Abschnitt",
    seconds: "Sekunden",
    follow: "Nachbarn folgen",
    closely: "Eng",
    somewhat: "Etwas",
    loosely: "Locker",
    moveUp: "Abschnitt {n} nach oben",
    moveDown: "Abschnitt {n} nach unten",
    remove: "Abschnitt {n} entfernen",
    lyrics: "Songtext (eine Zeile pro gesungener Zeile; leer für instrumental)",
    styles: "Stile",
    stylesFirst: "Stile (legen das Genre fest – nimm mehrere)",
    stylesPlaceholder: "z. B. dream pop, airy female vocal, analog synths",
    avoid: "Vermeiden",
    avoidPlaceholder: "z. B. distorted guitars",
    add: "Abschnitt hinzufügen",
    total: {
      one: "{n} Abschnitt · {length} von bis zu {max} min",
      other: "{n} Abschnitte · {length} von bis zu {max} min"
    }
  }
};
