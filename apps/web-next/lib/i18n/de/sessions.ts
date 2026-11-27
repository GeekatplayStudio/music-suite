import type { Dictionary } from "../index";

/** Studio Editor sessions page and the "Where should this song go?" chooser. */
export const sessions: Dictionary["sessions"] = {
  title: "Studio-Editor",
  tagline: "Mehrspur-Bearbeitung, Stem-Trennung, Reparatur und KI-Abgleich. Alles bleibt auf diesem Rechner.",
  untitled: "Unbenannte Session",
  newName: "Name der neuen Session",
  newSession: "Neue Session",
  openFile: "Projektdatei öffnen…",
  list: "Sessions",
  empty: "Noch keine Sessions. Lege oben eine an oder öffne einen Song aus dem Music-Suite-Arbeitsbereich.",
  deleteNamed: "{name} löschen",
  deleteSession: "Session löschen",
  errors: {
    load: "Projekte konnten nicht geladen werden.",
    create: "Das Projekt konnte nicht angelegt werden.",
    open: "Die Projektdatei konnte nicht geöffnet werden.",
    place: "Der Song konnte der Session nicht hinzugefügt werden.",
    delete: "Das Projekt konnte nicht gelöscht werden."
  },
  place: {
    region: "Wohin der Song soll",
    thisSong: "diesen Song",
    heading: "Wohin soll „{name}“?",
    added: "Er kommt auf eine neue Spur. Nichts, was schon in einer Session ist, wird ersetzt.",
    split: "Beim Öffnen in Stems trennen",
    splitHint:
      "Gesang, Drums, Bass und der Rest, jeweils auf eigener Spur – bereit zum Samplen, für MIDI oder zum Neuaufbau mit KI. Das Original bleibt stumm darüber.",
    howFar: "Wie weit",
    howMany: "Wie viele Stems",
    auto: { one: "So viele, wie dieser Rechner schafft ({n} Stem)", other: "So viele, wie dieser Rechner schafft ({n} Stems)" },
    two: "2 Stems: Gesang und Instrumental",
    four: "4 Stems: Gesang, Drums, Bass, Sonstiges",
    six: "6 Stems: dazu Gitarre und Klavier",
    full: "Alles: 12 Stems mit einzelnen Drum-Teilen und Lead-/Backing-Vocals",
    moreStems: "Mehr Stems mit KI-Stem-Trennung",
    newSession: "Neue Session „{name}“",
    orAdd: "Oder zu einer Session hinzufügen",
    openHere: "Öffnen (ist schon hier)",
    addHere: "Hier hinzufügen",
    noOthers: "Noch keine anderen Sessions."
  }
};
