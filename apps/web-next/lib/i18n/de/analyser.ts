import type { Dictionary } from "../index";

/** The analyser (app/page.tsx). */
export const analyser: Dictionary["analyser"] = {
  na: "k. A.",
  yes: "ja",
  no: "nein",
  idle: "Bereit",
  status: {
    idle: "bereit",
    uploaded: "hochgeladen",
    queued: "in Warteschlange",
    running: "läuft",
    completed: "abgeschlossen",
    failed: "fehlgeschlagen",
    cancelled: "abgebrochen"
  },
  severity: {
    critical: "kritisch",
    high: "hoch",
    medium: "mittel",
    low: "niedrig",
    info: "Info",
    warning: "Warnung",
    error: "Fehler"
  },
  chartTitles: {
    waveform: "Wellenform + Hüllkurve",
    loudness: "Lautheitsverlauf",
    spectrum: "Durchschnittsspektrum",
    stereo: "Stereokorrelation + M/S",
    correlation_meter: "Korrelationsanzeige",
    ms_view: "Mitte/Seite-Ansicht",
    vectorscope: "Vektorskop / Goniometer",
    spectrogram_stft_linear: "STFT-Spektrogramm (linear)",
    spectrogram_stft_log: "STFT-Spektrogramm (log.)",
    spectrogram_mel: "Mel-Spektrogramm",
    spectrogram_cqt: "CQT-Spektrogramm"
  },
  chartHelp: {
    waveform:
      "Zeigt die Amplitude über die Zeit plus Peak-/RMS-Hüllkurven. Damit erkennst du Transienten, starkes Limiting und die Form der Hüllkurve.",
    loudness:
      "Momentary- und Short-term-LUFS über die Zeit. Achte auf Gleichmäßigkeit sowie Einbrüche und Spitzen gegenüber deinem Ziel-Lieferpegel.",
    spectrum:
      "Durchschnittliche Frequenzbalance. Nützlich, um die tonale Neigung zu prüfen und zu viel Sub, Schärfe oder fehlende Luft zu finden.",
    stereo: "Korrelation und Mitte/Seite-Verhältnis zusammen. Negative Korrelation warnt vor Problemen mit der Monokompatibilität.",
    correlation_meter:
      "Korrelation von −1 bis +1. Werte nahe +1 sind monokompatibel; Werte unter 0 können in Mono zusammenfallen.",
    ms_view: "Trends des Mitte/Seite-Verhältnisses und der L-R-Balance. Hilft, ungleiche Breite oder seitenlastige Passagen zu finden.",
    vectorscope:
      "Stereobild als Punktwolke von links gegen rechts. Senkrechte Tendenz ist eher mono; eine breite Wolke zeigt größere Stereobreite.",
    spectrogram_stft_linear:
      "Zeit-Frequenz-Energie mit linearer Frequenzachse. Gut für die detaillierte technische Prüfung des gesamten Spektrums.",
    spectrogram_stft_log: "STFT mit logarithmischer Frequenzskala. Musikalisch leichter zu lesen, besonders im Tieftonbereich.",
    spectrogram_mel: "Gehörgerecht gewichtetes Spektrogramm, ausgerichtet daran, wie das Gehör Frequenzbänder gruppiert.",
    spectrogram_cqt: "Constant-Q-Spektrogramm mit musikalischen Abständen über die Oktaven, nützlich für Tonhöhen- und Obertonstruktur."
  },
  chartHelpMissing: "Keine Beschreibung zur Deutung des Diagramms verfügbar.",
  groups: {
    all: { label: "Alle Ansichten", description: "Die komplette Analyse für die technische Prüfung." },
    mix: { label: "Mix-Prüfung", description: "Wellenform, Lautheit, tonale Balance und Problem-Marker." },
    stereo: { label: "Stereo-Fokus", description: "Breite, Monokompatibilität und räumliche Balance." },
    spectral: { label: "Spektral", description: "Detaillierte Zeit-Frequenz-Prüfung in STFT-, Mel- und CQT-Ansichten." }
  },
  guide: {
    title: "Leitfaden: Was alles bedeutet",
    intro: "Dieses Glossar erklärt jede Messgröße und jedes Diagramm dieser Ansicht, damit du Ergebnisse schnell deuten kannst.",
    element: "Element",
    whatItTells: "Was es dir sagt",
    graph: "Diagramm",
    howToRead: "Wie man es liest",
    rows: {
      compressionLoss: {
        element: "Geschätzter Kompressionsverlust",
        meaning:
          "Wie weit unter der Hörgrenze (20 kHz, bei niedrigen Abtastraten Nyquist) der gemessene Inhalt endet. 0 Hz heißt, es fehlt nichts Hörbares; ein großer Wert bei einer verlustfreien Datei deutet auf eine Umwandlung aus einer verlustbehafteten Quelle hin."
      },
      peakToNoise: {
        element: "Bereichsdetail | Peak zu Rauschen",
        meaning:
          "Abstand zwischen Spitzenpegel und gemessenem Grundrauschen. Größere Werte bedeuten meist einen saubereren Dynamikumfang. k. A., wenn der Track keine leisen Lücken hat, in denen sich das Grundrauschen messen lässt."
      },
      peakToLufs: {
        element: "Bereichsdetail | Peak zu LUFS",
        meaning: "Abstand zwischen True Peak und integrierter Lautheit. Nützlich als Kontext für Headroom und Transientenkontrast."
      },
      compressionAssessment: {
        element: "Kompressionsbewertung",
        meaning:
          "Heuristische Zusammenfassung aus Codec-/Container-Metadaten und spektralem Verhalten. Informativ, aber kein forensischer Codec-Detektor."
      },
      metadataTags: {
        element: "Metadaten-Tags",
        meaning:
          "Eingebettete Tags wie Künstler/Titel/Album. „Keine eingebetteten Tags gefunden“ heißt, die Tags fehlen oder sind in dieser Datei nicht lesbar."
      },
      rawMetadata: {
        element: "Rohe Metadaten als JSON zeigen",
        meaning: "Ungefilterte Metadaten von ffprobe und mutagen für die technische Prüfung."
      },
      integratedLufs: {
        element: "Integrierte LUFS",
        meaning: "Wahrgenommene Gesamtlautheit des ganzen Tracks, gemessen mit Lautheitsmodell nach BS.1770."
      },
      truePeak: {
        element: "True Peak dBFS",
        meaning: "Überabgetastete Spitzenschätzung einschließlich möglicher Inter-Sample-Peaks, die bei Wiedergabe/Kodierung clippen können."
      },
      crestFactor: {
        element: "Crest-Faktor dB",
        meaning: "Kontrast von Peak zu RMS. Ein höherer Crest-Faktor bedeutet oft mehr Transienten-Punch und weniger Dauer-Limiting."
      },
      noiseFloor: {
        element: "Grundrauschen dBFS",
        meaning:
          "Pegel des Rauschens, das zu hören ist, wo die Musik aussetzt (Fades, Lücken, leise Intros). Je negativer, desto sauberer. Dichte Tracks ohne solche Passagen zeigen k. A., weil die Musik das Grundrauschen verdeckt."
      },
      markersAround: {
        element: "Marker um die aktuelle Timeline-Position",
        meaning: "Warnungen, die nahe der aktuellen Abspielposition aktiv sind. „Keine Zeilen“ heißt, an dieser Stelle gibt es keine aktiven Warnungen."
      },
      stageTicker: {
        element: "Session-Steuerung | Phasenanzeige",
        meaning:
          "Live-Fortschritt der aktuellen Analysephase (Dekodieren, Scannen, Spektrogramme, Berichterstellung). Nützlich, wenn der Prozentwert stillzustehen scheint."
      },
      hardReset: {
        element: "Session-Steuerung | Harter Reset",
        meaning: "Löscht den Laufverlauf und setzt wartende/laufende Worker-Jobs zurück, um festhängende Analyseschleifen zu lösen."
      },
      masteringBackend: {
        element: "KI-Mastering | Backend",
        meaning:
          "Ausführungsweg für das Mastering. „auto“ wählt zur Laufzeit das beste verfügbare Backend; nicht verfügbare Backends fallen sicher zurück."
      },
      masteringReference: {
        element: "KI-Mastering | Referenzsong",
        meaning:
          "Optionale ID eines analysierten Laufs als Referenz für Klang und Lautheit (vor allem für Referenz-Mastering im Stil von matchering)."
      },
      refinePasses: {
        element: "KI-Mastering | Verfeinerungsdurchläufe",
        meaning:
          "Höchstzahl markerbewusster Korrekturdurchläufe. Mehr Durchläufe können hartnäckige Probleme verbessern, sind aber begrenzt, um Schleifen zu verhindern."
      },
      adaptation: {
        element: "KI-Mastering | Quellenbewusste Anpassung",
        meaning:
          "Vor dem Rendern kann AudioQI De-Essing, Tiefen-/Höhenbalance, Kompression, Limiter-Drive und Peak-Headroom anhand erkannter Quellprobleme leicht nachjustieren. Manuelle Lautheitsziele bleiben, sofern keine zusätzliche Spitzensicherheit nötig ist."
      },
      selfCheckAssessment: {
        element: "Selbstprüfung nach dem Master | Bewertung",
        meaning:
          "Gesamtergebnis: starke Verbesserung, teilweise Verbesserung, unverändert oder Verschlechterung (dann greift der Rollback-Schutz)."
      },
      selfCheckScore: {
        element: "Selbstprüfung nach dem Master | Problemwert",
        meaning: "Gewichtete Anzahl aktiver Problemklassen vor und nach dem Mastering. Ein niedrigerer Wert danach zeigt eine Verbesserung."
      },
      selfCheckLists: {
        element: "Selbstprüfung nach dem Master | Verbleibend/Behoben/Verschlechtert",
        meaning:
          "Problemklassen, die nach dem Mastering noch da, entfernt oder stärker sind. Verbleibende schwere Probleme brauchen meist Korrekturen im Mix oder an den Stems."
      },
      selfCheckMatch: {
        element: "Selbstprüfung nach dem Master | Übereinstimmung mit KI-Empfehlung",
        meaning: "Vergleicht angewandten Modus/Preset/Ziele mit den Empfehlungen des Analyzers. Übereinstimmung garantiert nicht, dass Probleme behoben sind."
      },
      refinementDiagnostics: {
        element: "Verfeinerungsdiagnose",
        meaning: "Zeigt angenommene Durchläufe, Rollbacks, den finalen Problemwert und ob der Stem-Fallback genutzt wurde."
      },
      proModules: {
        element: "Pro-Module",
        meaning: "Verfügbarkeit optionaler Integrationen zur Laufzeit (ffmpeg, pedalboard, matchering, pyebur128)."
      },
      naValues: {
        element: "Werte „k. A.“",
        meaning:
          "Erscheinen, wenn Signal/Metadaten für eine Messgröße nicht ausreichen (z. B. kein stabiles Grundrauschen oder fehlende Codec-Metadaten)."
      }
    }
  },
  norm: {
    off: { label: "Aus (Preset/Manuell)", help: "Preset-Standards oder manuelle LUFS-/TP-Werte nutzen." },
    youtube: { label: "YouTube", help: "Übliches Normalisierungsziel von YouTube." },
    spotify: { label: "Spotify", help: "Typische Ausrichtung an der Spotify-Normalisierung." },
    apple_music: { label: "Apple Music", help: "Zurückhaltende Lautheit im Stil von Apple Music." },
    instagram: { label: "Instagram", help: "Ausgewogenes Ziel für Social/Mobil." },
    tiktok: { label: "TikTok", help: "Ziel für Kurzform-Plattformen." },
    broadcast_ebu: { label: "Rundfunk EBU", help: "Rundfunk-Auslieferung nach EBU R128." },
    podcast_voice: { label: "Podcast-Sprache", help: "Sprachbetonte Podcast-Normalisierung." }
  },
  bassMono: {
    presetDefault: "Preset-Standard",
    off: "Aus"
  },
  readiness: {
    aligned: "Passend",
    hot: "Heiß",
    quiet: "Leise",
    safe: "Sicher",
    tight: "Knapp",
    risk: "Risiko",
    clean: "Sauber",
    review: "Prüfen",
    attention: "Achtung",
    open: "Offen",
    controlled: "Kontrolliert",
    dense: "Dicht"
  },
  header: {
    title: "Music Suite von Geekatplay Studio",
    stack:
      "Backend-Stack: FFmpeg/ffprobe, SoundFile (libsndfile), Mutagen, NumPy, SciPy, Librosa, pyloudnorm, Plotly und optionale CUDA-Beschleunigung für Spektrogramme mit torchaudio + nnAudio.",
    configuration: "Konfiguration",
    refreshRuns: "Läufe aktualisieren",
    mapperTitle: "Gewählten Song in der Song-Geometrie öffnen",
    needSong: "Wähle zuerst einen Song oder lade einen hoch",
    songFromThisTitle:
      "Einen neuen KI-Song aus dem gewählten Track starten: Tempo, Tonart und Stil füllen das Formular, und du kannst ihn neu stylen, verlängern oder Stimmen hinzufügen",
    newSongTitle: "Einen neuen Song mit KI auf diesem Rechner schreiben und erzeugen",
    songFromThis: "Song daraus machen",
    editorAddTitle: "Gewählten Song einer Studio-Editor-Session hinzufügen (neu oder vorhanden), optional in Stems getrennt",
    editorOpenTitle: "Den Mehrspur-Studio-Editor öffnen",
    synthTitle: "Synth-Sounds gestalten und spielen und die Bibliothek von Surge XT durchstöbern",
    modelsTitle: "Optionale Engines und KI-Modelle installieren: mehr Stems, die Musik-Engine, den Texter",
    helpTitle: "Das Benutzerhandbuch: jeder Arbeitsbereich und jede Einstellung erklärt",
    clearHistory: "Verlauf löschen",
    hardReset: "Harter Reset",
    hardResetTitle: "Job-Worker zwangsweise zurücksetzen und alle Läufe löschen (auch aktive)."
  },
  config: {
    title: "Konfiguration & Updates",
    product: "Produkt",
    createdBy: "Erstellt von Geekatplay Studio",
    installedVersion: "Installierte Version",
    revision: "Revision {rev}",
    notAvailable: "nicht verfügbar",
    officialSource: "Offizielle Quelle",
    stableBranch: "Stabiler Branch: main",
    updateAvailable: "Update verfügbar",
    upToDate: "Music Suite ist auf dem neuesten Stand",
    readyToCheck: "Bereit zur Update-Prüfung",
    dirty: "Lokale Änderungen gefunden. Die Installation ist gesperrt, bis sie committet oder entfernt sind.",
    officialOnly:
      "Prüft nur das offizielle Repository von Geekatplay Studio. Updates erfolgen nur per Fast-Forward und überschreiben nie lokale Änderungen.",
    checking: "Wird geprüft...",
    check: "Nach Updates suchen",
    installing: "Wird installiert...",
    install: "Update installieren"
  },
  session: {
    title: "Session-Steuerung",
    dropHint: "Audio hierher ziehen oder durchsuchen",
    browse: "Datei wählen",
    upload: "Hochladen",
    analyze: "Analysieren",
    visualTitle: "Echtzeit-Visuals für den hochgeladenen Song öffnen",
    visual: "Visual AI",
    useGpu: "Optionalen GPU-Weg für Spektrogramme nutzen",
    staleHeartbeat:
      "Das Lebenszeichen der Phase ist ungewöhnlich alt. Lange Spektrogramm-Berechnungen brauchen Zeit, aber der Schleifenschutz des Backends bricht wirklich festhängende Analysen trotzdem automatisch ab.",
    stage: "Phase: {stage}",
    stageUpdated: "Phase: {stage} | vor {n} s aktualisiert",
    exports: "Exporte",
    saveReady: "Fertige Dateien speichern ({n})"
  },
  convert: {
    title: "Formatumwandlung",
    intro: "Wandle den gewählten Song mit Fortschrittsanzeige in weitere Lieferformate um.",
    convertSelected: "Auswahl umwandeln",
    files: "Umgewandelte Dateien",
    none: "Noch keine umgewandelten Dateien."
  },
  mastering: {
    title: "KI-Mastering",
    helpLabel: "Mastering-Einstellungen",
    modesIntro: "V1 = transparente Kette, V2 = Optimierer-Varianten, V3 = stembasierter Korrektur-Workflow.",
    preflightIntro:
      "AudioQI führt jetzt vor dem Rendern der Varianten oder der Stem-Rettung einen quellenbewussten Vorab-Anpassungsdurchlauf aus. Für fortgeschrittene Kontrolle nutze Backend, Verfeinerungsdurchläufe und Referenzsong.",
    suggested: "Vorschlag aus der Analyse",
    noAdvice: "Keine Empfehlung",
    mode: "Modus",
    preset: "Preset",
    targetsLine: "Ziel-LUFS {lufs} | True Peak {tp} | Varianten {variants} | Backend {backend} | Verfeinerung {refine}",
    issueScore: " | Problemwert {n}",
    scorePolicy:
      "Bewertungsregel: Dichte, verlustbehaftete oder spitzenempfindliche Quellen bleiben bei V1; sauberere Korrekturfälle gehen zu V2; V3 ist für stärkere Eingriffe bei rettbarem Material reserviert.",
    apply: "Vorschlag übernehmen",
    analyzeFirst: "Analysiere zuerst einen Track, um empfohlenen KI-Mastering-Modus, Preset und Ziele zu erhalten.",
    awaiting: "Warte auf Empfehlung des Analyzers",
    settings: "Mastering-Einstellungen",
    normProfile: "Normalisierungsprofil",
    profileTargets: "Profilziele",
    profileTargetsValue: "{lufs} LUFS | {tp} dBFS TP",
    presetTargets: "Preset-/manuelle Ziele",
    backend: "Backend",
    reference: "Referenzsong (matchering)",
    referenceAria: "Referenzsong für matchering",
    none: "Keiner",
    runShort: "Lauf {id}…",
    targetLufs: "Ziel-LUFS",
    truePeak: "True Peak dBFS",
    inputGain: "Eingangsgain (dB)",
    gainStaging: "Gain-Staging",
    unity: "Unity (Quellpegel unverändert)",
    gainBefore: "{gain} dB vor der Kette",
    reset: "Zurücksetzen",
    bassMono: "Bass-Mono",
    stereoWidth: "Stereobreite",
    widthPlaceholder: "Preset-Standard (1.0)",
    variants: "V2-Varianten",
    refinePasses: "Verfeinerungsdurchläufe",
    backendNotes:
      "Hinweise zu Backends: `internal` ist der sicherste Standard, `auto` dient der fortgeschrittenen Backend-Wahl, und `matchering` braucht einen gültigen Referenzsong. Der Eingangsgain (-12..+12 dB) trimmt die Quelle vor Profilierung, Anpassung und jedem Backend-Durchlauf und verändert so, wie die Kette den Mix hört. Bass-Mono fasst gegenphasige Seitenenergie unterhalb der Grenzfrequenz zusammen (die Mitte bleibt unberührt), und Stereobreite skaliert den Seitenkanal; stehen beide auf Preset-Standard, kann der Vorabdurchlauf sie straffen, wenn Monokompatibilitäts-Marker auslösen. Verfeinerungsdurchläufe sind gegen Schleifen geschützt. Das Normalisierungsprofil setzt Plattformziele; manuelle LUFS-/TP-Werte überschreiben die Profilstandards. Die quellenbewusste Anpassung kann Schärfe, Sub-Energie, Dichte oder True-Peak-Risiko reduzieren, bevor der Haupt-Master gerendert wird.",
    run: "Mastering starten",
    bestOutput: "Bestes Ergebnis: {id}",
    backendSelected: "Gewähltes Backend: {backend}",
    outputHash: "SHA256 des Ergebnisses: {hash}...",
    refinement: "Verfeinerung: {accepted} / {max} angenommen",
    finalScore: " | Finaler Problemwert {n}",
    rollbacks: " | Rollbacks {n}",
    stemFallback: " | Stem-Fallback angewendet",
    nonRegression: " | Schutz gegen Verschlechterung ({reason})",
    applied: "angewendet",
    proModules: "Pro-Module:",
    adaptationTitle: "Quellenbewusste Anpassung",
    sourceScore: "Problemwert der Quelle: {n}",
    adjustments: " | Anpassungen {n}",
    noChanges: "Für diese Quelle waren keine Vorab-Parameteränderungen nötig.",
    selfCheckTitle: "Selbstprüfung nach dem Master",
    assessment: "Bewertung:",
    issueScoreLabel: "Problemwert:",
    appliedSettings: "Angewendet: {name} | Ziel {target} | TP {tp} | Norm {norm} | Eingangsgain {gain}",
    stereoStage: "Stereostufe: Bass-Mono {bass} | Breite {width}",
    off: "aus",
    aiMatch: "Übereinstimmung mit KI-Empfehlung: Modus {mode} | Preset {preset} | Ziel {target} | TP {tp}",
    compliance: "Konformität: {result}",
    pass: "bestanden",
    reviewRequired: "Prüfung nötig",
    lufsDelta: " | LUFS-Differenz {n}",
    tpDelta: " | TP-Differenz {n} dB",
    crestDelta: " | Crest-Differenz {n} dB",
    complianceIssues: "Konformitätsprobleme: {list}",
    rescue: "Rettung nach der Prüfung: {state}",
    rescueAttempted: "nur versucht",
    round: " | Runde {n}",
    resolved: "Behoben: {list}",
    remaining: "Verbleibend: {list}",
    worsened: "Verschlechtert: {list}",
    outputs: "Gemasterte Dateien",
    noOutputs: "Noch keine Mastering-Ergebnisse."
  },
  history: {
    title: "Laufverlauf"
  },
  columns: {
    file: "Datei",
    status: "Status",
    stage: "Phase",
    progress: "Fortschritt",
    updated: "Aktualisiert",
    type: "Typ",
    severity: "Schwere",
    window: "Fenster",
    note: "Hinweis",
    format: "Format",
    details: "Details",
    size: "Größe",
    download: "Download",
    output: "Ergebnis",
    score: "Wert",
    truePeak: "True Peak",
    verify: "Prüfen"
  },
  playback: {
    title: "Wiedergabe + Timeline",
    playhead: "Abspielposition",
    rate: "Wiedergabe {rate}x",
    loopOn: "Auswahl-Loop aktiv",
    loopOff: "Auswahl-Loop aus",
    eqOn: "EQ-Abhören aktiv",
    eqOff: "EQ umgangen",
    segment: "Gewählter Abschnitt (Zoombereich)",
    fullTrack: "Ganzer Track",
    segmentLine: "Start {start} s | Ende {end} s | Länge {length} s",
    leftMarker: "Linker Marker",
    rightMarker: "Rechter Marker",
    markers: "Marker (Klick zum Springen + Zoomen)",
    noMarkers: "Noch keine Marker vorhanden."
  },
  tiles: {
    activeRun: "Aktiver Lauf",
    noRun: "Kein Lauf gewählt",
    runId: "Lauf-ID {id}",
    copyRunId: "Vollständige Lauf-ID kopieren",
    uploadToCreate: "Lade eine Datei hoch, um einen Lauf anzulegen.",
    analysisState: "Analysestatus",
    complete: "{pct}% fertig",
    reviewAssets: "Prüfmaterial",
    chartsLoaded: "{loaded}/{total} Diagramme geladen",
    markersLine: "{markers} Marker erkannt | {attention} Punkte mit Handlungsbedarf",
    selectionWindow: "Auswahlfenster {length} s",
    strategy: "Mastering-Strategie",
    backendProfile: "Backend {backend} | Profil {profile}",
    masteredReady: { one: "{n} gemasterte Datei bereit", other: "{n} gemasterte Dateien bereit" },
    noMastered: "Noch keine gemasterten Dateien"
  },
  overview: {
    title: "Übersicht",
    pause: "Pause",
    play: "Abspielen",
    selectionStart: "Auswahlbeginn",
    loopSelection: "Auswahl loopen",
    speed: "Tempo",
    setStart: "Start bei {time} s",
    setEnd: "Ende bei {time} s",
    resetRange: "Bereich zurücksetzen",
    readiness: "Lieferbereitschaft",
    loudness: "Lautheit",
    loudnessLine: "{lufs} LUFS bei Ziel {target}",
    truePeak: "True Peak",
    peakLine: "{tp} dBFS aktuelle Obergrenze",
    markerLoad: "Marker-Last",
    markerLine: { one: "{n} Marker mit hoher Priorität", other: "{n} Marker mit hoher Priorität" },
    dynamics: "Dynamik",
    dynamicsLine: "Crest {crest} dB | LRA {lra} LU",
    flatSections: " (flache Abschnitte)",
    manualEq: "Manueller EQ",
    live: "Live",
    bypass: "Bypass",
    eqExportNote: "Der EQ-Export rendert eine WAV des ganzen Tracks im Browser, damit deine Backend-Pipeline unverändert bleibt.",
    guidanceTitle: "Hinweise zur Prüfung",
    guidance1: "Nutze die Prüfleiste, um schnell durch die Datei zu springen, bevor du die vollständigen Analysediagramme öffnest.",
    guidance2:
      "Lass die Diagrammgruppe für die erste Diagnose auf Mix-Prüfung und wechsle dann zu Spektral, um Ursachen zu untersuchen.",
    guidance3:
      "Ist die Lieferbereitschaft nicht passend, übernimm das vorgeschlagene Mastering-Profil, bevor du einen neuen Mastering-Durchlauf startest.",
    guidance4:
      "Nutze den optionalen EQ zum manuellen Abhören und exportiere den bearbeiteten Track als WAV, wenn du diese Kurve behalten willst."
  },
  file: {
    title: "Datei-Analyse",
    titleHelp:
      "Wichtigste Aufnahme-/Kodierdetails, geschätzter Frequenzgehalt, Folgen der Kompression und Kontext zum Dynamikumfang.",
    formatHelp: "Containerformat und Codec zeigen, wie das Audio gespeichert und kodiert wurde.",
    formatCodec: "Format / Codec",
    compression: "Kompression:",
    freqHelp: "Die Abtastrate bestimmt die Nyquist-Grenze; das praktische Hörspektrum reicht etwa von 20 Hz bis 20 kHz.",
    freqRange: "Frequenzbereich",
    estimatedContent: "Geschätzter Inhalt:",
    dynHelp: "Der Dynamikumfang vereint Crest-Faktor, Lautheitsbereich und Peak-zu-Rauschen-Abstand.",
    dynSnapshot: "Dynamik auf einen Blick",
    crest: "Crest {n} dB",
    lra: "LRA {n} LU (gegatet, ca.)",
    signalHelp: "Bitrate und Bittiefe beeinflussen die mögliche Qualität und den Headroom.",
    signal: "Signaleigenschaften",
    channels: "{rate} Hz, {ch} Kan.",
    kbps: "{n} kbps",
    bitrateNa: "Bitrate k. A.",
    bitDepth: "{n} Bit",
    bitDepthFloat: "{n} Bit Float",
    bitDepthNa: "Bittiefe k. A.",
    lossHelp: "Der geschätzte Höhenverlust wird aus dem gemessenen Inhalt im obersten Band gegenüber der Nyquist-Grenze abgeleitet.",
    lossEstimate: "Geschätzter Kompressionsverlust",
    lossOfBand: "{pct}% des Bands {band}",
    audible: "hörbar",
    rangeHelp: "Verhältnis von Peak zu Lautheit und Peak-zu-Rauschen-Abstand helfen, Punch und nutzbaren Dynamik-Headroom zu bewerten.",
    rangeDetail: "Bereichsdetail",
    peakToNoise: "Peak zu Rauschen: {value}",
    peakToLufs: "Peak zu LUFS: {value}",
    compressionAssessment: "Kompressionsbewertung",
    noAssessment: "Keine Bewertung verfügbar.",
    whyNa: "Warum manche Werte k. A. sind",
    metadataTags: "Metadaten-Tags",
    hiddenTags: { one: "{n} sperriges oder System-Tag ausgeblendet", other: "{n} sperrige oder System-Tags ausgeblendet" },
    noTags: "Keine eingebetteten Tags gefunden.",
    rawJson: "Rohe Metadaten als JSON zeigen"
  },
  hints: {
    lossUnavailable:
      "Keine Schätzung des Kompressionsverlusts, weil Codec-Metadaten oder die spektrale Schätzung fehlen oder dieser Lauf älter als der aktuelle Analyzer ist (neu analysieren zum Aktualisieren).",
    noiseStale:
      "Peak zu Rauschen und Grundrauschen sind ausgeblendet, weil dieser Lauf älter als die aktuelle Grundrauschen-Schätzung ist; analysiere neu, um sie zu messen.",
    noiseDigital:
      "Peak zu Rauschen ist nicht verfügbar, weil die Lücken digitale Stille sind und es kein Grundrauschen zu messen gibt.",
    noiseMasked:
      "Peak zu Rauschen ist nicht verfügbar, weil der Track keine leisen Lücken (Fades, Intros, Pausen) hat, aus denen sich ein Grundrauschen lesen lässt; die Musik verdeckt es.",
    peakLufs: "Peak zu LUFS ist nicht verfügbar, wenn die integrierte Lautheit undefiniert ist (sehr kurzes/stilles Material).",
    noTags: "In dieser Datei wurden keine eingebetteten Metadaten-Tags gefunden.",
    hiddenOnly: {
      one: "Keine beschreibenden eingebetteten Tags gefunden. {n} sperriges oder System-Tag ausgeblendet; öffne die rohen Metadaten als JSON, um es anzusehen.",
      other: "Keine beschreibenden eingebetteten Tags gefunden. {n} sperrige oder System-Tags ausgeblendet; öffne die rohen Metadaten als JSON, um sie anzusehen."
    }
  },
  kpi: {
    integratedHelp: "Integrierte LUFS: wahrgenommene Gesamtlautheit über den ganzen Track.",
    integrated: "Integrierte LUFS",
    truePeakHelp: "True Peak dBFS: überabgetastete Spitzenschätzung einschließlich Inter-Sample-Peaks.",
    truePeak: "True Peak dBFS",
    crestHelp: "Crest-Faktor: Transienten-Punch bzw. Spitzenkontrast relativ zum RMS-Pegel.",
    crest: "Crest-Faktor dB",
    noiseHelp:
      "Grundrauschen, gelesen aus Fades, Lücken und leisen Intros. Dichte Tracks ohne solche Passagen haben kein messbares Grundrauschen.",
    noise: "Grundrauschen dBFS",
    reanalyze: "Neu analysieren zum Messen",
    digitalSilence: "Lücken sind digitale Stille",
    masked: "Keine leisen Lücken; die Musik verdeckt es"
  },
  recs: {
    title: "Empfehlungen fürs Remastering",
    none: "Noch keine Empfehlungen fürs Remastering."
  },
  markers: {
    title: "Marker nahe Abspielposition / Auswahl",
    hint: "Klicke auf eine Marker-Zeile, um hinzuspringen und die Timeline-Auswahl zu setzen. Die Tabelle ist entdoppelt und nach Nähe zur Abspielposition sortiert."
  },
  chartStudio: {
    title: "Diagramm-Studio",
    viewFocus: "Ansichtsfokus",
    showing: { one: "{n} Feld angezeigt.", other: "{n} Felder angezeigt." },
    loadedOf: "{loaded} von {total} erwarteten Diagrammen geladen.",
    quickJump: "Schnellsprung",
    timelineTip: "Timeline-Tipp: Mit Rechtsklick und Ziehen im Diagrammbereich verschiebst du das gewählte Zeitfenster."
  },
  saveDialog: {
    title: "Dateien zum Speichern bereit",
    intro: "Wähle, wo jede umgewandelte/gemasterte Datei gespeichert wird.",
    later: "Später",
    conversion: "Umwandlung",
    mastering: "Mastering",
    saving: "Wird gespeichert...",
    saveAs: "Speichern unter...",
    quickDownload: "Schnell-Download",
    dismiss: "Ausblenden"
  },
  footer: {
    rights: "© {year} Geekatplay Studio. Alle Rechte vorbehalten.",
    version: "Music Suite • Erstellt von Geekatplay Studio • Version 1.0.0"
  },
  msg: {
    pickFile: "Wähle eine Audiodatei, um zu beginnen.",
    saved: "{name} gespeichert.",
    saveFailed: "{name} konnte nicht gespeichert werden: {reason}",
    saveTimedOut: "Der Speichern-Dialog hat zu lange gedauert. Browser-Download für {name} gestartet.",
    fetchRunsFailed: "Läufe konnten nicht abgerufen werden.",
    chartsPartial: "{loaded}/{total} Diagramme geladen. Fehlende werden erneut versucht: {missing}",
    noStageUpdate: " (seit {n} s keine Phasenänderung)",
    chartsLoading: "Analyse fertig. Diagramme werden geladen ({loaded}/{total})... Fehlend: {missing}",
    masteringProgress: "Mastering {status}... {pct}%",
    conversionProgress: "Umwandlung {status}... {pct}%",
    masteringFailed: "Mastering fehlgeschlagen.",
    conversionFailed: "Umwandlung fehlgeschlagen.",
    analysisComplete: "Analyse fertig.",
    analysisFailed: "Analyse fehlgeschlagen.",
    runProgress: "{status}... {pct}% | {ticker}",
    fetchRunFailed: "Laufdetails konnten nicht abgerufen werden.",
    outputsReady: {
      one: "Neue Datei bereit. Wähle, wo sie gespeichert wird.",
      other: "Neue Dateien bereit. Wähle, wo die {n} Dateien gespeichert werden."
    },
    uploading: "Wird hochgeladen...",
    uploaded: "{name} hochgeladen. Bereit zur Analyse.",
    uploadFailed: "Hochladen fehlgeschlagen.",
    analysisQueued: "Analyse in der Warteschlange.",
    analysisStartFailed: "Analyse konnte nicht gestartet werden.",
    pickFormat: "Wähle mindestens ein Zielformat für die Umwandlung.",
    queueingConversion: "Umwandlung wird eingereiht...",
    conversionQueued: "Umwandlung eingereiht: {formats}",
    conversionStartFailed: "Umwandlung konnte nicht gestartet werden.",
    queueingMastering: "Mastering wird eingereiht...",
    masteringQueued: "Mastering eingereiht ({mode}, {preset}, {backend}, Norm: {norm}, Eingangsgain: {gain} dB).",
    masteringStartFailed: "Mastering konnte nicht gestartet werden.",
    confirmHardReset:
      "Dienste hart zurücksetzen und alle Läufe löschen (auch aktive/wartende Jobs)? Wartende Worker werden abgebrochen.",
    confirmClear: "Laufverlauf aller nicht aktiven Läufe löschen?",
    hardResetting: "Dienste werden hart zurückgesetzt und der Verlauf gelöscht...",
    clearing: "Laufverlauf wird gelöscht...",
    cleared: { one: "{n} Lauf gelöscht.", other: "{n} Läufe gelöscht." },
    keptActive: { one: " ({n} aktiver Lauf behalten)", other: " ({n} aktive Läufe behalten)" },
    jobsReset: " Jobs zurückgesetzt: abgebrochen {cancelled}, laufend {running}.",
    hardResetFailed: "Dienste konnten nicht hart zurückgesetzt werden.",
    clearFailed: "Laufverlauf konnte nicht gelöscht werden.",
    appliedAdvice: "Vorgeschlagene Mastering-Einstellungen übernommen ({mode} / {preset} / {backend}).",
    playbackFailed: "Die Wiedergabe konnte nicht starten.",
    selectRunForEq: "Wähle einen Lauf, bevor du EQ-Audio exportierst.",
    sourceFetchFailed: "Quell-Audio konnte nicht abgerufen werden: {status}",
    noOfflineRendering: "Web-Audio-Offline-Rendering ist in diesem Browser nicht verfügbar.",
    eqExported: "EQ-Export fertig. Bearbeitete WAV gespeichert.",
    eqExportFailed: "EQ-Export fehlgeschlagen.",
    updateAvailable: "Ein Update für Music Suite ist verfügbar.",
    updateCheckFailed: "Update-Prüfung fehlgeschlagen.",
    updateInstallFailed: "Update-Installation fehlgeschlagen.",
    audioLoadFailed: "Die Audiowiedergabe für diesen Lauf konnte nicht geladen werden."
  },
  popout: {
    visual: "Visual AI",
    visualTitle: "Visual AI",
    charts: "die Diagramme",
    chartsTitle: "Diagramme"
  },
};
