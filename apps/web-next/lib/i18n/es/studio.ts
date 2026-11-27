import type { Dictionary } from "../index";

/** AI Song Studio main page (components/generation/generate-studio.tsx). */
export const studio: Dictionary["studio"] = {
  header: {
    subtitle: "Describe una canción, edita la letra y genérala en este equipo. Los resultados se abren en el Editor de estudio.",
    backToEditor: "Volver al editor"
  },
  tabs: {
    label: "Secciones del Estudio de canciones IA",
    create: "Crear",
    live: "En vivo",
    album: "Álbum",
    history: "Historial",
    settings: "Ajustes"
  },
  errors: {
    load: "No se pudo cargar la generación con IA.",
    draftPlan: "No se pudo redactar el plan.",
    estimate: "No se pudo estimar el coste.",
    write: "No se pudo escribir la canción.",
    start: "No se pudo iniciar la generación.",
    place: "La canción se generó, pero no se pudo colocar en la línea de tiempo. Añádela desde la lista de recursos del editor.",
    failed: "La generación falló.",
    read: "No se pudo leer la canción. Aun así puedes usarla; rellena el formulario tú mismo.",
    upload: "No se pudo subir la canción.",
    analyse: "No se pudo enviar la canción al analizador.",
    bringIn: "No se pudo traer la canción.",
    history: "No se pudo cargar el historial.",
    removeEntry: "No se pudo quitar la entrada.",
    installStart: "No se pudo iniciar la instalación."
  },
  writer: {
    ollama: "Escrito en este equipo por {model}. Edita lo que quieras antes de generar.",
    planner: "Borrador del planificador del motor de música. Para letras más completas, configura Ollama en Ajustes.",
    abcReady: "El plan de composición está listo. Revisa y edita la partitura ABC y luego genera la canción."
  },
  defaults: {
    songTitle: "Canción generada",
    liveTake: "Toma en vivo de Magenta",
    songName: "Canción",
    theSong: "la canción",
    newVersion: "{name} (nueva versión)"
  },
  sourceStatus: {
    reading: "Leyendo tempo, tonalidad y estilo…",
    uploading: "Subiendo {name}…",
    bringing: "Trayendo {name}…"
  },
  send: {
    label: "Enviar {name}",
    add: "Añadir a una sesión",
    addTitle: "Añadirla en una pista nueva de una sesión del editor nueva o existente",
    split: "Separar en stems",
    splitTitle: "Añadirla a una sesión y separarla en voces, batería, bajo y el resto",
    analyse: "Analizar",
    analyseTitle: "Abrir una copia en el analizador y medirla",
    startFrom: "Crear una canción a partir de ella",
    startFromTitle: "Hacer otra canción a partir de esta: cambiar el estilo, alargarla, añadir una parte…"
  },
  result: {
    label: "Resultado: {title}",
    versions: { one: "{n} versión", other: "{n} versiones" },
    madeIn: "hecha en {time}",
    openEditor: "Abrir en el Editor de estudio",
    seed: "semilla {seed}",
    play: "Reproducir {name}",
    keepSeed: "Conservar esta semilla para la próxima versión"
  },
  history: {
    label: "Historial de generaciones",
    loading: "Cargando historial…",
    empty: "Aún no se ha generado nada. Las canciones que hagas aparecen aquí con los ajustes que las crearon.",
    useSettings: "Usar estos ajustes",
    openProject: "Abrir proyecto",
    removeLabel: "Quitar {title} del historial",
    removeTitle: "Quitar del historial (el audio se queda en su proyecto)"
  },
  install: {
    heading: "Un paso antes de tu primera canción",
    body: "El motor de música local aún no está instalado. La instalación descarga unos {gb} GB y tarda unos minutos. Después, las canciones se crean en este equipo, sin conexión.",
    progress: "Progreso de la instalación",
    retry: "Reintentar la instalación",
    install: "Instalar motor local"
  },
  generator: {
    label: "Generador",
    notReady: " — no está listo"
  },
  idea: {
    heading: "Empezar desde una idea",
    describe: "Describe la canción que quieres",
    placeholder: "Un viaje nocturno por la costa después de una ruptura, esperanzador al final. Synth-pop soñador, voz femenina.",
    writing: "Escribiendo… (unos 30 s)",
    write: "Escribir estilo y letra",
    hint: "Opcional. Rellena el formulario de abajo; también puedes escribirlo todo tú."
  },
  form: {
    title: "Título de la canción",
    titlePlaceholder: "Canción sin título",
    abc: "Redactar partitura ABC editable",
    revise: "Cómo cambiar la letra",
    revisePlaceholder: "Cambia la letra: p. ej., “añade un puente”, “simplifica el estribillo”, “tradúcela al inglés”",
    rewrite: "Reescribir"
  },
  bar: {
    working: "Trabajando…",
    progress: "Progreso de la generación",
    estimate: "Unos {time} en este equipo. Una canción a la vez.",
    notReady: "Aún no se puede enviar: {error}",
    prices: "Precios a fecha de {date}",
    taskFrom: "{task} a partir de “{name}”",
    makeIt: "Hacerla",
    generate: "Generar",
    generateInStyle: "Generar en su estilo",
    generateIntoProject: "Generar en este proyecto"
  },
  allOff: "Todos los generadores están desactivados. Activa uno en Ajustes."
};
