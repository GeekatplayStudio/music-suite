import type { Dictionary } from "../index";

/** Panels moved into windows of their own (components/detachable.tsx). */
export const detach: Dictionary["detach"] = {
  detach: "{panel} in eigenem Fenster öffnen (für einen weiteren Monitor)",
  attach: "{panel} zurück in die Seite holen",
  away: "{panel}: in eigenem Fenster geöffnet.",
  bringBack: "Zurückholen",
  floatNamed: "„{panel}“ in eigenem Fenster öffnen",
  dockNamed: "„{panel}“ zurück in die Seite holen",
  menu: {
    heading: "Bedienfelder dieser Seite",
    none: "Auf dieser Seite lässt sich nichts lösen.",
    float: "Lösen",
    dock: "Andocken",
    reopen: "Gelöste wieder öffnen",
    dockAll: "Alle andocken",
    auto: "Gelöste Bedienfelder mit ihrer Seite öffnen",
    note: "Ein gelöstes Bedienfeld bekommt ein eigenes Fenster: verschieben, Größe ändern oder auf einen anderen Monitor ziehen. Music Suite merkt sich, wo jedes hingehört. Damit sie sich selbst öffnen, erlaube Pop-ups für Music Suite.",
    blocked: "Der Browser hat für diesen Klick nur ein Fenster geöffnet. Erlaube Pop-ups für Music Suite (Symbol rechts in der Adressleiste), um alle auf einmal zu öffnen."
  },
  warning:
    "Das Bedienfeld öffnet sich in einem eigenen Fenster, das du auf einen anderen Monitor ziehen kannst.\n\nJedes zusätzliche Fenster ist eine weitere Seite, die der Computer zeichnen muss. Das kostet mehr Arbeitsspeicher, Prozessor- und Grafikleistung, besonders mit Live-Pegelanzeigen, Visuals oder der Spektralansicht. Schließe das Fenster (oder nutze „Zurückholen“), um das Bedienfeld zurückzuholen.\n\nÖffnen?",
  blocked: "Der Browser hat das neue Fenster blockiert. Erlaube Pop-ups für Music Suite und versuche es erneut.",
  titles: {
    arrange: "Spuren und Timeline",
    summary: "Übersicht",
    loudness: "Lautheitswerte",
    song: "Song-Einstellungen",
    results: "Ergebnisse",
    synthControls: "Synth-Regler",
    inspector: "Inspector",
    lower: "Piano Roll und Ansichten",
    keys: "Bildschirmklavier"
  },
  emptyLower: "Wähle einen Noten-Clip (oder öffne die Spektralansicht), dann erscheint er hier.",
  panels: {
    arrange: "Spuren und Timeline",
    inspector: "Inspector",
    lower: "Piano Roll und Ansichten",
    keys: "Bildschirmklavier"
  }
};
