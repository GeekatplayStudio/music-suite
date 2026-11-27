/** Shared analysis views: charts, tables, equaliser, visuals, review strip, help page, mapper. */
export const charts = {
  visualizer: {
    subtitle: "Real-time frequency, waveform, and energy analysis",
    modes: {
      spectrum: "Spectrum",
      orbit: "Orbit",
      waveform: "Waveform"
    },
    fullscreen: "Fullscreen visualizer",
    canvas: "Live audio visualization",
    playVisualizer: "Play visualizer",
    play: "Play",
    pause: "Pause",
    ready: "Ready",
    bass: "Bass {value}%",
    mid: "Mid {value}%",
    high: "High {value}%",
    cannotStart: "Unable to start visualizer playback.",
    cannotLoad: "The selected audio could not be loaded."
  },
  plot: {
    renderError: "Chart drawing error: {message}",
    noData: "Chart data unavailable for this run.",
    /** Plotly's own toolbar and hints (its English text is the key it looks up). */
    toolbar: {
      zoom: "Zoom",
      pan: "Pan",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      autoscale: "Autoscale",
      resetAxes: "Reset axes",
      download: "Download plot as a PNG",
      spikes: "Toggle Spike Lines",
      closest: "Show closest data on hover",
      compare: "Compare data on hover",
      boxSelect: "Box Select",
      lasso: "Lasso Select",
      doubleClick: "Double-click to zoom back out"
    }
  },
  equalizer: {
    title: "Optional Equalizer",
    intro: "Preview the loaded file through a manual EQ curve and export the processed result as WAV.",
    enable: "Enable EQ",
    reset: "Reset EQ",
    exporting: "Exporting EQ WAV…",
    export: "Export EQ WAV"
  },
  review: {
    title: "Waveform Review Strip",
    intro: "Click to scrub. Use the Start and End buttons below to mark the active review window.",
    playhead: "Playhead {time}s",
    selection: "Selection {start}s to {end}s"
  },
  table: {
    empty: "No rows."
  },
  helpLink: "Help: {label}",
  help: {
    subtitle: "{title}: how every part of the app works and what each setting does.",
    analyser: "Analyser & mastering",
    search: "Search the manual",
    clear: "Clear the search",
    contents: "Contents",
    noMatch: "Nothing in the manual matches that."
  },
  mapper: {
    title: "Song Geometry Mapper",
    loaded: "Loaded song: {name}",
    none: "Load a song here or return to Music Suite to select one."
  },
  notFound: {
    title: "Page not found",
    body: "The page you requested does not exist in this workspace."
  }
};
