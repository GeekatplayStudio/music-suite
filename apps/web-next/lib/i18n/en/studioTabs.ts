/** The AI Song Studio's other tabs and forms: settings, AI edit, album, plan editor, form fields. */
export const studioTabs = {
  settings: {
    failed: "That did not work. Please try again.",
    onThisComputer: "On this computer",
    optional: "Optional",
    keySources: {
      environment: "from an environment variable",
      keychain: "in this computer's keychain",
      file: "in a private file on this computer (no keychain was available)"
    },
    online: {
      terms: "Terms and pricing",
      on: "On. Key saved {source}. {message}",
      off:
        "Off. Adding your key switches it on. Your style text and lyrics are then sent to this service when you choose it as the generator; it bills your account. A clip's audio is uploaded only when you tick “Allow uploading” to edit it with ElevenLabs.",
      fromEnvironment: "To change it, edit the {env} environment variable.",
      keyLabel: "{name} API key",
      pasteNew: "Paste a new key to replace it",
      paste: "Paste your API key",
      replace: "Replace key",
      save: "Save key",
      remove: "Remove key"
    },
    engine: {
      title: "Local music engine",
      intro: "ACE-Step 1.5 generates full songs with vocals on this computer. Nothing you write or generate leaves it.",
      editingReady:
        "Editing model installed: AI edits in the Studio Editor can extract instruments, add parts and build songs around a part.",
      editingMissing:
        "Regenerate, extend and restyle work now. Extracting an instrument, adding a part or building a song around a part needs the editing model below.",
      installed: "Installed. It starts by itself when you generate and unloads after {minutes} idle minutes.",
      installedLoaded: "Installed and loaded. It starts by itself when you generate and unloads after {minutes} idle minutes.",
      builtNoModels: "The engine is built, but its models are missing.",
      notInstalled: "Not installed yet.",
      installSize: "Installing downloads about {gb} GB and takes a few minutes.",
      progress: "Install progress",
      keepUsing: "You can keep using Music Suite while this runs.",
      retry: "Try the install again",
      install: "Install local engine",
      qualityTitle: "A larger music model for new songs: about 25% slower and 0.6 GB more memory",
      quality: "Download high-quality model ({gb} GB)",
      editingTitle: "Needed in the Studio Editor to extract an instrument, add a part, or build a song around a part",
      editing: "Download editing model ({gb} GB)",
      unload: "Unload now",
      useQuality: "Use the high-quality (XL) model for new songs",
      useQualityHelp:
        "Measured here: a 2-minute song in 80 s instead of 63 s, using 5.0 GB instead of 4.4 GB. AI edits keep the standard model.",
      sources:
        "Installing fetches the engine's source code from GitHub (one fixed version) and its models from Hugging Face, and checks each model file against a known fingerprint. After that it works offline."
    },
    writer: {
      title: "Lyrics and style writer",
      intro: "A language model running in Ollama turns an idea into a style description and lyrics.",
      ready: "Ready, using {model}.",
      noModel: "Ollama is running, but the model “{model}” is not downloaded yet (about 8 GB).",
      noOllama:
        "Ollama is not running. Without it, the music engine's own planner writes a simpler draft. Get Ollama from ollama.com, start it, then come back here.",
      model: "Model",
      notDownloaded: "{model} (not downloaded)",
      download: "Download {model}",
      sizeNote: "Models much larger than 12 GB will not fit in memory next to the music engine on a 24 GB computer."
    },
    memory: {
      title: "Keeping your computer responsive",
      unknown: "Free memory could not be read on this system.",
      free: "{percent}% of memory is free right now.",
      oneAtATime: "One song generates at a time, and the lyrics model is unloaded before music starts.",
      minLabel: "Do not start below",
      minHelp: "Generation waits, then stops with a message, if less memory than this is free.",
      minUnit: "% free memory",
      idleLabel: "Unload the engine after",
      idleHelp: "The engine gives its memory back when it has not been used for this long.",
      idleUnit: "idle minutes"
    },
    loudness: {
      title: "Loudness of new songs",
      level: "Level each new song when it is imported",
      levelHelp: "One gain change towards the target, never letting peaks pass −1 dBTP. The dynamics are not touched.",
      target: "Target loudness",
      targetHelp: "−14 LUFS suits streaming services."
    },
    services: {
      title: "Online services",
      intro:
        "These run on the provider's servers with your own account. Each stays off until you add its key. Keys are kept on this computer and are never shown again, even here."
    },
    generators: {
      title: "Generators",
      on: "On",
      online: "Online service"
    }
  },
  aiEdit: {
    title: "AI edit",
    hint: "Change this clip with AI, on this computer or with an online service you have set up. Every change can be undone.",
    noEngine: "The local AI engine is not available.",
    installFromStudio: "Install it from AI Song Studio.",
    openStudio: "Open AI Song Studio",
    openSettings: "Open AI Song Studio Settings",
    hints: {
      restyle: "Recreate this recording with the described sound.",
      inpaint: "Regenerate the highlighted region using the description.",
      continue: "Generate additional music after the source recording.",
      reference: "Use this recording's sound to steer a new Magenta performance.",
      repaint: "Regenerates the highlighted part of this clip and keeps everything around it exactly as it is.",
      extend: "Adds new music before or after this clip that continues it.",
      cover: "Plays the same song in a new style.",
      extract: "Recreates one instrument from this clip on its own track. For exact stems, use Separate instead.",
      add_layer: "Writes a new instrument part that fits this clip, on its own track.",
      complete:
        "Builds a full arrangement around this part, for example a band around a vocal. Works best on a single part, such as a stem from Separate.",
      stem: "Generate a replacement performance from this stem. Notes and timing may change."
    },
    titles: {
      repaint: "regenerated",
      extend: "extended",
      cover: "restyled",
      extract: "extracted",
      add_layer: "new part",
      complete: "full song"
    },
    extractedTitle: "{instrument} (from {clip})",
    newPartTitle: "New {instrument} part",
    reconstruct: "AI reconstruct this stem",
    generator: "Generator",
    generatorLabel: "Generator for the AI edit",
    whatToDo: "What to do",
    needsEditing: " (needs the editing model)",
    abc: "Reviewed source melody (ABC score)",
    abcLabel: "Cover melody ABC score",
    abcHelp: "YuE2 follows this score. Review the source melody, chords and lyric phrasing before rendering.",
    abcTerms: "My use complies with the YuE2 model terms and creator permissions",
    unreverse: "Un-reverse the clip first.",
    needSelection: "Highlight at least one second of this clip with the Range tool (R), then come back here.",
    section: "Section: {start} s to {end} s of the clip's audio",
    instrumentOut: "Instrument to pull out",
    partToAdd: "Part to add",
    clipIs: "This clip is",
    instrument: "Instrument",
    newStyle: "New style",
    describeOptional: "Describe it (optional)",
    style: "Style",
    styleLabel: "Style for the AI edit",
    coverPlaceholder: "e.g. lo-fi hip hop, dusty drums, mellow piano",
    stylePlaceholder: "e.g. warm acoustic folk, male vocal",
    lyrics: "Lyrics (optional)",
    lyricsLabel: "Lyrics for the AI edit",
    lyricsPlaceholder: "Leave empty for an instrumental part",
    checkpointLimit: "This checkpoint supports at most {seconds} seconds.",
    diffLimit: "DiffRhythm supports at most 285 seconds.",
    modelControls: "Model controls",
    add: "Add",
    where: "Where",
    afterEnd: "After the end",
    beforeStart: "Before the start",
    keep: "Keep",
    faithful: "Stay close to the original (keeps melody and timing, changes the production)",
    faithfulSection: "Stay close to the original section",
    allowUpload:
      "Allow uploading this clip's audio to {service} if it was not made there. The upload is billed like generating the same length.",
    prices: "Prices as of {date}",
    versions: "Versions",
    versionsHelp: "The first version replaces or adds the clip; the others go on muted tracks to compare."
  },
  album: {
    status: {
      queued: "Waiting",
      writing: "Writing",
      generating: "Generating",
      done: "Done",
      failed: "Failed",
      cancelled: "Cancelled",
      running: "Running",
      partial: "Partly done"
    },
    untitled: "Untitled album",
    startFailed: "The album could not be started.",
    placeFailed: "The songs could not be placed in the editor.",
    cancelFailed: "Could not cancel.",
    removeFailed: "Could not remove.",
    newAlbum: "New album",
    make: "Make an album",
    intro:
      "Give one idea per song. The songs are written and generated one after another in the background, so you can close this page or leave it overnight; an album also continues after Music Suite restarts.",
    noGenerator: "No generator is ready. Install the local engine or add an online service in Settings.",
    albumTitle: "Album title",
    titlePlaceholder: "Night Drives",
    generator: "Generator",
    about: "What the album is about",
    aboutPlaceholder: "A synth-pop album about driving through a city at night, from leaving to sunrise.",
    sharedStyle: "Shared style",
    stylePlaceholder: "dreamy synth-pop, airy female vocal, analog synths",
    songs: "Songs, one idea per line ({count} of up to {max})",
    songsLabel: "Songs, one idea per line",
    songsPlaceholder: "Leaving the city lights behind\nThe empty coastal road\nA gas station at 3 a.m.\nSunrise over the bridge",
    eachAbout: "Each song about",
    lengthLabel: "Length of each song in seconds",
    seconds: "seconds",
    instrumental: "Instrumental",
    writeLyrics: "Write lyrics and style for each song",
    onlineCost: {
      one: "About ${usd} for {n} song on your account (prices as of {date}).",
      other: "About ${usd} for {n} songs on your account (prices as of {date})."
    },
    localTime: {
      one: "Roughly {n} minute on this computer, one song at a time.",
      other: "Roughly {n} minutes on this computer, one song at a time."
    },
    makeSongs: {
      one: "Make {n} song",
      other: "Make {n} songs"
    },
    makeNone: "Make songs",
    albums: "Albums",
    loading: "Loading albums…",
    none: "No albums yet.",
    albumLabel: "Album {title}",
    ready: "{status} · {done} of {total} songs ready",
    openEditor: "Open in Studio Editor",
    stop: "Stop",
    removeLabel: "Remove album {title} from the list",
    removeTitle: "Remove from the list (the project and songs are kept)",
    footer: "Each album is its own project. Opening it places the finished songs one after another on separate tracks.",
    allProjects: "All projects"
  },
  form: {
    auto: "Auto",
    timestamp: "Timestamp lyrics",
    timestampHelp: "Draft timings use line length. Review the timestamps and phrasing before generating.",
    insertSection: "Insert a section tag",
    lyricsPlaceholder: "[Verse]\nYour words here…\n\n[Chorus]\n…",
    settingsCount: {
      one: "{n} setting",
      other: "{n} settings"
    }
  },
  plan: {
    title: "Song plan",
    intro: "Optional. Shape the song section by section. With a plan, the Length and Lyrics fields above are not used.",
    draftAgain: "Draft again",
    draft: "Draft a plan (free)",
    clear: "Clear plan",
    section: "Section",
    seconds: "Seconds",
    follow: "Follow neighbours",
    closely: "Closely",
    somewhat: "Somewhat",
    loosely: "Loosely",
    moveUp: "Move section {n} up",
    moveDown: "Move section {n} down",
    remove: "Remove section {n}",
    lyrics: "Lyrics (one line per sung line; leave empty for instrumental)",
    styles: "Styles",
    stylesFirst: "Styles (sets the genre — use several)",
    stylesPlaceholder: "e.g. dream pop, airy female vocal, analog synths",
    avoid: "Avoid",
    avoidPlaceholder: "e.g. distorted guitars",
    add: "Add a section",
    total: {
      one: "{n} section · {length} of up to {max} min",
      other: "{n} sections · {length} of up to {max} min"
    }
  }
};
