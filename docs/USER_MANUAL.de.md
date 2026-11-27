<a id="music-suite-user-manual"></a>
# Music Suite – Benutzerhandbuch

Music Suite ist eine Musik-Workstation, die auf deinem eigenen Computer läuft. Sie analysiert und mastert fertige Songs, zerlegt sie in ihre Instrumente, wandelt Audio in Noten um, bearbeitet und mischt Mehrspur-Sessions, erzeugt Songs mit KI, hilft dir beim Gestalten von Synth-Sounds und spielt deine Musik über ein Hardware-Keyboard wie das Roland GO:KEYS 3.

Alles läuft lokal. Ins Internet gehen nur die Online-KI-Dienste, die du selbst einschaltest (mit deinem eigenen Schlüssel), Downloads optionaler Modelle, die Suche nach Updates und Community-Browser-Plugins, wenn du sie erlaubst.

> **Tipp:** In jedem Arbeitsbereich gibt es neben den Einstellungen kleine **?**-Schaltflächen. Sie öffnen dieses Handbuch in einem neuen Tab genau an der Stelle, die sie erklärt – so geht nichts verloren, woran du gerade arbeitest.

<a id="getting-started"></a>
## Erste Schritte

<a id="the-workspaces"></a>
### Die Arbeitsbereiche

| Arbeitsbereich | Adresse | Wofür er da ist |
|---|---|---|
| [Analyse und Mastering](#analyser-and-mastering) | `/` | Einen fertigen Song messen, seine Probleme finden, ihn mastern und in andere Formate umwandeln. |
| [Studio-Editor](#studio-editor) | `/editor` | Mehrspur-Sessions: importieren, in Stems zerlegen, reparieren, bearbeiten, aufnehmen, Noten schreiben, mischen und exportieren. |
| [KI-Song-Studio (AI Song Studio)](#ai-song-studio) | `/generate` | Songs aus einer Beschreibung oder aus einem vorhandenen Song erzeugen; Alben. |
| [Synth-Studio (Synth Studio)](#synth-studio) | `/synth` | Synth-Sounds gestalten und Plugin-Instrumente wie Surge XT spielen. |
| [Song-Geometrie](#song-geometry-mapper) | `/mapper` | Ein 3D-Bild vom Klang eines Songs – zum Erkunden und für Videos. |
| [Modelle & Engines](#models-and-engines) | `/models` | Optionale KI-Modelle und Instrumente installieren. |
| Hilfe | `/help` | Dieses Handbuch. |

Songs wandern mit den Schaltflächen oben auf jeder Seite zwischen den Arbeitsbereichen: Zum Beispiel fügt **Studio-Editor** im Analyzer den ausgewählten Song einer Session hinzu, und **Mix an Analyzer und Mastering senden** im Export-Menü des Editors schickt einen Mix zurück.

<a id="language-colours-and-extra-windows"></a>
### Sprache, Farben und zusätzliche Fenster

Die Schaltfläche **Sprache und Farben** (ein Globus mit der aktuellen Sprache, neben den Kopfzeilen-Schaltflächen in jedem Arbeitsbereich) legt fest:

- **Sprache:** English, Español, Deutsch, Français, Русский oder Українська. Die ganze Oberfläche ist übersetzt, einschließlich der Meldungen der Engines und dieses Handbuchs (bei deutscher Oberfläche zeigt die Hilfe-Seite die deutsche Ausgabe, [USER_MANUAL.de.md](USER_MANUAL.de.md)). Manches bleibt absichtlich, wie es ist:
  - Namen von Modellen, Plugins und Presets;
  - Einheiten, die Musiker auf Englisch verwenden (BPM, LUFS, dB);
  - Text, der an die Musikmodelle geschickt wird, etwa Stil-Prompts und die Abschnittsnamen im Plan, weil die Modelle Englisch lesen;
  - Spurnamen, die der Editor anlegt und später wiedererkennt, etwa "Sing-along".
- **Farbschema:** Mitternachtscyan (das Original), Bernsteinstudio, Violette Nacht, Wald, Magenta oder **Hell (Tag)**. Statusfarben behalten in jedem Schema ihre Bedeutung: Rot für Fehler, Bernstein für Warnungen, Grün für Erfolg. Im hellen Schema behalten Wellenformen, Piano Roll, Diagramme und Visualisierungen ihre dunkle Zeichenfläche.

Beides wird in diesem Browser gespeichert.

**Panels in eigenen Fenstern (für einen zweiten Monitor).** Die Schaltfläche **In eigenem Fenster öffnen** (ein Kästchen mit Pfeil) öffnet ein Panel in einem separaten Fenster, das du auf einen anderen Monitor ziehen kannst.

- **Studio-Editor:**
  - der **Inspector** (Schaltfläche in der Kopfzeile);
  - **Piano Roll, Notenblatt und Spektralansicht** (Schaltfläche neben der Schließen-Schaltfläche jedes Panels);
  - das **Bildschirmklavier** (neben *Ausblenden*).
- **Analyzer:**
  - **Visual AI** (Schaltfläche neben der Vollbild-Schaltfläche);
  - die **Diagramme** (Schaltfläche in der Hinweiszeile darüber). Die Gruppenschaltflächen und Schnellsprung-Links des Diagramm-Studios bleiben auf der Seite und steuern die Diagramme im anderen Fenster.

Das Panel funktioniert genau wie vorher, und Tasten, die du in seinem Fenster drückst (Leertaste, Rückgängig, Tastenkürzel), kommen weiterhin auf der Seite an. Schließe das Fenster oder drücke **Zurückholen**, um es zurückzuholen.

Jedes Fenster merkt sich, wo es war und wie groß es war, und öffnet sich beim nächsten Mal wieder dort. Mit mehr als einem Monitor fragt der Browser einmal, ob Music Suite Fenster platzieren darf; erlaube es, dann öffnet sich ein Panel beim ersten Mal auf dem anderen Bildschirm und danach auf dem Bildschirm, auf dem du es zuletzt gelassen hast.

Beim ersten Mal erklärt eine Meldung, dass jedes zusätzliche Fenster mehr Arbeitsspeicher, Prozessor- und Grafikleistung braucht. Funktioniert in Chrome und Edge; erlaube Pop-ups für Music Suite, falls der Browser das Fenster blockiert.

**Jedes Bedienfeld lässt sich lösen.** Außer diesen hat jeder Bereich eines Arbeitsbereichs dieselbe kleine Schaltfläche im Titel: die Karten der Analyse, **Spuren und Timeline** im Editor, die Bereiche und Tabs des AI Song Studio, Sound, Regler und Plug-in-Bereiche im Synth Studio sowie die Bereiche unter Modelle & Engines. Löse die gewünschten und richte den Bildschirm nach deinen Vorstellungen ein. Die Schaltfläche **Sprache und Farben** listet unter **Bedienfelder dieser Seite** die Bedienfelder der aktuellen Seite auf, jeweils mit **Lösen** oder **Andocken**, dazu **Alle andocken** und **Gelöste wieder öffnen**, um die Anordnung vom letzten Mal wiederherzustellen. Aktiviere **Gelöste Bedienfelder mit ihrer Seite öffnen**, damit das von selbst passiert. Dafür müssen Pop-ups für Music Suite erlaubt sein, sonst öffnet der Browser pro Klick nur ein Fenster.

**Arbeitsbereiche und Tabs in eigenen Fenstern.** Die Schaltfläche **Sprache und Farben** hat auch **In neuem Fenster öffnen**: Wähle einen Bereich (Analyzer, Studio-Editor, KI-Song-Studio, Synth-Studio, Modelle & Engines, Song-Geometrie oder Hilfe), und er öffnet sich in einem eigenen Fenster. Im KI-Song-Studio und im Synth-Studio öffnet die Fenster-Schaltfläche neben den Tabs den aktuellen Tab in einem neuen Fenster, zum Beispiel den Tab **Album** auf einem Monitor, während du auf einem anderen Songs erstellst. Auch diese Fenster merken sich, wo du sie gelassen hast. Öffne jede Session nur in einem Editor-Fenster: Ist dieselbe Session in zwei Fenstern offen, weisen beide darauf hin, weil jedes über die Änderungen des anderen speichern würde.

<a id="installing-windows"></a>
### Installation (Windows)

1. Doppelklicke im Music-Suite-Ordner auf **install.bat**. Entpacke zuerst die heruntergeladene ZIP-Datei (Rechtsklick ▸ **Alle extrahieren...**): Direkt aus der ZIP gestartet, hält es an und sagt das.
2. Es fragt **Complete install? [y/N]**:
   - **Enter (Standard):** die App mit allem, was sie zum Laufen braucht. Etwa 10 GB freier Speicher reichen locker.
   - **y (Komplett):** zusätzlich die lokale KI-Musik-Engine und ihre Modelle, der Songtext-Schreiber (Ollama), KI-Stem-Trennung mit allen Modellen und der Synth Surge XT. Etwa 30 GB Downloads; halte 45 GB frei.
3. Es arbeitet fünf Schritte ab: Werkzeuge (Python, FFmpeg, Node.js, Git), die Python-Umgebung, die Web-App (der langsamste Schritt), optionale Teile und eine abschließende Prüfung. Jedes Werkzeug kommt aus seiner offiziellen Quelle und wird vor der Verwendung geprüft. Python muss nicht auf dem Computer sein: Wie die portable Version von ComfyUI bringt Music Suite ein eigenes Python in seinem Ordner mit, daher wird in Windows nichts installiert und kein Administratorkennwort abgefragt.
4. Wenn **Music Suite is installed!** erscheint, doppelklicke auf **start.bat**.

Was ausgelassen wurde, kannst du später unter [Modelle & Engines](#models-and-engines) und in den Einstellungen des KI-Song-Studios nachinstallieren. Installer-Optionen findest du in `docs/WINDOWS_INSTALL_GUIDE.md`.

Bevor etwas heruntergeladen wird, prüft der Installer, dass:

- er in den Ordner schreiben kann;
- genug freier Speicherplatz vorhanden ist;
- dieser Computer die Python- und Web-Paketserver erreicht.

Schlägt etwas davon fehl, sagt er, was zu tun ist. Er warnt auch, wenn der Ordner in OneDrive liegt oder einen sehr langen Pfad hat: Beides kann Installationen scheitern lassen, und ein Ordner wie `C:\MusicSuite` vermeidet das. Ein abgebrochener Download wird automatisch wiederholt.

**Wenn die Installation fehlschlägt,** zeigt der Installer, was schiefgelaufen ist. Starte **install.bat** erneut: Es behält alles, was schon erledigt ist, und macht dort weiter. Bleibt es zweimal an derselben Stelle stehen, starte Windows neu und versuche es noch einmal. Das vollständige Protokoll steht in `logs\install.log`.

<a id="starting-and-stopping"></a>
### Starten und Beenden

- **start.bat** startet Music Suite und öffnet es im Browser (normalerweise http://127.0.0.1:3000). Fehlt etwas, das es braucht, wird es zuerst installiert. Läuft Music Suite schon, wird nur der Browser geöffnet.
- **stop.bat** beendet es. Es beendet nur das Music Suite, das es selbst gestartet hat, nie etwas anderes.
- Ist ein Port belegt, nimmt Music Suite den nächsten freien und sagt, welchen.
- **Nach einem Update** bringt der erste Start die Bibliotheken auf den neuesten Stand und baut die App neu, wenn die neue Version das braucht. Das dauert einmalig ein bis zwei Minuten; jeder weitere Start dauert ein paar Sekunden.
- Verwende **Chrome oder Edge**: Hardware-MIDI (Keyboards) funktioniert nur dort.

Startoptionen (`start.ps1` aus PowerShell ausführen): `-NoBrowser` (Browser nicht öffnen), `-ApiPort` und `-WebPort` (bevorzugte Ports, 8008 und 3000), `-StartupTimeoutSeconds` (Standard 300), `-NoInstall` (melden, was fehlt, statt es zu installieren), `-StartComfyUI -ComfyUIPath <folder>` (zusätzlich ComfyUI für MusicGen starten).

<a id="updating"></a>
### Aktualisieren

Drücke auf der Analyzer-Seite **Konfiguration**:

- **Nach Updates suchen** schaut nur im offiziellen Music-Suite-Repository nach.
- **Update installieren** holt es, wenn eines verfügbar ist. Es überschreibt nie Änderungen, die du selbst gemacht hast; gibt es welche, verweigert es das Update und sagt es dir.
- Starte Music Suite danach neu. Neue Abhängigkeiten werden beim Start installiert.

Updates in der App setzen voraus, dass Music Suite mit Git (als Klon) installiert wurde, nicht aus einer ZIP-Datei.

<a id="where-your-work-is-kept"></a>
### Wo deine Arbeit gespeichert wird

| Was | Wo |
|---|---|
| Editor-Sessions, ihr Audio und ihre Stems | `data\editor\<session id>\` |
| Analysierte Songs, Master, Konvertierungen und Berichte | `data\runs\` und `data\uploads\` |
| Einstellungen, Verlauf und Alben des KI-Song-Studios | `data\generation\` |
| Die lokale KI-Musik-Engine und ihre Modelle | `data\engines\acestep.cpp\` |
| Modelle für die Stem-Trennung | `data\models\audio-separator\` |
| Logs (wenn etwas schiefgeht) | `logs\` (`api.log`, `web.log`, `install.log`) und `data\generation\engine.log` |
| Schlüssel für Online-Dienste | Windows-Anmeldeinformationsverwaltung ("Music Suite") |
| Surge XT | `data\plugins\VST3\` (Windows) oder dein eigener VST3-Ordner, wenn du es mit anderen Musikprogrammen teilen wolltest |
| Eigenes Python, FFmpeg, Node.js und Git von Music Suite | `.tools\` |
| Download-Caches (Bibliotheken, Modelle) | `.cache\` und `data\cache\` |
| Deine Synth-Sounds, Plugin-Favoriten, MIDI-Einstellungen, Mapper-Presets | Der Speicher deines Browsers: nicht im Music-Suite-Ordner und nicht in Projektdateien enthalten |

**Alles bleibt in diesem Ordner.** Wie ComfyUI Portable installiert Music Suite nichts in Windows: Python, Werkzeuge, Downloads und Caches liegen in seinem Ordner, und wer den Ordner löscht, entfernt es vollständig. Außerhalb liegen nur die Schlüssel für Online-Dienste (Windows-Anmeldeinformationsverwaltung), was dein Browser speichert (siehe oben), Surge XT, wenn du es mit anderen Musikprogrammen teilen wolltest, und – nur bei der vollständigen Installation – Ollama und die Build-Werkzeuge für die KI-Musik-Engine.

Um eine Session zu sichern oder umzuziehen, nutze im Editor **Exportieren → Ganzes Projekt** (siehe [Speichern, Projektdateien und Rückgängig](#saving-project-files-and-undo)).

<a id="analyser-and-mastering"></a>
## Analyse und Mastering

Die Startseite (`/`) analysiert einen fertigen Song gründlich, sagt dir, was daran nicht stimmt, und mastert ihn für die Veröffentlichung. Hier wird deine Originaldatei nie verändert: Jedes Ergebnis ist eine neue Datei.

Die Seite hat links eine Spalte mit Bedienelementen (Session-Steuerung, Formatumwandlung, KI-Mastering, Laufverlauf, Wiedergabe + Timeline) und rechts eine Spalte mit Ergebnissen (Status-Kacheln, Übersicht, Datei-Analyse, Messwerte, Empfehlungen, Marker und Diagramme). Auf einem schmalen Bildschirm kommt die linke Spalte zuerst.

<a id="the-workflow-in-short"></a>
### Der Ablauf in Kürze

1. **Hochladen:** Ziehe eine Datei auf die Ablagefläche oder drücke **Datei wählen**. Sie wird sofort hochgeladen und zum ausgewählten *Lauf* (ein Song und alles, was daraus entsteht).
2. **Analysieren:** Drücke **Analysieren**. Ein typischer Song braucht zwischen unter einer Minute und ein paar Minuten.
3. **Prüfen:** Lies die Kacheln, Empfehlungen, Marker und Diagramme.
4. **Mastern:** Drücke **Vorschlag übernehmen** (oder stelle selbst ein) und **Mastering starten**.
5. **Speichern:** Wenn es fertig ist, fragt der Dialog **Dateien zum Speichern bereit**, wo die Dateien gespeichert werden sollen.

> **Tipp:** Drücke nach dem Ablegen einer Datei nicht **Hochladen**: Die Datei ist schon hochgeladen, und Hochladen legt eine zweite Kopie im Laufverlauf an.

<a id="header-buttons"></a>
### Schaltflächen in der Kopfzeile

| Schaltfläche | Was sie tut |
|---|---|
| Konfiguration | Zeigt die installierte Version und sucht nach Updates (siehe [Aktualisieren](#updating)). |
| Läufe aktualisieren | Lädt die Liste der Läufe neu. |
| Song-Geometrie | Öffnet den ausgewählten Song in der [Song-Geometrie](#song-geometry-mapper). |
| Song daraus machen / KI-Song-Studio | Öffnet das [KI-Song-Studio](#ai-song-studio) mit Tempo, Tonart und Stil des ausgewählten Songs vorausgefüllt. |
| Studio-Editor | Fügt den ausgewählten Song einer Session im [Studio-Editor](#studio-editor) hinzu, auf Wunsch in Stems zerlegt. |
| Synth-Studio, Modelle & Engines | Öffnen diese Arbeitsbereiche. |
| Verlauf löschen | Löscht jeden Lauf, der gerade nicht arbeitet, auch fehlgeschlagene. Fragt vorher. |
| Harter Reset | Bricht alle wartenden Aufgaben ab, startet die Hintergrund-Worker neu und löscht jeden Lauf, auch aktive. Nur verwenden, wenn etwas hängt. Fragt vorher. |

<a id="session-control"></a>
### Session-Steuerung

- **Ablagefläche / Datei wählen:** nimmt WAV, FLAC, MP3, AAC, OGG, M4A und AIFF an, standardmäßig bis 500 MB und 15 Minuten (beides lässt sich ändern, siehe [Einstellungsreferenz](#settings-reference)).
- **Analysieren:** misst den Song. Ein erneuter Start bei einem fertigen Song analysiert ihn neu.
- **Visual AI:** öffnet das Sonic-Visual-AI-Panel über der Seite: live **Spektrum**, **Orbit** und **Wellenform** mit Bass-, Mitten- und Höhenanzeigen und einer Vollbild-Schaltfläche. Es hat einen eigenen Player. Es bleibt offen, bis du die Seite neu lädst.
- **Optionalen GPU-Weg für Spektrogramme nutzen** (aus): berechnet das lineare Spektrogramm auf der GPU. Dafür braucht es die GPU-Bibliotheken; ohne sie läuft die Analyse auf der CPU weiter und sagt das.
- **Statusfeld:** der Zustand des Laufs (hochgeladen, in Warteschlange, läuft, fertig, fehlgeschlagen), ein Fortschrittsbalken und eine Zeile, die sagt, was gerade passiert (siehe [Analysephasen](#analysis-stages)). Eine bernsteinfarbene Warnung erscheint, wenn sich fünf Minuten lang nichts geändert hat; ein langer Spektrogramm-Schritt kann so lange dauern, und eine wirklich hängende Analyse wird nach zehn Minuten automatisch gestoppt.
- **Exporte: JSON, HTML, PDF:** die Messwerte als Daten und ein vollständiger Bericht als Webseite oder PDF. Sie gibt es, sobald die Analyse fertig ist. Für das PDF wird WeasyPrint gebraucht; ohne es entsteht nur der HTML-Bericht.

<a id="format-conversion"></a>
### Formatumwandlung

Erstellt Kopien des ausgewählten Songs in anderen Formaten.

| Einstellung | Bereich | Standard |
|---|---|---|
| Formate | MP3, WAV, FLAC, AAC, OGG, M4A | MP3, WAV, FLAC |
| MP3 kbps | 96–320 | 320 |
| AAC kbps (auch für M4A) | 96–320 | 256 |

**Auswahl umwandeln** startet die Konvertierung. WAV-Kopien sind 16 Bit; FLAC ist verlustfrei; OGG ist Vorbis mit Qualität 5. Die Konvertierung braucht ffmpeg (wird mit Music Suite installiert). Nach der Analyse werden die Kopien aus der analysierten 48-kHz-Version erstellt und heißen `canonical.mp3`, `canonical.wav` und so weiter. Eine erneute Konvertierung ersetzt die vorherigen Kopien.

<a id="ai-mastering"></a>
### KI-Mastering

Mastert den Song für sein Ziel: stellt die Lautheit ein, kontrolliert Spitzen, gleicht den Klang aus und behebt Probleme, die die Analyse gefunden hat.

<a id="suggested-from-analysis"></a>
#### Vorschlag aus der Analyse

Nach der Analyse schlägt dieses Feld einen Modus, ein Preset, eine Lautheit und eine Spitzengrenze vor, jeweils mit Begründung. **Vorschlag übernehmen** kopiert sie in das Formular darunter (Eingangsgain, Bass-Mono, Stereobreite und Referenzsong bleiben unverändert).

So wird entschieden:

- **V1** für dichte, verlustbehaftete, übersteuerte oder spitzenempfindliche Quellen; **V2** für sauberere Songs mit mehreren Problemen; **V3** für stärkere Korrektur bei Material, das sie verträgt.
- **film** für sehr dynamisches oder leises Material, **voice** für sprachlastiges Material, **club** für bassbetontes Material mit Reserven, sonst **streaming**.

<a id="mastering-settings"></a>
#### Mastering-Einstellungen

| Einstellung | Auswahl / Bereich | Standard | Was sie tut |
|---|---|---|---|
| Modus | V1, V2, V3 | V1 | **V1:** ein sorgfältiger Mastering-Durchgang, dann Feinschliff. Am sichersten. **V2:** probiert mehrere Varianten der Einstellungen aus, bewertet jede und behält die beste. **V3:** teilt den Klang in vier Frequenzbänder (Bass, Mitten, Transienten, der Rest), bearbeitet jedes und setzt sie wieder zusammen. Das sind Frequenzaufteilungen, keine KI-Stems. |
| Preset | streaming, club, film, voice | streaming | Der Ausgangspunkt der Kette: Kompression, De-Essing, Punch und wie weit der Bass mono gemacht wird. Siehe Tabelle unten. |
| Normalisierungsprofil | Aus, YouTube, Spotify, Apple Music, Instagram, TikTok, Rundfunk EBU, Podcast-Sprache | Aus | Füllt Ziel-LUFS und True Peak mit den Werten dieser Plattform. |
| Backend | internal, auto, ffmpeg, pedalboard, matchering | internal | Eine optionale zusätzliche Bearbeitungsstufe. Siehe [Backends](#backends). |
| Referenzsong | Keiner oder ein anderer Song im Laufverlauf | Keiner | Mit matchering: lässt das Master wie diesen Song klingen. |
| Ziel-LUFS | −30 bis −6 | −14 | Wie laut das Master insgesamt ist. |
| True Peak dBFS | −6 bis 0 | −1 | Die höchste erlaubte Spitze, einschließlich Spitzen zwischen den Samples. |
| Eingangsgain (dB) | −12 bis +12 | 0 | Macht die Quelle vor dem Mastering lauter oder leiser, was beeinflusst, wie stark die Kette arbeitet. **Zurücksetzen** stellt sie auf 0. |
| Bass-Mono | Preset-Standard, Aus, 80, 100, 120, 150 Hz | Preset-Standard | Macht alles unterhalb dieser Frequenz mono; das strafft den Bassbereich und hält ihn auf Mono-Lautsprechern sicher. Preset-Standard erlaubt dem Mastering, den Wert bei Phasenproblemen anzuheben; jede andere Wahl legt ihn fest. |
| Stereobreite | 0,5–1,5 oder leer | leer (1,0) | Macht das Stereobild schmaler (unter 1) oder breiter (über 1). Leer erlaubt dem Mastering, es bei Phasenproblemen schmaler zu machen. |
| V2-Varianten | 2–8 | 4 | Wie viele Varianten V2 ausprobiert. Mehr heißt breitere Suche, aber langsamer. Nur in V2. |
| Verfeinerungsdurchläufe | 1–5 | 2 | Wie viele Reparaturdurchgänge auf den Hauptdurchgang folgen dürfen. Ein Durchgang wird nur behalten, wenn er etwas verbessert, ohne anderes zu verschlechtern. |

> **Wichtig:** Die Felder Ziel-LUFS und True Peak haben immer Vorrang vor dem Preset. Wählst du **club** und stehen die Felder noch auf −14 und −1, wird auf −14 LUFS gemastert, nicht auf die −9 von club. Um die Lautheit eines Presets zu nutzen, leere beide Felder oder verwende Vorschlag übernehmen bzw. ein Normalisierungsprofil.

Worauf jedes Preset zielt (wenn die Felder leer sind):

| Preset | Lautheit | Spitzengrenze | Charakter |
|---|---|---|---|
| streaming | −14 LUFS | −1 dBTP | Ausgewogen, sanfte Kompression, Bass mono unter 110 Hz. |
| club | −9 LUFS | −0,5 dBTP | Lauter und dichter, festere Kompression, Bass mono unter 120 Hz. |
| film | −18 LUFS | −2 dBTP | Am dynamischsten, leichte Kompression, Bass mono unter 80 Hz. |
| voice | −16 LUFS | −1,5 dBTP | Klare Sprache, stärkstes De-Essing, Bass mono unter 120 Hz. |

Plattformprofile: YouTube, Spotify, Instagram und TikTok −14 LUFS / −1 dBTP; Apple Music −16 / −1; Rundfunk EBU −23 / −1; Podcast-Sprache −16 / −1,5.

<a id="backends"></a>
#### Backends

| Backend | Was es hinzufügt | Braucht |
|---|---|---|
| internal | Nichts zusätzlich: nur die eingebaute Kette. Am sichersten, am schnellsten und der Standard. | Nichts |
| ffmpeg | Einen zweiten Durchgang mit Filterung, Kompression, Lautheitsnormalisierung und Limiting. | ffmpeg (installiert) |
| pedalboard | Einen zweiten Durchgang mit Filterung, Kompression und Limiting. | Die Pedalboard-Bibliothek |
| matchering | Passt Klang und Lautheit an einen Referenzsong an. | Die Matchering-Bibliothek **und** einen Referenzsong |
| auto | Wählt matchering (wenn verfügbar und eine Referenz gesetzt ist), sonst pedalboard, sonst internal. Nie ffmpeg. | |

Ist ein Backend nicht installiert, verwendet das Mastering stillschweigend **internal**. Unter "Backend selected" im Fortschrittsfeld siehst du, was verwendet wurde, und unter "Pro modules", was installiert ist.

Auf einem langsameren Computer können die zusätzlichen Backends mehrere Minuten pro Song brauchen, während **internal** deutlich unter einer Minute bleibt. Die Kachel **Aktiver Lauf** zeigt die vollständige Lauf-ID des Songs mit einer Kopieren-Schaltfläche, falls du sie anderswo brauchst.

Pro Song läuft immer nur ein Mastering-Durchgang. Drückst du **Mastering starten** erneut, während einer läuft, wird das gemeldet und nichts geändert; warte, bis er fertig ist, und starte dann mit den neuen Einstellungen.

<a id="running-and-reading-the-results"></a>
#### Starten und die Ergebnisse lesen

**Mastering starten** startet es; ein erneutes Mastering ersetzt die vorherigen Master dieses Songs. Das Fortschrittsfeld zeigt die Phase, die beste Ausgabe, das verwendete Backend und einen Fingerabdruck (SHA-256) des Ergebnisses.

- **Feinschliff:** wie viele Reparaturdurchgänge angenommen wurden, die endgültige Problempunktzahl und wie viele Durchgänge zurückgenommen wurden. "Non-regression safeguard" bedeutet, dass das verfeinerte Ergebnis schlechter als die Quelle war und das Mastering sanfter von der Quelle neu begonnen hat.
- **Quellenbewusste Anpassung:** was das Mastering vor dem Start geändert hat und warum. Zum Beispiel senkt es die Spitzengrenze bei einer Quelle, die schon übersteuert, erhöht das De-Essing bei einer scharfen Quelle oder verringert die Breite bei Phasenproblemen. Einstellungen, die du festgelegt hast (Bass-Mono, Stereobreite), werden nicht angetastet.
- **Selbstprüfung nach dem Master:** misst das Master und vergleicht es mit der Quelle.
  - *Bewertung:* starke Verbesserung, teilweise Verbesserung, unverändert oder Verschlechterung.
  - *Problempunktzahl vorher → nachher:* niedriger ist besser. Jede Art von Problem bringt Punkte (Clipping, Spitzenrisiko, zu laut, Mono-Probleme, plattgedrückter Lautheitsumfang 3; Schärfe, Sub-Bass, Einbrüche, zu leise, zu dicht 2). *Plattgedrückter Lautheitsumfang* heißt, das Master hat weniger als die Hälfte des Lautheitsumfangs des Songs behalten: Leise und laute Abschnitte landen fast auf einem Pegel.
  - *Konformität: bestanden* heißt, die Lautheit liegt innerhalb von 0,75 LU vom Ziel, Spitzen liegen höchstens 0,1 dB über der Grenze, es gibt kein Clipping, und die Musik hat noch Punch (genug Crest). Fällt das erste Ergebnis durch, werden automatisch bis zu zwei strengere Versuche gemacht ("Post-check rescue").
  - *Behoben / Verbleibend / Verschlechtert:* welche Probleme sich geändert haben, und *Empfohlene Korrekturen* für das, was bleibt.
- **Gemasterte Dateien:** jede erstellte Datei mit ihrer Lautheit, Spitze und (bei V2) Punktzahl, wobei niedriger besser ist. Alle sind 32-Bit-Float-WAV mit 48 kHz.

| Modus | Dateien |
|---|---|
| V1 | `master_v1.wav` |
| V2 | `master_v2_variant_1…N.wav` und `master_v2_best.wav` |
| V3 | `master_v3.wav` plus die vier Banddateien `stem_bass`, `stem_vocals`, `stem_drums`, `stem_other` |

<a id="outputs-ready-to-save"></a>
### Dateien zum Speichern bereit

Wenn eine auf dieser Seite gestartete Konvertierung oder ein Mastering fertig ist, listet ein Dialog die neuen Dateien auf (beim Mastering nur das beste Master; die anderen stehen in der Tabelle Gemasterte Dateien).

- **Speichern unter...** lässt dich den Speicherort wählen. Browser ohne Speicherdialog laden stattdessen herunter.
- **Schnell-Download** lädt in deinen üblichen Ordner herunter.
- **Verwerfen** entfernt die Zeile.
- **Später** schließt den Dialog; **Fertige Dateien speichern (N)** in der Session-Steuerung öffnet ihn wieder.

Die Liste geht verloren, wenn du die Seite neu lädst; die Dateien selbst bleiben in den Tabellen.

<a id="run-history"></a>
### Laufverlauf

Jeder hochgeladene Song, der neueste zuerst (bis zu 50). Klicke auf eine Zeile, um sie auszuwählen. Beim Wechsel des Songs stoppt die Wiedergabe, und EQ, Geschwindigkeit und Loop werden zurückgesetzt; Mastering-Einstellungen bleiben erhalten.

<a id="playback-and-the-timeline"></a>
### Wiedergabe und Zeitleiste

Der Player spielt den **ursprünglichen Upload** (es gibt keinen eingebauten A/B-Vergleich mit den Mastern; lade sie herunter oder öffne beide im Studio-Editor).

- **Abspielposition:** ziehen, um durch den Song zu wandern.
- **Ausgewählter Abschnitt:** **Linker Marker** und **Rechter Marker** wählen ein Fenster (mindestens 0,25 s). Die zeitbasierten Diagramme zoomen darauf. **Ganzer Track** wählt alles.
- **Marker:** ein Chip pro gefundenem Problem; klicke auf einen, um dorthin zu springen und heranzuzoomen.
- **Übersicht:**
  - **Wellenform-Prüfleiste:** klicken zum Scrubben. Farbige Balken am unteren Rand sind Marker: rot hoch, bernstein mittel, blau niedrig.
  - **Transport:** **Play/Pause**, **−5s / +5s**, **Auswahlbeginn**, **Auswahl loopen**, **Tempo** (0,75–1,5×), **Start bei / Ende bei** der Abspielposition und **Bereich zurücksetzen** (ganzer Song, Loop aus).
  - **Tastatur:** Die Leertaste startet und pausiert; die Pfeiltasten links und rechts springen 5 s.

<a id="delivery-readiness"></a>
### Lieferbereitschaft

| Kachel | Zeigt |
|---|---|
| Lautheit | **Passend** innerhalb von 1,5 LU vom Ziel des gewählten Normalisierungsprofils (−14 LUFS bei Aus), sonst **Heiß** oder **Leise**. |
| True Peak | **Sicher** bei −1 dBFS oder darunter, **Knapp** bis −0,2, sonst **Risiko**. |
| Marker-Last | **Sauber** ohne ernste Marker, **Prüfen** mit bis zu 3, **Achtung** mit mehr. |
| Dynamik | **Offen** mit einem Crest von 8 dB oder mehr, **Kontrolliert** ab 5 dB, sonst **Dicht**. |

Vor der Analyse ist jeder Wert null, daher zeigen diese Kacheln Heiß, Risiko und Dicht, bis der Song analysiert wurde.

<a id="manual-eq"></a>
### Manueller EQ

Ein 20-Band-EQ (20 Hz bis 16 kHz, je ±12 dB) zum Abhören über den Player der Seite. Setze zuerst das Häkchen bei **EQ aktivieren**; solange er aus ist, bewirken die Regler nichts. **EQ zurücksetzen** stellt ihn flach. **EQ-WAV exportieren** rendert den ganzen Song in deinem Browser durch den EQ und speichert eine 16-Bit-WAV namens `<song>_eq.wav`. Bei ausgeschaltetem EQ ist der Export eine unbearbeitete Kopie. Der EQ wirkt sich nicht auf das Mastering aus.

<a id="file-intelligence"></a>
### Datei-Analyse

| Kachel | Was sie dir sagt |
|---|---|
| Format / Codec | Der Dateityp und ob er verlustbehaftet (MP3, AAC…) oder verlustfrei ist. |
| Frequenzbereich | Der Bereich, den die Datei fassen kann, und der Bereich, in dem tatsächlich Klang steckt. |
| Dynamik auf einen Blick | Crest-Faktor (Punch) und Lautheitsumfang (LRA, wie stark sich die Lautheit bewegt). |
| Signaleigenschaften | Samplerate, Kanäle, Bitrate und Bittiefe. |
| Geschätzter Kompressionsverlust | Wie weit unter 20 kHz der Klang aufhört. Eine "verlustfreie" Datei, deren Klang bei 16 kHz endet, wurde wahrscheinlich aus einer MP3 erstellt. |
| Bereichsdetail | Spitze zu Grundrauschen und Spitze zu Lautheit. |

**Kompressionsbewertung** fasst das in einem Satz zusammen. **Warum manche Werte k. A. sind** erklärt jede leere Kachel; meistens hat der Song keine leisen Lücken, in denen sich Rauschen messen lässt, oder er wurde von einer älteren Version analysiert (drücke erneut Analysieren). **Metadaten-Tags** listet die Tags der Datei; **Rohe Metadaten als JSON zeigen** zeigt alle. **Leitfaden: Was alles bedeutet** ist eine Kurzreferenz direkt auf der Seite.

<a id="measurements-recommendations-and-markers"></a>
### Messwerte, Empfehlungen und Marker

| Messwert | Was er bedeutet | Gute Werte |
|---|---|---|
| Integrierte LUFS | Gesamtlautheit. | −14 für Streaming, −9 bis −8 für Club, −23 für Rundfunk |
| True Peak dBFS | Die höchste Spitze, auch zwischen den Samples. | −1 oder darunter |
| Crest-Faktor dB | Der Abstand zwischen Spitzen und Durchschnittspegel: Punch. | 8 dB oder mehr für offen klingende Musik |
| Grundrauschen dBFS | Das Hintergrundrauschen in leisen Lücken. | so niedrig wie möglich; leer, wenn es keine Lücken gibt |

**Empfehlungen fürs Remastering** listen jedes Problem mit einer Priorität (hoch, mittel, niedrig) und was dagegen zu tun ist, zum Beispiel Clipping, Spitzen über −1 dBTP, zu laut oder zu leise, überkomprimiert, Mono-Probleme, Zischlaute, Schärfe, zu viel Sub-Bass, fehlende Höhen oder DC-Offset.

**Marker** sind die Momente, in denen Probleme auftreten:

| Marker | Gefunden, wenn | Schweregrad |
|---|---|---|
| clipping | Drei oder mehr Samples hintereinander auf Vollaussteuerung | hoch, wenn es 5 ms oder länger dauert |
| true_peak_risk | Spitzen bei −1 dBFS oder darüber | hoch |
| mono_incompatibility | Links und rechts löschen sich aus (Korrelation unter −0,1) | hoch |
| loudness_dip | Der Pegel fällt 8 LU oder mehr unter den Durchschnitt des Songs | mittel |
| sibilance | Starke "S"-Laute (6–10 kHz) | mittel |
| harshness_band | Zu viel 3–9 kHz | mittel |
| sub_bass_heavy | Zu viel 20–80 Hz | mittel |
| dc_offset | Die Wellenform ist aus der Mitte verschoben | mittel |

Die Tabelle **Marker nahe Abspielposition / Auswahl** listet sie, die nächstgelegenen zuerst; klicke auf eine Zeile, um dorthin zu springen.

<a id="charts"></a>
### Diagramme

**Diagramm-Studio** filtert die Diagramme: **Alle Ansichten**, **Mix-Prüfung**, **Stereo-Fokus** oder **Spektral**. **Schnellsprung** scrollt zu einem Diagramm. Jedes Diagramm lässt sich mit dem Mausrad zoomen, per Doppelklick zurücksetzen und mit dem Kamera-Symbol als Bild speichern. Ziehe mit der rechten Maustaste über ein Zeitdiagramm, um das ausgewählte Fenster zu verschieben. Die Zeitdiagramme folgen dem ausgewählten Abschnitt.

| Diagramm | So liest du es |
|---|---|
| Wellenform + Hüllkurve | Die Form des Klangs mit Spitzen- und Durchschnittspegel über die Zeit. Flache Oberkanten bedeuten starkes Limiting oder Clipping. |
| Lautheitsverlauf | Lautheit von Moment zu Moment (0,4 s) und von Phrase zu Phrase (3 s) im Vergleich zur Gesamtlautheit des Songs. |
| Durchschnittsspektrum | Wie viel Energie bei jeder Frequenz liegt: Neigung, zu viel Bass, Schärfe, fehlende Luft. |
| Stereokorrelation + M/S | Unter null heißt, dass sich links und rechts bei Mono-Wiedergabe auslöschen. |
| Korrelationsanzeige | Dasselbe über die Zeit: Grün ist sicher, Rot droht in Mono zu verschwinden. |
| Mitte/Seite-Ansicht | Wie viel in der Mitte gegenüber den Seiten liegt, und die Links-rechts-Balance. |
| Vektorskop / Goniometer | Eine senkrechte Linie ist mono; eine breite Wolke ist breites Stereo; eine waagerechte Form ist phasenverkehrt. |
| STFT-Spektrogramm (linear / log) | Zeit gegen Frequenz, Helligkeit ist Pegel. Log ist musikalisch leichter zu lesen. |
| Mel-Spektrogramm | Frequenzen so verteilt, wie das Gehör sie gruppiert. |
| CQT-Spektrogramm | Frequenzen in Musiknoten verteilt: zeigt Tonhöhen und Obertöne. |

Mono-Dateien haben keine Stereo-Diagramme.

<a id="analysis-stages"></a>
### Analysephasen

Die Statuszeile durchläuft: hochgeladen, in Warteschlange, Initialisierung, Metadaten lesen, Dekodieren, Scannen, Lautheit und Dynamik messen, Marker erkennen, Spektrogramme erstellen, Diagramme aufbauen, Bericht erstellen (HTML, dann PDF) und fertig. Ändert sich 10 Minuten lang nichts, wird die Analyse mit der Meldung "Loop guard triggered" gestoppt; drücke **Harter Reset**, wenn ein Lauf danach immer noch hängt.

<a id="studio-editor"></a>
## Studio-Editor

Der Studio-Editor ist ein Mehrspur-Editor für Audio und MIDI. Jede Arbeit ist eine *Session* (auch Projekt genannt), die sich während der Arbeit selbst speichert.

<a id="sessions"></a>
### Sessions

Beim Öffnen von `/editor` siehst du deine Sessions:

- **Neue Session:** Gib einen Namen ein (oder lass ihn leer für "Unbenannte Session") und drücke **Neue Session** oder Enter.
- **Projektdatei öffnen…:** öffnet eine mit Exportieren → Ganzes Projekt gespeicherte `.musicsuite.zip` als neue Session. Deine vorhandenen Sessions bleiben unberührt.
- **Session-Liste:** Klicke auf eine Session, um sie zu öffnen. Das Papierkorb-Symbol fragt **Löschen** oder **Behalten**. **Das Löschen einer Session ist endgültig**: Es lässt sich nicht rückgängig machen.

Wenn ein Song aus einem anderen Arbeitsbereich hierher geschickt wird, fragt die Seite **Wohin soll "Name"?**:

- **Beim Öffnen in Stems trennen** und **wie weit**: so viele, wie dieser Computer schafft, 2, 4 oder 6 Stems oder Alles (12 Stems mit einzelnen Drum-Teilen und Lead-/Backing-Gesang; dafür wird KI-Stem-Trennung gebraucht).
- **Neue Session "Name"** oder **Hier hinzufügen** bei einer vorhandenen Session. Der Song kommt auf eine neue Spur bei 0:00; nichts Vorhandenes wird ersetzt.

<a id="the-editor-screen"></a>
### Der Editor-Bildschirm

Von links nach rechts am oberen Rand:

| Bedienelement | Was es tut | Kürzel |
|---|---|---|
| ← | Zurück zur Session-Liste. | |
| Projektname | Die Session umbenennen. Darunter: Gespeichert, Speichern… oder "Speichern fehlgeschlagen – neuer Versuch bei der nächsten Änderung". | |
| ✦ | Einen Song mit KI in diese Session erzeugen (öffnet das KI-Song-Studio). | |
| Zum Anfang / Abspielen / Loop | Transport. Loop verwendet den markierten Bereich, falls es einen gibt. | Pos1 / Leertaste / L |
| Aufnahme (Mikrofon) | Nimmt Audio auf oder Noten, wenn ein MIDI-Keyboard angeschlossen ist (siehe [Aufnahme](#recording)). Der Tooltip sagt, was davon. | |
| MIDI-Keyboard-Symbol | Verbindet ein MIDI-Keyboard zum Spielen und Aufnehmen von Noten. | |
| **Assistent** | Der [Keyboard-Assistent](#keyboard-wizard). | |
| **Keyboard** | Dein Hardware-Keyboard: Musik darauf abspielen, seinen Klang wählen, darüber aufnehmen (siehe [Dein Hardware-Keyboard](#your-hardware-keyboard)). | |
| Klavier-Symbol | Zeigt ein Bildschirmklavier für die ausgewählte Instrumentenspur. | |
| Uhr | Die Abspielposition. Klicke, um das Lineal zwischen Zeit (m:ss) und Takten (Takt.Schlag) umzuschalten. | |
| Pegel und Lautheit | Die Master-Pegelanzeige sowie Tempo, Taktart und Tonart. Während der Wiedergabe: integrierte, kurzzeitige und momentane Lautheit (LUFS) und der höchste True Peak. Sie wird pink, wenn die Spitze die Grenze überschreitet. | |
| Auswahl-, Schneide- und Bereichswerkzeug | Wie die Maus die Zeitleiste bearbeitet (siehe unten). | V / C / R |
| Magnet | Raster ein oder aus (anfangs ein). | N |
| Automation | Zeigt auf den Spuren Lautstärke, dann Panorama, dann keine Automation. Das Dropdown daneben wählt eine beliebige Automationsspur: Lautstärke, Panorama, Hall-Anteil, Delay-Anteil, Delay-Feedback, Kompressor-Schwelle, EQ-Verstärkungen. | A |
| Spektralansicht | Zeigt die Frequenzen des ausgewählten Clips über die Zeit. | W |
| Lesezeichen | Setzt einen Marker an der Abspielposition. | K |
| Rückgängig / Wiederholen | Bis zu 200 Schritte. | Ctrl+Z / Ctrl+Shift+Z |
| Verkleinern / Vergrößern / Einpassen | | − / + / F |
| **Importieren** / **Exportieren** | Dateien hereinholen; deine Arbeit hinaus speichern (siehe unten). | |
| Tastatur | Die Liste der Tastenkürzel. | ? |

Manche davon sind in schmalen Fenstern ausgeblendet; mach das Fenster breiter, um alle zu sehen.

Unter der Zeitleiste zeigt die Statuszeile, woran gerade gearbeitet wird, einen Hinweis (mit **Ausblenden**) oder einen Tipp zum aktuellen Werkzeug, und rechts die Anzahl der Spuren und Clips sowie die Länge der Session.

Das rechte Panel ist der [Inspector](#editor-tools-the-inspector).

<a id="the-timeline"></a>
### Die Zeitleiste

**Werkzeuge:**

- **Auswahlwerkzeug (V):** Ziehe einen Clip, um ihn zu verschieben (auch auf eine andere Spur), ziehe seine Ränder zum Trimmen, ziehe die kleinen quadratischen Griffe nahe den oberen Ecken für Fades. Mit Shift- oder Ctrl-Klick wählst du mehrere aus. Rechtsklick öffnet ein Menü.
- **Schneidewerkzeug (C):** Klicke auf einen Clip, um ihn dort zu schneiden.
- **Bereichswerkzeug (R):** Ziehe über die Zeit, um sie auf allen Spuren zu markieren. Drücke dann Entf zum Entfernen, Shift+Entf zum Entfernen und Schließen der Lücke oder L zum Loopen.

**Raster** (N, anfangs ein) zieht Bearbeitungen an das Raster, die Abspielposition, Marker, Abschnittsgrenzen und die Ränder anderer Clips. Eine gelbe Linie zeigt, wenn an etwas anderem als dem Raster eingerastet wird. Halte beim Ziehen **Alt** gedrückt, um frei zu platzieren.

**Das Lineal:** Klicken setzt die Abspielposition, Ziehen scrubbt, **Shift+Ziehen** zeichnet einen Loop. Das Band oben zeigt Abschnitte und Marker: Klicke auf einen Abschnitt, um ihn zu markieren, auf einen Marker, um dorthin zu springen, ziehe einen Marker, um ihn zu verschieben, und lösche ihn mit Alt+Klick.

**Bearbeiten:**

| Aktion | So geht's |
|---|---|
| An der Abspielposition teilen | S (oder Ctrl+E). Ohne Auswahl wird jeder Clip unter der Abspielposition geteilt. |
| Löschen | Entf. Ohne ausgewählten Clip wird der markierte Bereich gelöscht. |
| Löschen und Lücke schließen | Shift+Entf: löscht und schiebt alles danach nach links, um die Lücke zu schließen. |
| Duplizieren | Ctrl+D: eine Kopie direkt hinter dem Clip. |
| Kopieren / Ausschneiden / Einfügen | Ctrl+C / X / V. Eingefügt wird an der Abspielposition. |
| Alles auswählen | Ctrl+A |
| Verschieben in Schritten | ← / → verschieben die ausgewählten Clips um einen Rasterschritt (oder die Abspielposition, wenn nichts ausgewählt ist). |
| Zeit eines Clips markieren | Doppelklick darauf. |
| Warp-Marker setzen | Alt+Klick auf einen ausgewählten Audioclip, dann die gestrichelte Linie dorthin ziehen, wo dieser Moment landen soll; im Abschnitt Warp des Inspectors anwenden. |

**Rechtsklick-Menü:** auf einem Clip: Hier teilen, Duplizieren, Umkehren / Vorwärts abspielen, Clip stummschalten / Stummschaltung aufheben, Kopieren, Löschen, Löschen und Lücke schließen. Auf leerer Fläche: Hier einfügen, Abspielposition hierher, Spur hinzufügen, und bei markiertem Bereich: Loopen, Bereich löschen, Bereich löschen und Lücke schließen.

**Überlappende Clips** werden mit einem Crossfade überblendet (das lässt sich in den Projekteinstellungen des Inspectors abschalten).

**Automation:** Bei sichtbarer Automationsspur klickst du auf die gelbe Linie, um einen Punkt hinzuzufügen, ziehst einen Punkt, um ihn zu verschieben, und entfernst ihn per Doppelklick.

**Marker und Abschnitte:** K setzt einen Marker; [ und ] springen zum vorherigen und nächsten. Shift+R macht aus dem markierten Bereich einen Abschnitt. Abschnitte benennst, wiederholst und schneidest du im Inspector.

<a id="tracks"></a>
### Spuren

**+** über den Spurköpfen (oder Shift+T) fügt eine Spur hinzu. Jeder Spurkopf hat:

| Bedienelement | Bereich | Was es tut |
|---|---|---|
| Name | bis zu 60 Zeichen | |
| M | | Stumm (M). |
| S | | Solo (Shift+S): Nur Solo-Spuren sind zu hören. |
| Vol | −60 bis +6 dB, Standard 0 | Spurpegel. |
| Pan | links bis rechts, Standard Mitte | Stereoposition. |
| ˄ ˅ | | Spur nach oben oder unten verschieben. |
| × | | Spur samt Clips löschen. **Ohne Rückfrage**, aber Rückgängig holt sie zurück. |

Klicke auf einen Spurkopf, um die Spur auszuwählen. EQ, Breite, Ausgang, Sends, Farbe, Effekte und Instrument findest du im [Inspector](#track-effects-and-buses).

<a id="recording"></a>
### Aufnahme

**Audio** (die Mikrofon-Schaltfläche):

- **Normale Aufnahme:** nimmt ab der Abspielposition auf die ausgewählte Spur auf. Liegt in diesem Abschnitt der Spur schon ein Clip oder ist keine Spur ausgewählt, kommt die Aufnahme auf eine neue Spur namens "Recording": Aufnahmen landen nie über vorhandenem Audio.
- **Punch-in:** Markiere zuerst einen Bereich. Die Aufnahme beginnt 2 s früher (damit du rechtzeitig einsetzen kannst), behält nur, was im Bereich liegt, und stoppt kurz danach.
- **Loop-Takes:** Bei eingeschaltetem Loop wird jeder Durchgang ein eigener Take auf einer eigenen Spur; der letzte ist zu hören. Wähle den besten Take oder das beste Stück von jedem im Abschnitt **Takes** des Inspectors.
- Drücke erneut Aufnahme oder die Leertaste, um zu stoppen.
- Aufnahmen sind 24-Bit-WAV mit 48 kHz; die Gesprächsverarbeitung des Browsers (Echounterdrückung, Rauschunterdrückung, automatische Verstärkung) ist ausgeschaltet, damit der Klang unverändert bleibt. Die Schaltfläche in der Werkzeugleiste nimmt von deinem Standardeingang auf; um von einem bestimmten Eingang aufzunehmen (etwa dem USB-Audio des Keyboards), verwende das Panel **Keyboard**.

**Noten von einem MIDI-Keyboard:** Wenn ein MIDI-Keyboard angeschlossen (oder das Bildschirmklavier offen) ist und die ausgewählte Spur eine Instrumentenspur mit Notenclip ist, nimmt die Aufnahme-Schaltfläche Noten statt Audio auf. Sustainpedal und Pitch-Bend-Rad funktionieren. Bei eingeschaltetem Loop ergänzt jeder Durchgang denselben Take. Der neue Clip heißt "Played HH:MM:SS"; bei eingeschaltetem Raster wird er auf ganze Takte erweitert.

**Das MIDI-Keyboard-Panel** (das Keyboard-Symbol): **Verbinden**, dann **Hören auf** alle angeschlossenen Keyboards oder nur eines. Es zeigt, welche Spur das Keyboard spielt und ob die Aufnahme Noten erfasst. **Instrumentenspur hinzufügen** legt eine neue Instrumentenspur mit einem leeren Clip von vier Takten an, bereit zum Einspielen.

**Das Bildschirmklavier:** spielt die ausgewählte Instrumentenspur mit Maus oder Touch, genau wie ein MIDI-Keyboard.

<a id="piano-roll-sheet-music-and-spectral-view"></a>
### Piano Roll, Notenblatt und Spektralansicht

Unter der Zeitleiste ist immer nur eine davon zu sehen.

**Piano Roll** (öffnet sich, wenn du einen Notenclip auswählst; P zeigt oder verbirgt sie):

- Klicke auf eine leere Stelle, um eine Note hinzuzufügen; zieh weiter, um ihre Länge festzulegen. Ziehe eine Note, um sie zu verschieben; ziehe ihren rechten Rand, um die Länge zu ändern. Mit Shift+Ziehen wählst du mehrere aus. **Rechtsklick auf eine Note löscht sie.**
- **Anschlagstärke** (wie stark die ausgewählten Noten gespielt werden, 6–127), **Kopieren**, **Einfügen** (an der Abspielposition), **Löschen**.
- **Noteneingabe:** Gib Noten mit den Tasten A W S E D F T G Y H U J K (C4 bis C5) oder einem MIDI-Keyboard ein; jede Note kommt an die Abspielposition und schiebt diese weiter.
- − / + zoomen (oder Ctrl+Mausrad). Drum-Clips zeigen ein Drum-Raster mit benannten Zeilen.

> **Vorsicht:** Drückst du bei offener Piano Roll die Entf-Taste, wird der ganze Clip aus der Zeitleiste gelöscht, nicht die ausgewählten Noten. Verwende stattdessen die Schaltfläche **Löschen** der Piano Roll oder einen Rechtsklick. Rückgängig holt den Clip zurück.

**Notenblatt** (Inspector → Als Notenblatt zeigen): die Noten als Partitur mit zwei Notensystemen, gerundet auf Sechzehntel oder Triolen. Klicke auf einen Takt, um die Abspielposition dorthin zu setzen. Wähle **A4** oder **US Letter**, dann **Drucken** oder speichere als **PDF**.

**Spektralansicht** (W): die Frequenzen des ausgewählten Clips über die Zeit, 50 Hz bis 20 kHz. Ziehe ein Rechteck um ein unerwünschtes Geräusch (ein Husten, ein Quietschen, ein Telefon), dann:

- **Abschwächen** senkt dieses Rechteck um den gewählten Betrag ab (−6 bis −96 dB, Standard −24).
- **Reparieren** ersetzt es durch eine Mischung aus dem Klang kurz davor und danach.

<a id="importing"></a>
### Importieren

**Importieren** nimmt WAV-, FLAC-, MP3-, AAC-, OGG-, M4A-, AIFF- und MIDI-Dateien (.mid) an, auch mehrere auf einmal. Jede Datei kommt auf eine neue Spur bei 0:00. Um Position oder Spur zu wählen, ziehe die Dateien stattdessen auf die Zeitleiste.

MIDI-Dateien werden in deinem Browser gelesen. Jeder Part wird eine Instrumentenspur mit dem Instrument, das die Datei verlangt, und Kanal 10 wird eine Drum-Spur. Das Tempo der Session wird durch den Import einer MIDI-Datei nicht geändert.

<a id="exporting"></a>
### Exportieren

Alles Audio wird mit 48 kHz Stereo durch den vollständigen Mix gerendert, einschließlich Effekten und ihren Ausklängen.

| Eintrag im Export-Menü | Was du bekommst |
|---|---|
| Ganzes Projekt · eine Datei zum späteren Öffnen | `<name>.musicsuite.zip`: die Session und jede Aufnahme darin. Öffne sie auf der Session-Seite mit **Projektdatei öffnen…** |
| Song aus gewählten Spuren · WAV, FLAC oder MP3… | Hake die gewünschten Spuren an und wähle WAV 24 Bit, WAV 32 Bit Float, FLAC oder MP3 320 kbps. Gerade stummgeschaltete Spuren sind anfangs nicht angehakt. Deine Stumm- und Solo-Einstellungen werden nicht verändert. |
| Mixdown · WAV 24 Bit / WAV 32 Bit Float / FLAC / MP3 320 kbps | Der ganze Mix, so wie du ihn hörst (stummgeschaltete Spuren weggelassen). |
| Markierter Bereich · WAV 24 Bit | Nur die Bereichsauswahl. |
| Jede Spur · WAV 24 Bit | Eine Datei pro Spur. |
| Ausgewählte Spur · WAV 24 Bit / MIDI-Datei | Nur die Spur, die du angeklickt hast (das Menü zeigt ihren Namen). |
| Alle Instrumente · MIDI-Datei | Eine MIDI-Datei mit jeder Notenspur, dem Tempo und der Taktart. |
| Mix an Analyzer und Mastering senden → | Analysiert den Mix auf der [Analyzer-Seite](#analyser-and-mastering), bereit zum Mastern. |
| Aus dem Mix einen KI-Song starten → | Öffnet das KI-Song-Studio mit dem Mix als Ausgangspunkt. |

<a id="saving-project-files-and-undo"></a>
### Speichern, Projektdateien und Rückgängig

- **Sessions speichern sich selbst** innerhalb einer Sekunde nach jeder Änderung. Von Hand muss nichts gespeichert werden.
- **Rückgängig** (Ctrl+Z) und **Wiederholen** (Ctrl+Shift+Z) umfassen bis zu 200 Schritte, einschließlich Tempo, Busse, Marker und Loop. Das Ziehen eines Reglers oder das Eintippen eines Namens zählt als ein Schritt. Der Rückgängig-Verlauf geht beim Neuladen der Seite verloren; das Umbenennen der Session lässt sich nicht rückgängig machen.
- Zoom, Scrollposition, das aktuelle Werkzeug und die Auswahl werden nicht gespeichert.
- **Projektdateien** (Exportieren → Ganzes Projekt) enthalten die Session und ihr gesamtes Audio. Nutze sie für Backups und um eine Session auf einen anderen Computer zu bringen. Synth-Sounds und Plugin-Favoriten aus deinem Browser sind nicht enthalten.

<a id="keyboard-shortcuts"></a>
### Tastenkürzel

| Tasten | Aktion |
|---|---|
| Leertaste | Wiedergabe / Pause |
| Pos1 / Ende | Zum Anfang / Ende springen |
| V · C · R | Auswahl- · Schneide- · Bereichswerkzeug |
| S oder Ctrl+E | An der Abspielposition teilen |
| Entf (oder Rücktaste) | Clips oder den markierten Bereich löschen |
| Shift+Entf | Löschen und Lücke schließen |
| Ctrl+D | Duplizieren |
| Ctrl+C · X · V | Kopieren · Ausschneiden · Einfügen an der Abspielposition |
| Ctrl+A | Alle Clips auswählen |
| Ctrl+Z · Ctrl+Shift+Z (oder Ctrl+Y) | Rückgängig · Wiederholen |
| ← / → | Clips verschieben oder Abspielposition schrittweise bewegen |
| M · Shift+S | Gewählte Spur stumm · solo |
| L | Loop (nutzt den Bereich, falls einer markiert ist) |
| N | Raster an/aus (beim Ziehen Alt halten, um es zu umgehen) |
| + / − / F | Vergrößern · Verkleinern · Einpassen |
| Ctrl+Mausrad / Shift+Mausrad | Am Mauszeiger zoomen / seitwärts scrollen |
| Shift+Ziehen im Lineal | Loop-Bereich ziehen |
| Shift+T | Eine Spur hinzufügen |
| W · P · A | Spektralansicht · Piano Roll · Automationsspur |
| K · [ · ] | Marker setzen · vorheriger · nächster Marker |
| Shift+R | Markierten Bereich zu einem Abschnitt machen |
| Esc | Menüs schließen und Auswahl aufheben |
| ? | Liste der Tastenkürzel anzeigen |

Tastenkürzel werden ignoriert, während du in ein Feld tippst.

<a id="editor-tools-the-inspector"></a>
## Editor-Werkzeuge: der Inspector

Der Inspector ist das Panel rechts im Studio-Editor. Was er zeigt, hängt davon ab, was ausgewählt ist:

| Ausgewählt | Der Inspector zeigt |
|---|---|
| Ein Audioclip | Clip, Stems trennen, Reparatur, Takes (nur bei Loop-Takes), Warp, Restaurierung, Tonhöhe und Zeit, KI-Abgleich, Plugins, Komponieren, KI-Bearbeitung, Stimme generieren, Favoriten, dann die Spur des Clips und ihre Effekte |
| Ein MIDI-Clip (Noten) | Clip, MIDI-Clip, Instrument, Plugin-Instrument, dann die Spur und ihre Effekte |
| Nichts | Projekteinstellungen, Arrangement schreiben, Song erstellen, Phasenscope, Busse, Abschnitte, Marker und Medien |

<a id="how-processing-works"></a>
### Wie die Bearbeitung funktioniert

- **Ergebnisse ersetzen den Klang des Clips.** Ein Werkzeug wie **Rauschen mindern** rendert eine neue Datei, und der ausgewählte Clip spielt ab dann diese. Der Name des Clips bekommt einen Vermerk, was getan wurde, zum Beispiel "Vocal (denoised, declicked)". Die Originaldatei bleibt unter **Medien** erhalten, und **Rückgängig** (Ctrl+Z) holt sie zurück.
- **Manche Werkzeuge fügen stattdessen Spuren hinzu:** Stems trennen, In MIDI umwandeln, Ganzer Song zu MIDI, Stimme generieren, das Rendern eines Plugin-Instruments und die KI-Bearbeitungen Extrahieren, Stimme hinzufügen und Aufbauen. Sie lassen das Original, wo es ist.
- **Die Liste **Verarbeitung**** oben im Inspector zeigt jeden laufenden Auftrag mit Fortschrittsbalken und seiner aktuellen Phase. Fertige Aufträge verschwinden nach ein paar Sekunden; fehlgeschlagene bleiben mit dem Grund in Rot stehen, bis du sie mit × schließt.
- **Mehrere Clips auf einmal:** Wähle mehr als einen Clip aus, dann laufen die meisten Audiowerkzeuge auf allen. Die Clip-Überschrift lautet "Clip (N ausgewählt)". Warp, KI-Abgleich, Stimme generieren, KI-Bearbeitung, Ganzer Song zu MIDI und die spektrale Reparatur arbeiten nur mit dem ersten ausgewählten Clip. Notenclips werden von Audiowerkzeugen übersprungen.
- **Regler:** Doppelklicke auf einen Regler, um ihn auf den Standard zurückzusetzen. Fahre mit der Maus darüber, um seinen Wert zu sehen.
- Wird Music Suite neu gestartet, während ein Auftrag läuft, schlägt er mit "The job was interrupted before it finished. Please run it again." fehl.

<a id="clip"></a>
### Clip

| Bedienelement | Bereich / Auswahl | Standard | Was es tut |
|---|---|---|---|
| Clipname | bis zu 80 Zeichen | Dateiname | Der Name auf der Zeitleiste. |
| Gain | −24 bis +24 dB | 0 | Macht diesen Clip vor dem Spur-Fader lauter oder leiser. |
| Fade-in / Fade-out | 0 bis 10 s | 0 | Blendet Anfang oder Ende des Clips ein bzw. aus. |
| Fade-Form | Linear, Gleiche Leistung, S-Kurve | Linear | Gleiche Leistung hält den Pegel bei einem Crossfade gleichmäßig; S-Kurve beginnt und endet sanft. |
| Umkehren | ein / aus | aus | Spielt den Clip rückwärts. |
| Clip stummschalten | ein / aus | aus | Schaltet nur diesen Clip stumm. |
| Teilen (S) | | | Schneidet den Clip an der Abspielposition in zwei. |
| Duplizieren (Ctrl+D) | | | Setzt eine Kopie direkt dahinter. |
| Clip löschen (Entf) | | | Entfernt ihn aus der Zeitleiste (Rückgängig holt ihn zurück). |

<a id="midi-clip"></a>
### MIDI-Clip

Wird bei einem Notenclip angezeigt. Er spielt das Instrument der Spur.

- **Piano Roll öffnen (P):** die Noten bearbeiten.
- **Als Notenblatt zeigen:** die Noten als Partitur.
- **Transponieren −12, −1, +1, +12:** verschiebt jede Note um so viele Halbtöne.
- **Noten auf 1/16 quantisieren:** setzt den Anfang jeder Note auf die nächste Sechzehntel im Projekttempo.
- **Als .mid-Datei exportieren:** speichert nur die Noten dieses Clips.

<a id="separate-stems"></a>
### Stems trennen

Zerlegt eine Aufnahme in ihre Instrumente. Jedes landet auf einer eigenen Spur unter dem Original, zeitlich passend; der Originalclip wird stummgeschaltet, nicht entfernt.

| Bedienelement | Auswahl | Was es tut |
|---|---|---|
| Anzahl der Stems | 2: Gesang + Instrumental · 4: Gesang, Drums, Bass, Sonstiges · 6: dazu Gitarre und Klavier | Mehr Stems heißt feinere Teile. 6 Stems brauchen KI-Stem-Trennung. |
| Drums in Kick, Snare, Toms, Hi-Hat, Ride und Crash zerlegen | ein / aus | Macht aus dem Drum-Stem sechs Spuren. Braucht 4 oder 6 Stems und KI-Stem-Trennung. |
| Gesang in Lead und Backing zerlegen | ein / aus | Macht aus dem Gesangs-Stem zwei Spuren. Braucht KI-Stem-Trennung. |

Bei einem Clip, der schon ein Stem ist, können zwei weitere Schaltflächen erscheinen: **Diesen Drum-Stem in Kit-Teile trennen** und **Diesen Gesangs-Stem in Lead und Backing trennen**.

Die verwendete Engine steht oben im Abschnitt. Mit dem Paket **KI-Stem-Trennung** aus [Modelle & Engines](#models-and-engines) nutzt die App KI-Modelle (RoFormer, htdemucs und DrumSep); ohne es liefert ein einfacher eingebauter Splitter nur ungefähre 2 oder 4 Stems.

Für eine feinere Trennung installiere **MVSep Mega 53** unter **Modelle & Engines**, wähle einen Clip aus und dann **Original-Stems extrahieren → MVSep Mega 53 → Instrumentenspuren extrahieren**. Der erste Lauf lädt die Gewichte herunter. Das Modell schätzt jede Kategorie, daher können manche Spuren Stille oder Übersprechen enthalten. Ein langer Song kann mehrere Gigabyte Audio erzeugen.

Für einen einzelnen Klang installiere **Meta SAM Audio** und authentifiziere das Backend-Konto von Music Suite bei Hugging Face, nachdem du Zugriff auf `facebook/sam-audio-small` erhalten hast. Wähle **Meta SAM Audio**, gib eine Beschreibung wie `muted trumpet` ein und wähle **Klang und Rest extrahieren**.

Um eine neue Darbietung zu erzeugen, wähle einen extrahierten Stem aus und öffne **KI-Bearbeitung → Diesen Stem mit KI rekonstruieren** mit einem Generator, der Restyling unterstützt. Prüfe die vorgeschlagene Beschreibung und die Generierungseinstellungen und starte dann die Bearbeitung. Der extrahierte Clip dient als Referenz. Achte beim Anhören auf Änderungen bei Noten, Phrasierung und Timing.

> **Tipp:** Um einen Song in Noten zu verwandeln, sind 4 Stems besser als 6. Die Sechs-Stem-Trennung rät, ob ein Klang zu Gitarre, Klavier oder "Sonstiges" gehört, und ändert ihre Meinung von Moment zu Moment, wodurch ein Instrument über drei Spuren verstreut wird.

<a id="repair"></a>
### Reparatur

| Bedienelement | Bereich | Standard | Was es tut |
|---|---|---|---|
| Stärke + **Rauschen mindern** | 10–100 % | 60 % | Entfernt Rauschen, Brummen und Hintergrundgeräusche. Höher entfernt mehr, kann aber wässrig klingen. |
| Lautheit + **Lautheit normalisieren** | −30 bis −6 LUFS | −14 LUFS | Macht den ganzen Clip auf diese Lautheit lauter oder leiser und hält Spitzen unter −1 dBTP. Ein sehr spitzenreicher Clip kann etwas leiser ausfallen als gewünscht. |

> **Tipp:** Für die sauberste Rauschentfernung markiere zuerst mit dem Bereichswerkzeug (R) eine Stelle im Clip, die nur Rauschen enthält. Diese Stelle dient als "Rauschprofil" (mindestens 0,1 s). Ohne sie wird der leiseste Teil jedes Frequenzbands als Rauschen behandelt.

Derselbe Lautheitswert ist auch das Ziel für die Option Lautheit des KI-Abgleichs.

<a id="takes"></a>
### Takes

Wird bei Clips angezeigt, die durch Loop-Aufnahme entstanden sind.

- **Diesen Take nehmen:** macht diesen Take über seine ganze Passage zu dem, den du hörst, und schaltet die anderen dort stumm.
- **Diesen Take im markierten Bereich nehmen:** dasselbe, aber nur innerhalb der Bereichsauswahl – so baust du eine Darbietung aus den besten Stücken mehrerer Takes.

<a id="warp"></a>
### Warp

Verschiebt Momente einer Aufnahme zeitlich, ohne ihre Tonhöhe zu ändern. Wird für einen einzelnen, nicht umgekehrten Clip angezeigt.

1. Setze die Abspielposition auf einen Moment (einen Drum-Schlag, ein Wort) und drücke **Marker an der Abspielposition setzen**.
2. Gib ein, wo er landen soll, oder setze die Abspielposition dorthin und drücke **Hierher**.
3. Drücke **Warp anwenden**. Das Audio zwischen den Markern wird passend gedehnt oder gestaucht.

Jede Dehnung muss zwischen einem Viertel und dem Vierfachen der ursprünglichen Länge bleiben.

- **Beats auf N BPM quantisieren:** findet die gespielten Beats und zieht sie auf das Tempo-Raster des Projekts. Das funktioniert, wenn das gespielte Tempo zwischen der Hälfte und dem Doppelten des Projekttempos liegt.
- **Auf die Länge des markierten Bereichs strecken:** macht den Clip genau so lang wie die Bereichsauswahl.

<a id="restore"></a>
### Restaurierung

Korrekturen für beschädigte Aufnahmen. **Stärke** (10–100 %, Standard 50 %) legt fest, wie kräftig DeClick und DeReverb arbeiten.

| Schaltfläche | Was sie behebt |
|---|---|
| DeClick | Klicks, Knackser und Vinyl-Knistern. Höhere Stärke erwischt auch leisere Klicks. |
| DeHum | Netzbrummen mit 50 oder 60 Hz und seine Obertöne, automatisch gefunden. |
| DeClip | Durch zu lautes Aufnehmen abgeflachte Spitzen: baut ihre Form wieder auf und senkt dann den Pegel, um Platz zu lassen. |
| DeReverb | Raumhall. Höhere Stärke klingt trockener, aber möglicherweise dünner. |

Für ein einzelnes Husten oder Stuhlknarren öffne unten die Spektralansicht (W) und ziehe stattdessen ein Rechteck darum (siehe [Studio-Editor](#studio-editor)).

<a id="pitch-and-time"></a>
### Tonhöhe und Zeit

| Bedienelement | Bereich | Standard | Was es tut |
|---|---|---|---|
| Tonhöhe + **Tonhöhe verschieben** | −12 bis +12 Halbtöne | 0 | Ändert die Tonart; die Länge bleibt gleich. |
| Geschwindigkeit + **Time-Stretch anwenden** | 50–200 % | 100 % | Ändert die Länge; die Tonhöhe bleibt gleich. |

Die Qualität hängt von der oben angezeigten Engine ab: Rubber Band (mit den Editor-Extras installiert) ist am besten; der eingebaute Ersatz funktioniert, klingt aber rauer.

<a id="ai-match"></a>
### KI-Abgleich

Passt einen Clip in Tempo, Tonart und Lautheit an das Projekt oder an einen anderen Clip an.

- **Tempo & Tonart erkennen:** analysiert den Clip und zeigt "Erkannt: 120 BPM · a-Moll · −12 LUFS". Am Audio ändert sich nichts.
- **Fürs Projekt übernehmen:** kopiert Tempo und Tonart ins Projekt und schaltet das Lineal auf Takte um.
- **Abgleichen mit:** das Projekt oder einen anderen Clip der Session.
- **Tempo / Tonart / Lautheit** (Tempo und Tonart standardmäßig an): was angepasst wird. Tempo verwendet das nächstliegende von normal, halbem oder doppeltem Tempo und muss zwischen der Hälfte und dem Doppelten bleiben. Die Tonart wird um den kleinsten Schritt verschoben, höchstens sechs Halbtöne; eine Paralleltonart (a-Moll zu C-Dur) braucht keine Änderung.
- **Clip abgleichen:** rendert die angepasste Version und richtet ihre erste Eins am nächsten Takt aus.

<a id="plugins"></a>
### Plugins

Wird angezeigt, wenn das Plugin-Hosting installiert ist und auf diesem Computer VST3-Effekt-Plugins gefunden wurden.

1. Wähle ein Plugin. Seine Regler erscheinen als Schieberegler (die ersten 64).
2. **8 s ab Abspielposition vorhören**, um es zu hören, ohne etwas zu verändern.
3. **Durch Plugin berechnen**, um es anzuwenden. Das Ergebnis wird auf die Länge des Clips gekürzt, ein Hallausklang über das Ende hinaus geht also verloren.

<a id="compose"></a>
### Komponieren

| Schaltfläche | Was sie tut |
|---|---|
| In MIDI-Noten umwandeln | Schreibt die Noten dieses Clips auf eine neue Instrumentenspur. Mit dem Paket **KI-Notentranskription** folgt es Akkorden; ohne es schreibt es eine Note nach der anderen, was zu Gesang, Bass und Leadlinien passt. |
| Ganzer Song zu MIDI (alle Instrumente) | Zerlegt einen kompletten Song und schreibt pro Instrument eine Notenspur. Siehe [Audio in Noten verwandeln](#turning-audio-into-notes). |
| Song-Abschnitte erkennen | Findet, wo sich der Song ändert, und markiert die Abschnitte im Lineal (Section A, B…), wobei Wiederholungen denselben Buchstaben bekommen. Braucht mindestens 8 s Klang. |

<a id="ai-edit"></a>
### KI-Bearbeitung

Verändert einen Clip mit KI, auf diesem Computer (ACE-Step 1.5) oder mit einem Online-Dienst, den du im [KI-Song-Studio](#ai-song-studio) eingerichtet hast. Jede Änderung lässt sich rückgängig machen.

| Aufgabe | Was sie tut | Braucht |
|---|---|---|
| Abschnitt neu generieren | Erzeugt nur den markierten Teil neu und lässt den Rest exakt, wie er ist. | Eine Bereichsauswahl von mindestens 1 s innerhalb des Clips. |
| Verlängern | Fügt 10, 20, 30 oder 60 s neue Musik nach dem Ende oder vor dem Anfang hinzu. | |
| Neuer Stil | Derselbe Song in einem neuen Stil. **Behalten** (5–100 %, Standard 50 %) legt fest, wie nah er am Original bleibt. | |
| Ein Instrument extrahieren | Erzeugt ein Instrument auf einer eigenen Spur neu. Für exakte Stems nimm stattdessen Trennen. | Das Bearbeitungsmodell von ACE-Step (2,4 GB) |
| Stimme hinzufügen | Schreibt eine neue Instrumentenstimme, die zum Clip passt. | Das Bearbeitungsmodell von ACE-Step |
| Einen ganzen Song darum herum bauen | Eine Band um, sagen wir, einen Gesangs-Stem. Das Original wird stummgeschaltet. | Das Bearbeitungsmodell von ACE-Step |

- **Stil:** eine kurze Beschreibung des gewünschten Klangs (mindestens 3 Zeichen).
- **Songtext (optional):** für Neu generieren, Verlängern und Neuer Stil. Leer ergibt ein Instrumental.
- **Versionen (1–4):** Die erste Version ersetzt den Clip oder kommt hinzu; die anderen landen auf stummgeschalteten Spuren, damit du vergleichen kannst.
- Online-Dienste bitten dich, das Hochladen des Clips zu erlauben, und zeigen vor dem Start die Kosten.

<a id="generate-a-part"></a>
### Stimme generieren

Erzeugt aus einem Text-Prompt (zum Beispiel "warm upright bass, walking line") mit MusicGen über ComfyUI auf diesem Computer eine neue Instrumentalstimme, im Tempo und in der Tonart des Projekts. Länge 4–60 s, Standard 15 s. Dafür muss ComfyUI mit den Sonic-Holodeck-Nodes laufen; der Abschnitt sagt es, wenn das nicht der Fall ist.

<a id="favourites"></a>
### Favoriten

Speichert eine Kette von Bearbeitungsschritten, damit du sie mit einem Klick erneut ausführen kannst.

- **Gerade ausgeführt:** wiederholt einen deiner letzten drei Schritte.
- **Letzte 1 / 2 / 3, Name, Speichern:** speichert deine letzten Schritte unter einem Namen. Ein gespeicherter Favorit führt jeden Schritt der Reihe nach aus, jeweils auf dem vorherigen Ergebnis.

Favoriten werden in diesem Browser gespeichert. Trennung, Warping, Anpassung, Transkription und KI-Werkzeuge lassen sich nicht als Schritte speichern.

<a id="project"></a>
### Projekt

Wird angezeigt, wenn nichts ausgewählt ist.

| Einstellung | Bereich | Standard | Was sie tut |
|---|---|---|---|
| Tempo | 40–240 BPM | 120 | Die Geschwindigkeit des Projekts: Raster, Takte, Metronom und generierte Stimmen folgen ihr. |
| Schläge / Takt, Schlag ist | 2–12, Viertel- oder Achtelnote | 4/4 | Die Taktart. |
| Tonart | jede Dur- oder Molltonart | Nicht gesetzt | Wird von Anpassung, Harmonien und generierten Stimmen verwendet. |
| Master | −60 bis +6 dB | 0 | Gesamter Ausgangspegel. |
| True-Peak-Limiter auf dem Master | ein / aus | ein | Verhindert, dass der Mix die Grenze überschreitet, auch zwischen Samples, damit Exporte nie verzerren. |
| Grenze | −6 bis −0,1 dBTP | −1 | Der höchste Pegel, den der Limiter zulässt. |
| Überlappende Clips überblenden | ein / aus | ein | Überlappende Clips gehen weich ineinander über, statt hart zu schneiden. |

**Instrumentenspur (MIDI) hinzufügen** setzt einen Notenclip von vier Takten an die Abspielposition und öffnet die Piano Roll.

<a id="write-an-arrangement"></a>
### Arrangement schreiben

Schreibt Drums, Bass, Akkorde, eine Melodie und mehr als Noten, auf diesem Computer. Wird angezeigt, wenn der Arrangeur eingeschaltet ist.

| Einstellung | Auswahl | Standard |
|---|---|---|
| Beschreibe es (optional) | bis zu 400 Zeichen; wird nur verwendet, wenn Ollama läuft | |
| Stil | Pop, Rock, Ballad, Folk, Electronic, Lo-fi, Hip-hop, Funk, Jazz, Cinematic, Metal, Waltz | Pop |
| Form | verse-chorus, pop, short, loop, AABA, build, instrumental | verse-chorus |
| Tonart, Tempo | beliebig oder Auto (aus dem Stil) | Auto |
| Länge | 4–200 Takte | 32 |
| Stimmen | Drums, Bass, Chords, Melody, Pad, Arpeggio | alle an |
| Geschäftigkeit | 0–1 | 0,5 |
| Seed | eine Zahl oder Auto | Auto: jedes Mal ein anderes Ergebnis |

**Stimmen schreiben** legt pro Stimme eine Instrumentenspur an die Abspielposition und markiert die Abschnitte im Lineal. Ein leeres Projekt übernimmt außerdem Tempo, Tonart und Taktart des Arrangements.

<a id="track-effects-and-buses"></a>
### Spur, Effekte und Busse

**Spur** (jede ausgewählte Spur):

| Bedienelement | Bereich | Standard | Was es tut |
|---|---|---|---|
| Tiefen / Mitten / Höhen | −12 bis +12 dB | 0 | Dreiband-EQ. |
| Breite | 0 (mono) bis 200 % | 100 % | Macht das Stereobild schmaler oder breiter. |
| EQ-Frequenzen und Güte (Q) einstellen… | Tiefen 30–600 Hz, Mitten 150 Hz–8 kHz, Mitten-Q 0,2–8, Höhen 1,5–16 kHz | 160 Hz, 1,2 kHz, 0,8, 6 kHz | Wo jedes EQ-Band wirkt. |
| Ausgang | Master oder ein Bus | Master | Wohin die Spur geht. |
| Sends | −48 bis +6 dB pro Bus | −12 dB beim Einschalten | Schickt eine Kopie nach dem Fader an einen Hall- oder Delay-Bus. |
| Farbe | 8 Farben | | Die Clipfarbe auf der Zeitleiste. |

**Effekte** laufen in dieser Reihenfolge: EQ, Gate, Stimme, Verzerrung, Kompressor, dann Delay und Hall parallel zum trockenen Signal. Sie sind live zu hören und in Exporten enthalten.

| Effekt | Einstellungen (Standard) | Wofür |
|---|---|---|
| Gate | Threshold −45 dB, Attack 2 ms, Hold 60 ms, Release 150 ms | Rauschen zwischen Phrasen stummschalten. |
| Verzerrung | Drive 40 %, Mix 100 % | Biss oder Wärme hinzufügen. |
| Kompressor | Threshold −18 dB, Ratio 3:1, Attack 10 ms, Release 200 ms, Make-up 0 dB | Laute und leise Momente ausgleichen. |
| Delay | Zeit 375 ms, Feedback 35 %, Mix 25 % | Echos. |
| Hall | Größe 1,8 s, Mix 20 % | Raum- oder Saalklang. |

**Stimme** verwandelt eine Stimme in etwas anderes:

- **Presets:** Robot singer, Deep vocoder, Monotone robot, Chipmunk (+12), Helium (+5), Monster (−7), Octave harmony, Ring-mod robot, Metallic robot, Synth voice, 8-bit voice, Vox distortion (megaphone), Old radio.
- **Typ:**
  - Vocoder (Robotersänger)
  - Tonhöhenverschiebung (Chipmunk oder Monster)
  - Roboter (Ringmodulator)
  - Synth-Stimme (folgt deiner Tonhöhe)
  - Vox-Verzerrung
- **Noten** (Vocoder und Synth-Stimme): dem Gesang folgen, auf Halbtöne gerastert, mit Transponieren −24 bis +24; oder eine Note halten (C1–C6). Hältst du Tasten auf einem MIDI-Keyboard, während die Spur spielt, wählst du die Noten selbst, auch Akkorde.
- **Mix:** 0–100 % (Standard 100 %).

Vocoder und Synth-Stimme funktionieren am besten mit einer Solostimme; bei einem vollen Mix folgen sie der jeweils lautesten Note.

**Busse** (nichts ausgewählt): **+ Hall**, **+ Delay** und **+ Gruppe** fügen einen gemeinsamen Effekt- oder Gruppenkanal hinzu. Jeder Bus hat einen Pegel, eine Stummschaltung und eigene Effekte. Schicke Spuren über ihre Sends dorthin.

**Browser-Plugin:** Web-Audio-Plugins der Community von webaudiomodules.com. Das ist der einzige Teil der App, der Code aus dem Internet lädt, daher bleibt er aus, bis du **Internet-Plugins in diesem Browser erlauben** drückst.

<a id="sections-markers-and-media"></a>
### Abschnitte, Marker und Medien

Wird angezeigt, wenn nichts ausgewählt ist.

- **Abschnitte:** **Abschnitt aus markiertem Bereich** (Shift+R). Jeder Abschnitt lässt sich auswählen, **wiederholen** (eine Kopie wird direkt dahinter eingefügt) oder mit **Herausschneiden** entfernen (die Lücke wird geschlossen).
- **Marker:** Drücke K, um einen an der Abspielposition zu setzen; klicke auf einen, um dorthin zu springen.
- **Medien:** jede Datei und jeder gerenderte Take im Projekt, einschließlich Originalen, die durch Bearbeitung ersetzt wurden. Klicke auf eine, um sie auf einer neuen Spur an der Abspielposition einzufügen.
- **Phasenscope:** zeigt, ob links und rechts in Phase sind. Grün ist in Ordnung; Rot heißt, dass sich Teile bei Mono-Wiedergabe auslöschen.

<a id="instruments-and-sounds"></a>
## Instrumente und Sounds

Jede Instrumentenspur (MIDI) spielt ihre Noten über ein Instrument. Wähle es im Inspector aus, während ein Notenclip ausgewählt ist.

<a id="instrument-types"></a>
### Instrumenttypen

- **Typ:** *Synth (Noten mit Tonhöhe)* oder *Drumkit*. Das eingebaute Drumkit spielt Kick (Note 36 und darunter), Snare (37, 38, 40), Clap (39), geschlossene Hi-Hat (42, 44), offene Hi-Hat (46), Becken (49 und ab 51) und Toms für die Noten dazwischen. Die Notenlänge wird bei Drums ignoriert.
- **Sound von:** *Eigener Synth-Sound dieser Spur* oder eines der 128 General-MIDI-Instrumente (Klaviere, Orgeln, Gitarren, Bässe, Streicher, Bläser, Pads und so weiter). Die General-MIDI-Wahl wird auch in exportierte MIDI-Dateien geschrieben.
- **SoundFont (.sf2):** Lade einen mit **SoundFont laden**, um die General-MIDI-Instrumente mit echten Samples zu hören. Ohne SoundFont spielt der eingebaute Synth seinen nächstliegenden Sound. Ein SoundFont gilt für jede Spur, bleibt nur in diesem Browser und wird nie hochgeladen. **Entfernen** vergisst ihn.

<a id="the-built-in-synth"></a>
### Der eingebaute Synth

Schnelle Regler im Inspector:

| Bedienelement | Bereich | Standard | Was es tut |
|---|---|---|---|
| Sound | 17 Werks-Presets und deine eigenen Sounds | Init | Analog bass, Acid bass, Sub bass, Wobble bass, Supersaw lead, Mono lead, Pluck, Warm pad, Sweep pad, Strings, Brass, Organ, FM bell, FM electric piano, Noise riser, Chip square. |
| Helligkeit | 60 Hz – 18 kHz | 3,2 kHz | Heller oder dumpfer (die Filter-Cutoff-Frequenz). |
| Attack | 1 ms – 2 s | 10 ms | Wie schnell eine Note einsetzt. |
| Release | 5 ms – 4 s | 200 ms | Wie lange eine Note nach dem Loslassen ausklingt. |

**Sound bearbeiten…** öffnet den vollständigen Sound-Editor, der dem [Synth-Studio](#synth-studio) entspricht: drei Oszillatoren, Filter, Rauschen und FM, zwei Hüllkurven, zwei LFOs und bis zu acht Modulationswege. **Als meinen Sound sichern** behält einen Sound für jede Spur und für das Synth-Studio; **Exportieren** und **Importieren** bringen Sounds als `.mssound`-Dateien zwischen Computern hin und her.

<a id="plugin-instruments-vst3"></a>
### Plugin-Instrumente (VST3)

Plugin-Instrumente wie **Surge XT** (kostenlos, installiert über [Modelle & Engines](#models-and-engines)) laufen auf diesem Computer außerhalb des Browsers.

- **Plugin-Instrument:** *Keins* (der eingebaute Synth spielt) oder eines der auf diesem Computer gefundenen Instrumente.
- **Sounds:** bei Surge XT eine durchsuchbare Liste seiner Werks-Sounds. Markiere einen Sound mit einem Stern, um ihn unter **★ Favoriten** zu behalten.
- **Abspielen:** spielt den Clip in einer Schleife durch das Plugin, damit du es hörst. **Stopp** beendet das.
- **Mit dem MIDI-Keyboard spielen:** startet das Plugin, damit dein Keyboard es live spielt (die Aufnahme erfasst die Noten).
- **Volle Oberfläche von <name> öffnen:** öffnet das eigene Fenster des Plugins auf dem Desktop (es kann hinter dem Browser liegen). **Sound behalten und Fenster schließen** speichert, was du dort eingestellt hast.
- **Diesen Clip mit <name> berechnen:** macht aus den Noten Audio auf einer neuen Spur unter der Instrumentenspur und schaltet den Notenclip stumm, damit er nicht doppelt zu hören ist.
- **Sound exportieren / Sound importieren:** einen Plugin-Sound als Datei speichern oder laden.

Noten erreichen ein Plugin-Instrument 15–25 ms nach dem Spielen; Bluetooth-Kopfhörer fügen ihre eigene Verzögerung hinzu.

<a id="turning-audio-into-notes"></a>
## Audio in Noten verwandeln

Music Suite kann die Noten einer Aufnahme als MIDI aufschreiben: einen Clip oder einen ganzen Song mit einer Spur pro Instrument.

<a id="ways-to-do-it"></a>
### Wege dorthin

| Wo | Wofür |
|---|---|
| Inspector → Komponieren → **In MIDI-Noten umwandeln** | Ein Clip: ein Gesang, eine Basslinie, ein Klavier, ein Stem. |
| Inspector → Komponieren → **Ganzer Song zu MIDI (alle Instrumente)** | Ein kompletter Mix: eine Notenspur pro Instrument. |
| Der [Keyboard-Assistent](#keyboard-wizard), Schritt Song | Dasselbe, mit den besten Einstellungen für dich ausgewählt. |

<a id="what-kind-of-recording-it-is"></a>
### Was für eine Aufnahme es ist

Der Assistent fragt, was die Aufnahme ist. Das ist wichtiger als jede andere Einstellung:

| Auswahl | Was passiert | Am besten für |
|---|---|---|
| Ein ganzer Song oder unsicher | In vier Stems zerlegt (Gesang, Drums, Bass, Sonstiges), jeder mit dem passenden Modell aufgeschrieben und dann bereinigt. Enthält ein Stem 90 % oder mehr des Klangs, wird die Aufnahme als einzelnes Instrument erkannt und stattdessen als Ganzes aufgeschrieben. | Mixe und alles, wo du unsicher bist |
| Nur ein Klavier | Direkt von einem reinen Klaviermodell notiert, ohne Zerlegung. | Soloklavier: die genaueste Option |
| Ein anderes Instrument | Direkt notiert, mit Akkorden. | Eine Gitarre, ein Synth oder eine Orgel allein |
| Eine Stimme oder Melodielinie | Als einzelne Linie notiert, eine Note nach der anderen. | Ein Sänger, ein Pfeifen, eine Leadlinie, eine Basslinie |

Wird die Aufnahme eines einzelnen Instruments zerlegt, reißt das sie in Stücke: Ein Soloklavier, sechsfach zerlegt, kam mit 6 % seiner Noten zurück. Sagst du der App, was die Aufnahme ist, vermeidest du das.

<a id="which-engines-write-the-notes"></a>
### Welche Engines die Noten schreiben

| Teil | Engine | Braucht |
|---|---|---|
| Klavier | Transkun, ein reines Klaviermodell | Paket KI-Notentranskription |
| Akkorde und andere Instrumente | basic-pitch | Paket KI-Notentranskription |
| Stimme, Bass, einzelne Linien | basic-pitch (eine Note nach der anderen) oder pYIN ohne das Paket | |
| Drums | Schläge, die auf jedem getrennten Drum-Teil gefunden werden (Kick, Snare, Toms, Hi-Hat, Ride, Crash) | KI-Stem-Trennung für die Drum-Teile; ohne sie nur Kick, Snare und Hi-Hat |
| Ganzer Mix in einem Durchgang (optional) | MuScriptor: benennt bis zu 35 Instrumente | Manuelle Installation; nur nicht kommerzielle Nutzung |

**Methode** (angezeigt, wenn MuScriptor installiert ist): *Beste verfügbare* (die Stem-Methode, die besser abgeschnitten hat), *MuScriptor: ein Modell hört den ganzen Mix* oder *Stems: erst zerlegen, dann ein Modell pro Instrument*.

<a id="how-the-notes-are-cleaned-up"></a>
### Wie die Noten bereinigt werden

- **Jede Note wird mit dem Audio abgeglichen.** Eine Note, die in der Aufnahme in diesem Moment nicht zu hören ist, fliegt raus. Das entfernt die meisten "seltsamen, unpassenden Noten".
- Noten außerhalb dessen, was eine Stimme oder ein Bass hervorbringen kann, werden entfernt.
- Kurze, leise Noten außerhalb der Tonart des Songs werden entfernt, aber nur, wenn die Tonart sicher erkannt wurde.
- Klang, der von einem Instrument in den Stem eines anderen übergesprochen hat, wird entfernt.
- Stille Stems werden übersprungen, und ein Song ohne Drums bekommt keine Drum-Stimme.
- Notenanfänge werden am eigenen Beat des Songs ausgerichtet (Sechzehntel oder Triolen).
- Die Noten behalten die Länge, mit der sie in der Aufnahme gehalten werden.

<a id="how-accurate-it-is"></a>
### Wie genau es ist

Gemessen an einem Klavierstück mit 47 bekannten Noten:

| Weg | Richtige Noten | Erfundene Noten | Gehaltene Länge |
|---|---|---|---|
| Nur ein Klavier | 92 % | keine | 101 % der notierten |
| Ein ganzer Song oder unsicher (als ein Instrument erkannt) | 92 % | keine | 101 % |
| Dasselbe Stück auf einem Roland GO:KEYS 3 gespielt, aufgenommen und notiert | 96 % | keine | 100 % |

Klare Stimmen (ein Leadgesang, eine Basslinie, ein Soloinstrument) kommen nah heran. Dichte Mixe sind nur ungefähr, weil schon die Trennung Instrumente vermischt: Bei einem kompletten Song ließen sich etwa 95 % der Noten beim Gesang im Audio bestätigen, 91 % bei der Gitarre, 80 % beim Bass und 71 % beim Stem "Sonstiges". Prüfe die Ergebnisse mit dem Ohr und korrigiere falsche Noten in der Piano Roll.

> **Tipp:** Für die besten Ergebnisse installiere sowohl **KI-Stem-Trennung** als auch **KI-Notentranskription** über [Modelle & Engines](#models-and-engines).

<a id="your-hardware-keyboard"></a>
## Dein Hardware-Keyboard

Ein per USB angeschlossenes Hardware-Keyboard (zum Beispiel ein Roland GO:KEYS 3) kann deine Musik mit seinen eigenen Sounds spielen, und sein Klang lässt sich direkt zurück in eine Session aufnehmen. Alles dazu findest du hinter der Schaltfläche **Keyboard** im Editor.

<a id="connecting-the-keyboard"></a>
### Das Keyboard anschließen

1. Verbinde das Keyboard mit einem USB-Kabel mit dem Computer und schalte es ein. Stelle seine Lautstärke auf etwa drei Viertel.
2. Öffne Music Suite in **Chrome oder Edge** (andere Browser können nicht mit MIDI-Hardware sprechen).
3. Drücke im Editor **Keyboard**, dann **Verbinden**, und erlaube MIDI, wenn der Browser fragt.
4. Wähle das Keyboard unter **Keyboard** und seinen **Kanal**. Ein GO:KEYS 3 hört **nur auf Kanal 4**; die meisten anderen Keyboards, die auf "alle empfangen" stehen, reagieren auf jedem.
5. **Ausgang testen: drei Noten spielen:** Du solltest sie auf dem Keyboard hören.

Ein GO:KEYS 3 erscheint für MIDI als "Roland Digital Piano" und für Audio als "Line (Roland Digital Piano)".

<a id="play-my-music-on-the-keyboard"></a>
### Meine Musik auf dem Keyboard spielen

**Was das Keyboard spielt, wenn der Song läuft:**

- *Nichts:* Noten erklingen am Computer.
- *Alle Stimmen zusammen:* jede Notenspur.
- *Eine Stimme:* eine einzelne Spur.

Die gewählten Noten gehen bei normaler Wiedergabe an das Keyboard, und ihr Klang am Computer wird stummgeschaltet, damit sie nicht doppelt zu hören sind. Aufgelistet werden nur Spuren mit Noten; wandle Audio zuerst in Noten um (siehe [Audio in Noten verwandeln](#turning-audio-into-notes)) oder nutze den Assistenten.

**Gleichzeitige Noten:** *Alle* oder eine Grenze von 1, 2, 3, 4 oder 6. Manche Keyboard-Sounds, besonders Charakterstimmen, machen aus vielen gleichzeitigen Noten einen Brei; eine Grenze behält die lauteren Noten und lässt den Rest weg.

<a id="choosing-the-keyboards-voice"></a>
### Den Sound des Keyboards wählen

**Keyboard-Sound** wählt jeden Sound, den das Keyboard hat:

1. Wähle eine **Bank**.
2. Blättere mit **◀ ▶** durch ihre Sounds oder gib die Nummer des Sounds ein. Jede Änderung wird an das Keyboard geschickt und angespielt, du hörst also, was du siehst.
3. **Anhören** spielt einen kurzen Akkord mit dem aktuellen Sound.

Du kannst auch eine Sound-Taste am Keyboard selbst drücken; wenn das Keyboard das meldet, übernimmt die App ihn.

Bänke des GO:KEYS 3:

| Bank | Was sie enthält |
|---|---|
| Extra voices (71/99) | Weitere Sounds, die nicht in Rolands veröffentlichter Klangliste stehen; bei der Minion-Edition liegen hier die Charakterstimmen. |
| Preset A, B, C (71/96, 71/97, 71/98) | Die Hauptklangliste: Klaviere (Preset A, Nummer 1, ist der Flügel), Orgeln, Streicher, Synths und so weiter. |
| Common 1–7 (87/85 bis 87/91) | Weitere Sounds im General-MIDI-Stil. |
| Drum kits (86/65) | Drumkits. |

Das Keyboard spielt immer nur einen Sound gleichzeitig, deshalb wird ein Song mit mehreren Stimmen eine Stimme nach der anderen aufgenommen.

<a id="recording-a-part-through-the-keyboard"></a>
### Eine Stimme über das Keyboard aufnehmen

1. **Audioeingang:** **Eingänge suchen**, dann den eigenen Ausgang des Keyboards wählen (beim GO:KEYS 3 "Line (Roland Digital Piano)"). **Eingang testen** zeigt, ob Klang ankommt.
2. **Timing:** **Verzögerung messen**. Das Keyboard antwortet ein paar Dutzend Millisekunden zu spät; misst du das einmal, landet jeder Take genau im Timing.
3. **Durchlauf aufnehmen:** Wähle die Stimme und drücke **… über das Keyboard aufnehmen**. Die Stimme wird ausgespielt, und was zurückkommt, wird auf einer neuen Spur namens "<part> (keyboard)" aufgenommen. Die Notenspur bleibt, wie sie war, du kannst also erneut aufnehmen.

**Automatischer Pegel:** Vor jedem Take spielt die App den lautesten Akkord der Stimme, so lange gehalten, wie die Stimme ihn hält (bis zu etwa 1,6 Sekunden, damit auch anschwellende Sounds gemessen werden), misst, was zurückkommt, und stellt die Lautstärke des Keyboards über MIDI so ein, dass dieser Moment bei etwa einem Drittel der Vollaussteuerung liegt. Das lässt Platz für überlappende gehaltene Akkorde und weiter anschwellende Sounds, sodass ein ganzer Take unter der Verzerrung bleibt. Vor jedem Take kommen so ein paar Sekunden Testakkorde dazu. Ein sehr leiser Sound kann selbst bei voller Lautstärke unter dem Ziel bleiben.

**Prüfungen nach jedem Take:**

- *Still:* Der Take wird nicht gespeichert, und du erfährst, dass das Keyboard nicht mehr antwortet (siehe [Fehlerbehebung](#troubleshooting)).
- *Verzerrt:* Der Take wird trotzdem gespeichert, und du wirst informiert. Im Assistenten wird er von selbst neu aufgenommen, jedes Mal etwa 6 dB leiser, bis zu drei Versuche; nur wenn selbst eine niedrige MIDI-Lautstärke verzerrt, wirst du gebeten, den Lautstärkeregler am Keyboard selbst herunterzudrehen.

<a id="keyboard-wizard"></a>
## Keyboard-Assistent

Die Schaltfläche **Assistent** im Editor führt einen Song Schritt für Schritt komplett durch das Keyboard: Entweder fügt er ihm eine neue Stimme hinzu oder besetzt seine Stimmen neu. Jeder Schritt sagt, was er gerade tut, während er es tut.

<a id="step-1-song"></a>
### Schritt 1: Song

Sag, was die Aufnahme ist: *Ein ganzer Song oder unsicher*, *Nur ein Klavier*, *Ein anderes Instrument* oder *Eine Stimme oder Melodielinie* (was jede Wahl bewirkt, steht unter [Audio in Noten verwandeln](#turning-audio-into-notes)). Dann **Song-Datei laden…** oder **Diesen nehmen** für einen Song, der schon auf der Zeitleiste liegt. Der Assistent zerlegt ihn bei Bedarf und schreibt seine Noten auf; ein Song von drei Minuten braucht ein paar Minuten.

Hat die Session schon Notenspuren, geht es mit **Überspringen** direkt weiter.

<a id="step-2-keyboard"></a>
### Schritt 2: Keyboard

**Keyboard prüfen** findet das MIDI des Keyboards, findet seinen Audioeingang, spielt eine Testnote und misst, wie lange der Klang für den Rückweg braucht. Wenn es klappt, werden alle drei aufgelistet. Erlaube MIDI und das Mikrofon, wenn der Browser fragt: Der Klang des Keyboards kommt als Audioeingang herein.

<a id="step-3-voices"></a>
### Schritt 3: Sounds

Wähle, was passieren soll:

**Dem Song eine Stimme hinzufügen** (der Standard). Der Song bleibt genau, wie er ist, und eine neue Stimme wird passend dazu geschrieben:

| Was die neue Stimme tut | Wie sie entsteht |
|---|---|
| Die Melodie singen | Die Melodie des Songs, eine Note nach der anderen, in eine Singlage gebracht. Aus der Gesangsstimme genommen, falls es eine gibt, sonst aus der obersten Linie der anderen Stimmen. |
| Eine Harmonie singen | Eine Terz über der Melodie, in der Tonart des Songs. |
| Akkorde halten | Lange Noten, die Takt für Takt den Akkorden des Songs folgen, drei gleichzeitig, wie ein Begleitchor. |

Hake eine oder mehrere davon an. Jeder angehakte Stil wird eine eigene Stimme, die nacheinander aufgenommen wird, und die Takes spielen zusammen: die Melodie, ihre Harmonie und gehaltene Akkorde darunter. Gehaltene Akkorde werden drei Stimmen (tief, mittel, hoch), weil die Minion-Sounds immer nur eine Note gleichzeitig spielen. Drücke **Mitsing-Stimme schreiben**. Sie entsteht aus den eigenen Noten des Songs, Tonart, Tempo und Akkorde kommen also aus dem Song. **Neu schreiben** ersetzt sie, zum Beispiel nachdem du einen anderen Stil gewählt hast. Die neue Stimme beginnt in der Bank **Extra voices** des Keyboards, wo die Minion-Edition des GO:KEYS 3 ihre Charakterstimmen hat; blättere darin zu der, die du willst. Das verdoppelt, harmonisiert oder begleitet die vorhandene Melodie des Songs; es komponiert keine neue Gegenmelodie und ist nur so gut wie die in Schritt 1 notierten Noten.

**Stimmen des Songs umbesetzen.** Die eigenen Stimmen des Songs werden vom Keyboard mit Sounds gespielt, die du wählst. Hake die Stimmen an, die dabei sein sollen. **Stummschalten, was das Keyboard ersetzt** schaltet jede Originalstimme stumm, sobald ihr Keyboard-Take da ist; ohne Häkchen spielt das Original unter den Takes voll weiter.

Für jede Stimme:

| Einstellung | Auswahl | Standard | Was sie tut |
|---|---|---|---|
| Sound | Jede Bank und jeder Sound oder der aktuelle Sound des Keyboards | Klavierstimmen: der Flügel; Mitsingen: Extra voices | Womit das Keyboard die Stimme spielt. |
| Gleichzeitige Noten | 1 (Melodie), 2, 3, 4, Alle | Gesang, Bass und Leadlinien: 1; Mitsing-Akkorde: 3; alles andere: Alle | Dünnt Akkorde für Sounds aus, die sie verschwimmen lassen. |
| Oktave | Singlage, 2 höher, 1 höher, Wie notiert, 1 tiefer | Linien: Singlage; andere: Wie notiert | Verschiebt die Stimme um ganze Oktaven. Singlage zentriert sie um das G über dem eingestrichenen C. |
| Notenlänge | Bis zur nächsten gehalten, Raum zum Sprechen, Wie notiert | Linien: Bis zur nächsten gehalten; andere: Wie notiert | *Bis zur nächsten gehalten* verbindet die Noten (eine lange Stille bleibt Stille); *Raum zum Sprechen* gibt kurzen Noten mindestens eine Viertelsekunde. |
| Eine Note nach der anderen | ein / aus | Ein für die Extra voices des Keyboards (die Minion-Sounds); sonst aus | Gemessen am GO:KEYS 3: Diese Sounds spielen immer nur eine Note gleichzeitig, und eine neue Note schneidet das Wort ab, das gerade noch gesprochen wird. Ist das an, beginnt keine Note, bevor die vorherige ihre kürzeste Länge hatte, und jede Schicht wird als eigener Take aufgenommen. |
| Kürzeste Note | 0 bis 2 Sekunden | Gesungene Mitsing-Stimmen: 0,6 s; andere: wie geformt | Jede Note dauert mindestens so lange. Ein Sound, der ein Wort sagt (ein Minion-Sound), wird abgeschnitten, wenn seine Note endet; gib ihm also genug Zeit für das Wort. |
| Wenn eine Note in die nächste läuft | Nächste Note auslassen (Wörter klingen aus), Überlappen lassen | Mitsingen: Auslassen | *Auslassen* lässt eine kurze Note weg, die beginnen würde, während noch ein Wort gesprochen wird; so werden weniger Noten gesungen, aber jedes Wort bleibt ganz. *Überlappen* behält jede Note und lässt sie übereinander klingen. Gehaltene Akkorde werden nie ausgelassen. |
| Eine Terz höher | ein / aus | aus | Spielt eine Terz über der Stimme statt der Stimme selbst. |
| Schichten hinzufügen | Terz darüber, Quinte darunter, Oktave darüber, Oktave darunter | keine | Noten, die etwas leiser zu jeder Note der Stimme hinzukommen; Terz und Quinte folgen der Tonart des Songs. Ist *Eine Note nach der anderen* an, wird jede Schicht im selben Rhythmus als eigener Take auf einer eigenen Spur aufgenommen; sonst werden sie zusammen in einem Take gespielt. |

Manche Minion-Sounds sagen ein kurzes Wort, das von selbst endet (gemessen etwa 0,3 bis 0,8 Sekunden), egal wie lange die Taste gehalten wird. Eine längere *Kürzeste Note* verlängert ein solches Wort nicht; sie gibt ihm Raum, vor der nächsten Note auszuklingen.

<a id="step-4-record"></a>
### Schritt 4: Aufnahme

**Eine Stimme nach der anderen aufnehmen** (empfohlen). Für jede Stimme:

1. Prüfe oder ändere ihren Sound und ihre Einstellungen, dann **Diese Stimme aufnehmen** oder **Überspringen**.
2. Hör mit **Allein anhören** oder **Mit dem Song anhören** hinein. Das ändert nur, was du hörst; in der Session ändert sich nichts.
3. **Neu aufnehmen**, nachdem du etwas geändert hast (der neue Take ersetzt den alten), oder **Behalten, nächste Stimme**.

**Alle ohne Pause aufnehmen** nimmt jede Stimme nacheinander auf, ohne auf dich zu warten.

Vor jedem Take wird der Pegel des Keyboards automatisch eingestellt (siehe [Dein Hardware-Keyboard](#your-hardware-keyboard)). Kommt ein Take verzerrt zurück, nimmt der Assistent diese Stimme von selbst neu auf, jedes Mal etwa 6 dB leiser, bis zu drei Versuche, und bittet dich erst dann, den Lautstärkeregler am Keyboard selbst herunterzudrehen. Kommt ein Take still zurück, hält der Assistent an, statt leere Spuren zu speichern.

<a id="step-5-done"></a>
### Schritt 5: Fertig

Jeder behaltene Take liegt auf einer eigenen Spur, die nach seiner Stimme benannt ist, und die Notenspuren sind stummgeschaltet. Im Modus *Stimme hinzufügen* wird sonst nichts verändert; im Modus *Umbesetzen* werden die ersetzten Stimmen stummgeschaltet, wenn du diese Option angehakt hast. **Ergebnis abspielen** spielt den ganzen Song von Anfang an. Passe die Fader an und exportiere wie gewohnt (Exportieren → Mixdown oder Song aus gewählten Spuren).

<a id="ai-song-studio"></a>
## KI-Song-Studio

Unter **Einstellungen → Downloads und Updates lokaler Modelle** wählst du eine Runtime, prüfst ihre Voraussetzungen und bestätigst den Download. Nach der Installation wählst du die Engine im Generierungsformular. HeartMuLa und MiniMax Music 3 nehmen Songtexte an. DiffRhythm verwendet Songtexte mit Zeitstempeln und bietet Renderings von 95 und 285 Sekunden. Magenta RealTime 2 rendert Instrumentals offline. Stable Audio 3 arbeitet auch mit einem Editor-Clip. Wähle den Clip aus und öffne **KI-Bearbeitung**, um ihm einen neuen Stil zu geben, einen markierten Bereich neu zu generieren oder über das Ende der Quelle hinaus weiterzumachen. Jede Runtime hat ihre eigenen Abhängigkeiten. Manche Gewichte werden bei der ersten Generierung heruntergeladen.

Erzeugt Songs mit KI: auf diesem Computer mit ACE-Step 1.5 oder mit einem Online-Dienst, den du mit deinem eigenen Schlüssel einschaltest. Ergebnisse öffnen sich im Studio-Editor. Die Seite hat vier Tabs: **Erstellen**, **Album**, **Verlauf** und **Einstellungen**.

<a id="generators"></a>
### Generatoren

| Generator | Wo er läuft | Braucht | Hinweise |
|---|---|---|---|
| ACE-Step 1.5 (auf diesem Computer) | Dein Computer | Die lokale Engine (etwa 5,3 GB, über die Einstellungen installiert) | Standardmäßig an. Komplette Songs mit Gesang, offline. Macht auch KI-Bearbeitungen. |
| ACE-Step 1.5 (dein eigener Python-Server) | Dein Computer | Der eigene Server von ACE-Step, bereits laufend | Standardmäßig aus. Am besten auf NVIDIA. |
| YuE2 (auf diesem Computer, nicht kommerziell) | Dein Computer | NVIDIA-GPU mit etwa 24 GB und eine separate YuE2-Installation | Standardmäßig aus. Lizenz CC BY-NC 4.0: nicht für kommerzielle Nutzung. |
| MusicGen über ComfyUI | Dein Computer | Laufendes ComfyUI mit den Sonic-Holodeck-Nodes | Kurze Instrumentalstimmen, bis zu 120 s. |
| ElevenLabs Music | Online | Dein ElevenLabs-Schlüssel | Etwa 0,15 $ pro Minute (Preise Stand 2026-11). Song-Pläne. |
| fal.ai: MiniMax Music, Lyria | Online | Dein fal.ai-Schlüssel | Etwa 0,08–0,15 $ pro Song. |
| Google Lyria | Online | Dein Gemini-Schlüssel | Etwa 0,04–0,08 $ pro Song. Jeder Song trägt Googles SynthID-Wasserzeichen. |

Suno ist aufgeführt, aber nicht verfügbar: Es hat keine öffentliche API, und inoffizielle Anbindungen verstoßen gegen seine Bedingungen. Der Arrangeur (der Noten schreibt, kein Audio) wird aus dem Inspector des Studio-Editors verwendet.

<a id="create"></a>
### Erstellen

1. **Lokale Engine installieren**, falls die Karte danach fragt (nur beim ersten Mal; etwa 5,3 GB und ein paar Minuten).
2. **Generator:** wird angezeigt, wenn mehr als einer bereit ist.
3. Entweder **Mit einer Idee beginnen**: Beschreibe den Song in ein oder zwei Sätzen und drücke **Stil und Text schreiben** (etwa 30 s). Das füllt Titel, Stil, Songtext, Tempo, Tonart, Taktart, Sprache und Länge aus. Bearbeite vor dem Generieren, was du willst. Mit installiertem Ollama werden die Songtexte reichhaltiger.
4. Oder **Von einem Song ausgehen:** **Song-Datei wählen** (oder einen analysierten wählen). Tempo, Tonart, Taktart, Länge und Feeling werden gemessen und eingetragen. Wähle dann, was daraus werden soll:

| Auswahl | Was daraus entsteht |
|---|---|
| Neuer Song in diesem Stil | Ein neuer Song mit gleichem Tempo, gleicher Tonart, Länge und gleichem Feeling. |
| Neuer Stil | Derselbe Song in einem neuen Stil. |
| Verlängern | Mehr Musik vor dem Anfang oder nach dem Ende. |
| Ein Instrument extrahieren | Ein Instrument daraus, als eigene Spur. |
| Stimme hinzufügen | Eine neue Stimme (Drums, Bass, Gitarre…), die dazu passt. |
| Einen ganzen Song darum herum bauen | Ein Arrangement um, sagen wir, einen Gesang oder ein Riff. |

Extrahieren, Stimme hinzufügen und Aufbauen brauchen das Bearbeitungsmodell (2,4 GB, aus den Einstellungen). Bei *Neuer Song in diesem Stil* und *Neuer Stil* wird die Spur des Originals in der Session stummgeschaltet.

5. Fülle das Formular aus und drücke **Generieren** (oder **In dieses Projekt generieren**, wenn du aus dem Editor kommst).

**ACE-Step-Einstellungen:**

| Einstellung | Bereich | Standard | Was sie tut |
|---|---|---|---|
| Stilbeschreibung | 3–1500 Zeichen | | Genre, Stimmung, Instrumente, Stimme und Produktion, in einfachen Worten. Pflichtfeld. |
| Instrumental (ohne Gesang) | ein / aus | aus | Kein Gesang. |
| Länge | 10–600 s | Auto | Auf Auto lassen, damit das Modell entscheidet. |
| Songtext | bis zu 6000 Zeichen | leer | Verwende Tags wie [Verse] und [Chorus] (die Schaltflächen + Verse, + Chorus… fügen sie ein). Leer lässt das Modell ihn schreiben. |
| Sprache | Auto und 21 Sprachen | Auto | |
| Tempo / Tonart / Taktart | 30–300 BPM / jede Tonart / 4/4, 3/4, 2/4, 6/8 | Auto | |
| Anzahl Versionen | 1–4 | 1 | Jede zusätzliche Version kostet zusätzliche Zeit. |
| Seed | −1 oder eine Zahl | −1 | −1 ist zufällig. Verwende einen Seed erneut, um wieder dasselbe Ergebnis zu bekommen. |

**Erweitert** (eingeklappt):

- **Den Song zuerst planen:** standardmäßig an; kostet etwa 15 s mehr.
- **Den Planer den Stil umschreiben lassen.**
- **Temperatur, Guidance, Top-p und Top-k des Planers:** wie experimentierfreudig der Plan ist.
- **Zu vermeidende Stile.**
- **Diffusionsschritte:** Auto ist 8 für die schnellen Modelle und 50 für das Basismodell.
- **Diffusion-Guidance, Schedule-Shift und Solver.**
- **Musikmodell und Planermodell:** Auto verwendet das hochwertige XL-Modell, wenn es installiert und eingeschaltet ist.
- **LoRA-Adapter und Stärke:** nur angezeigt, wenn Adapter installiert sind.

**Neu schreiben** (unter dem Songtext) ändert den Songtext auf Wunsch, zum Beispiel "add a bridge" oder "translate to Spanish". Dafür wird Ollama gebraucht.

**Reime und Silben** (unter dem Songtext) zeigt jede gesungene Zeile mit Silbenzahl und Reimbuchstabe: Zeilen mit demselben Buchstaben reimen sich, so ist das Schema (AABB, ABAB…) auf einen Blick zu sehen. Eine bernsteinfarbene Zahl heißt, die Zeile ist deutlich länger oder kürzer als der Rest des Abschnitts und passt nicht auf dieselbe Melodie. Funktioniert ohne Ollama und aktualisiert sich beim Tippen. Exakt sind die Reime im Spanischen und – sobald das Aussprachewörterbuch geladen ist (3,6 MB, beim ersten Mal) – im Englischen; im Russischen, Ukrainischen, Deutschen und Französischen werden sie nach der Schreibweise beurteilt, nimm sie als Hinweis.

**Alternativen** (neben einer Zeile) schlägt andere Fassungen dieser Zeile vor, die Reim und Länge behalten. Wähle, worauf sie sich reimen soll (ihre Partnerzeile, eine andere Zeile oder kein Reim), sag optional, was sich ändern soll, und drücke **Vorschlagen**. Jeder Vorschlag wird nach denselben Regeln geprüft: Ein Haken heißt, er reimt sich wirklich und hat die richtige Silbenzahl. **Übernehmen** setzt ihn an die Stelle der Zeile. Braucht Ollama. Kleine lokale Modelle reimen gut auf Englisch und Spanisch und weniger zuverlässig auf Russisch und Ukrainisch – darum wird jeder Vorschlag geprüft, statt ihm blind zu vertrauen.

**Beschreibung verbessern** (unter der Stilbeschreibung) schreibt sie klarer und konkreter für das Musikmodell um: Genre, Stimmung, Tempogefühl, Instrumente, Stimme und Produktion – deine Idee bleibt erhalten. Sie wird auf Englisch geschrieben, das die Musikmodelle am besten verstehen. **Rückgängig** holt deine Fassung zurück.

Die Leiste unten zeigt, wie lange es dauern wird (lokal) oder was es kosten wird (online). Während der Generierung zeigt sie jede Phase und eine Schaltfläche **Abbrechen**. Online-Dienste lassen sich nicht mehr abbrechen, sobald die Anfrage gesendet ist.

**Ergebnisse:** Jede Version hat einen Player und zeigt Tempo, Tonart, Lautheit und Seed. Die Schaltflächen sind:

- **Im Studio-Editor öffnen**
- **Zu einer Session hinzufügen**
- **In Stems trennen**
- **Analysieren**
- **Neuen Song daraus machen**
- **Diesen Seed für die nächste Version behalten**

Jede Version kommt auf eine eigene Spur; zusätzliche Versionen werden stummgeschaltet, damit du sie vergleichen kannst.

**ElevenLabs-Song-Plan:** ein optionaler Plan Abschnitt für Abschnitt, mit bis zu 30 Abschnitten und insgesamt 10 Minuten. Jeder Abschnitt hat:

- einen Namen und eine Länge (3–120 s);
- wie eng er seinen Nachbarn folgt;
- seinen Songtext, eine Zeile pro gesungener Zeile;
- seine Stile und was zu vermeiden ist.

**Plan entwerfen (kostenlos)** erstellt einen für dich. Die Stile des ersten Abschnitts legen das Genre fest. Mit einem Plan werden Länge und Songtext nicht verwendet.

<a id="album"></a>
### Album

Erstellt im Hintergrund bis zu 20 Songs nacheinander. Sie laufen nach einem Neustart weiter.

- **Albumtitel**, **Generator**, **Worum es im Album geht** und **Gemeinsamer Stil**.
- **Songs, eine Idee pro Zeile.**
- **Jeder Song etwa** (30–300 s, Standard 150).
- **Instrumental** und **Text und Stil für jeden Song schreiben** (an).
- **N Songs erstellen.**

Jedes Album wird eine eigene Session. Ist der Speicher knapp oder der Generator beschäftigt, wartet ein Song und versucht es bis zu zwei Stunden lang jede Minute erneut. **Im Studio-Editor öffnen** legt die fertigen Songs nacheinander an; **Stopp** bricht den Rest ab.

> **Tipp:** Nimm für Alben ACE-Step oder einen Online-Dienst. MusicGen und YuE2 verwenden andere Einstellungen, und ein damit erstelltes Album schlägt wahrscheinlich fehl.

<a id="history"></a>
### Verlauf

Jeder Song, den du erstellt hast, mit den Einstellungen, die ihn erzeugt haben. **Diese Einstellungen nutzen** füllt das Formular wieder aus; **Projekt öffnen** öffnet ihn im Editor; das Papierkorb-Symbol entfernt den Eintrag (das Audio bleibt in seiner Session).

<a id="settings"></a>
### Einstellungen

| Karte | Einstellungen |
|---|---|
| Lokale Musik-Engine | **Lokale Engine installieren**, **Hochwertiges Modell laden (4,9 GB)** (bessere Songs, etwa 25 % langsamer), **Bearbeitungsmodell laden (2,4 GB)** (nötig für Extrahieren, Stimme hinzufügen und Aufbauen), **Jetzt entladen** und **Hochwertiges Modell (XL) für neue Songs nutzen** (an). |
| Text- und Stil-Autor | Verwendet Ollama (von ollama.com) mit dem Modell deiner Wahl; **Herunterladen** holt es (gemma4:12b, etwa 8 GB). Ohne Ollama schreibt der eigene Planer der Musik-Engine einen einfacheren Entwurf. |
| Damit dein Rechner reaktionsschnell bleibt | **Nicht starten unter** 5–80 % freiem Speicher (Standard 25 %). **Engine entladen nach** 1–240 Minuten Leerlauf (Standard 10). |
| Lautheit neuer Songs | **Jeden neuen Song beim Import angleichen** (an), auf eine **Ziel-Lautheit** von −30 bis −6 LUFS (Standard −14), mit Spitzen nie über −1 dBTP. Gilt nicht für KI-Bearbeitungen oder MusicGen. |
| Online-Dienste | Füge deinen API-Schlüssel ein und drücke **Schlüssel speichern**, um einen Dienst einzuschalten; **Schlüssel entfernen** schaltet ihn aus. Schlüssel werden in der Windows-Anmeldeinformationsverwaltung gespeichert. Jeder hat einen Link **Bedingungen und Preise**. |
| Generatoren | Schalte jeden Generator ein oder aus. |

<a id="synth-studio"></a>
## Synth-Studio

Synth-Sounds gestalten und spielen; hier gespeicherte Sounds erscheinen im Studio-Editor auf Instrumentenspuren als "Meine Sounds". Die Schaltfläche **MIDI** oben verbindet ein MIDI-Keyboard, das den jeweils offenen Tab spielt (Anschlagstärke, Sustainpedal und Pitch-Bend funktionieren).

<a id="music-suite-synth"></a>
### Music-Suite-Synth

Der eingebaute Synth, der in deinem Browser läuft.

- **Sound-Leiste:** der Name des Sounds, **Preset laden…** (Werks-Sounds und Meine Sounds), **Als meinen Sound sichern** (in diesem Browser gespeichert, bis zu 200), **Vergessen**, **Exportieren** / **Importieren** (`.mssound`-Dateien) und **Neuer Sound** (zurück zu Init).
- **Klavier:** spiele mit Maus, Touch oder den Computertasten A W S E D F T G Y H U J K O L P; **Z / X** verschieben die Oktave. Bis zu 12 Noten gleichzeitig.

| Bereich | Bedienelemente (Standard) |
|---|---|
| Oszillatoren 1, 2, 3 | **An** (anfangs ist nur 1 an). **Welle:** Sägezahn, Rechteck, Puls 25 %, Puls 12 %, Dreieck, Sinus, Orgel, Hohl, Hell. **Oktave** ±3, **Halbtöne** ±12, **Fein** ±100 Cent, **Pegel** (80 %). **Unison** 1–7 Stimmen mit **Verstimmung** und **Stereobreite**, für einen dickeren Klang. |
| Filter | **Typ:** Tiefpass, Hochpass, Bandpass, Notch. **Flankensteilheit:** 12 oder 24 dB/Okt. **Cutoff** (3,2 kHz): Helligkeit. **Resonanz** (10 %): eine Überhöhung an der Cutoff-Frequenz. **Drive**: Biss. **Keytracking** (30 %): höhere Noten klingen heller. **Hüllkurve-2-Stärke**: wie weit Hüllkurve 2 das Filter bewegt. |
| Rauschen, FM und Stimmen | **Rauschen**. **FM (Osz 2 → 1)**: Glocken- und E-Piano-Klänge. **Stimmen:** Poly (Akkorde) oder Mono (eine Note, gleitet) mit **Glide**-Zeit. **Anschlagstärke** (60 %): wie viel lauter stärkeres Spielen macht. **Lautstärke**. |
| Hüllkurve 1 (Lautstärke) | **Attack** (10 ms), **Decay** (300 ms), **Sustain** (80 %), **Release** (200 ms): wie eine Note beginnt, sich einpendelt und endet. |
| Hüllkurve 2 (Modulation) | Dieselben vier, für Filterfahrten und die Modulationswege. |
| LFOs 1 und 2 | **Form:** Sinus, Dreieck, Sägezahn, Rechteck, Zufallsstufen. **Sync:** frei (mit **Rate** 0,05–20 Hz) oder ans Tempo gebunden (1 Takt bis 1/16, Triolen). Langsame, gleichmäßige Bewegung für Vibrato, Wobble und Filterfahrten. |
| Modulation | Bis zu 8 Wege von einer **Quelle** (LFO 1, LFO 2, Hüllkurve 2, Anschlagstärke, Note) zu einem **Ziel** (Tonhöhe, Tonhöhe oder Pegel eines Oszillators, Rauschen, FM-Anteil, Cutoff, Resonanz, Lautstärke, Panorama) mit einem **Anteil** von ±100 %. Bei vollem Anteil bewegt sich die Tonhöhe um eine Oktave und der Cutoff um vier Oktaven. |

<a id="surge-xt-and-plugins"></a>
### Surge XT und Plugins

Spielt VST3-Instrument-Plugins, die auf diesem Computer installiert sind, etwa Surge XT (kostenlos installierbar über [Modelle & Engines](#models-and-engines)).

- **Instrument:** welches Plugin. Schalte es aus, um ein anderes zu wählen.
- **Volle Oberfläche von <name> öffnen:** das eigene Fenster des Plugins auf dem Desktop. Beim Schließen bleibt der Sound erhalten.
- **Abspielen** spielt eine kurze Demo-Phrase in einer Schleife; **Stopp** beendet sie.
- **Sounds:** eine durchsuchbare Liste (nur Surge XT) mit ★-Favoriten. Die Pfeiltasten blättern durch die Sounds.
- **<name> ausschalten.**
- **Sound exportieren / Sound importieren.**
- **Das Klavier:** Die erste Taste, die du drückst, schaltet das Instrument ein.

Um einen Sound in einem Song zu verwenden, markiere ihn hier mit einem Stern und wähle ihn dann im Editor auf einer Instrumentenspur.

<a id="song-geometry-mapper"></a>
## Song-Geometrie

Verwandelt einen Song in eine bewegte 3D-Wolke: Jeder kurze Klangausschnitt wird ein Punkt, platziert nach seinem Charakter (Helligkeit, Streuung, Energie und so weiter) und mit seinen Nachbarn in Zeit und Klang verbunden. Nutze sie, um die Struktur eines Songs zu sehen oder um Visuals und Videos zu machen.

Öffne sie über die Schaltfläche **Song-Geometrie** im Analyzer (der ausgewählte Song wird geladen und automatisch analysiert) oder lade eine Datei direkt in der Song-Geometrie.

- **Obere Leiste:** **About** (wie es funktioniert), **Song Info**, **Waveform** (zum Springen klicken), **Math HUD** (die Messwerte hinter dem Bild) sowie live RMS, Schwerpunkt und Streuung. **H** blendet die Einblendungen aus.
- **Bewegen:** Ziehen zum Kreisen, Scrollen zum Zoomen, Pfeiltasten zum Verschieben, **F** zeigt alles, **Leertaste** spielt ab, **[** und **]** ändern die Geschwindigkeit.
- **Hilfe beim Darüberfahren:** Halte den Mauszeiger eine halbe Sekunde auf ein Bedienelement, um zu sehen, was es tut.

| Tab | Was er enthält |
|---|---|
| Session (S) | **Analysis Model:** Classic (im Browser), Voice oder Deep (auf dem Computer, braucht KI-Stem-Trennung; fällt auf Classic zurück, wenn nicht verfügbar). **Voice Focus:** Gesang, ganzer Mix, Drums, Bass oder Sonstiges. **Load Audio File** (oder ein gespeichertes Analyse-JSON). Player, **Playback Speed** (0,05–2×), **Preserve pitch**. **AI Music Style:** eine schriftliche Beschreibung des Stils des Songs, gemessen und auf Wunsch von Ollama ausformuliert. Anzeigeschalter: Verbindungen, Beschriftungen, Kinoeffekte, nur Knoten. |
| Mapping (M) | Wie Punkte platziert werden: **Mapping Mode** (Manifold, Time Spine, Hybrid Flow, Helix Orbit), **3D Frequency Spread**, Versätze, wie Punkte verbunden werden (**Edge Mode**, **Neighbor Links**), **Camera Preset** (Static, Drift, Orbit, Pulse, Dive) und **Display Decimation** (weniger Punkte für mehr Tempo). |
| Visual (V) | Punktgröße, Deckkraft und Tiefe; Verbindungsstil (Wave, Straight, Ribbon), Stärke und Spuren; Zeit- und Strukturebenen (Nebel, Geisterebenen, Zeitröhre, Abschnittsbögen); Bewegung und Puls. |
| Post FX (FX) | **Visual Preset** (Cinematic, Observatory, Neon, Aurora…), Glühen, Bloom, Nebel, Lens Flare, **Color Metric** (was die Farben zeigen) und Palette. Speichere deine eigenen Presets. |

**Export** (Tab Post FX):

- **Export Analysis JSON:** die Analyse später neu laden, ohne erneut zu analysieren.
- **Export 3D OBJ:** die sichtbare Wolke als 3D-Modell.
- **Capture Still:** ein PNG; wähle **4K Still** für den Druck.
- **Start Video / Stop Video:** eine WebM-Aufnahme.
- **Copy MP4 Command:** ein ffmpeg-Befehl, der diese Aufnahme in MP4 umwandelt.

<a id="models-and-engines"></a>
## Modelle & Engines

Optionale Engines und KI-Modelle. Alles hier läuft auf diesem Computer, und eine Installation verändert nie, was schon installiert ist.

**Dieser Rechner** zeigt deine Grafikkarte und ob die KI-Modelle sie nutzen werden. Eine NVIDIA-Karte macht Trennung und Transkription viel schneller. Wenn dort steht, dass du den NVIDIA-Treiber aktualisieren sollst, tu das, um die GPU zu nutzen.

| Paket | Was es hinzufügt | Größe |
|---|---|---|
| KI-Stem-Trennung | Bessere Trennung in 2 und 4 Stems, 6 Stems (dazu Gitarre und Klavier), einzelne Drum-Teile (Kick, Snare, Toms, Hi-Hat, Ride, Crash), Lead- und Backing-Gesang, KI-Beat-Erkennung. Wähle, welche Modelle heruntergeladen werden; nicht heruntergeladene werden beim ersten Bedarf geholt. **Heruntergeladene Modelle löschen** gibt den Platz frei. | Etwa 3 GB mit NVIDIA-Unterstützung (1 GB ohne), plus Modelle |
| KI-Notentranskription | Ganzer Song zu MIDI, Klavier durch ein reines Klaviermodell (Transkun), Akkorde in In MIDI-Noten umwandeln (basic-pitch). Funktioniert am besten, wenn auch die Stem-Trennung installiert ist. | Etwa 120 MB |
| MuScriptor (optional, manuell) | Ein Transkribierer für den ganzen Mix, der bis zu 35 Instrumente benennt. Nur nicht kommerzielle Nutzung. Die Seite listet die Installationsschritte (eine pip-Installation, das Akzeptieren seiner Bedingungen auf Hugging Face, die Anmeldung). | Hängt von der gewählten Größe ab |
| Musik-Engine (ACE-Step 1.5) | Komplette Songs mit Gesang, offline, im KI-Song-Studio. Braucht einen C++-Compiler und CMake, die der Installer holt. | Etwa 5,3 GB |
| Bearbeitungsmodell | Ein Instrument extrahieren, eine Stimme hinzufügen, einen Song um eine Stimme herum bauen. | 2,4 GB |
| Hochwertiges Modell (XL) | Bessere Songs, etwas langsamer. | 4,9 GB |
| Texter | Songtexte und Stilbeschreibungen mit Ollama. Braucht laufendes Ollama. | Etwa 8 GB |
| Surge XT | Ein kostenloser Hybrid-Synthesizer mit Tausenden Werks-Sounds, für Instrumentenspuren und das Synth-Studio. Unter Windows bleibt es im Music-Suite-Ordner, wo deine anderen Musikprogramme es nicht sehen, außer du setzt den Haken bei **Auch in meinen anderen Musikprogrammen (DAW) verfügbar machen**. | Etwa 300 MB Download |

Wenn ein Paket fertig ist, lade offene Editor-Seiten neu, um es zu nutzen. **Installationsprotokoll** zeigt, was der Installer getan hat, falls etwas fehlschlägt.

Im Terminal: `.venv\Scripts\python -m audioqi.addons install stems` und `python -m audioqi.editor.instruments install surge-xt`. Mit `--for-daws` kommt Surge XT stattdessen in deinen VST3-Ordner.

<a id="settings-reference"></a>
## Einstellungsreferenz

Die meisten Einstellungen sind in der App selbst und werden dort in diesem Handbuch erklärt, wo sie vorkommen:

| Einstellungen | Wo | Siehe |
|---|---|---|
| Mastering | Analyzer-Seite → KI-Mastering | [Analyse und Mastering](#analyser-and-mastering) |
| Projekttempo, Tonart, Master-Pegel, Limiter, Crossfades | Editor → Inspector, wenn nichts ausgewählt ist | [Projekt](#project) |
| Spur-EQ, Breite, Sends, Effekte | Editor → Inspector mit ausgewählter Spur | [Spur, Effekte und Busse](#track-effects-and-buses) |
| Instrumente | Editor → Inspector mit ausgewähltem Notenclip | [Instrumente und Sounds](#instruments-and-sounds) |
| MIDI-Kanal, Keyboard-Sound, gleichzeitige Noten, Audioeingang | Editor → Keyboard | [Dein Hardware-Keyboard](#your-hardware-keyboard) |
| KI-Engines, Speicher, Lautheit neuer Songs, Online-Schlüssel | KI-Song-Studio → Einstellungen | [KI-Song-Studio](#settings) |
| Optionale Modelle | Modelle & Engines | [Modelle & Engines](#models-and-engines) |

<a id="advanced-environment-variables"></a>
### Für Fortgeschrittene: Umgebungsvariablen

Für Dinge, die die App nicht als Einstellung anbietet, setze vor dem Start von start.bat eine Windows-Umgebungsvariable (Systemeigenschaften → Umgebungsvariablen, dann Music Suite neu starten). Eine Einstellungsdatei gibt es dafür nicht.

| Variable | Standard | Was sie ändert |
|---|---|---|
| `AUDIOQI_DATA_DIR` | `data` im Music-Suite-Ordner | Wo alle Sessions, Songs und Modelle gespeichert werden. |
| `MUSIC_SUITE_MAX_UPLOAD_BYTES` | 524288000 (500 MB) | Die größte Datei, die du hochladen oder generieren kannst. |
| `MUSIC_SUITE_MAX_AUDIO_DURATION_SECONDS` | 900 (15 Minuten) | Der längste Song, den du laden kannst. |
| `AUDIOQI_SAMPLE_RATE` | 48000 | Die Samplerate, mit der Songs analysiert werden. |
| `AUDIOQI_JOB_WORKERS` | 2 | Wie viele Analysen gleichzeitig laufen. |
| `AUDIOQI_ANALYSIS_STALL_TIMEOUT_SECONDS` | 600 | Wie lange eine Analyse ohne Fortschritt bleiben darf, bevor sie gestoppt wird. |
| `AUDIOQI_REPORT_MAX_SECONDS` | 300 | Zeitlimit für das Erstellen des Berichts; 0 heißt kein Limit. |
| `AUDIOQI_FFMPEG_TIMEOUT_SECONDS` | 900 | Zeitlimit für Konvertierungen und für Online-, ComfyUI- und Lyria-Generierung. |
| `AUDIOQI_SKIP_PDF_EXPORT` | aus | Auf 1 setzen, um den PDF-Bericht zu überspringen. |
| `MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS` | 300 | Wie lange start.bat wartet, bis Music Suite hochgefahren ist. |
| `MUSIC_SUITE_ELEVENLABS_API_KEY`, `MUSIC_SUITE_FAL_KEY`, `MUSIC_SUITE_GEMINI_API_KEY` | | Schlüssel für Online-Dienste, statt sie in der App zu speichern. |
| `MUSIC_SUITE_COMFYUI_URL` | http://127.0.0.1:8188 | Wo ComfyUI für MusicGen zu finden ist. |
| `MUSIC_SUITE_ACESTEP_DIR`, `MUSIC_SUITE_ACESTEP_URL` | | Der Ordner der lokalen Engine; die Adresse deines eigenen ACE-Step-Servers. |
| `MUSIC_SUITE_YUE2_PYTHON`, `MUSIC_SUITE_YUE2_DEVICE` | , cuda | Die YuE2-Installation. |
| `MUSIC_SUITE_MUSCRIPTOR_SIZE` | | small, medium oder large. |

<a id="troubleshooting"></a>
## Fehlerbehebung

<a id="the-keyboard"></a>
### Das Keyboard

| Problem | Was tun |
|---|---|
| "Über MIDI wurde kein Keyboard gefunden" | Prüfe das USB-Kabel und ob das Keyboard eingeschaltet ist. Verwende Chrome oder Edge und erlaube MIDI, wenn gefragt wird. |
| Testnoten sind nicht zu hören | Prüfe den **Kanal** (4 beim GO:KEYS 3) und die Lautstärke des Keyboards. |
| Ein Take kommt still zurück, oder das Keyboard antwortet mitten in einer Session nicht mehr | Die Windows-Verbindung zum MIDI des Keyboards hängt. Zieh das USB-Kabel des Keyboards ab, warte fünf Sekunden und steck es wieder ein (oder schalte das Keyboard aus und wieder an), dann noch einmal **Keyboard prüfen**. Antwortet es immer noch nicht, starte den Computer neu. |
| Ein Take klingt verzerrt | Der Assistent nimmt ihn von selbst leiser neu auf (bis zu drei Versuche). Meldet er es weiterhin, steht der Lautstärkeregler am Keyboard sehr hoch: Dreh ihn auf etwa die Hälfte herunter und nimm erneut auf. |
| Der Take ist zu spät oder zu früh | **Verzögerung messen** erneut, während nichts anderes spielt. |
| Das Keyboard spielt den falschen Sound | Wähle den Sound in der App statt am Keyboard und drücke vor der Aufnahme **Anhören**. |

<a id="notes"></a>
### Noten

| Problem | Was tun |
|---|---|
| Seltsame, unpassende Noten | Sag dem Assistenten, was die Aufnahme ist (*Nur ein Klavier*, *Eine Stimme*…). Installiere KI-Stem-Trennung und KI-Notentranskription. Prüfe das Ergebnis mit dem Ohr und korrigiere es in der Piano Roll. |
| Noten sind zu kurz | Sie behalten die Länge, mit der sie in der Aufnahme gehalten werden. Wähle für Gesangsstimmen im Assistenten **Notenlänge: Bis zur nächsten gehalten**. |
| Ein Klavier kommt über mehrere Spuren verteilt zurück | Wähle *Nur ein Klavier*; oder nimm 4 Stems statt 6. |
| Eine erfundene Drum-Stimme | Behoben: Ein Song ohne Drums bekommt keine mehr. Lösche die Spur, wenn eine alte Session sie noch hat. |

<a id="the-editor"></a>
### Der Editor

| Problem | Was tun |
|---|---|
| "Speichern fehlgeschlagen – neuer Versuch bei der nächsten Änderung" | Der Hintergrunddienst von Music Suite antwortet nicht. Mach eine beliebige kleine Änderung, um es erneut zu versuchen; schlägt es weiter fehl, starte mit stop.bat und start.bat neu. Dein zuletzt gespeicherter Stand ist sicher. |
| Ein Werkzeug meldet, dass eine Engine fehlt | Installiere sie über [Modelle & Engines](#models-and-engines) und lade dann die Editor-Seite neu. |
| Die Entf-Taste hat einen ganzen Clip entfernt | Rückgängig (Ctrl+Z). Lösche Noten in der Piano Roll per Rechtsklick oder mit der Schaltfläche **Löschen**. |
| Die Aufnahme wird verweigert | Erlaube in der Adressleiste des Browsers das Mikrofon für die Seite. |
| Einem Export fehlt ein Browser-Plugin | Manche Community-Plugins können während des Exports nicht laufen; der Hinweis nennt sie. |

<a id="analysis-and-mastering"></a>
### Analyse und Mastering

| Problem | Was tun |
|---|---|
| Die Analyse hängt beim selben Prozentwert | Lange Spektrogramme können eine Weile dauern. Nach zehn Minuten ohne Fortschritt stoppt sie sich selbst; wenn ein Lauf danach immer noch hängt, nutze **Harter Reset**. |
| Kein PDF-Bericht | Das PDF braucht WeasyPrint; der HTML-Bericht hat denselben Inhalt. |
| Die Wahl eines Presets hat die Lautheit nicht geändert | Die Felder Ziel-LUFS und True Peak haben Vorrang. Leere sie oder verwende Vorschlag übernehmen bzw. ein Normalisierungsprofil. |
| "Backend selected: internal", obwohl du ein anderes gewählt hast | Dieses Backend ist nicht installiert; das Mastering hat stattdessen die eingebaute Kette verwendet. |
| Ein Fehler zeigt Rohtext wie `{"detail": …}` | Die Meldung in "detail" ist der Grund. |

<a id="generating-songs"></a>
### Songs generieren

| Problem | Was tun |
|---|---|
| "Noch nicht installiert" | Einstellungen → **Lokale Engine installieren**. |
| "Nur N % des Speichers sind frei…" | Schließe andere Apps oder Browser-Tabs oder senke **Nicht starten unter** in den Einstellungen. |
| "Braucht das Bearbeitungsmodell" | Einstellungen → **Bearbeitungsmodell laden**. |
| ElevenLabs lehnt den Schlüssel ab oder hat kein Guthaben | Prüfe den Schlüssel und dein ElevenLabs-Konto. |
| "Die KI-Engine wurde beim Starten beendet" | Siehe `data\generation\engine.log`. |

<a id="starting-music-suite"></a>
### Music Suite starten

| Problem | Was tun |
|---|---|
| "did not open port N within S seconds" | Der Computer braucht lange zum Starten: Führe `.\start.ps1 -StartupTimeoutSeconds 600` aus. |
| "Die Music-Suite-API ist nicht erreichbar" | Der Hintergrunddienst von Music Suite wurde beendet: Führe stop.bat aus, dann start.bat. |
| Etwas anderes | Schau im Ordner `logs` nach: `api.error.log` und `web.error.log` sagen meist, warum. |

<a id="glossary"></a>
## Glossar

| Begriff | Bedeutung |
|---|---|
| **Bus (Bus)** | Eine gemeinsame Spur, an die mehrere Spuren senden, für einen gemeinsamen Hall oder Delay oder um sie zu gruppieren. |
| **Clip (Clip)** | Ein Stück Audio oder Noten auf der Zeitleiste. |
| **Crest factor (Crest-Faktor)** | Der Abstand zwischen den Spitzen eines Songs und seinem Durchschnittspegel. Mehr Crest klingt druckvoller und offener. |
| **dBFS / dBTP** | Pegel bezogen auf Vollaussteuerung; True Peak (dBTP) berücksichtigt Spitzen, die zwischen den Samples entstehen. |
| **LRA** | Lautheitsumfang: wie stark sich die Lautheit im Lauf eines Songs ändert. |
| **LUFS** | Lautheit, wie Menschen sie hören. Streamingdienste spielen Songs mit etwa −14 LUFS ab. |
| **MIDI** | Noten als Anweisungen (welche Taste, wann, wie stark) statt als Klang. |
| **Mono compatibility (Mono-Kompatibilität)** | Ob ein Song noch richtig klingt, wenn links und rechts zusammengemischt werden (Handys, Club-Anlagen). |
| **Normalise (Normalisieren)** | Das Ganze auf einen Zielpegel lauter oder leiser machen. |
| **Run (Lauf)** | Ein in den Analyzer hochgeladener Song und alles, was daraus entsteht. |
| **Session / project (Session / Projekt)** | Eine Arbeit im Studio-Editor. |
| **Stem (Stem/Spur)** | Ein aus einem Mix herausgetrenntes Instrument: Gesang, Drums, Bass, Sonstiges… |
| **Take (Take/Aufnahme)** | Ein aufgenommener Versuch. |
| **Velocity (Anschlagstärke)** | Wie stark eine Note gespielt wird. |
| **Voice (Keyboard-Sound)** | Ein Sound auf einem Hardware-Keyboard: ein Klavier, ein Chor, eine Minion-Stimme. |
