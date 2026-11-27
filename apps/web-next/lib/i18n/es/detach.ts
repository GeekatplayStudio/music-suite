import type { Dictionary } from "../index";

/** Panels moved into windows of their own (components/detachable.tsx). */
export const detach: Dictionary["detach"] = {
  detach: "Abrir {panel} en su propia ventana (para otro monitor)",
  attach: "Devolver {panel} a la página",
  away: "{panel}: abierto en su propia ventana.",
  bringBack: "Devolver",
  floatNamed: "Abrir «{panel}» en su propia ventana",
  dockNamed: "Devolver «{panel}» a la página",
  menu: {
    heading: "Paneles de esta página",
    none: "En esta página no hay nada que separar.",
    float: "Separar",
    dock: "Acoplar",
    reopen: "Reabrir mis paneles flotantes",
    dockAll: "Acoplar todos",
    auto: "Reabrir los paneles flotantes al abrir su página",
    note: "Un panel flotante tiene su propia ventana: muévela, cambia su tamaño o llévala a otro monitor. Music Suite recuerda dónde va cada una. Para que se reabran solas, permite las ventanas emergentes para Music Suite.",
    blocked: "El navegador solo abrió una ventana con ese clic. Permite las ventanas emergentes para Music Suite (el icono a la derecha de la barra de direcciones) para reabrirlas todas a la vez."
  },
  warning:
    "Esto abre el panel en una ventana aparte que puedes mover a otro monitor.\n\nCada ventana extra es otra página que el equipo tiene que dibujar, así que usa más memoria, procesador y gráficos, sobre todo con medidores en vivo, visuales o la vista espectral. Cierra la ventana (o usa “Devolver”) para recuperar el panel.\n\n¿Abrirla?",
  blocked: "El navegador bloqueó la nueva ventana. Permite las ventanas emergentes para Music Suite y vuelve a intentarlo.",
  titles: {
    arrange: "Pistas y línea de tiempo",
    summary: "Resumen",
    loudness: "Cifras de sonoridad",
    song: "Ajustes de la canción",
    results: "Resultados",
    synthControls: "Controles del sintetizador",
    inspector: "Inspector",
    lower: "Piano roll y vistas",
    keys: "Piano en pantalla"
  },
  emptyLower: "Selecciona un clip de notas (o abre la vista espectral) y aparecerá aquí.",
  panels: {
    arrange: "las pistas y la línea de tiempo",
    inspector: "el inspector",
    lower: "el piano roll y las vistas",
    keys: "el piano en pantalla"
  }
};
