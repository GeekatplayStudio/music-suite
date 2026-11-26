/** Studio Editor sessions page and the "Where should this song go?" chooser. */
export const sessions = {
  title: "Studio Editor",
  tagline: "Multitrack editing, stem separation, repair and AI matching. Everything stays on this machine.",
  untitled: "Untitled session",
  newName: "New session name",
  newSession: "New session",
  openFile: "Open a project file…",
  list: "Sessions",
  empty: "No sessions yet. Create one above, or open a song from the Music Suite workspace.",
  deleteNamed: "Delete {name}",
  deleteSession: "Delete session",
  errors: {
    load: "Could not load projects.",
    create: "The project could not be created.",
    open: "The project file could not be opened.",
    place: "The song could not be added to the session.",
    delete: "The project could not be deleted."
  },
  place: {
    region: "Where should the song go",
    thisSong: "this song",
    heading: "Where should “{name}” go?",
    added: "It is added on a new track. Nothing already in a session is replaced.",
    split: "Split it into stems when it opens",
    splitHint:
      "Vocals, drums, bass and the rest, each on its own track, ready to sample, turn into MIDI or rebuild with AI. The original stays, muted, above them.",
    howFar: "How far",
    howMany: "How many stems",
    auto: { one: "As many as this computer can ({n} stem)", other: "As many as this computer can ({n} stems)" },
    two: "2 stems: vocals and instrumental",
    four: "4 stems: vocals, drums, bass, other",
    six: "6 stems: adds guitar and piano",
    full: "Everything: 12 stems with drum kit pieces and lead/backing vocals",
    moreStems: "More stems with AI stem separation",
    newSession: "New session “{name}”",
    orAdd: "Or add it to a session",
    openHere: "Open (it is here)",
    addHere: "Add here",
    noOthers: "No other sessions yet."
  }
};
