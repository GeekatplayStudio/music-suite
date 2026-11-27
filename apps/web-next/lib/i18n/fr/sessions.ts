import type { Dictionary } from "../index";

/** Studio Editor sessions page and the "Where should this song go?" chooser. */
export const sessions: Dictionary["sessions"] = {
  title: "Éditeur studio",
  tagline: "Montage multipiste, séparation en stems, réparation et adaptation par IA. Tout reste sur cet ordinateur.",
  untitled: "Session sans titre",
  newName: "Nom de la nouvelle session",
  newSession: "Nouvelle session",
  openFile: "Ouvrir un fichier de projet…",
  list: "Sessions",
  empty: "Aucune session pour l'instant. Créez-en une ci-dessus ou ouvrez un morceau depuis l'espace de travail Music Suite.",
  deleteNamed: "Supprimer {name}",
  deleteSession: "Supprimer la session",
  errors: {
    load: "Impossible de charger les projets.",
    create: "Le projet n'a pas pu être créé.",
    open: "Le fichier de projet n'a pas pu être ouvert.",
    place: "Le morceau n'a pas pu être ajouté à la session.",
    delete: "Le projet n'a pas pu être supprimé."
  },
  place: {
    region: "Où placer le morceau",
    thisSong: "ce morceau",
    heading: "Où placer « {name} » ?",
    added: "Il est ajouté sur une nouvelle piste. Rien de ce qui se trouve déjà dans une session n'est remplacé.",
    split: "Le séparer en stems à l'ouverture",
    splitHint:
      "Voix, batterie, basse et le reste, chacun sur sa propre piste, prêts à être samplés, convertis en MIDI ou reconstruits par IA. L'original reste au-dessus, en sourdine.",
    howFar: "Jusqu'où",
    howMany: "Combien de stems",
    auto: { one: "Autant que cet ordinateur le permet ({n} stem)", other: "Autant que cet ordinateur le permet ({n} stems)" },
    two: "2 stems : voix et instrumental",
    four: "4 stems : voix, batterie, basse, autres",
    six: "6 stems : ajoute guitare et piano",
    full: "Tout : 12 stems avec les éléments de batterie et voix lead/chœurs",
    moreStems: "Plus de stems avec la séparation en stems par IA",
    newSession: "Nouvelle session « {name} »",
    orAdd: "Ou l'ajouter à une session",
    openHere: "Ouvrir (il est ici)",
    addHere: "Ajouter ici",
    noOthers: "Aucune autre session pour l'instant."
  }
};
