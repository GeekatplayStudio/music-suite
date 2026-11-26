/** Models & engines (/models). */
export const models = {
  intro: "Optional engines and AI models. Everything here runs on this computer; installing never changes what is already installed.",
  working: "Working…",
  loadFailed: "Models & engines could not be loaded.",
  checking: "Checking this computer…",
  installFailed: "The install could not be started.",
  installProgress: "Install progress",
  readyReload: "Ready. Reload open editor pages to use it.",
  computer: {
    heading: "This computer",
    gpu: "Graphics card",
    gpuNone: "None found: AI models run on the processor (slower)",
    torch: "PyTorch (runs the AI models)",
    usingGpu: " · using the GPU",
    willUseCuda: "Not installed · will use the GPU ({build})",
    willUseMps: "Not installed · will use the Apple GPU",
    willUseCpu: "Not installed · will use the processor"
  },
  notes: {
    install: "Install AI note transcription"
  },
  muscriptor: {
    title: "MuScriptor: one model for the whole mix (optional)",
    bodyBefore: "Hears the full song at once and names up to 35 instruments. Its model is free but for",
    nonCommercial: "non-commercial use only",
    bodyAfter:
      "(CC BY-NC 4.0), and its terms forbid transcribing music you have no rights to. When it is ready, Whole song to MIDI can use it; choose the Stems method for work you sell.",
    ready: "Ready",
    readySize: "Ready · {size}",
    needsSignIn: "Needs sign-in",
    downloadedList: "Downloaded: {list}.",
    signedIn: "Signed in; the model downloads the first time it is used.",
    sizeHint: "Set MUSIC_SUITE_MUSCRIPTOR_SIZE to small, medium or large to choose a size.",
    stepCode: "Install its code:",
    stepTerms: "Accept the terms for a size on Hugging Face (each size separately), for example",
    stepSignIn: "Sign in on this computer:",
    stepSignInAfter: "Signing in on the website alone is not enough.",
    stepRestart: "Restart Music Suite."
  },
  stems: {
    legend: "Models",
    onDemand: "Models not downloaded here download the first time a split needs them.",
    downloadedSoFar: " Downloaded so far: {size}.",
    install: "Install AI stem separation",
    downloadFailed: "The model could not be downloaded.",
    deleteSize: "Delete {size}",
    deleteFailed: "The models could not be deleted.",
    deleteModels: "Delete downloaded models",
    log: "Install log"
  },
  music: {
    heading: "AI music (AI Song Studio)",
    label: "AI music",
    progress: "Music engine install progress",
    engine: "Music engine (ACE-Step 1.5)",
    engineNote: "Makes full songs with vocals, offline. About {gb} GB; needs CMake and a C++ compiler.",
    editing: "Editing model",
    editingNote: "Extract an instrument, add a part, build a song around a part. {gb} GB.",
    xl: "High-quality (XL) model",
    xlNote: "Better songs, a little slower. {gb} GB.",
    writer: "Lyrics writer ({model})",
    writerReady: "Writes lyrics and style descriptions with Ollama.",
    writerMissing: "Needs Ollama (ollama.com) running on this computer.",
    settingsBefore: "Memory limits, loudness and online services are in",
    settingsLink: "AI Song Studio ▸ Settings"
  },
  hardware: {
    vulkan: " Runs on the graphics card (Vulkan).",
    cuda: " Runs on the graphics card (CUDA).",
    metal: " Runs on the Apple GPU (Metal).",
    cpu: " Runs on the processor.",
    cpuWithGpu:
      " Runs on the processor, although this computer has a graphics card: in AI Song Studio ▸ Settings ▸ Local model downloads, tick “Rebuild runtime” for ACE-Step to build it for the card (several times faster)."
  },
  instruments: {
    heading: "Instruments (Studio Editor)",
    label: "Instruments",
    intro:
      "Free synthesizers that play the notes of a MIDI clip. Each download is a fixed release file from the instrument's own project, checked before it is installed for your user only.",
    download: "Download: {size}.",
    platformOnly: "macOS and Windows only",
    progress: "{name} install progress",
    useBefore: "To use one, select a MIDI clip in the",
    useMiddle: "and open its Plugin instrument section, or try the sounds in"
  },
  terminal: {
    heading: "From a terminal",
    before: "The same installs work from the Music Suite folder:",
    windowsOr: "(Windows) or",
    mac: "(macOS).",
    list: "shows what is installed. Instruments:"
  }
};
