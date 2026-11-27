import type { Dictionary } from "../index";

/** Panels moved into windows of their own (components/detachable.tsx). */
export const detach: Dictionary["detach"] = {
  detach: "Ouvrir {panel} dans une fenêtre séparée (pour un autre écran)",
  attach: "Ramener {panel} dans la page",
  away: "« {panel} » est ouvert dans une fenêtre séparée.",
  bringBack: "Le ramener",
  floatNamed: "Ouvrir « {panel} » dans une fenêtre séparée",
  dockNamed: "Ramener « {panel} » dans la page",
  menu: {
    heading: "Panneaux de cette page",
    none: "Rien à détacher sur cette page.",
    float: "Détacher",
    dock: "Ancrer",
    reopen: "Rouvrir mes panneaux détachés",
    dockAll: "Tout ancrer",
    auto: "Rouvrir les panneaux détachés avec leur page",
    note: "Un panneau détaché a sa propre fenêtre : déplacez-la, redimensionnez-la ou mettez-la sur un autre écran. Music Suite retient où va chacune. Pour qu'elles se rouvrent seules, autorisez les fenêtres pop-up pour Music Suite.",
    blocked: "Le navigateur n'a ouvert qu'une fenêtre pour ce clic. Autorisez les fenêtres pop-up pour Music Suite (l'icône à droite de la barre d'adresse) pour toutes les rouvrir d'un coup."
  },
  warning:
    "Le panneau va s'ouvrir dans une fenêtre séparée que vous pouvez déplacer sur un autre écran.\n\nChaque fenêtre supplémentaire est une page de plus à afficher pour l'ordinateur : elle consomme plus de mémoire, de processeur et de puissance graphique, surtout avec les vumètres en direct, les visuels ou la vue spectrale. Fermez la fenêtre (ou utilisez « Le ramener ») pour récupérer le panneau.\n\nL'ouvrir ?",
  blocked: "Le navigateur a bloqué la nouvelle fenêtre. Autorisez les fenêtres pop-up pour Music Suite et réessayez.",
  titles: {
    arrange: "Pistes et timeline",
    summary: "Résumé",
    loudness: "Mesures de loudness",
    song: "Réglages du morceau",
    results: "Résultats",
    synthControls: "Réglages du synthé",
    inspector: "Inspecteur",
    lower: "Piano roll et vues",
    keys: "Piano à l'écran"
  },
  emptyLower: "Sélectionnez un clip de notes (ou ouvrez la vue spectrale) pour qu'il s'affiche ici.",
  panels: {
    arrange: "les pistes et la timeline",
    inspector: "l'inspecteur",
    lower: "le piano roll et les vues",
    keys: "le piano à l'écran"
  }
};
