# Votre premier morceau dans Music Suite, étape par étape

*[English](FIRST_PROJECT.md) · [Español](FIRST_PROJECT.es.md) · [Deutsch](FIRST_PROJECT.de.md) · **Français** · [Русский](FIRST_PROJECT.ru.md) · [Українська](FIRST_PROJECT.uk.md)*

D'une mélodie que vous jouez sur un clavier (ou que vous fredonnez, ou que vous importez) à un
morceau terminé et nettoyé, avec vos propres paroles. Chaque étape indique le bouton sur lequel
cliquer. Comptez environ 20 à 30 minutes la première fois, surtout pour l'installation et
l'attente du modèle.

Pas besoin de connaître la théorie musicale. Il vous faut :

- Music Suite installé et démarré (voir le [guide d'installation Windows](WINDOWS_INSTALL_GUIDE.md) ;
  sur macOS, double-cliquez sur `install.command`, puis sur `start.command`).
- Chrome ou Edge (ils savent communiquer avec les claviers MIDI ; Safari non).
- Facultatif : un clavier MIDI USB. Sans clavier, le piano à l'écran fonctionne de la même façon.
- Facultatif mais recommandé : une carte graphique NVIDIA. Tout fonctionne aussi sur le processeur,
  simplement plus lentement (mesuré sur un ordinateur : un morceau de 30 secondes a pris 49 s sur le
  processeur et 7,8 s sur une RTX 3090).

> **Deux façons de commencer.** Si vous voulez simplement un morceau à partir d'une description,
> passez directement à [Raccourci : un morceau à partir d'une idée](#shortcut-a-song-from-an-idea).
> Le chemin complet ci-dessous sert à transformer *votre propre* mélodie en morceau.

---

## 1. Installer le moteur musical (la première fois seulement)

1. Ouvrez le **Studio de chansons IA** (bouton sur la page principale).
2. Si une carte affiche **Une étape avant votre premier morceau**, cliquez sur **Installer le moteur
   local**. Il télécharge environ 5,3 Go et construit le moteur ; cela prend plusieurs minutes.
3. Ouvrez **Modèles et moteurs** (bouton dans l'en-tête de chaque espace de travail) et regardez la
   ligne **Moteur musical**. Elle indique sur quoi tourne le moteur, par exemple *Tourne sur la carte
   graphique (Vulkan)*. Si elle indique le processeur alors que votre ordinateur a une carte
   graphique, suivez l'indication sur cette ligne.
4. Pour **Construire un morceau complet autour** à l'étape 5, il vous faut aussi le **Modèle
   d'édition** (2,4 Go) : cliquez sur **Installer** sur sa ligne.

## 2. Créer une session et une piste d'instrument

1. Ouvrez l'**Éditeur studio**, tapez un nom comme *Mon premier morceau*, et cliquez sur
   **Nouvelle session**.
2. Branchez votre clavier MIDI. Cliquez sur l'**icône de clavier** dans l'en-tête de l'éditeur, puis
   sur **Connecter**, et autorisez le MIDI quand le navigateur le demande. (Pas de clavier ? Cliquez
   sur l'**icône de piano** dans l'en-tête pour ouvrir le piano à l'écran ; il joue et enregistre de
   la même façon.)
3. Dans ce même panneau, cliquez sur **Ajouter une piste d'instrument**. Vous obtenez une piste avec
   un clip de notes vide de quatre mesures, prête à recevoir votre jeu. Sélectionnez-la (cliquez sur
   son en-tête).

## 3. Enregistrer votre mélodie

1. Réglez le tempo voulu dans le panneau du projet à droite (**Tempo**, par exemple 100 BPM).
2. Cliquez sur **enregistrer** (le bouton du microphone). Avec une piste d'instrument sélectionnée et
   un clavier connecté (ou le piano à l'écran ouvert), il enregistre des **notes**, pas de l'audio ;
   son info-bulle indique lequel.
3. Jouez votre mélodie. Cliquez à nouveau sur **enregistrer** (ou appuyez sur Espace) pour arrêter.
   Un clip appelé *Played HH:MM:SS* apparaît.
4. Corrigez les fausses notes : sélectionnez le clip, et le **piano roll** s'ouvre sous la timeline
   (P l'affiche ou le masque). Faites glisser une note pour la déplacer, faites glisser son bord droit
   pour changer sa durée, faites un clic droit sur une note pour la supprimer. **Afficher en
   partition** la montre sous forme de partition si vous préférez.
5. Écoutez avec Espace. Ça vous plaît ? Continuez.

> Vous préférez chanter ou fredonner ? Cliquez plutôt sur le bouton du **microphone** pour enregistrer
> de l'audio, puis utilisez **Transformer l'audio en notes** (Aide ▸ Transformer l'audio en notes)
> pour le transcrire en notes, ou envoyez directement l'enregistrement à l'étape 4.

## 4. Envoyer la mélodie au Studio de chansons IA

1. **Exporter ▸ Créer un morceau IA à partir du mix →**. Le Studio de chansons IA s'ouvre avec votre
   mélodie dans le panneau **À partir de**. Il a mesuré le tempo, la tonalité et la durée et les a
   remplis.
2. Sous **Qu'en faire**, choisissez :
   - **Changer de style** : votre mélodie devient un morceau complet dans le style que vous décrivez,
     **avec vos paroles**. Choisissez celui-ci pour un morceau chanté.
   - **Construire un morceau complet autour** : un arrangement autour de votre mélodie (sans paroles ;
     nécessite le modèle d'édition).
   - **Nouveau morceau dans son style** : un nouveau morceau avec les mêmes tempo, tonalité et feeling
     (vos paroles sont acceptées, mais votre mélodie n'est pas conservée).

## 5. Ajouter des paroles et un style, puis générer

1. **Description du style** (obligatoire) : genre, ambiance, instruments et voix en mots simples, par
   exemple *warm pop ballad, female vocal, piano and strings, slow build* (les modèles lisent
   l'anglais).
2. **Paroles** : tapez-les, en utilisant **+ Verse**, **+ Chorus** pour ajouter des balises de
   section. Ou décrivez le morceau sous **Partir d'une idée** et cliquez sur **Écrire le style et les
   paroles** (des paroles plus riches nécessitent Ollama, proposé dans les Paramètres).
3. Pour **Changer de style** : **Quelle part de l'original conserver**. Plus haut reste plus proche
   de votre mélodie, plus bas suit plus librement le nouveau style. Commencez vers le milieu.
   **Rester proche de l'original (remix)** garde la mélodie et le placement rythmique et change
   surtout la production.
4. **Versions à produire** : 2, c'est un bon début, pour pouvoir choisir la meilleure.
5. Cliquez sur le bouton **Générer** (son libellé reprend le choix, par exemple *Changer le style à
   partir de …*). La barre affiche chaque étape et une estimation du temps.

Le modèle suit votre mélodie, mais pas note pour note : c'est un point de départ, pas une copie. Si
un résultat s'éloigne trop, conservez davantage l'original et générez à nouveau, ou cliquez sur
**Garder cette graine pour la version suivante** sur un résultat qui vous plaît et changez seulement
les paroles ou le style.

<a id="6-open-the-result-in-the-editor"></a>
## 6. Ouvrir le résultat dans l'éditeur

Chaque version a un lecteur. Cliquez sur **Ouvrir dans l'Éditeur studio** (ou **Ajouter à une
session**). Les versions arrivent sur leurs propres pistes à côté de votre mélodie ; les versions
supplémentaires commencent muettes pour que vous puissiez les comparer avec les boutons M et S.

Facultatif : **Séparer en stems** sur un résultat donne les voix, la batterie, la basse et le reste
sur des pistes séparées, pour que vous puissiez changer une partie (par exemple remplacer la
batterie, ou jouer une partie sur votre clavier avec l'**Assistant**).

## 7. Nettoyer le son

Les morceaux générés ont parfois du souffle ou un léger bruit de fond. Dans l'éditeur, sélectionnez
le clip et utilisez l'inspecteur :

1. **Réparation ▸ Réduire le bruit.** Pour le résultat le plus propre, utilisez d'abord l'**outil
   Plage (R)** pour surligner un court passage qui ne contient *que* du bruit (au moins 0,1 s), afin
   qu'il serve d'empreinte de bruit. Commencez avec une intensité de 40 à 60 % ; plus haut, le son
   peut devenir « aquatique ».
2. **Restauration** : **DeClick** pour les clics, **DeHum** pour le ronflement du secteur,
   **DeReverb** pour trop de résonance de la pièce.
3. Une toux ou un clic isolé : ouvrez la **vue spectrale (W)** et tracez un cadre autour.

Chaque étape peut être annulée (Ctrl+Z), et le clip original est conservé.

## 8. Finaliser et exporter

1. Équilibrez les pistes avec leurs faders **Vol** ; rendez muet ce que vous ne voulez pas.
2. Pour un volume soigné, prêt pour le streaming : **Exporter ▸ Envoyer le mix à l'analyse et au
   mastering →**, puis utilisez le **Mastering IA** sur la page de l'analyseur.
3. Ou exportez tout de suite : **Exporter ▸ Mixage final · MP3 320 kbps** (ou WAV pour la meilleure
   qualité). **Morceau à partir de pistes choisies…** vous permet de cocher exactement les pistes
   à inclure.
4. **Exporter ▸ Projet entier** enregistre tout dans un seul fichier à rouvrir plus tard.

---

<a id="shortcut-a-song-from-an-idea"></a>
## Raccourci : un morceau à partir d'une idée

1. **Studio de chansons IA ▸ Créer**.
2. Sous **Partir d'une idée**, décrivez le morceau en une phrase ou deux, par exemple
   *une virée nocturne le long de la côte, pleine d'espoir, synth-pop rêveuse, voix féminine*, et
   cliquez sur **Écrire le style et les paroles**.
3. Modifiez ce que vous voulez, puis cliquez sur **Générer**.
4. Continuez à partir de l'[étape 6](#6-open-the-result-in-the-editor).

## Et ensuite

- **Aide** (dans l'application) est le manuel complet, avec une recherche.
- **Assistant clavier** (la baguette dans l'éditeur) : jouez les parties d'un morceau sur un clavier
  matériel avec ses propres sons et réenregistrez-les, ou ajoutez une voix sing-along.
- **Studio de synthèse** : créez vos propres sons, ou ouvrez l'interface complète de Surge XT.
