import type { Dictionary } from "../index";

/** Studio Editor sessions page and the "Where should this song go?" chooser. */
export const sessions: Dictionary["sessions"] = {
  title: "Editor de estudio",
  tagline: "Edición multipista, separación de stems, reparación y ajuste con IA. Todo se queda en este equipo.",
  untitled: "Sesión sin título",
  newName: "Nombre de la nueva sesión",
  newSession: "Nueva sesión",
  openFile: "Abrir un archivo de proyecto…",
  list: "Sesiones",
  empty: "Aún no hay sesiones. Crea una arriba o abre una canción desde el área de trabajo de Music Suite.",
  deleteNamed: "Eliminar {name}",
  deleteSession: "Eliminar sesión",
  errors: {
    load: "No se pudieron cargar los proyectos.",
    create: "No se pudo crear el proyecto.",
    open: "No se pudo abrir el archivo de proyecto.",
    place: "No se pudo añadir la canción a la sesión.",
    delete: "No se pudo eliminar el proyecto."
  },
  place: {
    region: "Dónde va la canción",
    thisSong: "esta canción",
    heading: "¿Dónde va “{name}”?",
    added: "Se añade en una pista nueva. No se reemplaza nada de lo que ya hay en una sesión.",
    split: "Separarla en stems al abrirla",
    splitHint:
      "Voces, batería, bajo y el resto, cada uno en su propia pista, listos para samplear, convertir en MIDI o reconstruir con IA. El original se queda encima, silenciado.",
    howFar: "Hasta dónde",
    howMany: "Cuántos stems",
    auto: { one: "Todos los que pueda este equipo ({n} stem)", other: "Todos los que pueda este equipo ({n} stems)" },
    two: "2 stems: voces e instrumental",
    four: "4 stems: voces, batería, bajo, otros",
    six: "6 stems: añade guitarra y piano",
    full: "Todo: 12 stems con piezas de la batería y voz principal/coros",
    moreStems: "Más stems con separación de stems por IA",
    newSession: "Nueva sesión “{name}”",
    orAdd: "O añádela a una sesión",
    openHere: "Abrir (ya está aquí)",
    addHere: "Añadir aquí",
    noOthers: "Aún no hay otras sesiones."
  }
};
