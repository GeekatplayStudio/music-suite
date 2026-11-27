import type { Dictionary } from "../index";

/** The AI Song Studio's other tabs and forms: settings, AI edit, album, plan editor, form fields. */
export const studioTabs: Dictionary["studioTabs"] = {
  settings: {
    failed: "No funcionó. Inténtalo de nuevo.",
    onThisComputer: "En este equipo",
    optional: "Opcional",
    keySources: {
      environment: "desde una variable de entorno",
      keychain: "en el llavero de este equipo",
      file: "en un archivo privado de este equipo (no había llavero disponible)"
    },
    online: {
      terms: "Condiciones y precios",
      on: "Activado. Clave guardada {source}. {message}",
      off:
        "Desactivado. Al añadir tu clave se activa. Entonces tu texto de estilo y tu letra se envían a este servicio cuando lo eliges como generador; se cobra a tu cuenta. El audio de un clip solo se sube cuando marcas “Permitir subir” para editarlo con ElevenLabs.",
      fromEnvironment: "Para cambiarla, edita la variable de entorno {env}.",
      keyLabel: "Clave de API de {name}",
      pasteNew: "Pega una clave nueva para reemplazarla",
      paste: "Pega tu clave de API",
      replace: "Reemplazar clave",
      save: "Guardar clave",
      remove: "Quitar clave"
    },
    engine: {
      title: "Motor de música local",
      intro: "ACE-Step 1.5 genera canciones completas con voz en este equipo. Nada de lo que escribes o generas sale de él.",
      editingReady:
        "Modelo de edición instalado: las ediciones con IA del Editor de estudio pueden extraer instrumentos, añadir partes y construir canciones alrededor de una parte.",
      editingMissing:
        "Regenerar, alargar y cambiar el estilo ya funcionan. Extraer un instrumento, añadir una parte o construir una canción alrededor de una parte necesita el modelo de edición de abajo.",
      installed: "Instalado. Se inicia solo cuando generas y se descarga de memoria tras {minutes} minutos de inactividad.",
      installedLoaded: "Instalado y cargado. Se inicia solo cuando generas y se descarga de memoria tras {minutes} minutos de inactividad.",
      builtNoModels: "El motor está compilado, pero faltan sus modelos.",
      notInstalled: "Aún no está instalado.",
      installSize: "La instalación descarga unos {gb} GB y tarda unos minutos.",
      progress: "Progreso de la instalación",
      keepUsing: "Puedes seguir usando Music Suite mientras tanto.",
      retry: "Reintentar la instalación",
      install: "Instalar motor local",
      qualityTitle: "Un modelo de música más grande para canciones nuevas: un 25% más lento y 0,6 GB más de memoria",
      quality: "Descargar modelo de alta calidad ({gb} GB)",
      editingTitle: "Necesario en el Editor de estudio para extraer un instrumento, añadir una parte o construir una canción alrededor de una parte",
      editing: "Descargar modelo de edición ({gb} GB)",
      unload: "Descargar de memoria ahora",
      useQuality: "Usar el modelo de alta calidad (XL) para canciones nuevas",
      useQualityHelp:
        "Medido aquí: una canción de 2 minutos en 80 s en lugar de 63 s, usando 5,0 GB en lugar de 4,4 GB. Las ediciones con IA siguen con el modelo estándar.",
      sources:
        "La instalación obtiene el código fuente del motor desde GitHub (una versión fija) y sus modelos desde Hugging Face, y comprueba cada archivo de modelo con una huella conocida. Después funciona sin conexión."
    },
    writer: {
      title: "Escritor de letras y estilo",
      intro: "Un modelo de lenguaje que se ejecuta en Ollama convierte una idea en una descripción de estilo y una letra.",
      ready: "Listo, usando {model}.",
      noModel: "Ollama está en ejecución, pero el modelo “{model}” aún no está descargado (unos 8 GB).",
      noOllama:
        "Ollama no está en ejecución. Sin él, el planificador propio del motor de música escribe un borrador más simple. Descarga Ollama de ollama.com, inícialo y vuelve aquí.",
      model: "Modelo",
      notDownloaded: "{model} (no descargado)",
      download: "Descargar {model}",
      sizeNote: "Los modelos de mucho más de 12 GB no caben en memoria junto al motor de música en un equipo de 24 GB."
    },
    memory: {
      title: "Mantener tu equipo ágil",
      unknown: "No se pudo leer la memoria libre en este sistema.",
      free: "Ahora mismo hay un {percent}% de memoria libre.",
      oneAtATime: "Se genera una canción a la vez, y el modelo de letras se descarga de memoria antes de que empiece la música.",
      minLabel: "No empezar por debajo de",
      minHelp: "Si hay menos memoria libre que esto, la generación espera y luego se detiene con un mensaje.",
      minUnit: "% de memoria libre",
      idleLabel: "Descargar el motor de memoria tras",
      idleHelp: "El motor libera su memoria cuando no se ha usado durante este tiempo.",
      idleUnit: "minutos de inactividad"
    },
    loudness: {
      title: "Sonoridad de las canciones nuevas",
      level: "Nivelar cada canción nueva al importarla",
      levelHelp: "Un solo cambio de ganancia hacia el objetivo, sin dejar que los picos pasen de −1 dBTP. La dinámica no se toca.",
      target: "Sonoridad objetivo",
      targetHelp: "−14 LUFS es adecuado para servicios de streaming."
    },
    services: {
      title: "Servicios en línea",
      intro:
        "Se ejecutan en los servidores del proveedor con tu propia cuenta. Cada uno sigue desactivado hasta que añadas su clave. Las claves se guardan en este equipo y nunca se vuelven a mostrar, ni siquiera aquí."
    },
    generators: {
      title: "Generadores",
      on: "Activado",
      online: "Servicio en línea"
    }
  },
  aiEdit: {
    title: "Edición con IA",
    hint: "Cambia este clip con IA, en este equipo o con un servicio en línea que hayas configurado. Todos los cambios se pueden deshacer.",
    noEngine: "El motor de IA local no está disponible.",
    installFromStudio: "Instálalo desde el Estudio de canciones IA.",
    openStudio: "Abrir el Estudio de canciones IA",
    openSettings: "Abrir los ajustes del Estudio de canciones IA",
    hints: {
      restyle: "Recrea esta grabación con el sonido descrito.",
      inpaint: "Regenera la región resaltada según la descripción.",
      continue: "Genera música adicional después de la grabación de origen.",
      reference: "Usa el sonido de esta grabación para guiar una nueva interpretación de Magenta.",
      repaint: "Regenera la parte resaltada de este clip y deja todo lo que la rodea exactamente como está.",
      extend: "Añade música nueva antes o después de este clip que lo continúa.",
      cover: "Toca la misma canción en un estilo nuevo.",
      extract: "Recrea un instrumento de este clip en su propia pista. Para stems exactos, usa Separar.",
      add_layer: "Escribe una nueva parte de instrumento que encaje con este clip, en su propia pista.",
      complete:
        "Construye un arreglo completo alrededor de esta parte, por ejemplo una banda alrededor de una voz. Funciona mejor con una sola parte, como un stem de Separar.",
      stem: "Genera una interpretación de reemplazo a partir de este stem. Las notas y el tiempo pueden cambiar."
    },
    titles: {
      repaint: "regenerado",
      extend: "alargado",
      cover: "nuevo estilo",
      extract: "extraído",
      add_layer: "parte nueva",
      complete: "canción completa"
    },
    extractedTitle: "{instrument} (de {clip})",
    newPartTitle: "Nueva parte de {instrument}",
    reconstruct: "Reconstruir este stem con IA",
    generator: "Generador",
    generatorLabel: "Generador para la edición con IA",
    whatToDo: "Qué hacer",
    needsEditing: " (necesita el modelo de edición)",
    abc: "Melodía de origen revisada (partitura ABC)",
    abcLabel: "Partitura ABC de la melodía del cover",
    abcHelp: "YuE2 sigue esta partitura. Revisa la melodía de origen, los acordes y el fraseo de la letra antes de generar.",
    abcTerms: "Mi uso cumple las condiciones del modelo YuE2 y los permisos de los autores",
    unreverse: "Quita primero la inversión del clip.",
    needSelection: "Resalta al menos un segundo de este clip con la herramienta Rango (R) y vuelve aquí.",
    section: "Sección: de {start} s a {end} s del audio del clip",
    instrumentOut: "Instrumento que extraer",
    partToAdd: "Parte que añadir",
    clipIs: "Este clip es",
    instrument: "Instrumento",
    newStyle: "Nuevo estilo",
    describeOptional: "Descríbelo (opcional)",
    style: "Estilo",
    styleLabel: "Estilo para la edición con IA",
    coverPlaceholder: "p. ej., lo-fi hip hop, dusty drums, mellow piano",
    stylePlaceholder: "p. ej., warm acoustic folk, male vocal",
    lyrics: "Letra (opcional)",
    lyricsLabel: "Letra para la edición con IA",
    lyricsPlaceholder: "Déjalo vacío para una parte instrumental",
    checkpointLimit: "Este checkpoint admite como máximo {seconds} segundos.",
    diffLimit: "DiffRhythm admite como máximo 285 segundos.",
    modelControls: "Controles del modelo",
    add: "Añadir",
    where: "Dónde",
    afterEnd: "Después del final",
    beforeStart: "Antes del inicio",
    keep: "Conservar",
    faithful: "Mantenerse cerca del original (conserva la melodía y el tiempo, cambia la producción)",
    faithfulSection: "Mantenerse cerca de la sección original",
    allowUpload:
      "Permitir subir el audio de este clip a {service} si no se creó allí. La subida se cobra como generar la misma duración.",
    prices: "Precios a fecha de {date}",
    versions: "Versiones",
    versionsHelp: "La primera versión reemplaza o añade el clip; las demás van en pistas silenciadas para comparar."
  },
  album: {
    status: {
      queued: "En espera",
      writing: "Escribiendo",
      generating: "Generando",
      done: "Hecho",
      failed: "Falló",
      cancelled: "Cancelado",
      running: "En curso",
      partial: "Hecho en parte"
    },
    untitled: "Álbum sin título",
    startFailed: "No se pudo iniciar el álbum.",
    placeFailed: "No se pudieron colocar las canciones en el editor.",
    cancelFailed: "No se pudo cancelar.",
    removeFailed: "No se pudo quitar.",
    newAlbum: "Nuevo álbum",
    make: "Hacer un álbum",
    intro:
      "Da una idea por canción. Las canciones se escriben y generan una tras otra en segundo plano, así que puedes cerrar esta página o dejarla toda la noche; un álbum también continúa después de reiniciar Music Suite.",
    noGenerator: "No hay ningún generador listo. Instala el motor local o añade un servicio en línea en Ajustes.",
    albumTitle: "Título del álbum",
    titlePlaceholder: "Viajes nocturnos",
    generator: "Generador",
    about: "De qué trata el álbum",
    aboutPlaceholder: "Un álbum de synth-pop sobre conducir por una ciudad de noche, desde la partida hasta el amanecer.",
    sharedStyle: "Estilo común",
    stylePlaceholder: "dreamy synth-pop, airy female vocal, analog synths",
    songs: "Canciones, una idea por línea ({count} de hasta {max})",
    songsLabel: "Canciones, una idea por línea",
    songsPlaceholder: "Dejando atrás las luces de la ciudad\nLa carretera costera vacía\nUna gasolinera a las 3 de la madrugada\nAmanecer sobre el puente",
    eachAbout: "Cada canción de unos",
    lengthLabel: "Duración de cada canción en segundos",
    seconds: "segundos",
    instrumental: "Instrumental",
    writeLyrics: "Escribir letra y estilo para cada canción",
    onlineCost: {
      one: "Unos ${usd} por {n} canción en tu cuenta (precios a fecha de {date}).",
      other: "Unos ${usd} por {n} canciones en tu cuenta (precios a fecha de {date})."
    },
    localTime: {
      one: "Aproximadamente {n} minuto en este equipo, una canción a la vez.",
      other: "Aproximadamente {n} minutos en este equipo, una canción a la vez."
    },
    makeSongs: {
      one: "Hacer {n} canción",
      other: "Hacer {n} canciones"
    },
    makeNone: "Hacer canciones",
    albums: "Álbumes",
    loading: "Cargando álbumes…",
    none: "Aún no hay álbumes.",
    albumLabel: "Álbum {title}",
    ready: "{status} · {done} de {total} canciones listas",
    openEditor: "Abrir en el Editor de estudio",
    stop: "Detener",
    removeLabel: "Quitar el álbum {title} de la lista",
    removeTitle: "Quitar de la lista (el proyecto y las canciones se conservan)",
    footer: "Cada álbum es su propio proyecto. Al abrirlo, las canciones terminadas se colocan una tras otra en pistas separadas.",
    allProjects: "Todos los proyectos"
  },
  form: {
    auto: "Auto",
    timestamp: "Marcar tiempos en la letra",
    timestampHelp: "Los tiempos del borrador usan la longitud de las líneas. Revisa las marcas de tiempo y el fraseo antes de generar.",
    insertSection: "Insertar una etiqueta de sección",
    lyricsPlaceholder: "[Verse]\nTus palabras aquí…\n\n[Chorus]\n…",
    settingsCount: {
      one: "{n} ajuste",
      other: "{n} ajustes"
    }
  },
  plan: {
    title: "Plan de la canción",
    intro: "Opcional. Da forma a la canción sección por sección. Con un plan, los campos Duración y Letra de arriba no se usan.",
    draftAgain: "Redactar de nuevo",
    draft: "Redactar un plan (gratis)",
    clear: "Borrar plan",
    section: "Sección",
    seconds: "Segundos",
    follow: "Seguir a las vecinas",
    closely: "Mucho",
    somewhat: "Algo",
    loosely: "Poco",
    moveUp: "Subir la sección {n}",
    moveDown: "Bajar la sección {n}",
    remove: "Quitar la sección {n}",
    lyrics: "Letra (una línea por cada línea cantada; vacío para instrumental)",
    styles: "Estilos",
    stylesFirst: "Estilos (definen el género — usa varios)",
    stylesPlaceholder: "p. ej., dream pop, airy female vocal, analog synths",
    avoid: "Evitar",
    avoidPlaceholder: "p. ej., distorted guitars",
    add: "Añadir una sección",
    total: {
      one: "{n} sección · {length} de hasta {max} min",
      other: "{n} secciones · {length} de hasta {max} min"
    }
  }
};
