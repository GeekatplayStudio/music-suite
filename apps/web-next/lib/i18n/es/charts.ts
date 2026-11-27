import type { Dictionary } from "../index";

/** Shared analysis views: charts, tables, equaliser, visuals, review strip, help page, mapper. */
export const charts: Dictionary["charts"] = {
  visualizer: {
    subtitle: "Análisis de frecuencia, forma de onda y energía en tiempo real",
    modes: {
      spectrum: "Espectro",
      orbit: "Órbita",
      waveform: "Forma de onda"
    },
    fullscreen: "Visualizador a pantalla completa",
    canvas: "Visualización de audio en vivo",
    playVisualizer: "Reproducir visualizador",
    play: "Reproducir",
    pause: "Pausa",
    ready: "Listo",
    bass: "Graves {value}%",
    mid: "Medios {value}%",
    high: "Agudos {value}%",
    cannotStart: "No se pudo iniciar la reproducción del visualizador.",
    cannotLoad: "No se pudo cargar el audio seleccionado."
  },
  plot: {
    renderError: "Error al dibujar el gráfico: {message}",
    noData: "No hay datos de gráfico para este análisis.",
    /** Plotly's own toolbar and hints (its English text is the key it looks up). */
    toolbar: {
      zoom: "Zoom",
      pan: "Desplazar",
      zoomIn: "Acercar",
      zoomOut: "Alejar",
      autoscale: "Autoescala",
      resetAxes: "Restablecer ejes",
      download: "Descargar gráfico como PNG",
      spikes: "Líneas guía",
      closest: "Mostrar el dato más cercano",
      compare: "Comparar datos al pasar",
      boxSelect: "Selección rectangular",
      lasso: "Selección con lazo",
      doubleClick: "Doble clic para alejar"
    }
  },
  equalizer: {
    title: "Ecualizador opcional",
    intro: "Escucha el archivo cargado a través de una curva de EQ manual y exporta el resultado procesado como WAV.",
    enable: "Activar EQ",
    reset: "Restablecer EQ",
    exporting: "Exportando WAV con EQ…",
    export: "Exportar WAV con EQ"
  },
  review: {
    title: "Tira de revisión de la forma de onda",
    intro: "Haz clic para desplazarte. Usa los botones Inicio y Fin de abajo para marcar la ventana de revisión activa.",
    playhead: "Cursor {time} s",
    selection: "Selección de {start} s a {end} s"
  },
  table: {
    empty: "No hay filas."
  },
  helpLink: "Ayuda: {label}",
  help: {
    subtitle: "{title}: cómo funciona cada parte de la aplicación y qué hace cada ajuste.",
    analyser: "Análisis y masterización",
    search: "Buscar en el manual",
    clear: "Borrar la búsqueda",
    contents: "Contenido",
    noMatch: "No hay nada en el manual que coincida."
  },
  mapper: {
    title: "Geometría de la canción",
    loaded: "Canción cargada: {name}",
    none: "Carga una canción aquí o vuelve a Music Suite para seleccionar una."
  },
  notFound: {
    title: "Página no encontrada",
    body: "La página que pediste no existe en esta área de trabajo."
  }
};
