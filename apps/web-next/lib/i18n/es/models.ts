import type { Dictionary } from "../index";

/** Models & engines (/models). */
export const models: Dictionary["models"] = {
  intro: "Motores y modelos de IA opcionales. Todo lo de aquí se ejecuta en este equipo; instalar nunca cambia lo que ya está instalado.",
  working: "Trabajando…",
  loadFailed: "No se pudo cargar Modelos y motores.",
  checking: "Revisando este equipo…",
  installFailed: "No se pudo iniciar la instalación.",
  installProgress: "Progreso de la instalación",
  readyReload: "Listo. Recarga las páginas del editor que tengas abiertas para usarlo.",
  computer: {
    heading: "Este equipo",
    gpu: "Tarjeta gráfica",
    gpuNone: "No se encontró: los modelos de IA se ejecutan en el procesador (más lento)",
    torch: "PyTorch (ejecuta los modelos de IA)",
    usingGpu: " · usando la GPU",
    willUseCuda: "No instalado · usará la GPU ({build})",
    willUseMps: "No instalado · usará la GPU de Apple",
    willUseCpu: "No instalado · usará el procesador"
  },
  notes: {
    install: "Instalar transcripción de notas con IA"
  },
  muscriptor: {
    title: "MuScriptor: un modelo para toda la mezcla (opcional)",
    bodyBefore: "Escucha la canción completa de una vez y reconoce hasta 35 instrumentos. Su modelo es gratuito, pero solo para",
    nonCommercial: "uso no comercial",
    bodyAfter:
      "(CC BY-NC 4.0), y sus condiciones prohíben transcribir música sobre la que no tengas derechos. Cuando esté listo, Canción completa a MIDI puede usarlo; elige el método Stems para trabajos que vendas.",
    ready: "Listo",
    readySize: "Listo · {size}",
    needsSignIn: "Requiere iniciar sesión",
    downloadedList: "Descargado: {list}.",
    signedIn: "Sesión iniciada; el modelo se descarga la primera vez que se usa.",
    sizeHint: "Define MUSIC_SUITE_MUSCRIPTOR_SIZE como small, medium o large para elegir un tamaño.",
    stepCode: "Instala su código:",
    stepTerms: "Acepta las condiciones de un tamaño en Hugging Face (cada tamaño por separado), por ejemplo",
    stepSignIn: "Inicia sesión en este equipo:",
    stepSignInAfter: "Iniciar sesión solo en el sitio web no basta.",
    stepRestart: "Reinicia Music Suite."
  },
  stems: {
    legend: "Modelos",
    onDemand: "Los modelos que no estén descargados aquí se descargan la primera vez que una separación los necesite.",
    downloadedSoFar: " Descargado hasta ahora: {size}.",
    install: "Instalar separación de stems con IA",
    downloadFailed: "No se pudo descargar el modelo.",
    deleteSize: "Eliminar {size}",
    deleteFailed: "No se pudieron eliminar los modelos.",
    deleteModels: "Eliminar modelos descargados",
    log: "Registro de instalación"
  },
  music: {
    heading: "Música con IA (Estudio de canciones IA)",
    label: "Música con IA",
    progress: "Progreso de la instalación del motor de música",
    engine: "Motor de música (ACE-Step 1.5)",
    engineNote: "Crea canciones completas con voz, sin conexión. Unos {gb} GB; necesita CMake y un compilador de C++.",
    editing: "Modelo de edición",
    editingNote: "Extraer un instrumento, añadir una parte, construir una canción alrededor de una parte. {gb} GB.",
    xl: "Modelo de alta calidad (XL)",
    xlNote: "Mejores canciones, un poco más lento. {gb} GB.",
    writer: "Letrista ({model})",
    writerReady: "Escribe letras y descripciones de estilo con Ollama.",
    writerMissing: "Necesita Ollama (ollama.com) en ejecución en este equipo.",
    settingsBefore: "Los límites de memoria, la sonoridad y los servicios en línea están en",
    settingsLink: "Estudio de canciones IA ▸ Ajustes"
  },
  hardware: {
    vulkan: " Se ejecuta en la tarjeta gráfica (Vulkan).",
    cuda: " Se ejecuta en la tarjeta gráfica (CUDA).",
    metal: " Se ejecuta en la GPU de Apple (Metal).",
    cpu: " Se ejecuta en el procesador.",
    cpuWithGpu:
      " Se ejecuta en el procesador, aunque este equipo tiene tarjeta gráfica: en Estudio de canciones IA ▸ Ajustes ▸ Descargas de modelos locales, marca “Recompilar el entorno” para ACE-Step y así compilarlo para la tarjeta (varias veces más rápido)."
  },
  instruments: {
    heading: "Instrumentos (Editor de estudio)",
    label: "Instrumentos",
    intro:
      "Sintetizadores gratuitos que tocan las notas de un clip MIDI. Cada descarga es un archivo de versión fijo del propio proyecto del instrumento, que se verifica antes de instalarse solo para tu usuario.",
    download: "Descarga: {size}.",
    platformOnly: "Solo macOS y Windows",
    progress: "Progreso de la instalación de {name}",
    useBefore: "Para usar uno, selecciona un clip MIDI en el",
    useMiddle: "y abre su sección Instrumento plug-in, o prueba los sonidos en",
    forDaws: "Hacerlo disponible también en mis otros programas de música (DAW)",
    forDawsHelp: "Lo instala en tu carpeta VST3. Si no lo marcas, se queda dentro de la carpeta de Music Suite y ningún otro programa lo ve.",
    ownCopy: "Instalado dentro de la carpeta de Music Suite: solo Music Suite ve esta copia.",
    sharedCopy: "Instalado en tu carpeta VST3: tus otros programas de música también lo ven."
  },
  terminal: {
    heading: "Desde una terminal",
    before: "Las mismas instalaciones funcionan desde la carpeta de Music Suite:",
    windowsOr: "(Windows) o",
    mac: "(macOS).",
    list: "muestra lo que está instalado. Instrumentos:"
  }
};
