# Dein erster Song in Music Suite, Schritt für Schritt

*[English](FIRST_PROJECT.md) · [Español](FIRST_PROJECT.es.md) · **Deutsch** · [Français](FIRST_PROJECT.fr.md) · [Русский](FIRST_PROJECT.ru.md) · [Українська](FIRST_PROJECT.uk.md)*

Von einer Melodie, die du auf einem Keyboard spielst (oder summst oder hochlädst), bis zu einem
fertigen, bereinigten Song mit deinem eigenen Text. Jeder Schritt nennt die Schaltfläche, die du
drücken musst. Beim ersten Mal dauert es etwa 20–30 Minuten, das meiste davon ist Installieren
und Warten auf das Modell.

Du brauchst keine Musiktheorie. Du brauchst:

- Ein installiertes und gestartetes Music Suite (siehe [Windows-Installationsanleitung, englisch](WINDOWS_INSTALL_GUIDE.md); unter
  macOS doppelklickst du `install.command`, dann `start.command`).
- Chrome oder Edge (sie können mit MIDI-Keyboards sprechen; Safari nicht).
- Optional: ein USB-MIDI-Keyboard. Ohne eines funktioniert das Bildschirmklavier genauso.
- Optional, aber empfohlen: eine NVIDIA-Grafikkarte. Alles läuft auch auf dem Prozessor,
  nur langsamer (gemessen auf einem Computer: Ein 30-Sekunden-Song brauchte 49 s auf dem
  Prozessor und 7,8 s auf einer RTX 3090).

> **Zwei Wege hinein.** Wenn du einfach einen Song aus einer Beschreibung willst, spring zu
> [Abkürzung: ein Song aus einer Idee](#shortcut-a-song-from-an-idea). Der vollständige Weg unten ist dafür da,
> *deine eigene* Melodie in einen Song zu verwandeln.

---

## 1. Die Musik-Engine installieren (nur beim ersten Mal)

1. Öffne das **KI-Song-Studio** (Schaltfläche auf der Hauptseite).
2. Steht auf einer Karte **Ein Schritt vor deinem ersten Song**, drücke **Lokale Engine installieren**.
   Das lädt etwa 5,3 GB herunter und baut die Engine; das dauert einige Minuten.
3. Öffne **Modelle & Engines** (Schaltfläche in der Kopfzeile jedes Arbeitsbereichs) und schau dir die
   Zeile **Musik-Engine** an. Dort steht, worauf die Engine läuft, zum Beispiel *Läuft auf der Grafikkarte
   (Vulkan)*. Steht dort der Prozessor, obwohl dein Computer eine Grafikkarte hat, folge dem Hinweis in
   dieser Zeile.
4. Für **Einen ganzen Song darum herum bauen** in Schritt 5 brauchst du außerdem das
   **Bearbeitungsmodell** (2,4 GB): Drücke in seiner Zeile **Installieren**.

## 2. Eine Session und eine Instrumentenspur anlegen

1. Öffne den **Studio-Editor**, gib einen Namen wie *Mein erster Song* ein und drücke **Neue Session**.
2. Schließ dein MIDI-Keyboard an. Drücke das **Keyboard-Symbol** in der Kopfzeile des Editors, dann
   **Verbinden**, und erlaube MIDI, wenn der Browser fragt. (Kein Keyboard? Drücke das **Klavier-Symbol**
   in der Kopfzeile, um das Bildschirmklavier zu öffnen; es spielt und nimmt genauso auf.)
3. Drücke im selben Panel **Instrumentenspur hinzufügen**. Du bekommst eine Spur mit einem leeren
   Notenclip von vier Takten, bereit zum Einspielen. Wähle sie aus (klicke auf ihren Spurkopf).

## 3. Deine Melodie aufnehmen

1. Stelle im Projekt-Panel rechts das gewünschte Tempo ein (**Tempo**, zum Beispiel 100 BPM).
2. Drücke **Aufnahme** (die Mikrofon-Schaltfläche). Ist eine Instrumentenspur ausgewählt und ein Keyboard
   verbunden (oder das Bildschirmklavier offen), nimmt sie **Noten** auf, kein Audio; ihr Tooltip sagt,
   was davon.
3. Spiel deine Melodie. Drücke erneut **Aufnahme** (oder die Leertaste), um zu stoppen. Ein Clip namens
   *Played HH:MM:SS* erscheint.
4. Falsche Noten korrigieren: Wähle den Clip aus, und die **Piano Roll** öffnet sich unter der Zeitleiste
   (P zeigt oder verbirgt sie). Ziehe eine Note, um sie zu verschieben, ziehe ihren rechten Rand, um ihre
   Länge zu ändern, und lösche eine Note per Rechtsklick. **Als Notenblatt zeigen** zeigt sie als
   Notenschrift, wenn dir das lieber ist.
5. Hör mit der Leertaste hinein. Zufrieden? Dann weiter.

> Singst oder summst du lieber? Drücke stattdessen die **Mikrofon**-Schaltfläche, um Audio aufzunehmen,
> und nutze dann **Audio in Noten verwandeln** (Hilfe ▸ Audio in Noten verwandeln), um es als Noten
> aufzuschreiben, oder schick die Aufnahme direkt zu Schritt 4.

## 4. Die Melodie ans KI-Song-Studio schicken

1. **Exportieren ▸ Aus dem Mix einen KI-Song starten →**. Das KI-Song-Studio öffnet sich mit deiner Melodie
   im Panel **Ausgangspunkt**. Es hat Tempo, Tonart und Länge gemessen und eingetragen.
2. Wähle unter **Was daraus werden soll**:
   - **Neuer Stil**: Deine Melodie wird ein ganzer Song in dem Stil, den du beschreibst, **mit deinem
     Text**. Nimm diese Option für einen gesungenen Song.
   - **Einen ganzen Song darum herum bauen**: ein Arrangement um deine Melodie herum (ohne Text; braucht
     das Bearbeitungsmodell).
   - **Neuer Song in diesem Stil**: ein neuer Song mit gleichem Tempo, gleicher Tonart und gleichem
     Feeling (dein Text ist möglich, aber deine Melodie bleibt nicht erhalten).

## 5. Text und Stil hinzufügen und generieren

1. **Stilbeschreibung** (Pflichtfeld): Genre, Stimmung, Instrumente und Stimme in einfachen Worten, zum
   Beispiel *warm pop ballad, female vocal, piano and strings, slow build*.
2. **Songtext**: Tipp ihn ein und füge mit **+ Verse**, **+ Chorus** Abschnitts-Tags hinzu. Oder beschreibe
   den Song unter **Mit einer Idee beginnen** und drücke **Stil und Text schreiben** (für ausführlichere
   Texte brauchst du Ollama, das in den Einstellungen angeboten wird).
3. Bei **Neuer Stil**: **Wie viel vom Original behalten**. Höher bleibt näher an deiner Melodie,
   niedriger folgt freier dem neuen Stil. Fang etwa in der Mitte an. **Nah am Original bleiben
   (Remix)** behält Melodie und Timing und ändert vor allem die Produktion.
4. **Anzahl Versionen**: 2 ist ein guter Anfang, dann kannst du die bessere auswählen.
5. Drücke die Schaltfläche **Generieren** (ihre Beschriftung nennt die Wahl, zum Beispiel *Neuer Stil aus …*).
   Die Leiste zeigt jede Phase und eine Zeitschätzung.

Das Modell folgt deiner Melodie, aber nicht Note für Note: Es ist ein Ausgangspunkt, keine Kopie. Entfernt
sich ein Ergebnis zu weit, behalte mehr vom Original und generiere erneut, oder drücke bei einem Ergebnis,
das dir gefällt, **Diesen Seed für die nächste Version behalten** und ändere nur Text oder Stil.

<a id="6-open-the-result-in-the-editor"></a>
## 6. Das Ergebnis im Editor öffnen

Jede Version hat einen Player. Drücke **Im Studio-Editor öffnen** (oder **Zu einer Session hinzufügen**).
Die Versionen landen auf eigenen Spuren neben deiner Melodie; zusätzliche Versionen starten stummgeschaltet,
damit du sie mit den Schaltflächen M und S vergleichen kannst.

Optional: **In Stems trennen** bei einem Ergebnis legt Gesang, Drums, Bass und den Rest auf getrennte
Spuren, sodass du eine Stimme ändern kannst (zum Beispiel die Drums ersetzen oder eine Stimme mit dem
**Assistenten** über dein Keyboard spielen).

## 7. Den Klang bereinigen

Generierte Songs haben manchmal Rauschen oder ein leises Hintergrundgeräusch. Wähle im Editor den Clip aus
und nutze den Inspector:

1. **Reparatur ▸ Rauschen mindern.** Für das sauberste Ergebnis markiere zuerst mit dem
   **Bereichswerkzeug (R)** eine kurze Stelle, die *nur* Rauschen enthält (mindestens 0,1 s), damit sie als
   Rauschprofil dient. Fang mit 40–60 % Stärke an; höher kann wässrig klingen.
2. **Restaurierung**: **DeClick** für Klicks, **DeHum** für Netzbrummen, **DeReverb** für zu viel Raum.
3. Ein einzelnes Husten oder Klicken: Öffne die **Spektralansicht (W)** und ziehe ein Rechteck darum.

Jeder Schritt lässt sich rückgängig machen (Ctrl+Z), und der Originalclip bleibt erhalten.

## 8. Fertigstellen und exportieren

1. Gleiche die Spuren mit ihren **Vol**-Fadern aus; schalte stumm, was du nicht willst.
2. Für eine ausgefeilte, streamingtaugliche Lautheit: **Exportieren ▸ Mix an Analyzer und
   Mastering senden →**, dann auf der Analyzer-Seite **KI-Mastering** verwenden.
3. Oder exportiere sofort: **Exportieren ▸ Mixdown · MP3 320 kbps** (oder WAV für die beste Qualität).
   Mit **Song aus gewählten Spuren…** hakst du genau an, welche Spuren hineinkommen.
4. **Exportieren ▸ Ganzes Projekt** speichert alles in einer Datei, die du später wieder öffnen kannst.

---

<a id="shortcut-a-song-from-an-idea"></a>
## Abkürzung: ein Song aus einer Idee

1. **KI-Song-Studio ▸ Erstellen**.
2. Beschreibe unter **Mit einer Idee beginnen** den Song in ein oder zwei Sätzen, zum Beispiel
   *a late-night drive along the coast, hopeful, dreamy synth-pop, female voice*, und drücke
   **Stil und Text schreiben**.
3. Bearbeite, was du willst, und drücke dann **Generieren**.
4. Mach bei [Schritt 6](#6-open-the-result-in-the-editor) weiter.

## Wie es weitergeht

- **Hilfe** (in der App) ist das vollständige Handbuch, mit Suche ([USER_MANUAL.de.md](USER_MANUAL.de.md)).
- **Keyboard-Assistent** (der Zauberstab im Editor): Spiel die Stimmen eines Songs mit den eigenen Sounds
  eines Hardware-Keyboards ab und nimm sie wieder auf, oder füge eine Mitsing-Stimme hinzu.
- **Synth-Studio**: Gestalte deine eigenen Sounds oder öffne die vollständige Oberfläche von Surge XT.
