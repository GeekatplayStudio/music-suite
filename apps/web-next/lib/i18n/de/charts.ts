import type { Dictionary } from "../index";

/** Shared analysis views: charts, tables, equaliser, visuals, review strip, help page, mapper. */
export const charts: Dictionary["charts"] = {
  visualizer: {
    subtitle: "Frequenz, Wellenform und Energie in Echtzeit",
    modes: {
      spectrum: "Spektrum",
      orbit: "Orbit",
      waveform: "Wellenform"
    },
    fullscreen: "Visualizer im Vollbild",
    canvas: "Live-Audiovisualisierung",
    playVisualizer: "Visualizer abspielen",
    play: "Abspielen",
    pause: "Pause",
    ready: "Bereit",
    bass: "Bass {value}%",
    mid: "Mitten {value}%",
    high: "Höhen {value}%",
    cannotStart: "Wiedergabe des Visualizers konnte nicht gestartet werden.",
    cannotLoad: "Das gewählte Audio konnte nicht geladen werden."
  },
  plot: {
    renderError: "Fehler beim Zeichnen des Diagramms: {message}",
    noData: "Für diesen Lauf sind keine Diagrammdaten verfügbar.",
    /** Plotly's own toolbar and hints (its English text is the key it looks up). */
    toolbar: {
      zoom: "Zoom",
      pan: "Verschieben",
      zoomIn: "Vergrößern",
      zoomOut: "Verkleinern",
      autoscale: "Automatisch skalieren",
      resetAxes: "Achsen zurücksetzen",
      download: "Diagramm als PNG herunterladen",
      spikes: "Hilfslinien",
      closest: "Nächsten Wert anzeigen",
      compare: "Werte beim Überfahren vergleichen",
      boxSelect: "Rechteckauswahl",
      lasso: "Lassoauswahl",
      doubleClick: "Doppelklick zum Herauszoomen"
    }
  },
  equalizer: {
    title: "Optionaler Equalizer",
    intro: "Höre die geladene Datei über eine manuelle EQ-Kurve ab und exportiere das Ergebnis als WAV.",
    enable: "EQ aktivieren",
    reset: "EQ zurücksetzen",
    exporting: "EQ-WAV wird exportiert…",
    export: "EQ-WAV exportieren"
  },
  review: {
    title: "Wellenform-Prüfleiste",
    intro: "Klicke zum Scrubben. Mit den Tasten Start und Ende unten markierst du das aktive Prüffenster.",
    playhead: "Abspielposition {time} s",
    selection: "Auswahl {start} s bis {end} s"
  },
  table: {
    empty: "Keine Zeilen."
  },
  helpLink: "Hilfe: {label}",
  help: {
    subtitle: "{title}: wie jeder Teil der App funktioniert und was jede Einstellung bewirkt.",
    analyser: "Analyse & Mastering",
    search: "Handbuch durchsuchen",
    clear: "Suche löschen",
    contents: "Inhalt",
    noMatch: "Nichts im Handbuch passt dazu."
  },
  mapper: {
    title: "Song-Geometrie",
    loaded: "Geladener Song: {name}",
    none: "Lade hier einen Song oder kehre zu Music Suite zurück, um einen auszuwählen."
  },
  notFound: {
    title: "Seite nicht gefunden",
    body: "Die angeforderte Seite gibt es in diesem Arbeitsbereich nicht."
  }
};
