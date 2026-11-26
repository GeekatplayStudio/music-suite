/** AI Song Studio main page (components/generation/generate-studio.tsx). */
export const studio = {
  header: {
    subtitle: "Describe a song, edit the lyrics, and generate it on this computer. Results open in the Studio Editor.",
    backToEditor: "Back to the editor"
  },
  tabs: {
    label: "AI Song Studio sections",
    create: "Create",
    live: "Live",
    album: "Album",
    history: "History",
    settings: "Settings"
  },
  errors: {
    load: "AI generation could not be loaded.",
    draftPlan: "The plan could not be drafted.",
    estimate: "The cost could not be estimated.",
    write: "The song could not be written.",
    start: "Generation could not be started.",
    place: "The song was generated, but could not be placed on the timeline. Add it from the editor's asset list.",
    failed: "Generation failed.",
    read: "The song could not be read. You can still use it; fill in the form yourself.",
    upload: "The song could not be uploaded.",
    analyse: "The song could not be sent to the analyser.",
    bringIn: "The song could not be brought in.",
    history: "History could not be loaded.",
    removeEntry: "The entry could not be removed.",
    installStart: "The install could not be started."
  },
  writer: {
    ollama: "Written on this computer by {model}. Edit anything before generating.",
    planner: "Drafted by the music engine's planner. For fuller lyrics, set up Ollama in Settings.",
    abcReady: "The composition plan is ready. Review and edit the ABC score, then generate the song."
  },
  defaults: {
    songTitle: "Generated song",
    liveTake: "Magenta live take",
    songName: "Song",
    theSong: "the song",
    newVersion: "{name} (new version)"
  },
  sourceStatus: {
    reading: "Reading tempo, key and style…",
    uploading: "Uploading {name}…",
    bringing: "Bringing in {name}…"
  },
  send: {
    label: "Send {name}",
    add: "Add to a session",
    addTitle: "Add it on a new track in a new or existing editor session",
    split: "Split into stems",
    splitTitle: "Add it to a session and split it into vocals, drums, bass and the rest",
    analyse: "Analyse",
    analyseTitle: "Open a copy in the analyser and measure it",
    startFrom: "Start a song from it",
    startFromTitle: "Make another song from this one: restyle, extend, add a part…"
  },
  result: {
    label: "Result: {title}",
    versions: { one: "{n} version", other: "{n} versions" },
    madeIn: "made in {time}",
    openEditor: "Open in Studio Editor",
    seed: "seed {seed}",
    play: "Play {name}",
    keepSeed: "Keep this seed for the next version"
  },
  history: {
    label: "Generation history",
    loading: "Loading history…",
    empty: "Nothing generated yet. Songs you make appear here with the settings that made them.",
    useSettings: "Use these settings",
    openProject: "Open project",
    removeLabel: "Remove {title} from history",
    removeTitle: "Remove from history (the audio stays in its project)"
  },
  install: {
    heading: "One step before your first song",
    body: "The local music engine is not installed yet. Installing downloads about {gb} GB and takes a few minutes. After that, songs are made on this computer, offline.",
    progress: "Install progress",
    retry: "Try the install again",
    install: "Install local engine"
  },
  generator: {
    label: "Generator",
    notReady: " — not ready"
  },
  idea: {
    heading: "Start from an idea",
    describe: "Describe the song you want",
    placeholder: "A late-night drive along the coast after a breakup, hopeful by the end. Dreamy synth-pop, female voice.",
    writing: "Writing… (about 30 s)",
    write: "Write style and lyrics",
    hint: "Optional. Fills the form below; you can also type everything yourself."
  },
  form: {
    title: "Song title",
    titlePlaceholder: "Untitled song",
    abc: "Draft editable ABC score",
    revise: "How to change the lyrics",
    revisePlaceholder: "Change the lyrics: e.g. “add a bridge”, “make the chorus simpler”, “translate to Spanish”",
    rewrite: "Rewrite"
  },
  bar: {
    working: "Working…",
    progress: "Generation progress",
    estimate: "About {time} on this computer. One song at a time.",
    notReady: "Not ready to send yet: {error}",
    prices: "Prices as of {date}",
    taskFrom: "{task} from “{name}”",
    makeIt: "Make it",
    generate: "Generate",
    generateInStyle: "Generate in its style",
    generateIntoProject: "Generate into this project"
  },
  allOff: "Every generator is switched off. Turn one on in Settings."
};
