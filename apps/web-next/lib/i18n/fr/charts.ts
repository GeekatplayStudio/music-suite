import type { Dictionary } from "../index";

/** Shared analysis views: charts, tables, equaliser, visuals, review strip, help page, mapper. */
export const charts: Dictionary["charts"] = {
  visualizer: {
    subtitle: "Analyse en temps réel des fréquences, de la forme d'onde et de l'énergie",
    modes: {
      spectrum: "Spectre",
      orbit: "Orbite",
      waveform: "Forme d'onde"
    },
    fullscreen: "Visualiseur en plein écran",
    canvas: "Visualisation audio en direct",
    playVisualizer: "Lancer le visualiseur",
    play: "Lecture",
    pause: "Pause",
    ready: "Prêt",
    bass: "Graves {value} %",
    mid: "Médiums {value} %",
    high: "Aigus {value} %",
    cannotStart: "Impossible de lancer la lecture du visualiseur.",
    cannotLoad: "L'audio sélectionné n'a pas pu être chargé."
  },
  plot: {
    renderError: "Erreur de tracé du graphique : {message}",
    noData: "Données du graphique indisponibles pour cette analyse.",
    /** Plotly's own toolbar and hints (its English text is the key it looks up). */
    toolbar: {
      zoom: "Zoom",
      pan: "Déplacer",
      zoomIn: "Zoom avant",
      zoomOut: "Zoom arrière",
      autoscale: "Échelle auto",
      resetAxes: "Réinitialiser les axes",
      download: "Télécharger le graphique en PNG",
      spikes: "Lignes de repère",
      closest: "Afficher la donnée la plus proche",
      compare: "Comparer les données au survol",
      boxSelect: "Sélection rectangulaire",
      lasso: "Sélection au lasso",
      doubleClick: "Double-cliquez pour dézoomer"
    }
  },
  equalizer: {
    title: "Égaliseur optionnel",
    intro: "Écoutez le fichier chargé à travers une courbe d'égalisation manuelle et exportez le résultat traité en WAV.",
    enable: "Activer l'EQ",
    reset: "Réinitialiser l'EQ",
    exporting: "Export du WAV égalisé…",
    export: "Exporter le WAV égalisé"
  },
  review: {
    title: "Bande de revue de la forme d'onde",
    intro: "Cliquez pour vous déplacer. Utilisez les boutons Début et Fin ci-dessous pour marquer la fenêtre de revue active.",
    playhead: "Tête de lecture {time} s",
    selection: "Sélection de {start} s à {end} s"
  },
  table: {
    empty: "Aucune ligne."
  },
  helpLink: "Aide : {label}",
  help: {
    subtitle: "{title} : comment fonctionne chaque partie de l'application et à quoi sert chaque réglage.",
    analyser: "Analyseur et mastering",
    search: "Rechercher dans le manuel",
    clear: "Effacer la recherche",
    contents: "Sommaire",
    noMatch: "Rien dans le manuel ne correspond."
  },
  mapper: {
    title: "Géométrie du morceau",
    loaded: "Morceau chargé : {name}",
    none: "Chargez un morceau ici ou revenez à Music Suite pour en choisir un."
  },
  notFound: {
    title: "Page introuvable",
    body: "La page demandée n'existe pas dans cet espace de travail."
  }
};
