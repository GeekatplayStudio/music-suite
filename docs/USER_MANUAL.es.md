<a id="music-suite-user-manual"></a>
# Manual de usuario de Music Suite

Music Suite es una estación de trabajo musical que funciona en tu propio equipo. Analiza y masteriza canciones terminadas, las separa en sus instrumentos, convierte el audio en notas, edita y mezcla sesiones multipista, genera canciones con IA, diseña sonidos de sintetizador y toca tu música a través de un teclado físico, como un Roland GO:KEYS 3.

Todo funciona en local. Lo único que sale a internet son los servicios de IA en línea que tú decidas activar (con tu propia clave), las descargas de modelos opcionales, la comprobación de actualizaciones y los plug-ins de navegador de la comunidad, si los permites.

> **Consejo:** cada área de trabajo tiene pequeños botones **?** junto a sus ajustes. Abren este manual en la sección que los explica, en una pestaña nueva, así no pierdes nada de lo que estés haciendo.

<a id="getting-started"></a>
## Primeros pasos

<a id="the-workspaces"></a>
### Las áreas de trabajo

| Área de trabajo | Dirección | Para qué sirve |
|---|---|---|
| [Análisis y masterización](#analyser-and-mastering) | `/` | Medir una canción terminada, encontrar sus problemas, masterizarla y convertirla a otros formatos. |
| [Editor de estudio](#studio-editor) | `/editor` | Sesiones multipista: importar, separar en stems, reparar, editar, grabar, escribir notas, mezclar y exportar. |
| [Estudio de canciones IA](#ai-song-studio) | `/generate` | Generar canciones a partir de una descripción o de una canción que ya tienes; álbumes. |
| [Estudio de síntesis](#synth-studio) | `/synth` | Diseñar sonidos de sintetizador y tocar instrumentos plug-in como Surge XT. |
| [Geometría de la canción](#song-geometry-mapper) | `/mapper` | Una imagen 3D del sonido de una canción, para explorarlo y para video. |
| [Modelos y motores](#models-and-engines) | `/models` | Instalar modelos de IA e instrumentos opcionales. |
| Ayuda | `/help` | Este manual. |

Las canciones pasan de un área a otra con los botones de la parte superior de cada página: por ejemplo, **Editor de estudio** en el analizador añade la canción seleccionada a una sesión, y **Enviar la mezcla al analizador y masterización** en el menú Exportar del editor devuelve una mezcla.

<a id="language-colours-and-extra-windows"></a>
### Idioma, colores y ventanas adicionales

El botón **Idioma y colores** (un globo con el idioma actual, junto a los botones de la cabecera en cada área de trabajo) establece:

- **Idioma:** English, Español, Deutsch, Français, Русский o Українська. Toda la interfaz está traducida, incluidos los mensajes de los motores y este manual (la página Ayuda muestra la edición en español, [USER_MANUAL.es.md](USER_MANUAL.es.md), cuando la interfaz está en español). Algunas cosas se quedan como están a propósito:
  - los nombres de modelos, plug-ins y presets;
  - las unidades que los músicos usan en inglés (BPM, LUFS, dB);
  - el texto que se envía a los modelos musicales, como las descripciones de estilo y los nombres de las secciones del plan, porque los modelos leen inglés;
  - los nombres de pista que el editor crea y luego reconoce, como "Sing-along".
- **Tema de color:** Cian medianoche (el original), Estudio ámbar, Noche violeta, Bosque, Magenta o **Claro (de día)**. Los colores de estado mantienen su significado en todos los temas: rojo para errores, ámbar para avisos, verde para éxito. En el tema claro, las formas de onda, el piano roll, los gráficos y las visualizaciones conservan su área de dibujo oscura.

Ambas opciones se guardan en este navegador.

**Paneles en su propia ventana (para un segundo monitor).** El botón **Abrir en su propia ventana** (un cuadro con una flecha) abre un panel en una ventana aparte que puedes arrastrar a otro monitor.

- **Editor de estudio:**
  - el **inspector** (botón en la cabecera);
  - el **piano roll, la partitura y la vista espectral** (botón junto al botón de cerrar de cada panel);
  - el **piano en pantalla** (junto a *Ocultar*).
- **Analizador:**
  - **Visual AI** (botón junto a su botón de pantalla completa);
  - los **gráficos** (botón en la línea de consejo que hay encima). Los botones de grupo y los enlaces de salto rápido del Estudio de gráficos se quedan en la página y funcionan sobre los gráficos de la otra ventana.

El panel sigue funcionando exactamente igual que antes, y las teclas que pulses en su ventana (Espacio, deshacer, atajos) siguen llegando a la página. Cierra la ventana, o pulsa **Devolver**, para traerlo de vuelta.

Cada ventana recuerda dónde estaba y qué tamaño tenía, y la próxima vez se abre ahí. Con más de un monitor, el navegador pregunta una vez si Music Suite puede colocar ventanas; permítelo, y la primera vez el panel se abrirá en la otra pantalla y después volverá a la pantalla donde lo dejaste.

La primera vez, un mensaje explica que cada ventana adicional consume más memoria, procesador y potencia gráfica. Funciona en Chrome y Edge; si el navegador bloquea la ventana, permite las ventanas emergentes para Music Suite.

**Cualquier panel puede flotar.** Además de esos, cada sección de un espacio de trabajo tiene el mismo botoncito en su título: las tarjetas del analizador, las **pistas y línea de tiempo** del editor, las secciones y pestañas de AI Song Studio, el sonido, los controles y los paneles del plugin de Synth Studio, y las secciones de Modelos y motores. Separa los que quieras y organiza la pantalla a tu manera. El botón de **idioma y colores** muestra los paneles de la página actual en **Paneles de esta página**, con **Separar** o **Acoplar** para cada uno, **Acoplar todos** y **Reabrir mis paneles flotantes** para recuperar la disposición de la última vez. Marca **Reabrir los paneles flotantes al abrir su página** para que ocurra solo. Hace falta permitir las ventanas emergentes para Music Suite; si no, el navegador abre solo una ventana por clic.

**Áreas de trabajo y pestañas en sus propias ventanas.** El botón **Idioma y colores** también tiene **Abrir en una ventana nueva**: elige un área (Analizador, Editor de estudio, Estudio de canciones IA, Estudio de síntesis, Modelos y motores, Geometría de la canción o Ayuda) y se abre en su propia ventana. En el Estudio de canciones IA y el Estudio de síntesis, el botón de ventana junto a las pestañas abre la pestaña actual en una ventana nueva, por ejemplo la pestaña **Álbum** en un monitor mientras creas canciones en otro. Estas ventanas también recuerdan dónde las dejaste. Abre cada sesión en una sola ventana del editor: si la misma sesión está abierta en dos, ambas ventanas lo avisan, porque cada una guardaría encima de los cambios de la otra.

<a id="installing-windows"></a>
### Instalación (Windows)

1. Haz doble clic en **install.bat** en la carpeta de Music Suite. Primero extrae el ZIP descargado (clic derecho ▸ **Extraer todo...**): si lo abres desde dentro del ZIP, se detiene y te lo dice.
2. Te pregunta **Complete install? [y/N]**:
   - **Enter (Estándar):** la aplicación con todo lo que necesita para funcionar. Con unos 10 GB libres basta de sobra.
   - **y (Completa):** además, el motor local de música con IA y sus modelos, el letrista (Ollama), la separación de stems con IA con todos sus modelos y el sintetizador Surge XT. Unos 30 GB de descargas; ten 45 GB libres.
3. Avanza en cinco pasos: herramientas (Python, FFmpeg, Node.js, Git), el entorno de Python, la aplicación web (el paso más lento), las partes opcionales y una comprobación final. Cada herramienta se descarga de su fuente oficial y se verifica antes de usarla. No hace falta tener Python en el equipo: como la versión portable de ComfyUI, Music Suite guarda su propio Python dentro de su carpeta, así que no se instala nada en Windows ni se pide contraseña de administrador.
4. Cuando diga **Music Suite is installed!**, haz doble clic en **start.bat**.

Lo que no hayas instalado se puede añadir más tarde desde [Modelos y motores](#models-and-engines) y desde los Ajustes del Estudio de canciones IA. Consulta `docs/WINDOWS_INSTALL_GUIDE.md` para ver las opciones del instalador.

Antes de descargar nada, el instalador comprueba que:

- puede escribir en la carpeta;
- hay suficiente espacio libre en el disco;
- este equipo puede conectarse a los servidores de paquetes de Python y web.

Si alguna de estas comprobaciones falla, te dice qué hacer. También avisa cuando la carpeta está dentro de OneDrive o tiene una ruta muy larga: ambas cosas pueden hacer que la instalación falle, y mover la carpeta a un lugar como `C:\MusicSuite` lo evita. Una descarga que se corta se reintenta automáticamente.

**Si la instalación falla,** el instalador muestra qué salió mal. Ejecuta **install.bat** otra vez: conserva todo lo que ya está hecho y continúa desde ahí. Si se detiene dos veces en el mismo sitio, reinicia Windows e inténtalo una vez más. El registro completo está en `logs\install.log`.

<a id="starting-and-stopping"></a>
### Iniciar y detener

- **start.bat** inicia Music Suite y lo abre en tu navegador (normalmente http://127.0.0.1:3000). Si falta algo que necesita, primero lo instala. Si Music Suite ya está en marcha, solo abre el navegador.
- **stop.bat** lo detiene. Solo detiene el Music Suite que él mismo inició, nunca otra cosa.
- Si un puerto está ocupado, Music Suite elige el siguiente libre y te dice cuál.
- **Después de una actualización,** el primer inicio pone al día las bibliotecas y recompila la aplicación cuando la nueva versión lo necesita. Eso tarda uno o dos minutos, una sola vez; los demás inicios tardan unos segundos.
- Usa **Chrome o Edge**: el MIDI por hardware (teclados) solo funciona en ellos.

Opciones de inicio (ejecuta `start.ps1` desde PowerShell): `-NoBrowser` (no abrir el navegador), `-ApiPort` y `-WebPort` (puertos preferidos, 8008 y 3000), `-StartupTimeoutSeconds` (300 por defecto), `-NoInstall` (informar de lo que falta en lugar de instalarlo), `-StartComfyUI -ComfyUIPath <folder>` (iniciar también ComfyUI para MusicGen).

<a id="updating"></a>
### Actualizar

En la página del analizador, pulsa **Configuración**:

- **Buscar actualizaciones** consulta solo el repositorio oficial de Music Suite.
- **Instalar actualización** la descarga cuando hay una disponible. Nunca sobrescribe cambios que hayas hecho tú; si los hay, se niega y te lo dice.
- Después, reinicia Music Suite. Las nuevas dependencias se instalan al iniciarse.

Las actualizaciones desde la aplicación requieren que Music Suite se haya instalado con Git (un clon), no desde un ZIP.

<a id="where-your-work-is-kept"></a>
### Dónde se guarda tu trabajo

| Qué | Dónde |
|---|---|
| Sesiones del editor, su audio y sus stems | `data\editor\<session id>\` |
| Canciones analizadas, másteres, conversiones e informes | `data\runs\` y `data\uploads\` |
| Ajustes, historial y álbumes del Estudio de canciones IA | `data\generation\` |
| El motor local de música con IA y sus modelos | `data\engines\acestep.cpp\` |
| Modelos de separación de stems | `data\models\audio-separator\` |
| Registros (cuando algo va mal) | `logs\` (`api.log`, `web.log`, `install.log`) y `data\generation\engine.log` |
| Claves de servicios en línea | Administrador de credenciales de Windows ("Music Suite") |
| Surge XT | `data\plugins\VST3\` (Windows), o tu propia carpeta VST3 si elegiste compartirlo con otros programas de música |
| Python, FFmpeg, Node.js y Git propios de Music Suite | `.tools\` |
| Cachés de descargas (bibliotecas, modelos) | `.cache\` y `data\cache\` |
| Tus sonidos de sintetizador, plug-ins favoritos, opciones MIDI y presets del mapeador | El almacenamiento de tu navegador: no está en la carpeta de Music Suite y no se incluye en los archivos de proyecto |

**Todo se queda en esta carpeta.** Como ComfyUI Portable, Music Suite no instala nada en Windows: su Python, sus herramientas, descargas y cachés viven en su carpeta, así que borrar la carpeta lo elimina por completo. Lo único que se guarda fuera son las claves de los servicios en línea (Administrador de credenciales de Windows), lo que guarda tu navegador (arriba), Surge XT si elegiste compartirlo con otros programas de música y, solo con la instalación completa, Ollama y las herramientas de compilación del motor de música con IA.

Para hacer una copia de seguridad de una sesión o moverla, usa en el editor **Exportar → Proyecto completo** (consulta [Guardado, archivos de proyecto y deshacer](#saving-project-files-and-undo)).

<a id="analyser-and-mastering"></a>
## Análisis y masterización

La página de inicio (`/`) analiza a fondo una canción terminada, te dice qué le pasa y la masteriza para su entrega. Aquí nada modifica tu archivo original: cada resultado es un archivo nuevo.

La página tiene una columna izquierda de controles (Control de sesión, Conversión de formato, Masterización con IA, Historial de análisis, Reproducción + línea de tiempo) y una columna derecha de resultados (mosaicos de estado, Panel general, Información del archivo, mediciones, recomendaciones, marcadores y gráficos). En una pantalla estrecha, la columna izquierda aparece primero.

<a id="the-workflow-in-short"></a>
### El flujo de trabajo en resumen

1. **Subir:** arrastra un archivo a la zona de soltar o pulsa **Examinar archivo**. Se sube enseguida y se convierte en el *análisis* seleccionado (una canción y todo lo que se haga a partir de ella).
2. **Analizar:** pulsa **Analizar**. Una canción típica tarda desde menos de un minuto hasta unos pocos minutos.
3. **Revisar:** lee los mosaicos, las recomendaciones, los marcadores y los gráficos.
4. **Masterizar:** pulsa **Aplicar ajustes sugeridos** (o pon los tuyos) y **Masterizar**.
5. **Guardar:** cuando termina, el cuadro de diálogo **Resultados listos para guardar** te pregunta dónde guardar los archivos.

> **Consejo:** no pulses **Subir** después de soltar un archivo: el archivo ya está subido, y Subir crea una segunda copia en el Historial de análisis.

<a id="header-buttons"></a>
### Botones de la cabecera

| Botón | Qué hace |
|---|---|
| Configuración | Muestra la versión instalada y busca actualizaciones (consulta [Actualizar](#updating)). |
| Actualizar análisis | Vuelve a cargar la lista de análisis. |
| Geometría de la canción | Abre la canción seleccionada en [Geometría de la canción](#song-geometry-mapper). |
| Hacer una canción con esto / Estudio de canciones IA | Abre el [Estudio de canciones IA](#ai-song-studio) con el tempo, la tonalidad y el estilo de la canción seleccionada ya rellenados. |
| Editor de estudio | Añade la canción seleccionada a una sesión del [Editor de estudio](#studio-editor), opcionalmente separada en stems. |
| Estudio de síntesis, Modelos y motores | Abren esas áreas de trabajo. |
| Borrar historial | Elimina todos los análisis que no estén trabajando en este momento, incluidos los fallidos. Pregunta antes. |
| Reinicio forzado | Cancela todo el trabajo en cola, reinicia los procesos en segundo plano y elimina todos los análisis, incluidos los activos. Úsalo solo cuando algo esté atascado. Pregunta antes. |

<a id="session-control"></a>
### Control de sesión

- **Zona de soltar / Examinar archivo:** acepta WAV, FLAC, MP3, AAC, OGG, M4A y AIFF, de hasta 500 MB y 15 minutos por defecto (ambos límites se pueden cambiar, consulta [Referencia de ajustes](#settings-reference)).
- **Analizar:** mide la canción. Volver a ejecutarlo sobre una canción terminada la analiza de nuevo.
- **Visual AI:** abre el panel Sonic Visual AI sobre la página: visualizaciones en directo **Espectro**, **Órbita** y **Forma de onda** con medidores de graves, medios y agudos y un botón de pantalla completa. Tiene su propio reproductor. Se queda abierto hasta que recargas la página.
- **Usar la ruta opcional de espectrogramas en GPU** (desactivado): calcula el espectrograma lineal con la GPU. Necesita las bibliotecas de GPU; sin ellas, el análisis continúa en la CPU y lo indica.
- **Cuadro de estado:** el estado del análisis (subido, en cola, en curso, completado, fallido), una barra de progreso y una línea que dice qué está haciendo ahora (consulta [Etapas del análisis](#analysis-stages)). Aparece un aviso ámbar si nada cambia durante cinco minutos; un paso largo de espectrograma puede tardar eso, y un análisis realmente atascado se detiene automáticamente a los diez.
- **Exportaciones: JSON, HTML, PDF:** las mediciones como datos, y un informe completo como página web o PDF. Existen una vez terminado el análisis. El PDF necesita WeasyPrint; sin él, solo se crea el informe HTML.

<a id="format-conversion"></a>
### Conversión de formato

Crea copias de la canción seleccionada en otros formatos.

| Ajuste | Rango | Por defecto |
|---|---|---|
| Formatos | MP3, WAV, FLAC, AAC, OGG, M4A | MP3, WAV, FLAC |
| kbps de MP3 | 96–320 | 320 |
| kbps de AAC (también para M4A) | 96–320 | 256 |

**Convertir selección** la inicia. Las copias WAV son de 16 bits; FLAC es sin pérdida; OGG es Vorbis con calidad 5. La conversión necesita ffmpeg (se instala con Music Suite). Después del análisis, las copias se hacen a partir de la versión analizada a 48 kHz y se llaman `canonical.mp3`, `canonical.wav`, etc. Volver a convertir sustituye las copias anteriores.

<a id="ai-mastering"></a>
### Masterización con IA

Masteriza la canción para su destino: fija la sonoridad, controla los picos, equilibra el tono y corrige los problemas que encontró el análisis.

<a id="suggested-from-analysis"></a>
#### Sugerido a partir del análisis

Después del análisis, este cuadro sugiere un modo, un preset, una sonoridad y un techo de picos, con sus motivos. **Aplicar ajustes sugeridos** los copia en el formulario de abajo (no toca Ganancia de entrada, Graves en mono, Amplitud estéreo ni Canción de referencia).

Cómo decide:

- **V1** para fuentes densas, con pérdida, saturadas o sensibles a los picos; **V2** para canciones más limpias con varios problemas; **V3** para una corrección más fuerte en material que la aguanta.
- **film** para material muy dinámico o bajo de nivel, **voice** para material con mucha voz hablada, **club** para material con muchos graves y margen para empujar; en otro caso, **streaming**.

<a id="mastering-settings"></a>
#### Ajustes de masterización

| Ajuste | Opciones / rango | Por defecto | Qué hace |
|---|---|---|---|
| Modo | V1, V2, V3 | V1 | **V1:** una pasada de masterización cuidadosa y luego un refinado. La más segura. **V2:** prueba varias variaciones de los ajustes, puntúa cada una y se queda con la mejor. **V3:** divide el sonido en cuatro bandas de frecuencia (graves, medios, transitorios, el resto), trata cada una y las vuelve a combinar. Son divisiones de frecuencia, no stems de IA. |
| Preset | streaming, club, film, voice | streaming | El punto de partida de la cadena: compresión, de-essing, pegada y cuánto se pasan los graves a mono. Consulta la tabla de abajo. |
| Perfil de normalización | Desactivado, YouTube, Spotify, Apple Music, Instagram, TikTok, Emisión EBU, Voz de pódcast | Desactivado | Rellena LUFS objetivo y Pico real con los valores de esa plataforma. |
| Motor | internal, auto, ffmpeg, pedalboard, matchering | internal | Una etapa de procesado extra opcional. Consulta [Motores (backends)](#backends). |
| Canción de referencia | Ninguna, o cualquier otra canción del Historial de análisis | Ninguna | Con matchering: hace que el máster suene como esa canción. |
| LUFS objetivo | −30 a −6 | −14 | Lo fuerte que suena el máster en conjunto. |
| Pico real dBFS | −6 a 0 | −1 | El pico más alto permitido, incluidos los picos entre muestras. |
| Ganancia de entrada (dB) | −12 a +12 | 0 | Sube o baja la fuente antes de masterizar, lo que cambia cuánto trabaja la cadena. **Restablecer** la devuelve a 0. |
| Graves en mono | Predeterminado del preset, Desactivado, 80, 100, 120, 150 Hz | Predeterminado del preset | Pasa a mono todo lo que está por debajo de esa frecuencia, lo que ajusta los graves y los mantiene seguros en altavoces mono. Predeterminado del preset deja que la masterización la suba si encuentra problemas de fase; cualquier otra opción la bloquea. |
| Amplitud estéreo | 0.5–1.5, o vacío | vacío (1.0) | Estrecha (por debajo de 1) o ensancha (por encima de 1) la imagen estéreo. Vacío deja que la masterización la estreche si encuentra problemas de fase. |
| Variantes V2 | 2–8 | 4 | Cuántas variaciones prueba V2. Más es una búsqueda más amplia pero más lenta. Solo se usa en V2. |
| Pasadas de refinado | 1–5 | 2 | Cuántas pasadas de reparación pueden seguir a la principal. Una pasada solo se conserva si mejora las cosas sin empeorar nada más. |

> **Importante:** las casillas LUFS objetivo y Pico real siempre mandan sobre el preset. Elegir **club** con las casillas aún en −14 y −1 masteriza a −14 LUFS, no a los −9 de club. Para usar la sonoridad propia de un preset, vacía las dos casillas, o usa Aplicar ajustes sugeridos o un Perfil de normalización.

Qué busca cada preset (con las casillas vacías):

| Preset | Sonoridad | Techo de picos | Carácter |
|---|---|---|---|
| streaming | −14 LUFS | −1 dBTP | Equilibrado, compresión suave, graves en mono por debajo de 110 Hz. |
| club | −9 LUFS | −0.5 dBTP | Más fuerte y denso, compresión más firme, graves en mono por debajo de 120 Hz. |
| film | −18 LUFS | −2 dBTP | El más dinámico, compresión ligera, graves en mono por debajo de 80 Hz. |
| voice | −16 LUFS | −1.5 dBTP | Voz clara, el de-essing más fuerte, graves en mono por debajo de 120 Hz. |

Perfiles de plataforma: YouTube, Spotify, Instagram y TikTok −14 LUFS / −1 dBTP; Apple Music −16 / −1; Emisión EBU −23 / −1; Voz de pódcast −16 / −1.5.

<a id="backends"></a>
#### Motores (backends)

| Motor | Qué añade | Necesita |
|---|---|---|
| internal | Nada extra: solo la cadena integrada. El más seguro, el más rápido y el predeterminado. | Nada |
| ffmpeg | Una segunda pasada de filtrado, compresión, normalización de sonoridad y limitación. | ffmpeg (instalado) |
| pedalboard | Una segunda pasada de filtrado, compresión y limitación. | La biblioteca Pedalboard |
| matchering | Iguala el tono y la sonoridad de una canción de referencia. | La biblioteca Matchering **y** una Canción de referencia |
| auto | Elige matchering (si está disponible y hay referencia); si no, pedalboard; si no, internal. Nunca ffmpeg. | |

Si un motor no está instalado, la masterización usa **internal** en su lugar sin avisar. Mira «Motor seleccionado» en el cuadro de progreso para ver cuál se usó, y «Módulos pro» para ver cuáles están instalados.

En un equipo más lento, los motores extra pueden tardar varios minutos por canción, mientras que **internal** tarda bastante menos de uno. El mosaico **Análisis activo** muestra el ID completo del análisis de la canción con un botón de copiar, por si lo necesitas en otro sitio.

Solo se ejecuta una masterización por canción a la vez. Pulsar **Masterizar** otra vez mientras hay una en marcha lo indica y no cambia nada; espera a que termine y luego ejecútala con los nuevos ajustes.

<a id="running-and-reading-the-results"></a>
#### Ejecutar y leer los resultados

**Masterizar** la inicia; masterizar de nuevo sustituye los másteres anteriores de esa canción. El cuadro de progreso muestra la etapa, el mejor resultado, el motor usado y una huella (SHA-256) del resultado.

- **Refinado:** cuántas pasadas de reparación se aceptaron, la puntuación final de problemas y cuántas pasadas se revirtieron. «Protección contra regresión» significa que el resultado refinado era peor que la fuente, así que la masterización volvió a empezar desde la fuente con más suavidad.
- **Adaptación a la fuente:** qué cambió la masterización antes de empezar, y por qué. Por ejemplo, baja el techo de picos para una fuente que ya satura, sube el de-essing para una áspera o estrecha la anchura cuando encuentra problemas de fase. Los ajustes que bloqueaste (Graves en mono, Amplitud estéreo) no se tocan.
- **Autocomprobación posmáster:** mide el máster y lo compara con la fuente.
  - *Evaluación:* mejora fuerte, mejora parcial, sin cambios o regresión.
  - *Puntuación de problemas antes → después:* cuanto más bajo, mejor. Cada tipo de problema suma puntos (saturación, riesgo de picos, demasiado fuerte, problemas en mono, rango de sonoridad aplanado: 3; aspereza, subgraves, caídas, demasiado bajo, demasiado denso: 2). *Rango de sonoridad aplanado* significa que el máster conservó menos de la mitad del rango de sonoridad de la canción: las partes suaves y las fuertes acabaron casi al mismo nivel.
  - *Cumplimiento: correcto* significa que la sonoridad está a menos de 0.75 LU del objetivo, que los picos no superan el techo en más de 0.1 dB, que no hay saturación y que la música aún tiene pegada (suficiente factor de cresta). Si el primer resultado no pasa, se hacen automáticamente hasta dos intentos más estrictos («Rescate posterior»).
  - *Resueltos / Pendientes / Empeorados:* qué problemas cambiaron, y *Correcciones recomendadas* para lo que queda.
- **Resultados masterizados:** todos los archivos creados, con su sonoridad, su pico y (en V2) su puntuación, donde más bajo es mejor. Todos son WAV de 32 bits en coma flotante a 48 kHz.

| Modo | Archivos |
|---|---|
| V1 | `master_v1.wav` |
| V2 | `master_v2_variant_1…N.wav` y `master_v2_best.wav` |
| V3 | `master_v3.wav` más los cuatro archivos de banda `stem_bass`, `stem_vocals`, `stem_drums`, `stem_other` |

<a id="outputs-ready-to-save"></a>
### Resultados listos para guardar

Cuando termina un trabajo de conversión o masterización iniciado desde esta página, un cuadro de diálogo enumera los archivos nuevos (para la masterización, solo el mejor máster; los demás están en la tabla Resultados masterizados).

- **Guardar como...** te deja elegir dónde guardar. Los navegadores sin selector de guardado lo descargan en su lugar.
- **Descarga rápida** descarga en tu carpeta habitual.
- **Cerrar** quita la fila.
- **Más tarde** cierra el cuadro de diálogo; **Guardar archivos listos (N)** en Control de sesión lo vuelve a abrir.

La lista se pierde si recargas la página; los archivos en sí se quedan en las tablas.

<a id="run-history"></a>
### Historial de análisis

Todas las canciones subidas, de la más reciente a la más antigua (hasta 50). Haz clic en una fila para seleccionarla. Cambiar de canción detiene la reproducción y restablece el ecualizador, la velocidad y el bucle; los ajustes de masterización se conservan.

<a id="playback-and-the-timeline"></a>
### Reproducción y la línea de tiempo

El reproductor reproduce la **subida original** (no hay un A/B integrado con los másteres; descárgalos o abre ambos en el Editor de estudio).

- **Cursor de reproducción:** arrástralo para moverte por la canción.
- **Segmento seleccionado:** **Marcador izquierdo** y **Marcador derecho** eligen una ventana (de al menos 0.25 s). Los gráficos basados en tiempo hacen zoom a ella. **Pista completa** lo selecciona todo.
- **Marcadores:** una etiqueta por cada problema encontrado; haz clic en una para saltar ahí y hacer zoom.
- **Panel general:**
  - **Tira de revisión de la forma de onda:** haz clic para desplazarte. Las barras de colores de la parte inferior son marcadores: rojo alto, ámbar medio, azul bajo.
  - **Transporte:** **Reproducir/Pausa**, **−5s / +5s**, **Inicio de la selección**, **Repetir selección**, **Velocidad** (0.75–1.5×), **Fijar inicio / Fijar fin** en el cursor de reproducción, y **Restablecer rango** (canción completa, bucle desactivado).
  - **Teclado:** Espacio reproduce y pausa; las flechas izquierda y derecha saltan 5 s.

<a id="delivery-readiness"></a>
### Preparación para la entrega

| Mosaico | Indica |
|---|---|
| Sonoridad | **Alineado** a menos de 1.5 LU del objetivo del Perfil de normalización seleccionado (−14 LUFS si está Desactivado); si no, **Alto** o **Bajo**. |
| Pico real | **Seguro** a −1 dBFS o menos, **Justo** hasta −0.2; si no, **Riesgo**. |
| Carga de marcadores | **Limpio** sin marcadores graves, **Revisar** con hasta 3, **Atención** con más. |
| Dinámica | **Abierto** con un factor de cresta de 8 dB o más, **Controlado** desde 5 dB; si no, **Denso**. |

Antes del análisis todos los valores son cero, así que estos mosaicos indican Alto, Riesgo y Denso hasta que la canción se haya analizado.

<a id="manual-eq"></a>
### EQ manual

Un ecualizador de 20 bandas (de 20 Hz a 16 kHz, ±12 dB cada una) para escuchar a través del reproductor de la página. Marca primero **Activar EQ**; los deslizadores no hacen nada mientras está desactivado. **Restablecer EQ** lo deja plano. **Exportar WAV con EQ** procesa toda la canción a través del ecualizador en tu navegador y guarda un WAV de 16 bits llamado `<song>_eq.wav`. Con el ecualizador desactivado, la exportación es una copia sin procesar. El ecualizador no afecta a la masterización.

<a id="file-intelligence"></a>
### Información del archivo

| Mosaico | Qué te dice |
|---|---|
| Formato / Códec | El tipo de archivo, y si es con pérdida (MP3, AAC…) o sin pérdida. |
| Rango de frecuencias | El rango que el archivo puede contener, y el rango que de verdad tiene sonido. |
| Resumen del rango dinámico | Factor de cresta (pegada) y rango de sonoridad (LRA, cuánto se mueve la sonoridad). |
| Propiedades de la señal | Frecuencia de muestreo, canales, tasa de bits y profundidad de bits. |
| Estimación de pérdida por compresión | Cuánto por debajo de 20 kHz se corta el sonido. Un archivo "sin pérdida" cuyo sonido se corta en 16 kHz probablemente se hizo a partir de un MP3. |
| Detalle de rango | Del pico al ruido de fondo, y del pico a la sonoridad. |

**Evaluación de compresión** lo resume en una frase. **Por qué algunos valores son N/D** explica cualquier mosaico vacío; lo más habitual es que la canción no tenga silencios donde medir el ruido, o que la analizara una versión anterior (pulsa Analizar otra vez). **Etiquetas de metadatos** enumera las etiquetas del archivo; **Mostrar JSON de metadatos sin procesar** las muestra todas. **Guía: qué significa cada cosa** es una referencia rápida en la propia página.

<a id="measurements-recommendations-and-markers"></a>
### Mediciones, recomendaciones y marcadores

| Medición | Qué significa | Valores buenos |
|---|---|---|
| LUFS integrados | Sonoridad global. | −14 para streaming, de −9 a −8 para club, −23 para emisión |
| Pico real dBFS | El pico más alto, incluido entre muestras. | −1 o menos |
| Factor de cresta dB | La distancia entre los picos y el nivel medio: la pegada. | 8 dB o más para una música que suene abierta |
| Ruido de fondo dBFS | El ruido de fondo en los silencios. | lo más bajo posible; vacío si no hay silencios |

Las **Recomendaciones de remasterización** enumeran cada problema con una prioridad (alta, media, baja) y qué hacer al respecto, por ejemplo saturación, picos por encima de −1 dBTP, demasiado fuerte o demasiado bajo, exceso de compresión, problemas en mono, sibilancia, aspereza, demasiados subgraves, falta de agudos o desplazamiento de DC.

Los **marcadores** son los momentos en que ocurren los problemas:

| Marcador | Se detecta cuando | Gravedad |
|---|---|---|
| clipping | Tres o más muestras seguidas a escala completa | alta si dura 5 ms o más |
| true_peak_risk | Picos a −1 dBFS o más | alta |
| mono_incompatibility | El canal izquierdo y el derecho se cancelan (correlación por debajo de −0.1) | alta |
| loudness_dip | El nivel cae 8 LU o más por debajo de la media de la canción | media |
| sibilance | Sonidos de "s" fuertes (6–10 kHz) | media |
| harshness_band | Demasiado entre 3 y 9 kHz | media |
| sub_bass_heavy | Demasiado entre 20 y 80 Hz | media |
| dc_offset | La forma de onda está desplazada del centro | media |

La tabla **Marcadores cerca del cursor / la selección** los enumera, empezando por el más cercano al cursor de reproducción; haz clic en una fila para saltar ahí.

<a id="charts"></a>
### Gráficos

El **Estudio de gráficos** filtra los gráficos: **Todas las vistas**, **Revisión de mezcla**, **Enfoque estéreo** o **Espectral**. **Salto rápido** te lleva a un gráfico. Cualquier gráfico se puede ampliar con la rueda del ratón, restablecer con un doble clic y guardar como imagen con el icono de la cámara. Haz clic derecho y arrastra en un gráfico de tiempo para mover la ventana seleccionada. Los gráficos de tiempo siguen al Segmento seleccionado.

| Gráfico | Cómo leerlo |
|---|---|
| Forma de onda + envolvente | La forma del sonido, con el nivel de pico y el nivel medio en el tiempo. Las crestas planas indican una limitación fuerte o saturación. |
| Sonoridad en el tiempo | La sonoridad momento a momento (0.4 s) y frase a frase (3 s) frente a la sonoridad global de la canción. |
| Espectro medio | Cuánta energía hay en cada frecuencia: inclinación, exceso de graves, aspereza, falta de aire. |
| Correlación estéreo + M/S | Por debajo de cero significa que izquierda y derecha se cancelan al reproducirse en mono. |
| Medidor de correlación | Lo mismo a lo largo del tiempo: el verde es seguro, el rojo corre el riesgo de desaparecer en mono. |
| Vista Mid/Side | Cuánto hay en el centro frente a los lados, y el equilibrio izquierda-derecha. |
| Vectorscopio / goniómetro | Una línea vertical es mono; una nube ancha es un estéreo amplio; una forma horizontal está fuera de fase. |
| Espectrograma STFT (lineal / logarítmico) | El tiempo frente a la frecuencia; el brillo es el nivel. El logarítmico es más fácil de leer musicalmente. |
| Espectrograma Mel | Frecuencias espaciadas como las agrupa el oído. |
| Espectrograma CQT | Frecuencias espaciadas en notas musicales: muestra alturas y armónicos. |

Los archivos mono no tienen gráficos estéreo.

<a id="analysis-stages"></a>
### Etapas del análisis

La línea de estado recorre: subida, en cola, inicialización, lectura de metadatos, decodificación, exploración, medición de sonoridad y dinámica, detección de marcadores, creación de espectrogramas, construcción de gráficos, creación del informe (HTML y luego PDF) y completada. Si nada cambia durante 10 minutos, el análisis se detiene con un mensaje «Loop guard triggered»; pulsa **Reinicio forzado** si después de eso un análisis sigue pareciendo atascado.

<a id="studio-editor"></a>
## Editor de estudio

El Editor de estudio es un editor multipista de audio y MIDI. Cada trabajo es una *sesión* (también llamada proyecto) que se guarda sola a medida que trabajas.

<a id="sessions"></a>
### Sesiones

Al abrir `/editor` ves tus sesiones:

- **Nueva sesión:** escribe un nombre (o déjalo vacío para "Sesión sin título") y pulsa **Nueva sesión** o Enter.
- **Abrir un archivo de proyecto…:** abre como sesión nueva un `.musicsuite.zip` guardado con Exportar → Proyecto completo. Tus sesiones existentes no se tocan.
- **Lista de sesiones:** haz clic en una sesión para abrirla. El icono de la papelera pregunta **Eliminar** o **Conservar**. **Eliminar una sesión es permanente**: no se puede deshacer.

Cuando se envía aquí una canción desde otra área de trabajo, la página pregunta **¿Adónde va "nombre"?**:

- **Separarla en stems al abrirla**, y **hasta dónde**: tantos como pueda este equipo, 2, 4 o 6 stems, o Todo (12 stems con las piezas de la batería y la voz principal y los coros por separado, lo que necesita la separación de stems con IA).
- **Nueva sesión "nombre"**, o **Añadir aquí** en una sesión existente. La canción se añade en una pista nueva en 0:00; no se sustituye nada de lo que ya hay.

<a id="the-editor-screen"></a>
### La pantalla del editor

De izquierda a derecha en la parte superior:

| Control | Qué hace | Atajo |
|---|---|---|
| ← | Vuelve a la lista de sesiones. | |
| Nombre del proyecto | Cambia el nombre de la sesión. Debajo: Guardado, Guardando… o "Error al guardar: se reintentará en la próxima edición". | |
| ✦ | Genera con IA una canción dentro de esta sesión (abre el Estudio de canciones IA). | |
| Volver al inicio / Reproducir / Bucle | Transporte. El bucle usa el rango resaltado, si lo hay. | Home / Espacio / L |
| Grabar (micrófono) | Graba audio, o notas cuando hay un teclado MIDI conectado (consulta [Grabación](#recording)). Su descripción emergente dice cuál. | |
| Icono del teclado MIDI | Conecta un teclado MIDI para tocar y grabar notas. | |
| **Asistente** | El [Asistente de teclado](#keyboard-wizard). | |
| **Teclado** | Tu teclado físico: toca música en él, elige su voz, graba a través de él (consulta [Tu teclado físico](#your-hardware-keyboard)). | |
| Icono del piano | Muestra un piano en pantalla para la pista de instrumento seleccionada. | |
| Reloj | La posición del cursor de reproducción. Haz clic para cambiar la regla entre tiempo (m:ss) y compases (compás.tiempo). | |
| Nivel y sonoridad | El medidor de nivel máster, y el tempo, el compás y la tonalidad. Durante la reproducción: sonoridad integrada, a corto plazo y momentánea (LUFS) y el pico real más alto. Se vuelve rosa si el pico supera el límite. | |
| Herramientas Seleccionar / Cuchilla / Rango | Cómo edita el ratón la línea de tiempo (ver abajo). | V / C / R |
| Imán | Ajuste activado o desactivado (activado al empezar). | N |
| Automatización | Muestra el volumen, luego el panorama y luego ninguna automatización en las pistas. El desplegable de al lado elige cualquier carril: volumen, panorama, mezcla de reverb, mezcla de delay, realimentación del delay, umbral del compresor, ganancias del ecualizador. | A |
| Vista espectral | Muestra las frecuencias del clip seleccionado a lo largo del tiempo. | W |
| Marcador | Añade un marcador en el cursor de reproducción. | K |
| Deshacer / Rehacer | Hasta 200 pasos. | Ctrl+Z / Ctrl+Shift+Z |
| Alejar / Acercar / Ajustar | | − / + / F |
| **Importar** / **Exportar** | Traer archivos; sacar tu trabajo (ver abajo). | |
| Teclado | La lista de atajos de teclado. | ? |

Algunos de estos se ocultan en ventanas estrechas; ensancha la ventana para verlos todos.

Bajo la línea de tiempo, la línea de estado muestra en qué se está trabajando, un aviso (con **Cerrar**) o una pista para la herramienta actual, y a la derecha el número de pistas y clips y la duración de la sesión.

El panel de la derecha es el [inspector](#editor-tools-the-inspector).

<a id="the-timeline"></a>
### La línea de tiempo

**Herramientas:**

- **Seleccionar (V):** arrastra un clip para moverlo (también a otra pista), arrastra sus bordes para recortarlo, arrastra los pequeños tiradores cuadrados cerca de sus esquinas superiores para hacer fundidos. Shift o Ctrl + clic para seleccionar varios. Clic derecho para abrir un menú.
- **Cuchilla (C):** haz clic en un clip para cortarlo ahí.
- **Rango (R):** arrastra a lo largo del tiempo para resaltarlo en todas las pistas. Después pulsa Delete para quitarlo, Shift+Delete para quitarlo y cerrar el hueco, o L para repetirlo en bucle.

El **ajuste a la cuadrícula** (N, activado al empezar) atrae las ediciones a la cuadrícula, al cursor de reproducción, a los marcadores, a los bordes de las secciones y a los bordes de otros clips. Una línea amarilla aparece cuando se ajusta a algo que no es la cuadrícula. Mantén pulsado **Alt** mientras arrastras para colocar libremente.

**La regla:** haz clic para mover el cursor de reproducción, arrastra para desplazarte, **Shift+arrastrar** para dibujar un bucle. La banda superior muestra secciones y marcadores: haz clic en una sección para resaltarla, haz clic en un marcador para saltar a él, arrastra un marcador para moverlo, Alt+clic en un marcador para eliminarlo.

**Edición:**

| Acción | Cómo |
|---|---|
| Dividir en el cursor de reproducción | S (o Ctrl+E). Sin nada seleccionado, divide todos los clips que hay bajo el cursor. |
| Eliminar | Delete. Sin ningún clip seleccionado, elimina el rango resaltado. |
| Eliminar y cerrar hueco | Shift+Delete: elimina y mueve a la izquierda todo lo que viene después para cerrar el hueco. |
| Duplicar | Ctrl+D: una copia justo después del clip. |
| Copiar / cortar / pegar | Ctrl+C / X / V. Pegar va al cursor de reproducción. |
| Seleccionar todo | Ctrl+A |
| Desplazar poco a poco | ← / → mueven los clips seleccionados un paso de cuadrícula (o el cursor de reproducción, si no hay nada seleccionado). |
| Resaltar el tiempo de un clip | Haz doble clic en él. |
| Fijar un marcador de warp | Alt+clic en un clip de audio seleccionado y luego arrastra la línea discontinua hasta donde debe caer ese momento; aplícalo en la sección Warp del inspector. |

**Menú del clic derecho:** sobre un clip: Dividir aquí, Duplicar, Invertir / Reproducir hacia delante, Silenciar / Activar el sonido del clip, Copiar, Eliminar, Eliminar y cerrar hueco. En un espacio vacío: Pegar aquí, Mover el cursor aquí, Añadir pista y, con un rango resaltado: Bucle, Eliminar rango, Eliminar rango y cerrar hueco.

Los **clips superpuestos** se mezclan con un fundido cruzado (desactívalo en los Ajustes del proyecto del inspector).

**Automatización:** con un carril visible, haz clic en la línea amarilla para añadir un punto, arrastra un punto para moverlo, haz doble clic en un punto para quitarlo.

**Marcadores y secciones:** K añade un marcador; [ y ] saltan al anterior y al siguiente. Shift+R convierte el rango resaltado en una sección. Pon nombre a las secciones, repítelas y córtalas en el inspector.

<a id="tracks"></a>
### Pistas

**+** encima de las cabeceras de pista (o Shift+T) añade una pista. Cada cabecera de pista tiene:

| Control | Rango | Qué hace |
|---|---|---|
| Nombre | hasta 60 caracteres | |
| M | | Silenciar (M). |
| S | | Solo (Shift+S): solo se oyen las pistas en solo. |
| Vol | de −60 a +6 dB, 0 por defecto | Nivel de la pista. |
| Pan | de izquierda a derecha, centro por defecto | Posición estéreo. |
| ˄ ˅ | | Mueve la pista hacia arriba o hacia abajo. |
| × | | Elimina la pista y sus clips. **Sin confirmación**, pero Deshacer la recupera. |

Haz clic en una cabecera para seleccionar la pista. Su ecualizador, anchura, salida, envíos, color, efectos e instrumento están en el [inspector](#track-effects-and-buses).

<a id="recording"></a>
### Grabación

**Audio** (el botón del micrófono):

- **Toma normal:** graba desde el cursor de reproducción en la pista seleccionada. Si ese tramo de la pista ya tiene un clip, o si no hay ninguna pista seleccionada, la toma va a una pista nueva llamada "Recording": las grabaciones nunca se ponen encima del audio existente.
- **Pinchazo (punch-in):** resalta antes un rango. La grabación empieza 2 s antes (para que puedas entrar a tiempo), conserva solo lo que queda dentro del rango y se detiene justo después.
- **Tomas en bucle:** con el bucle activado, cada pasada se convierte en su propia toma en su propia pista; se oye la última. Elige la mejor toma, o el mejor trozo de cada una, en la sección **Tomas** del inspector.
- Pulsa grabar otra vez, o Espacio, para detener.
- Las grabaciones son WAV de 24 bits a 48 kHz, con el procesado de llamadas del navegador (cancelación de eco, supresión de ruido, ganancia automática) desactivado para que el sonido quede intacto. El botón de la barra de herramientas graba tu entrada predeterminada; para grabar desde una entrada concreta (como el audio USB del teclado), usa el panel **Teclado**.

**Notas desde un teclado MIDI:** cuando hay un teclado MIDI conectado (o el piano en pantalla está abierto) y la pista seleccionada es una pista de instrumento con un clip de notas, el botón de grabar graba notas en lugar de audio. El pedal de sustain y la rueda de pitch bend funcionan. Con el bucle activado, cada pasada se suma a la misma toma. El clip nuevo se llama "Played HH:MM:SS"; con el ajuste activado se amplía a compases enteros.

**El panel del teclado MIDI** (el icono del teclado): **Conectar** y luego **Escuchar** todos los teclados conectados o solo uno. Muestra qué pista toca el teclado y si grabar capturará notas. **Añadir una pista de instrumento** crea una pista de instrumento nueva con un clip vacío de cuatro compases, lista para tocar en ella.

**El piano en pantalla:** toca la pista de instrumento seleccionada con el ratón o con el dedo, igual que un teclado MIDI.

<a id="piano-roll-sheet-music-and-spectral-view"></a>
### Piano roll, partitura y vista espectral

Solo se muestra uno de ellos a la vez, bajo la línea de tiempo.

**Piano roll** (se abre al seleccionar un clip de notas; P lo muestra u oculta):

- Haz clic en un espacio vacío para añadir una nota; sigue arrastrando para fijar su duración. Arrastra una nota para moverla; arrastra su borde derecho para cambiar su tamaño. Shift+arrastrar para seleccionar varias. **Haz clic derecho en una nota para eliminarla.**
- **Velocidad** (con qué fuerza se tocan las notas seleccionadas, 6–127), **Copiar**, **Pegar** (en el cursor de reproducción), **Eliminar**.
- **Entrada de notas:** escribe notas con las teclas A W S E D F T G Y H U J K (de C4 a C5) o con un teclado MIDI; cada nota se coloca en el cursor de reproducción y lo hace avanzar.
- − / + para el zoom (o Ctrl+rueda). Los clips de batería muestran una cuadrícula de batería con filas con nombre.

> **Cuidado:** pulsar la tecla Delete con el piano roll abierto elimina todo el clip de la línea de tiempo, no las notas seleccionadas. Usa en su lugar el botón **Eliminar** del piano roll o el clic derecho. Deshacer recupera el clip.

**Partitura** (inspector → Mostrar como partitura): las notas como una partitura de dos pentagramas, redondeadas a semicorcheas o tresillos. Haz clic en un compás para mover allí el cursor de reproducción. Elige **A4** o **US Letter** y luego **Imprimir** o guarda como **PDF**.

**Vista espectral** (W): las frecuencias del clip seleccionado a lo largo del tiempo, de 50 Hz a 20 kHz. Dibuja un recuadro alrededor de un sonido no deseado (una tos, un chirrido, un teléfono) y luego:

- **Atenuar** baja ese recuadro en la cantidad elegida (de −6 a −96 dB, −24 por defecto).
- **Sanar** lo sustituye por una mezcla del sonido de justo antes y justo después.

<a id="importing"></a>
### Importar

**Importar** acepta archivos WAV, FLAC, MP3, AAC, OGG, M4A, AIFF y MIDI (.mid), varios a la vez. Cada archivo va a una pista nueva en 0:00. Para elegir la posición o la pista, arrastra los archivos a la línea de tiempo.

Los archivos MIDI se leen en tu navegador. Cada parte se convierte en una pista de instrumento con el instrumento que pide el archivo, y el canal 10 se convierte en una pista de batería. Importar un archivo MIDI no cambia el tempo de la sesión.

<a id="exporting"></a>
### Exportar

Todo el audio se procesa a 48 kHz estéreo a través de la mezcla completa, incluidos los efectos y sus colas.

| Opción del menú Exportar | Qué obtienes |
|---|---|
| Proyecto completo · un archivo para volver a abrirlo más tarde | `<name>.musicsuite.zip`: la sesión y todas sus grabaciones. Ábrelo en la página de sesiones con **Abrir un archivo de proyecto…** |
| Canción con las pistas elegidas · WAV, FLAC o MP3… | Marca las pistas que quieras y elige WAV de 24 bits, WAV de 32 bits float, FLAC o MP3 320 kbps. Las pistas que ahora están silenciadas empiezan sin marcar. Tus silencios y solos no cambian. |
| Mezcla final · WAV 24 bits / WAV 32 bits float / FLAC / MP3 320 kbps | Toda la mezcla tal como la oyes (sin las pistas silenciadas). |
| Rango resaltado · WAV 24 bits | Solo la selección de Rango. |
| Cada pista · WAV 24 bits | Un archivo por pista. |
| Pista seleccionada · WAV 24 bits / archivo MIDI | Solo la pista en la que hiciste clic (el menú muestra su nombre). |
| Todos los instrumentos · archivo MIDI | Un archivo MIDI con todas las pistas de notas, el tempo y el compás. |
| Enviar la mezcla al analizador y masterización → | Analiza la mezcla en la [página del analizador](#analyser-and-mastering), lista para masterizar. |
| Empezar una canción con IA a partir de la mezcla → | Abre el Estudio de canciones IA partiendo de la mezcla. |

<a id="saving-project-files-and-undo"></a>
### Guardado, archivos de proyecto y deshacer

- **Las sesiones se guardan solas** menos de un segundo después de cada cambio. No hace falta guardar nada a mano.
- **Deshacer** (Ctrl+Z) y **Rehacer** (Ctrl+Shift+Z) abarcan hasta 200 pasos, incluidos el tempo, los buses, los marcadores y el bucle. Arrastrar un deslizador o escribir un nombre cuenta como un solo paso. El historial de deshacer se pierde al recargar la página; el cambio de nombre de la sesión no se puede deshacer.
- El zoom, la posición de desplazamiento, la herramienta actual y la selección no se guardan.
- Los **archivos de proyecto** (Exportar → Proyecto completo) contienen la sesión y todo su audio. Úsalos para copias de seguridad y para mover una sesión a otro equipo. Los sonidos de sintetizador y los plug-ins favoritos guardados en tu navegador no se incluyen.

<a id="keyboard-shortcuts"></a>
### Atajos de teclado

| Teclas | Acción |
|---|---|
| Espacio | Reproducir / pausa |
| Home / End | Saltar al inicio / al final |
| V · C · R | Herramienta Selección · Cuchilla · Rango |
| S o Ctrl+E | Dividir en el cursor de reproducción |
| Delete (o Backspace) | Eliminar clips, o el rango resaltado |
| Shift+Delete | Eliminar y cerrar el hueco |
| Ctrl+D | Duplicar |
| Ctrl+C · X · V | Copiar · cortar · pegar en el cursor de reproducción |
| Ctrl+A | Seleccionar todos los clips |
| Ctrl+Z · Ctrl+Shift+Z (o Ctrl+Y) | Deshacer · rehacer |
| ← / → | Desplazar clips poco a poco, o mover el cursor de reproducción paso a paso |
| M · Shift+S | Silenciar · solo de la pista seleccionada |
| L | Bucle (usa el rango si hay uno resaltado) |
| N | Ajuste activado/desactivado (mantén Alt mientras arrastras para saltártelo) |
| + / − / F | Acercar · alejar · ajustar a la ventana |
| Ctrl+rueda / Shift+rueda | Zoom en el puntero / desplazar en horizontal |
| Shift+arrastrar en la regla | Dibujar una región de bucle |
| Shift+T | Añadir una pista |
| W · P · A | Vista espectral · piano roll · carril de automatización |
| K · [ · ] | Añadir un marcador · marcador anterior · siguiente |
| Shift+R | Convertir el rango resaltado en una sección |
| Esc | Cerrar menús y borrar la selección |
| ? | Mostrar la lista de atajos |

Los atajos se ignoran mientras escribes en un cuadro de texto.

<a id="editor-tools-the-inspector"></a>
## Herramientas del editor: el inspector

El inspector es el panel de la derecha del Editor de estudio. Lo que muestra depende de lo que esté seleccionado:

| Seleccionado | El inspector muestra |
|---|---|
| Un clip de audio | Clip, Separar stems, Reparar, Tomas (solo tomas en bucle), Warp, Restaurar, Tono y tiempo, Ajuste con IA, Plug-ins, Componer, Edición con IA, Generar una parte, Favoritos y después la pista del clip y sus efectos |
| Un clip MIDI (de notas) | Clip, Clip MIDI, Instrumento, Instrumento plug-in y después la pista y sus efectos |
| Nada | Ajustes del proyecto, Escribir un arreglo, Crear una canción, Fasímetro, Buses, Secciones, Marcadores y Medios |

<a id="how-processing-works"></a>
### Cómo funciona el procesado

- **Los resultados sustituyen el sonido del clip.** Una herramienta como Reducir ruido genera un archivo nuevo y el clip seleccionado pasa a reproducirlo. El nombre del clip recibe una nota de lo que se hizo, por ejemplo "Vocal (denoised, declicked)". El archivo original se conserva en **Medios**, y **Deshacer** (Ctrl+Z) lo recupera.
- **Algunas herramientas añaden pistas en su lugar:** Separar stems, Convertir en MIDI, Canción completa a MIDI, Generar una parte, renderizar un instrumento plug-in y las ediciones con IA Extraer, Añadir una parte y Construir. Estas dejan el original donde está.
- **La lista Procesando**, en la parte superior del inspector, muestra cada trabajo en curso con una barra de progreso y la etapa en la que está. Los trabajos terminados desaparecen a los pocos segundos; los fallidos se quedan, con el motivo en rojo, hasta que los descartas con ×.
- **Varios clips a la vez:** selecciona más de un clip y la mayoría de las herramientas de audio se ejecutan sobre todos. El encabezado del clip dice "Clip (N seleccionados)". Warp, Ajuste con IA, Generar una parte, Edición con IA, Canción completa a MIDI y la reparación espectral solo funcionan sobre el primer clip seleccionado. Las herramientas de audio se saltan los clips de notas.
- **Deslizadores:** haz doble clic en cualquier deslizador para devolverlo a su valor predeterminado. Pasa el ratón por encima para ver su valor.
- Si Music Suite se reinicia mientras se ejecuta un trabajo, el trabajo falla con "El trabajo se interrumpió antes de terminar. Ejecútalo de nuevo."

<a id="clip"></a>
### Clip

| Control | Rango / opciones | Por defecto | Qué hace |
|---|---|---|---|
| Nombre del clip | hasta 80 caracteres | nombre del archivo | El nombre en la línea de tiempo. |
| Ganancia | de −24 a +24 dB | 0 | Sube o baja este clip antes del fader de la pista. |
| Fundido de entrada / Fundido de salida | de 0 a 10 s | 0 | Hace un fundido al principio o al final del clip. |
| Forma del fundido | Lineal, Potencia constante, Curva en S | Lineal | Potencia constante mantiene el nivel uniforme durante un fundido cruzado; Curva en S entra y sale suavemente. |
| Invertir | sí / no | no | Reproduce el clip al revés. |
| Silenciar clip | sí / no | no | Silencia solo este clip. |
| Dividir (S) | | | Corta el clip en dos en el cursor de reproducción. |
| Duplicar (Ctrl+D) | | | Coloca una copia justo después. |
| Eliminar clip (Delete) | | | Lo quita de la línea de tiempo (Deshacer lo recupera). |

<a id="midi-clip"></a>
### Clip MIDI

Se muestra para un clip de notas. Toca el instrumento de la pista.

- **Abrir el piano roll (P):** edita las notas.
- **Mostrar como partitura:** las notas como partitura.
- **Transponer −12, −1, +1, +12:** mueve todas las notas ese número de semitonos.
- **Cuantizar notas a 1/16:** ajusta el inicio de cada nota a la semicorchea más cercana al tempo del proyecto.
- **Exportar como archivo .mid:** guarda solo las notas de este clip.

<a id="separate-stems"></a>
### Separar stems

Separa una grabación en sus instrumentos. Cada uno va a su propia pista debajo del original, alineado con él; el clip original se silencia, no se elimina.

| Control | Opciones | Qué hace |
|---|---|---|
| Número de stems | 2: voz + instrumental · 4: voz, batería, bajo, otros · 6: añade guitarra y piano | Más stems significa partes más finas. 6 stems necesita la separación de stems con IA. |
| Separar la batería en bombo, caja, toms, hi-hat, ride y crash | sí / no | Convierte el stem de batería en seis pistas. Necesita 4 o 6 stems y la separación de stems con IA. |
| Separar las voces en principal y coros | sí / no | Convierte el stem de voz en dos pistas. Necesita la separación de stems con IA. |

En un clip que ya es un stem pueden aparecer dos botones más: **Separar este stem de batería en piezas del kit** y **Separar este stem de voz en principal y coros**.

El motor usado se muestra en la parte superior de la sección. Con el paquete **Separación de stems con IA** de [Modelos y motores](#models-and-engines), la aplicación usa modelos de IA (RoFormer, htdemucs y DrumSep); sin él, un separador integrado sencillo solo da 2 o 4 stems aproximados.

Para una separación más detallada, instala **MVSep Mega 53** desde **Modelos y motores**, selecciona un clip y elige **Extraer los stems originales → MVSep Mega 53 → Extraer pistas de instrumentos**. La primera ejecución descarga los pesos. El modelo estima todas las categorías, así que algunas pistas pueden contener silencio o sangrado de otros instrumentos. Una canción larga puede producir varios gigabytes de audio.

Para un solo sonido, instala **Meta SAM Audio** y autentica la cuenta del backend de Music Suite con Hugging Face después de recibir acceso a `facebook/sam-audio-small`. Elige **Meta SAM Audio**, escribe una descripción como `muted trumpet` y selecciona **Extraer el sonido y el resto**.

Para generar una interpretación de reemplazo, selecciona un stem extraído y abre **Edición con IA → Reconstruir este stem con IA** con un generador que admita el cambio de estilo. Revisa la descripción y los ajustes de generación sugeridos y luego ejecuta la edición. El clip extraído sirve de referencia. Escucha si cambian las notas, el fraseo y el tempo.

> **Consejo:** para convertir una canción en notas, 4 stems es mejor que 6. La separación en seis stems adivina a cuál de guitarra, piano y "otros" pertenece cada sonido y cambia de opinión de un momento a otro, lo que reparte un mismo instrumento entre tres pistas.

<a id="repair"></a>
### Reparar

| Control | Rango | Por defecto | Qué hace |
|---|---|---|---|
| Intensidad + **Reducir ruido** | 10–100% | 60% | Elimina siseo, zumbido y ruido de fondo. Más alto elimina más, pero puede sonar acuoso. |
| Sonoridad + **Normalizar sonoridad** | de −30 a −6 LUFS | −14 LUFS | Sube o baja todo el clip hasta esa sonoridad, manteniendo los picos por debajo de −1 dBTP. Un clip con muchos picos puede quedar algo más bajo de lo pedido. |

> **Consejo:** para la reducción de ruido más limpia, usa primero la herramienta Rango (R) para resaltar dentro del clip un pasaje que sea solo ruido. Ese pasaje se usa como "huella de ruido" (de al menos 0.1 s). Sin él, la parte más silenciosa de cada banda de frecuencia se trata como ruido.

El mismo valor de Sonoridad es también el objetivo de la opción Sonoridad de Ajuste con IA.

<a id="takes"></a>
### Tomas

Se muestra en clips creados con grabación en bucle.

- **Usar esta toma:** hace que esta toma sea la que oyes en todo su pasaje y silencia las demás ahí.
- **Usar esta toma en el rango resaltado:** lo mismo, pero solo dentro de la selección de Rango, para que puedas montar una interpretación con los mejores trozos de varias.

<a id="warp"></a>
### Warp

Mueve momentos de una grabación en el tiempo sin cambiar su tono. Se muestra para un solo clip que no esté invertido.

1. Coloca el cursor de reproducción en un momento (un golpe de batería, una palabra) y pulsa **Añadir marcador en el cursor**.
2. Escribe dónde debe caer, o mueve el cursor de reproducción hasta allí y pulsa **Aquí**.
3. Pulsa **Aplicar warp**. El audio entre marcadores se estira o se comprime para encajar.

Cada estiramiento debe quedarse entre un cuarto y cuatro veces su duración original.

- **Cuantizar los tiempos a N BPM:** encuentra los tiempos tocados y los lleva a la cuadrícula de tempo del proyecto. Funciona cuando el tempo tocado está entre la mitad y el doble del tempo del proyecto.
- **Estirar a la duración del rango resaltado:** hace que el clip dure exactamente lo mismo que la selección de Rango.

<a id="restore"></a>
### Restaurar

Arreglos para grabaciones dañadas. **Cantidad** (10–100%, 50% por defecto) fija con qué fuerza trabajan DeClick y DeReverb.

| Botón | Qué arregla |
|---|---|
| DeClick | Clics, chasquidos y crepitado de vinilo. Una Cantidad más alta capta clics más suaves. |
| DeHum | El zumbido de la red eléctrica de 50 o 60 Hz y sus armónicos, detectado automáticamente. |
| DeClip | Picos aplanados por grabar demasiado fuerte: reconstruye su forma y luego baja el nivel para dejar margen. |
| DeReverb | El eco de la sala. Una Cantidad más alta suena más seca, pero puede sonar más delgada. |

Para una sola tos o el crujido de una silla, abre en su lugar la vista espectral (W) en la parte inferior y dibuja un recuadro alrededor (consulta [Editor de estudio](#studio-editor)).

<a id="pitch-and-time"></a>
### Tono y tiempo

| Control | Rango | Por defecto | Qué hace |
|---|---|---|---|
| Tono + **Aplicar cambio de tono** | de −12 a +12 semitonos | 0 | Cambia la tonalidad; la duración se mantiene. |
| Velocidad + **Aplicar estiramiento de tiempo** | 50–200% | 100% | Cambia la duración; el tono se mantiene. |

La calidad depende del motor que se muestra arriba: Rubber Band (se instala con los extras del editor) es el mejor; la alternativa integrada funciona, pero es más tosca.

<a id="ai-match"></a>
### Ajuste con IA

Adapta un clip al proyecto, o a otro clip, en tempo, tonalidad y sonoridad.

- **Detectar tempo y tonalidad:** analiza el clip y muestra "Detectado: 120 BPM · A minor · −12 LUFS". El audio no cambia en nada.
- **Usar en el proyecto:** copia ese tempo y esa tonalidad al proyecto y cambia la regla a compases.
- **Ajustar a:** el proyecto, o cualquier otro clip de la sesión.
- **Tempo / Tonalidad / Sonoridad** (Tempo y Tonalidad activados por defecto): qué ajustar. Tempo usa el más cercano entre tiempo normal, mitad o doble, y debe quedarse entre la mitad y el doble. Tonalidad se mueve el paso más pequeño, como mucho seis semitonos; una tonalidad relativa (de A minor a C major) no necesita ningún cambio.
- **Ajustar clip:** genera la versión ajustada y alinea su primer tiempo fuerte con el compás más cercano.

<a id="plugins"></a>
### Plug-ins

Se muestra cuando el alojamiento de plug-ins está instalado y se han encontrado plug-ins de efectos VST3 en este equipo.

1. Elige un plug-in. Sus controles aparecen como deslizadores (los 64 primeros).
2. **Probar 8 s desde el cursor** para oírlo sin cambiar nada.
3. **Renderizar con el plug-in** para aplicarlo. El resultado se recorta a la duración del clip, así que se pierde una cola de reverb que pase del final.

<a id="compose"></a>
### Componer

| Botón | Qué hace |
|---|---|
| Convertir en notas MIDI | Escribe las notas de este clip en una pista de instrumento nueva. Con el paquete **Transcripción de notas con IA** sigue los acordes; sin él, escribe una nota cada vez, lo que va bien para voces, bajo y líneas melódicas. |
| Canción completa a MIDI (todos los instrumentos) | Separa una canción completa y escribe una pista de notas por instrumento. Consulta [Convertir audio en notas](#turning-audio-into-notes). |
| Detectar secciones de la canción | Encuentra dónde cambia la canción y marca las secciones en la regla (Sección A, B…), dando la misma letra a las partes repetidas. Necesita al menos 8 s de sonido. |

<a id="ai-edit"></a>
### Edición con IA

Cambia un clip con IA, en este equipo (ACE-Step 1.5) o con un servicio en línea que hayas configurado en el [Estudio de canciones IA](#ai-song-studio). Cada cambio se puede deshacer.

| Tarea | Qué hace | Necesita |
|---|---|---|
| Regenerar una sección | Rehace solo la parte resaltada y deja el resto exactamente igual. | Una selección de Rango de al menos 1 s dentro del clip. |
| Extender | Añade 10, 20, 30 o 60 s de música nueva después del final o antes del principio. | |
| Cambiar de estilo | La misma canción en un estilo nuevo. **Conservar** (5–100%, 50% por defecto) fija cuánto se parece al original. | |
| Extraer un instrumento | Recrea un instrumento en su propia pista. Para stems exactos, usa Separar. | El modelo de edición de ACE-Step (2.4 GB) |
| Añadir una parte | Escribe una nueva parte de instrumento que encaje con el clip. | El modelo de edición de ACE-Step |
| Construir una canción completa a su alrededor | Una banda alrededor de, por ejemplo, un stem de voz. El original se silencia. | El modelo de edición de ACE-Step |

- **Estilo:** una descripción breve del sonido que quieres (al menos 3 caracteres).
- **Letra (opcional):** para Regenerar, Extender y Cambiar de estilo. Vacía da un instrumental.
- **Versiones (1–4):** la primera versión sustituye o añade el clip; las demás van a pistas silenciadas para que puedas compararlas.
- Los servicios en línea te piden permiso para subir el clip y muestran el coste antes de ejecutarse.

<a id="generate-a-part"></a>
### Generar una parte

Genera una nueva parte instrumental a partir de una descripción de texto (por ejemplo "warm upright bass, walking line") con MusicGen a través de ComfyUI en este equipo, al tempo y la tonalidad del proyecto. Duración de 4 a 60 s, 15 s por defecto. Necesita ComfyUI en marcha con los nodos Sonic Holodeck; la sección lo indica cuando no lo está.

<a id="favourites"></a>
### Favoritos

Guarda una cadena de pasos de procesado para que puedas volver a ejecutarlos con un clic.

- **Solo ejecutar:** repite uno de tus tres últimos pasos.
- **Últimos 1 / 2 / 3, Nombre, Guardar:** guarda tus últimos pasos con un nombre. Un favorito guardado ejecuta cada paso en orden, cada uno sobre el resultado anterior.

Los favoritos se guardan en este navegador. La separación, el warp, el ajuste, la transcripción y las herramientas de IA no se pueden guardar como pasos.

<a id="project"></a>
### Proyecto

Se muestra cuando no hay nada seleccionado.

| Ajuste | Rango | Por defecto | Qué hace |
|---|---|---|---|
| Tempo | 40–240 BPM | 120 | La velocidad del proyecto: la cuadrícula, los compases, el metrónomo y las partes generadas la siguen. |
| Tiempos / compás, El pulso es | 2–12, negra o corchea | 4/4 | El compás. |
| Tonalidad | cualquier tonalidad mayor o menor | Sin definir | La usan el ajuste, las armonías y las partes generadas. |
| Máster | de −60 a +6 dB | 0 | Nivel de salida global. |
| Limitador de pico real en el máster | sí / no | sí | Impide que la mezcla supere el techo, incluso entre muestras, para que las exportaciones nunca distorsionen. |
| Techo | de −6 a −0.1 dBTP | −1 | El nivel más alto que permite el limitador. |
| Fundido cruzado entre clips solapados | sí / no | sí | Los clips superpuestos se mezclan suavemente en lugar de cortarse. |

**Añadir una pista de instrumento (MIDI)** añade un clip de notas de cuatro compases en el cursor de reproducción y abre el piano roll.

<a id="write-an-arrangement"></a>
### Escribir un arreglo

Escribe batería, bajo, acordes, una melodía y más, como notas, en este equipo. Se muestra cuando el arreglista está activado.

| Ajuste | Opciones | Por defecto |
|---|---|---|
| Descríbelo (opcional) | hasta 400 caracteres; solo se usa cuando Ollama está en marcha | |
| Estilo | Pop, Rock, Ballad, Folk, Electronic, Lo-fi, Hip-hop, Funk, Jazz, Cinematic, Metal, Waltz | Pop |
| Forma | verse-chorus, pop, short, loop, AABA, build, instrumental | verse-chorus |
| Tonalidad, Tempo | cualquiera, o Auto (según el estilo) | Auto |
| Duración | 4–200 compases | 32 |
| Partes | Batería, Bajo, Acordes, Melodía, Pad, Arpegio | todas activadas |
| Densidad | 0–1 | 0.5 |
| Semilla | un número, o Auto | Auto: un resultado distinto cada vez |

**Escribir las partes** coloca una pista de instrumento por parte en el cursor de reproducción y marca las secciones en la regla. Un proyecto vacío adopta además el tempo, la tonalidad y el compás del arreglo.

<a id="track-effects-and-buses"></a>
### Pista, efectos y buses

**Pista** (cualquier pista seleccionada):

| Control | Rango | Por defecto | Qué hace |
|---|---|---|---|
| Graves / Medios / Agudos | de −12 a +12 dB | 0 | Ecualizador de tres bandas. |
| Anchura | de 0 (mono) a 200% | 100% | Estrecha o ensancha la imagen estéreo. |
| Ajustar frecuencias y ancho (Q) del EQ… | Graves 30–600 Hz, Medios 150 Hz–8 kHz, Q de medios 0.2–8, Agudos 1.5–16 kHz | 160 Hz, 1.2 kHz, 0.8, 6 kHz | Dónde actúa cada banda del ecualizador. |
| Salida | Máster o un bus | Máster | Adónde va la pista. |
| Envíos | de −48 a +6 dB por bus | −12 dB al activarlo | Envía una copia a un bus de reverb o de delay, después del fader. |
| Color | 8 colores | | El color del clip en la línea de tiempo. |

Los **efectos** se aplican en este orden: ecualizador, puerta, voz, distorsión, compresor, y después delay y reverb en paralelo con el sonido seco. Se oyen en directo y se incluyen en las exportaciones.

| Efecto | Ajustes (por defecto) | Úsalo para |
|---|---|---|
| Puerta de ruido | Umbral −45 dB, Ataque 2 ms, Mantenimiento 60 ms, Liberación 150 ms | Silenciar el ruido entre frases. |
| Distorsión | Drive 40%, Mezcla 100% | Añadir aspereza o calidez. |
| Compresor | Umbral −18 dB, Ratio 3:1, Ataque 10 ms, Liberación 200 ms, Ganancia de compensación 0 dB | Igualar los momentos fuertes y suaves. |
| Delay | Tiempo 375 ms, Realimentación 35%, Mezcla 25% | Ecos. |
| Reverb | Tamaño 1.8 s, Mezcla 20% | Espacio de sala o de auditorio. |

**Voz** convierte una voz en otra cosa:

- **Presets:** Robot singer, Deep vocoder, Monotone robot, Chipmunk (+12), Helium (+5), Monster (−7), Octave harmony, Ring-mod robot, Metallic robot, Synth voice, 8-bit voice, Vox distortion (megaphone), Old radio.
- **Tipo:**
  - Vocoder (cantante robot)
  - Cambio de tono (ardilla o monstruo)
  - Robot (modulador en anillo)
  - Voz de sintetizador (sigue tu tono)
  - Distorsión vocal
- **Notas** (vocoder y voz de sintetizador): siguen el canto, ajustadas a semitonos, con Transponer de −24 a +24; o mantienen una sola nota (C1–C6). Si mantienes pulsadas teclas de un teclado MIDI mientras suena la pista, eliges tú las notas, acordes incluidos.
- **Mezcla:** 0–100% (100% por defecto).

El vocoder y la voz de sintetizador funcionan mejor con una voz sola; en una mezcla completa siguen la nota que suene más fuerte.

**Buses** (sin nada seleccionado): **+ Reverb**, **+ Delay** y **+ Grupo** añaden una pista de efecto compartido o de grupo. Cada bus tiene un nivel, silencio y sus propios efectos. Envía pistas a él con sus Envíos.

**Plug-in del navegador:** plug-ins Web Audio de la comunidad de webaudiomodules.com. Es la única parte de la aplicación que carga código de internet, así que está desactivada hasta que pulses **Permitir plug-ins de internet en este navegador**.

<a id="sections-markers-and-media"></a>
### Secciones, marcadores y medios

Se muestra cuando no hay nada seleccionado.

- **Secciones:** **Añadir sección desde el rango resaltado** (Shift+R). Cada sección se puede seleccionar, **Repetir** (se inserta una copia justo después) o **Recortar** (se quita y se cierra el hueco).
- **Marcadores:** pulsa K para añadir uno en el cursor de reproducción; haz clic en uno para saltar a él.
- **Medios:** todos los archivos y tomas renderizadas del proyecto, incluidos los originales sustituidos por el procesado. Haz clic en uno para añadirlo en una pista nueva en el cursor de reproducción.
- **Fasímetro:** muestra si izquierda y derecha están en fase. El verde está bien; el rojo significa que hay partes que se cancelan al reproducirse en mono.

<a id="instruments-and-sounds"></a>
## Instrumentos y sonidos

Cada pista de instrumento (MIDI) toca sus notas a través de un instrumento. Elígelo en el inspector con un clip de notas seleccionado.

<a id="instrument-types"></a>
### Tipos de instrumento

- **Tipo:** *Sintetizador (notas con altura)* o *Kit de batería*. El kit de batería integrado toca bombo (nota 36 y por debajo), caja (37, 38, 40), palmas (39), hi-hat cerrado (42, 44), hi-hat abierto (46), platillo (49 y de 51 en adelante) y toms para las notas intermedias. En la batería, la duración de la nota se ignora.
- **Sonido de:** *El sonido de sintetizador propio de esta pista*, o cualquiera de los 128 instrumentos General MIDI (pianos, órganos, guitarras, bajos, cuerdas, metales, pads, etc.). La elección General MIDI también se escribe en los archivos MIDI exportados.
- **SoundFont (.sf2):** carga uno con **Cargar un SoundFont** para oír los instrumentos General MIDI con muestras reales. Sin él, el sintetizador integrado toca su sonido más parecido. Un SoundFont se aplica a todas las pistas, se queda solo en este navegador y nunca se sube. **Quitar** lo olvida.

<a id="the-built-in-synth"></a>
### El sintetizador integrado

Controles rápidos en el inspector:

| Control | Rango | Por defecto | Qué hace |
|---|---|---|---|
| Sonido | 17 presets de fábrica y tus propios sonidos | Init | Analog bass, Acid bass, Sub bass, Wobble bass, Supersaw lead, Mono lead, Pluck, Warm pad, Sweep pad, Strings, Brass, Organ, FM bell, FM electric piano, Noise riser, Chip square. |
| Brillo | 60 Hz – 18 kHz | 3.2 kHz | Más brillante o más apagado (el corte del filtro). |
| Ataque | 1 ms – 2 s | 10 ms | Lo rápido que entra una nota. |
| Liberación | 5 ms – 4 s | 200 ms | Cuánto suena una nota después de soltarla. |

**Editar sonido…** abre el editor de sonido completo, que es el mismo que el del [Estudio de síntesis](#synth-studio): tres osciladores, filtro, ruido y FM, dos envolventes, dos LFO y hasta ocho rutas de modulación. **Guardar como mi sonido** conserva un sonido para todas las pistas y para el Estudio de síntesis; **Exportar** e **Importar** mueven sonidos entre equipos como archivos `.mssound`.

<a id="plugin-instruments-vst3"></a>
### Instrumentos plug-in (VST3)

Los instrumentos plug-in como **Surge XT** (gratuito, se instala desde [Modelos y motores](#models-and-engines)) funcionan en este equipo, fuera del navegador.

- **Instrumento plug-in:** *Ninguno* (toca el sintetizador integrado) o uno de los instrumentos encontrados en este equipo.
- **Sonidos:** para Surge XT, una lista con búsqueda de sus sonidos de fábrica. Marca un sonido con una estrella para guardarlo en **★ Favoritos**.
- **Reproducir:** repite el clip en bucle a través del plug-in para que puedas oírlo. **Detener** lo termina.
- **Tócalo desde tu teclado MIDI:** inicia el plug-in para que tu teclado lo toque en directo (grabar captura las notas).
- **Abrir la interfaz completa de <name>:** abre la propia ventana del plug-in en el escritorio (puede quedar detrás del navegador). **Conservar este sonido y cerrar la ventana** guarda lo que hayas ajustado ahí.
- **Renderizar este clip con <name>:** convierte las notas en audio en una pista nueva debajo de la pista de instrumento y silencia el clip de notas, para que no se oiga dos veces.
- **Exportar sonido / Importar sonido:** guarda o carga un sonido del plug-in como archivo.

Las notas llegan a un instrumento plug-in entre 15 y 25 ms después de tocarlas; los auriculares Bluetooth añaden su propio retardo.

<a id="turning-audio-into-notes"></a>
## Convertir audio en notas

Music Suite puede escribir las notas de una grabación como MIDI: un clip, o una canción entera con una pista por instrumento.

<a id="ways-to-do-it"></a>
### Formas de hacerlo

| Dónde | Para qué |
|---|---|
| Inspector → Componer → **Convertir en notas MIDI** | Un clip: una voz, una línea de bajo, un piano, un stem. |
| Inspector → Componer → **Canción completa a MIDI (todos los instrumentos)** | Una mezcla completa: una pista de notas por instrumento. |
| El [Asistente de teclado](#keyboard-wizard), paso Canción | Lo mismo, con los mejores ajustes ya elegidos para ti. |

<a id="what-kind-of-recording-it-is"></a>
### Qué tipo de grabación es

El asistente pregunta qué es la grabación. Esto importa más que cualquier otro ajuste:

| Opción | Qué ocurre | Ideal para |
|---|---|---|
| Una canción completa, o no estoy seguro | Se separa en cuatro stems (voz, batería, bajo, otros), cada uno se transcribe con el modelo que le va mejor y luego se limpia. Si un stem contiene el 90% o más del sonido, la grabación se reconoce como un solo instrumento y se transcribe entera. | Mezclas, y cualquier cosa de la que no estés seguro |
| Solo un piano | Se transcribe directamente con un modelo solo para piano, sin separar. | Piano solo: la opción más precisa |
| Otro instrumento solo | Se transcribe directamente, acordes incluidos. | Una guitarra, un sintetizador o un órgano solos |
| Una voz o línea melódica | Se transcribe nota a nota. | Un cantante, un silbido, una línea solista, una línea de bajo |

Separar la grabación de un solo instrumento lo hace pedazos: un piano solo separado en seis volvió con el 6% de sus notas. Decirle a la aplicación qué es la grabación lo evita.

<a id="which-engines-write-the-notes"></a>
### Qué motores escriben las notas

| Parte | Motor | Necesita |
|---|---|---|
| Piano | Transkun, un modelo solo para piano | Paquete de transcripción de notas con IA |
| Acordes y otros instrumentos | basic-pitch | Paquete de transcripción de notas con IA |
| Voz, bajo, líneas individuales | basic-pitch (nota a nota), o pYIN sin el paquete | |
| Batería | Golpes encontrados en cada pieza de batería separada (bombo, caja, toms, hi-hat, ride, crash) | Separación de stems con IA para las piezas de batería; sin ella, solo bombo, caja y hi-hat |
| Toda la mezcla de una vez (opcional) | MuScriptor: nombra hasta 35 instrumentos | Instalación manual; solo para uso no comercial |

**Método** (se muestra cuando MuScriptor está instalado): *Lo mejor disponible* (el método de stems, que dio mejores mediciones), *MuScriptor: un modelo escucha toda la mezcla* o *Stems: separar primero y luego un modelo por instrumento*.

<a id="how-the-notes-are-cleaned-up"></a>
### Cómo se limpian las notas

- **Cada nota se comprueba con el audio.** Una nota que no se oye en la grabación en ese momento se descarta. Esto elimina la mayoría de las "notas raras que no vienen a cuento".
- Se descartan las notas que una voz o un bajo no pueden producir.
- Se descartan las notas cortas y débiles fuera de la tonalidad de la canción, pero solo cuando la tonalidad se detecta con seguridad.
- Se elimina el sonido que se ha colado de un instrumento al stem de otro.
- Los stems en silencio se omiten, y una canción sin batería no recibe parte de batería.
- Los inicios de las notas se alinean con el pulso propio de la canción (semicorcheas o tresillos).
- Las notas conservan la duración con que se mantienen en la grabación.

<a id="how-accurate-it-is"></a>
### Qué precisión tiene

Medido con una pieza de piano de 47 notas conocidas:

| Ruta | Notas correctas | Notas inventadas | Duración mantenida |
|---|---|---|---|
| Solo un piano | 92% | ninguna | 101% de lo escrito |
| Una canción completa, o no estoy seguro (reconocida como un instrumento) | 92% | ninguna | 101% |
| La misma pieza tocada en un Roland GO:KEYS 3, grabada y transcrita | 96% | ninguna | 100% |

Las partes claras (una voz principal, una línea de bajo, un instrumento solo) salen bastante fieles. Las mezclas densas son aproximadas, porque la propia separación mezcla instrumentos: en una canción completa, las notas que se pudieron confirmar en el audio fueron alrededor del 95% para la voz, el 91% para la guitarra, el 80% para el bajo y el 71% para el stem "otros". Comprueba los resultados de oído y corrige las notas equivocadas en el piano roll.

> **Consejo:** para obtener los mejores resultados, instala tanto **Separación de stems con IA** como **Transcripción de notas con IA** desde [Modelos y motores](#models-and-engines).

<a id="your-hardware-keyboard"></a>
## Tu teclado físico

Un teclado físico conectado por USB (por ejemplo, un Roland GO:KEYS 3) puede tocar tu música con sus propias voces, y su sonido se puede grabar directamente de vuelta en una sesión. Todo está en el botón **Teclado** del editor.

<a id="connecting-the-keyboard"></a>
### Conectar el teclado

1. Conecta el teclado al equipo con un cable USB y enciéndelo. Pon su volumen a unas tres cuartas partes.
2. Abre Music Suite en **Chrome o Edge** (otros navegadores no pueden comunicarse con hardware MIDI).
3. En el editor, pulsa **Teclado**, luego **Conectar**, y permite MIDI cuando el navegador lo pida.
4. Elige el teclado en **Teclado**, y su **Canal**. Un GO:KEYS 3 escucha **solo en el canal 4**; la mayoría de los demás teclados configurados para "recibir todo" responden en cualquiera.
5. **Probar salida: tocar tres notas:** deberías oírlas en el teclado.

Un GO:KEYS 3 aparece como "Roland Digital Piano" para MIDI y como "Line (Roland Digital Piano)" para audio.

<a id="play-my-music-on-the-keyboard"></a>
### Tocar mi música en el teclado

**Qué toca el teclado cuando suena la canción:**

- *Nada:* las notas suenan en el equipo.
- *Todas las partes juntas:* todas las pistas de notas.
- *Una parte:* una sola pista.

Las notas elegidas van al teclado durante la reproducción normal, y su sonido en el equipo se silencia para que no se oigan dos veces. Solo aparecen las pistas que tienen notas; convierte antes el audio en notas (consulta [Convertir audio en notas](#turning-audio-into-notes)) o usa el Asistente.

**Notas a la vez:** *Todas*, o un límite de 1, 2, 3, 4 o 6. Algunas voces del teclado, sobre todo las voces de personaje, convierten muchas notas simultáneas en un borrón; un límite conserva las notas más fuertes y descarta el resto.

<a id="choosing-the-keyboards-voice"></a>
### Elegir la voz del teclado

**Voz del teclado** elige cualquier sonido que tenga el teclado:

1. Elige un **banco**.
2. Recorre sus sonidos con **◀ ▶**, o escribe el número del sonido. Cada cambio se envía al teclado y se toca, así que lo que ves es lo que oyes.
3. **Escuchar** toca un acorde corto con la voz actual.

También puedes pulsar un botón de sonido en el propio teclado; cuando el teclado lo comunica, la aplicación lo recoge.

Bancos del GO:KEYS 3:

| Banco | Qué contiene |
|---|---|
| Voces extra (71/99) | Más voces que no están en la lista de tonos publicada por Roland; en la edición Minion, aquí están sus voces de personaje. |
| Preset A, B, C (71/96, 71/97, 71/98) | La lista de tonos principal: pianos (Preset A, número 1, es el piano de cola), órganos, cuerdas, sintetizadores, etc. |
| Common 1–7 (87/85 a 87/91) | Más sonidos al estilo General MIDI. |
| Kits de batería (86/65) | Kits de batería. |

El teclado toca una voz a la vez, así que una canción con varias partes se graba una parte tras otra.

<a id="recording-a-part-through-the-keyboard"></a>
### Grabar una parte a través del teclado

1. **Entrada de audio:** **Buscar entradas** y luego elige la salida propia del teclado (para un GO:KEYS 3, "Line (Roland Digital Piano)"). **Probar entrada** muestra si llega sonido.
2. **Sincronización:** **Medir el retardo**. El teclado responde unas decenas de milisegundos tarde; medirlo una vez hace que cada toma caiga exactamente a tiempo.
3. **Grabar una pasada:** elige la parte y pulsa **Grabar … a través del teclado**. Toca la parte y graba lo que vuelve en una pista nueva llamada "<part> (keyboard)". La pista de notas se queda como estaba, para que puedas grabarla otra vez.

**Nivel automático:** antes de cada toma, la aplicación toca el acorde más fuerte de la parte, mantenido tanto como lo mantiene la parte (hasta unos 1.6 segundos, para que se midan las voces que crecen), mide lo que vuelve y ajusta el volumen del teclado por MIDI para que ese momento quede a un tercio de la escala completa, más o menos. Eso deja margen para acordes mantenidos que se superponen y para voces que siguen creciendo, de modo que una toma entera se queda por debajo de la distorsión. Añade unos segundos de acordes de prueba antes de cada toma. Una voz muy suave puede quedarse por debajo del objetivo incluso a todo volumen.

**Comprobaciones después de cada toma:**

- *En silencio:* la toma no se guarda, y se te avisa de que el teclado dejó de responder (consulta [Solución de problemas](#troubleshooting)).
- *Distorsionada:* la toma se guarda igualmente y se te avisa. En el asistente se vuelve a grabar sola, cada vez unos 6 dB más baja, hasta tres intentos; solo si incluso con un volumen MIDI bajo distorsiona se te pide que bajes el mando de volumen del propio teclado.

<a id="keyboard-wizard"></a>
## Asistente de teclado

El botón **Asistente** del editor lleva una canción de principio a fin a través del teclado, paso a paso: o bien le añade una voz nueva, o bien cambia las voces de sus partes. Cada paso dice qué está haciendo mientras lo hace.

<a id="step-1-song"></a>
### Paso 1: Canción

Di qué es la grabación: *Una canción completa, o no estoy seguro*, *Solo un piano*, *Otro instrumento solo* o *Una voz o línea melódica* (consulta [Convertir audio en notas](#turning-audio-into-notes) para ver qué hace cada opción). Después, **Cargar un archivo de canción…**, o **Usar esta** para una canción que ya está en la línea de tiempo. El asistente la separa si hace falta y escribe sus notas; una canción de tres minutos tarda unos minutos.

Si la sesión ya tiene pistas de notas, **Omitir** pasa directamente al siguiente paso.

<a id="step-2-keyboard"></a>
### Paso 2: Teclado

**Comprobar el teclado** encuentra el MIDI del teclado y su entrada de audio, toca una nota de prueba y mide cuánto tarda el sonido en volver. Cuando funciona, muestra las tres cosas. Permite el MIDI y el micrófono cuando el navegador lo pida: el sonido del teclado llega como una entrada de audio.

<a id="step-3-voices"></a>
### Paso 3: Voces

Elige qué hacer:

**Añadir una voz a la canción** (la opción predeterminada). La canción se queda exactamente como está, y se escribe una parte nueva que la acompaña:

| Qué hace la nueva voz | Cómo se crea |
|---|---|
| Cantar la melodía | La melodía de la canción, nota a nota, plegada a un registro cantable. Se toma de la parte vocal si la hay; si no, de la línea superior de las demás partes. |
| Cantar una armonía | Una tercera por encima de la melodía, dentro de la tonalidad de la canción. |
| Sostener los acordes | Notas largas que siguen los acordes de la canción compás a compás, tres a la vez, como un coro de acompañamiento. |

Marca una o varias. Cada estilo marcado se convierte en su propia parte, que se graba por turnos, y las tomas suenan juntas: la melodía, su armonía y los acordes mantenidos debajo. Los acordes mantenidos se convierten en tres partes (grave, media y aguda), porque las voces Minion suenan nota a nota. Pulsa **Escribir la parte para cantar**. Se construye a partir de las propias notas de la canción, así que su tonalidad, su tempo y sus acordes salen de la canción. **Escribirla de nuevo** la sustituye, por ejemplo después de elegir otro estilo. La parte nueva empieza en el banco **Voces extra** del teclado, donde la edición Minion del GO:KEYS 3 guarda sus voces de personaje; recórrelo hasta encontrar la que quieras. Esto dobla, armoniza o acompaña la melodía existente de la canción; no compone una contramelodía nueva, y solo es tan buena como las notas escritas en el paso 1.

**Cambiar la voz de las partes de la canción.** El teclado toca las partes de la propia canción con las voces que elijas. Marca las partes que quieras incluir. **Silenciar lo que el teclado reemplaza** silencia cada parte original en cuanto su toma de teclado está lista; si no lo marcas, el original sigue sonando entero bajo las tomas.

Para cada parte:

| Ajuste | Opciones | Por defecto | Qué hace |
|---|---|---|---|
| Voz | Cualquier banco y sonido, o el sonido actual del teclado | Partes de piano: el piano de cola; parte para cantar: Voces extra | Con qué toca el teclado la parte. |
| Notas a la vez | 1 (melodía), 2, 3, 4, Todas | Líneas de voz, bajo y solista: 1; acordes de la parte para cantar: 3; todo lo demás: Todas | Aligera los acordes para voces que los emborronan. |
| Octava | Registro cantable, 2 arriba, 1 arriba, Tal como está escrito, 1 abajo | Líneas: Registro cantable; las demás: Tal como está escrito | Mueve la parte por octavas enteras. Registro cantable la centra en torno al sol por encima del do central. |
| Duración de las notas | Mantenida hasta la siguiente, Espacio para hablar, Tal como está escrito | Líneas: Mantenida hasta la siguiente; las demás: Tal como está escrito | *Mantenida hasta la siguiente* une las notas (un silencio largo sigue siendo un silencio); *Espacio para hablar* da a las notas cortas al menos un cuarto de segundo. |
| Una nota a la vez | sí / no | Activado para las Voces extra del teclado (las voces Minion); desactivado en otro caso | Medido en el GO:KEYS 3: estas voces suenan nota a nota, y una nota nueva corta la palabra que aún se está diciendo. Con esto activado, ninguna nota empieza hasta que la anterior haya tenido su duración mínima, y cada capa se graba como una toma propia. |
| Nota más corta | de 0 a 2 segundos | Partes cantadas para cantar: 0.6 s; las demás: según su forma | Cada nota dura al menos esto. Una voz que dice una palabra (una voz Minion) se corta cuando termina su nota, así que dale tiempo suficiente para la palabra. |
| Cuando una nota se junta con la siguiente | Saltar la siguiente nota (las palabras terminan), Dejar que se solapen | Parte para cantar: Saltar | *Saltar* descarta una nota corta que empezaría mientras aún se dice una palabra, así que se cantan menos notas, pero cada palabra queda entera. *Superponer* conserva todas las notas y deja que suenen unas sobre otras. Los acordes mantenidos nunca se saltan. |
| Subirla una tercera | sí / no | no | Toca una tercera por encima de la parte en lugar de la parte en sí. |
| Añadir capas | 3.ª arriba, 5.ª abajo, Octava arriba, Octava abajo | ninguna | Notas que se añaden a cada nota de la parte, algo más suaves; la tercera y la quinta siguen la tonalidad de la canción. Con *Una nota a la vez* activado, cada capa se graba como una toma propia con el mismo ritmo, en su propia pista; si no, se tocan juntas en una sola toma. |

Algunas voces Minion dicen una palabra corta que termina sola (de unos 0.3 a 0.8 segundos, medido) por mucho que se mantenga la tecla. Una *Nota más corta* más larga no alarga esa palabra; le da espacio para terminar antes de la nota siguiente.

<a id="step-4-record"></a>
### Paso 4: Grabar

**Grabar una parte cada vez** (recomendado). Para cada parte:

1. Comprueba o cambia su voz y sus ajustes, y luego **Grabar esta parte**, u **Saltarla**.
2. Escucha con **Escucharla sola** u **Escucharla con la canción**. Esto solo cambia lo que oyes; en la sesión no cambia nada.
3. **Grabar de nuevo** después de cambiar algo (la toma nueva sustituye a la anterior), o **Conservarla, siguiente parte**.

**Grabar todo sin parar** graba cada parte por turnos sin esperarte.

Antes de cada toma, el nivel del teclado se ajusta automáticamente (consulta [Tu teclado físico](#your-hardware-keyboard)). Si una toma vuelve distorsionada, el asistente vuelve a grabar esa parte por sí solo, unos 6 dB más baja cada vez, hasta tres intentos, y solo entonces te pide que bajes el mando de volumen del propio teclado. Si una toma vuelve en silencio, el asistente se detiene en lugar de guardar pistas vacías.

<a id="step-5-done"></a>
### Paso 5: Listo

Cada toma conservada está en su propia pista con el nombre de su parte, y las pistas de notas quedan silenciadas. En el modo *Añadir una voz* no se cambia nada más; en el modo *Cambiar la voz*, las partes sustituidas se silencian si marcaste esa opción. **Reproducir el resultado** reproduce toda la canción desde el principio. Ajusta los faders y exporta como siempre (Exportar → Mezcla final, o Canción con las pistas elegidas).

<a id="ai-song-studio"></a>
## Estudio de canciones IA

En **Ajustes → Descargas de modelos locales**, selecciona un runtime, revisa sus requisitos y confirma la descarga. Después de instalarlo, selecciona el motor en el formulario de generación. HeartMuLa y MiniMax Music 3 aceptan letras. DiffRhythm usa letras con marcas de tiempo y ofrece generaciones de 95 y 285 segundos. Magenta RealTime 2 genera instrumentales sin conexión. Stable Audio 3 también funciona a partir de un clip del editor. Selecciona el clip y abre **Edición con IA** para cambiarle el estilo, regenerar una región resaltada o continuar más allá del final de la fuente. Cada runtime tiene sus propias dependencias. Algunos pesos se descargan en la primera generación.

Genera canciones con IA: en este equipo con ACE-Step 1.5, o con un servicio en línea que activas con tu propia clave. Los resultados se abren en el Editor de estudio. La página tiene cuatro pestañas: **Crear**, **Álbum**, **Historial** y **Ajustes**.

<a id="generators"></a>
### Generadores

| Generador | Dónde se ejecuta | Necesita | Notas |
|---|---|---|---|
| ACE-Step 1.5 (en este equipo) | Tu equipo | El motor local (unos 5.3 GB, se instala desde Ajustes) | Activado por defecto. Canciones completas con voz, sin conexión. También hace ediciones con IA. |
| ACE-Step 1.5 (tu propio servidor Python) | Tu equipo | El propio servidor de ACE-Step ya en marcha | Desactivado por defecto. Funciona mejor en NVIDIA. |
| YuE2 (en este equipo, no comercial) | Tu equipo | GPU NVIDIA con unos 24 GB y una instalación aparte de YuE2 | Desactivado por defecto. Licencia CC BY-NC 4.0: no apto para uso comercial. |
| MusicGen a través de ComfyUI | Tu equipo | ComfyUI en marcha, con los nodos Sonic Holodeck | Partes instrumentales cortas, de hasta 120 s. |
| ElevenLabs Music | En línea | Tu clave de ElevenLabs | Unos 0.15 $ por minuto (precios de 2026-11). Planes de canción. |
| fal.ai: MiniMax Music, Lyria | En línea | Tu clave de fal.ai | Unos 0.08–0.15 $ por canción. |
| Google Lyria | En línea | Tu clave de Gemini | Unos 0.04–0.08 $ por canción. Cada canción lleva la marca de agua SynthID de Google. |

Suno aparece en la lista, pero no está disponible: no tiene API pública, y los conectores no oficiales incumplen sus condiciones. El arreglista (que escribe notas, no audio) se usa desde el inspector del Editor de estudio.

<a id="create"></a>
### Crear

1. **Instalar motor local** si la tarjeta lo pide (solo la primera vez; unos 5.3 GB y unos minutos).
2. **Generador:** se muestra cuando hay más de uno listo.
3. O bien **Empezar desde una idea**: describe la canción en una o dos frases y pulsa **Escribir estilo y letra** (unos 30 s). Rellena el título, el estilo, la letra, el tempo, la tonalidad, el compás, el idioma y la duración. Edita lo que quieras antes de generar. Con Ollama instalado, las letras son más completas.
4. O bien **Empezar desde una canción:** **Elegir un archivo de canción** (o elige una que hayas analizado). Se miden y se rellenan su tempo, su tonalidad, su compás, su duración y su carácter. Después, elige qué hacer con ella:

| Opción | Qué crea |
|---|---|
| Canción nueva en su estilo | Una canción nueva con el mismo tempo, tonalidad, duración y carácter. |
| Cambiar de estilo | La misma canción en un estilo nuevo. |
| Extender | Más música antes del principio o después del final. |
| Extraer un instrumento | Un instrumento de ella, en su propia pista. |
| Añadir una parte | Una parte nueva (batería, bajo, guitarra…) que encaje encima. |
| Construir una canción completa a su alrededor | Un arreglo alrededor de, por ejemplo, una voz o un riff. |

Extraer, Añadir una parte y Construir necesitan el modelo de edición (2.4 GB, desde Ajustes). Con *Canción nueva en su estilo* y *Cambiar de estilo*, la pista del original se silencia en la sesión.

5. Rellena el formulario y pulsa **Generar** (o **Generar en este proyecto** si vienes del editor).

**Ajustes de ACE-Step:**

| Ajuste | Rango | Por defecto | Qué hace |
|---|---|---|---|
| Descripción del estilo | 3–1500 caracteres | | Género, ambiente, instrumentos, voz y producción, con palabras sencillas. Obligatorio. |
| Instrumental (sin voz) | sí / no | no | Sin canto. |
| Duración | 10–600 s | Auto | Déjalo en Auto para que elija el modelo. |
| Letra | hasta 6000 caracteres | vacía | Usa etiquetas como [Verse] y [Chorus] (los botones + Estrofa, + Estribillo… las insertan). Vacía deja que el modelo la escriba. |
| Idioma | Auto y 21 idiomas | Auto | |
| Tempo / Tonalidad / Compás | 30–300 BPM / cualquier tonalidad / 4/4, 3/4, 2/4, 6/8 | Auto | |
| Versiones a crear | 1–4 | 1 | Cada versión extra lleva más tiempo. |
| Semilla | −1 o un número | −1 | −1 es aleatoria. Reutiliza una semilla para volver a obtener el mismo resultado. |

**Avanzado** (plegado):

- **Planificar la canción primero:** activado por defecto; añade unos 15 s.
- **Dejar que el planificador reescriba el estilo.**
- **Temperatura, guía, top-p y top-k del planificador:** lo atrevido que es el plan.
- **Estilos que evitar.**
- **Pasos de difusión:** Auto es 8 para los modelos rápidos y 50 para el modelo base.
- **Guía de difusión, Desplazamiento del programa y Solver.**
- **Modelo musical y Modelo planificador:** Auto usa el modelo XL de alta calidad cuando está instalado y activado.
- **Adaptador LoRA e intensidad:** solo se muestran cuando hay adaptadores instalados.

**Reescribir** (bajo la letra) cambia la letra según lo que pidas, por ejemplo "add a bridge" o "translate to Spanish". Necesita Ollama.

**Rimas y sílabas** (bajo la letra) muestra cada verso con su número de sílabas y una letra de rima: los versos con la misma letra riman, así que ves el esquema (AABB, ABAB…) de un vistazo. Un número en ámbar indica que el verso es mucho más largo o corto que el resto de su sección y no encajará en la misma melodía. Funciona sin Ollama y se actualiza mientras escribes. Las rimas son exactas en español y, cuando se ha descargado su diccionario de pronunciación (3,6 MB, la primera vez), en inglés; en ruso, ucraniano, alemán y francés se juzgan por la escritura, así que tómalas como una guía.

**Alternativas** (junto a un verso) sugiere otras versiones de ese verso que mantienen su rima y su longitud. Elige con qué debe rimar (su verso pareja, otro verso o sin rima), indica si quieres qué cambiar y pulsa **Sugerir**. Cada sugerencia se comprueba con las mismas reglas: una marca significa que rima de verdad y tiene el número de sílabas correcto. **Usar** la pone en lugar del verso. Necesita Ollama. Los modelos locales pequeños riman bien en inglés y español y con menos fiabilidad en ruso y ucraniano; por eso cada sugerencia se comprueba en lugar de darla por buena.

**Mejorar la descripción** (bajo la descripción del estilo) la reescribe para que sea más clara y concreta para el modelo musical: género, ambiente, tempo, instrumentos, voz y producción, manteniendo tu idea. La escribe en inglés, que es lo que mejor entienden los modelos musicales. **Deshacer** recupera lo que tenías.

La barra inferior muestra cuánto tardará (en local) o cuánto costará (en línea). Mientras genera, muestra cada etapa y un botón **Cancelar**. Los servicios en línea no se pueden cancelar una vez enviada la petición.

**Resultados:** cada versión tiene un reproductor y su tempo, tonalidad, sonoridad y semilla. Los botones son:

- **Abrir en el Editor de estudio**
- **Añadir a una sesión**
- **Separar en stems**
- **Analizar**
- **Crear una canción a partir de ella**
- **Conservar esta semilla para la próxima versión**

Cada versión va a su propia pista; las versiones extra se silencian para que puedas compararlas.

**Plan de la canción de ElevenLabs:** un plan opcional sección por sección, con hasta 30 secciones y 10 minutos en total. Cada sección tiene:

- un nombre y una duración (3–120 s);
- lo mucho que sigue a sus vecinas;
- su letra, una línea por cada verso cantado;
- sus estilos y lo que hay que evitar.

**Redactar un plan (gratis)** crea uno por ti. Los estilos de la primera sección fijan el género. Con un plan, Duración y Letra no se usan.

<a id="album"></a>
### Álbum

Crea hasta 20 canciones en segundo plano, una tras otra. Siguen adelante después de un reinicio.

- **Título del álbum**, **Generador**, **De qué trata el álbum** y **Estilo común**.
- **Canciones, una idea por línea.**
- **Cada canción de unos** (30–300 s, 150 por defecto).
- **Instrumental**, y **Escribir letra y estilo para cada canción** (activado).
- **Hacer N canciones.**

Cada álbum se convierte en su propia sesión. Cuando falta memoria o el generador está ocupado, una canción espera y lo vuelve a intentar cada minuto durante hasta dos horas. **Abrir en el Editor de estudio** coloca las canciones terminadas una tras otra; **Detener** cancela el resto.

> **Consejo:** usa ACE-Step o un servicio en línea para los álbumes. MusicGen y YuE2 usan ajustes diferentes, y es probable que un álbum hecho con ellos falle.

<a id="history"></a>
### Historial

Todas las canciones que has creado, con los ajustes que las crearon. **Usar estos ajustes** vuelve a rellenar el formulario; **Abrir proyecto** lo abre en el editor; el icono de la papelera quita la entrada (el audio se queda en su sesión).

<a id="settings"></a>
### Ajustes

| Tarjeta | Ajustes |
|---|---|
| Motor de música local | **Instalar motor local**, **Descargar modelo de alta calidad (4.9 GB)** (mejores canciones, alrededor de un 25% más lento), **Descargar modelo de edición (2.4 GB)** (necesario para Extraer, Añadir una parte y Construir), **Descargar de memoria ahora** y **Usar el modelo de alta calidad (XL) para canciones nuevas** (activado). |
| Escritor de letras y estilo | Usa Ollama (de ollama.com) con el modelo que elijas; **Descargar** lo obtiene (gemma4:12b, unos 8 GB). Sin Ollama, el propio planificador del motor de música escribe un borrador más sencillo. |
| Mantener tu equipo ágil | **No empezar por debajo de** 5–80% de memoria libre (25% por defecto). **Descargar el motor de memoria tras** 1–240 minutos de inactividad (10 por defecto). |
| Sonoridad de las canciones nuevas | **Nivelar cada canción nueva al importarla** (activado), a una **Sonoridad objetivo** de −30 a −6 LUFS (−14 por defecto), con picos nunca por encima de −1 dBTP. No se aplica a las ediciones con IA ni a MusicGen. |
| Servicios en línea | Pega tu clave de API y pulsa **Guardar clave** para activar un servicio; **Quitar clave** lo desactiva. Las claves se guardan en el Administrador de credenciales de Windows. Cada uno tiene un enlace **Condiciones y precios**. |
| Generadores | Activa o desactiva cada generador. |

<a id="synth-studio"></a>
## Estudio de síntesis

Diseña sonidos de sintetizador y tócalos; los sonidos que guardes aquí aparecen como "Mis sonidos" en las pistas de instrumento del Editor de estudio. El botón **MIDI** de la parte superior conecta un teclado MIDI, que toca la pestaña que esté abierta (la velocidad, el pedal de sustain y el pitch bend funcionan).

<a id="music-suite-synth"></a>
### Sintetizador de Music Suite

El sintetizador integrado, que funciona en tu navegador.

- **Barra de sonido:** el nombre del sonido, **Cargar un preset…** (sonidos de fábrica y Mis sonidos), **Guardar como mi sonido** (se guarda en este navegador, hasta 200), **Olvidar**, **Exportar** / **Importar** (archivos `.mssound`) y **Sonido nuevo** (vuelve a Init).
- **Piano:** toca con el ratón, con el dedo o con las teclas del equipo A W S E D F T G Y H U J K O L P; **Z / X** cambian de octava. Hasta 12 notas a la vez.

| Sección | Controles (por defecto) |
|---|---|
| Osciladores 1, 2, 3 | **Activado** (al principio solo está activado el 1). **Onda:** Sierra, Cuadrada, Pulso 25%, Pulso 12%, Triangular, Senoidal, Órgano, Hueca, Brillante. **Octava** ±3, **Semitonos** ±12, **Fino** ±100 cents, **Nivel** (80%). **Unísono** de 1 a 7 voces con **Desafinación** y **Amplitud estéreo**, para un sonido más grueso. |
| Filtro | **Tipo:** paso bajo, paso alto, paso banda, notch. **Pendiente:** 12 o 24 dB/oct. **Corte** (3.2 kHz): el brillo. **Resonancia** (10%): un pico en el corte. **Saturación**: aspereza. **Seguimiento de teclado** (30%): las notas más agudas son más brillantes. **Cantidad env. 2**: cuánto barre la envolvente 2 el filtro. |
| Ruido, FM y voz | **Ruido**. **FM (osc 2 → 1)**: tonos de campana y de piano eléctrico. **Voces:** Poly (acordes) o Mono (una nota, con portamento) con tiempo de **Portamento**. **Velocidad** (60%): cuánto más fuerte suena al tocar con más fuerza. **Volumen**. |
| Envolvente 1 (Volumen) | **Ataque** (10 ms), **Caída** (300 ms), **Sostenido** (80%), **Liberación** (200 ms): cómo empieza una nota, cómo se asienta y cómo termina. |
| Envolvente 2 (Modulación) | Los mismos cuatro, para barridos de filtro y las rutas de modulación. |
| LFO 1 y 2 | **Forma:** senoidal, triangular, sierra, cuadrada, pasos aleatorios. **Sincronía:** libre (con **Velocidad** de 0.05 a 20 Hz) o ligada al tempo (de 1 compás a 1/16, tresillos). Movimiento lento y regular para vibrato, wobble y barridos. |
| Modulación | Hasta 8 rutas desde una **fuente** (LFO 1, LFO 2, Envolvente 2, Velocidad, Nota) hasta un **destino** (tono, el tono o el nivel de un oscilador, ruido, cantidad de FM, corte, resonancia, volumen, panorama) con una **Cantidad** de ±100%. Con la cantidad al máximo, el tono se mueve una octava y el corte cuatro octavas. |

<a id="surge-xt-and-plugins"></a>
### Surge XT y plug-ins

Toca plug-ins de instrumento VST3 instalados en este equipo, como Surge XT (instálalo gratis desde [Modelos y motores](#models-and-engines)).

- **Instrumento:** qué plug-in. Desactívalo para elegir otro.
- **Abrir la interfaz completa de <name>:** la propia ventana del plug-in, en el escritorio. Al cerrarla se conserva el sonido.
- **Reproducir** repite en bucle una frase corta de demostración; **Detener** la termina.
- **Sonidos:** una lista con búsqueda (solo Surge XT), con ★ favoritos. Las flechas del teclado recorren los sonidos.
- **Desactivar <name>.**
- **Exportar sonido / Importar sonido.**
- **El piano:** la primera tecla que pulses activa el instrumento.

Para usar un sonido en una canción, márcalo aquí con una estrella y luego elígelo en una pista de instrumento del editor.

<a id="song-geometry-mapper"></a>
## Geometría de la canción

Convierte una canción en una nube 3D en movimiento: cada pequeño fragmento de sonido se convierte en un punto colocado según su carácter (brillo, dispersión, energía, etc.), unido a sus vecinos en el tiempo y en el sonido. Úsalo para ver la estructura de una canción o para crear visuales y video.

Ábrelo desde el botón **Geometría de la canción** del analizador (la canción seleccionada se carga y se analiza automáticamente), o carga un archivo en el propio mapeador.

- **Barra superior:** **About** (cómo funciona), **Song Info**, **Waveform** (haz clic para buscar una posición), **Math HUD** (las mediciones que hay detrás de la imagen), y RMS, centroide y dispersión en directo. **H** oculta las superposiciones.
- **Moverse:** arrastra para orbitar, usa la rueda para hacer zoom, las flechas para desplazarte, **F** para encuadrarlo todo, **Espacio** para reproducir, **[** y **]** para cambiar la velocidad.
- **Ayuda al pasar el ratón:** mantén el puntero sobre cualquier control medio segundo para ver qué hace.

| Pestaña | Qué contiene |
|---|---|
| Session (S) | **Analysis Model:** Classic (en el navegador), Voice o Deep (en el equipo; necesita la separación de stems con IA; si no está disponible, vuelve a Classic). **Voice Focus:** voz, mezcla completa, batería, bajo u otros. **Load Audio File** (o un JSON de análisis guardado). Reproductor, **Playback Speed** (0.05–2×), **Preserve pitch**. **AI Music Style:** una descripción escrita del estilo de la canción, medida y, opcionalmente, redactada por Ollama. Interruptores de visualización: conexiones, etiquetas, efectos de cine, solo nodos. |
| Mapping (M) | Cómo se colocan los puntos: **Mapping Mode** (Manifold, Time Spine, Hybrid Flow, Helix Orbit), **3D Frequency Spread**, desplazamientos, cómo se unen los puntos (**Edge Mode**, **Neighbor Links**), **Camera Preset** (Static, Drift, Orbit, Pulse, Dive) y **Display Decimation** (menos puntos para ganar velocidad). |
| Visual (V) | Tamaño, opacidad y profundidad de los puntos; estilo de las conexiones (Wave, Straight, Ribbon), intensidad y estelas; capas de tiempo y estructura (niebla, capas fantasma, tubo de tiempo, arcos de sección); movimiento y pulso. |
| Post FX (FX) | **Visual Preset** (Cinematic, Observatory, Neon, Aurora…), resplandor, bloom, niebla, destello de lente, **Color Metric** (lo que muestran los colores) y paleta. Guarda tus propios presets. |

**Exportar** (pestaña Post FX):

- **Export Analysis JSON:** vuelve a cargar el análisis más tarde sin analizar de nuevo.
- **Export 3D OBJ:** la nube visible como modelo 3D.
- **Capture Still:** un PNG; elige **4K Still** para imprimir.
- **Start Video / Stop Video:** una grabación WebM.
- **Copy MP4 Command:** un comando de ffmpeg que convierte esa grabación a MP4.

<a id="models-and-engines"></a>
## Modelos y motores

Motores y modelos de IA opcionales. Todo lo de aquí funciona en este equipo, e instalar algo nunca cambia lo que ya está instalado.

**Este equipo** muestra tu tarjeta gráfica y si los modelos de IA la usarán. Una tarjeta NVIDIA hace la separación y la transcripción mucho más rápidas. Si te dice que actualices el controlador de NVIDIA, hazlo para usar la GPU.

| Paquete | Qué añade | Tamaño |
|---|---|---|
| Separación de stems con IA | Mejores separaciones en 2 y 4 stems, 6 stems (añade guitarra y piano), piezas del kit de batería (bombo, caja, toms, hi-hat, ride, crash), voz principal y coros, detección de pulso con IA. Elige qué modelos descargar; los que no se descarguen se obtienen la primera vez que se necesiten. **Eliminar modelos descargados** libera el espacio. | Unos 3 GB con soporte NVIDIA (1 GB sin él), más los modelos |
| Transcripción de notas con IA | Canción completa a MIDI, piano con un modelo solo para piano (Transkun), acordes en Convertir en notas MIDI (basic-pitch). Funciona mejor si también está instalada la separación de stems. | Unos 120 MB |
| MuScriptor (opcional, manual) | Un transcriptor de la mezcla completa que nombra hasta 35 instrumentos. Solo para uso no comercial. La página enumera los pasos de instalación (un pip install, aceptar sus condiciones en Hugging Face, iniciar sesión). | Depende del tamaño elegido |
| Motor de música (ACE-Step 1.5) | Canciones completas con voz, sin conexión, en el Estudio de canciones IA. Necesita un compilador de C++ y CMake, que el instalador descarga. | Unos 5.3 GB |
| Modelo de edición | Extraer un instrumento, añadir una parte, construir una canción alrededor de una parte. | 2.4 GB |
| Modelo de alta calidad (XL) | Mejores canciones, algo más lento. | 4.9 GB |
| Letrista | Letras y descripciones de estilo con Ollama. Necesita Ollama en marcha. | Unos 8 GB |
| Surge XT | Un sintetizador híbrido gratuito con miles de sonidos de fábrica, para las pistas de instrumento y el Estudio de síntesis. En Windows se queda dentro de la carpeta de Music Suite, donde tus otros programas de música no lo ven, salvo que marques **Hacerlo disponible también en mis otros programas de música (DAW)**. | Unos 300 MB de descarga |

Cuando termine un paquete, recarga las páginas del editor que tengas abiertas para usarlo. **Registro de instalación** muestra lo que hizo el instalador si algo falla.

Desde un terminal: `.venv\Scripts\python -m audioqi.addons install stems` y `python -m audioqi.editor.instruments install surge-xt`. Añade `--for-daws` para poner Surge XT en tu carpeta VST3.

<a id="settings-reference"></a>
## Referencia de ajustes

La mayoría de los ajustes están en la propia aplicación y se explican donde aparecen en este manual:

| Ajustes | Dónde | Consulta |
|---|---|---|
| Masterización | Página del analizador → Masterización con IA | [Análisis y masterización](#analyser-and-mastering) |
| Tempo y tonalidad del proyecto, nivel máster, limitador, fundidos cruzados | Editor → inspector sin nada seleccionado | [Proyecto](#project) |
| Ecualizador, anchura, envíos y efectos de la pista | Editor → inspector con una pista seleccionada | [Pista, efectos y buses](#track-effects-and-buses) |
| Instrumentos | Editor → inspector con un clip de notas seleccionado | [Instrumentos y sonidos](#instruments-and-sounds) |
| Canal MIDI, voz del teclado, notas a la vez, entrada de audio | Editor → Teclado | [Tu teclado físico](#your-hardware-keyboard) |
| Motores de IA, memoria, sonoridad de las canciones nuevas, claves en línea | Estudio de canciones IA → Ajustes | [Estudio de canciones IA](#settings) |
| Modelos opcionales | Modelos y motores | [Modelos y motores](#models-and-engines) |

<a id="advanced-environment-variables"></a>
### Avanzado: variables de entorno

Para lo que la aplicación no ofrece como ajuste, define una variable de entorno de Windows antes de ejecutar start.bat (Propiedades del sistema → Variables de entorno, y luego reinicia Music Suite). No hay archivo de ajustes para esto.

| Variable | Por defecto | Qué cambia |
|---|---|---|
| `AUDIOQI_DATA_DIR` | `data` en la carpeta de Music Suite | Dónde se guardan todas las sesiones, canciones y modelos. |
| `MUSIC_SUITE_MAX_UPLOAD_BYTES` | 524288000 (500 MB) | El archivo más grande que puedes subir o generar. |
| `MUSIC_SUITE_MAX_AUDIO_DURATION_SECONDS` | 900 (15 minutos) | La canción más larga que puedes cargar. |
| `AUDIOQI_SAMPLE_RATE` | 48000 | La frecuencia de muestreo a la que se analizan las canciones. |
| `AUDIOQI_JOB_WORKERS` | 2 | Cuántos análisis se ejecutan a la vez. |
| `AUDIOQI_ANALYSIS_STALL_TIMEOUT_SECONDS` | 600 | Cuánto tiempo puede pasar un análisis sin avanzar antes de detenerse. |
| `AUDIOQI_REPORT_MAX_SECONDS` | 300 | Límite de tiempo para crear el informe; 0 es sin límite. |
| `AUDIOQI_FFMPEG_TIMEOUT_SECONDS` | 900 | Límite de tiempo para las conversiones y para la generación en línea, con ComfyUI y con Lyria. |
| `AUDIOQI_SKIP_PDF_EXPORT` | desactivado | Ponlo a 1 para omitir el informe PDF. |
| `MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS` | 300 | Cuánto espera start.bat a que Music Suite arranque. |
| `MUSIC_SUITE_ELEVENLABS_API_KEY`, `MUSIC_SUITE_FAL_KEY`, `MUSIC_SUITE_GEMINI_API_KEY` | | Claves de servicios en línea, en lugar de guardarlas en la aplicación. |
| `MUSIC_SUITE_COMFYUI_URL` | http://127.0.0.1:8188 | Dónde está ComfyUI, para MusicGen. |
| `MUSIC_SUITE_ACESTEP_DIR`, `MUSIC_SUITE_ACESTEP_URL` | | La carpeta del motor local; la dirección de tu propio servidor de ACE-Step. |
| `MUSIC_SUITE_YUE2_PYTHON`, `MUSIC_SUITE_YUE2_DEVICE` | , cuda | La instalación de YuE2. |
| `MUSIC_SUITE_MUSCRIPTOR_SIZE` | | small, medium o large. |

<a id="troubleshooting"></a>
## Solución de problemas

<a id="the-keyboard"></a>
### El teclado

| Problema | Qué hacer |
|---|---|
| "No se encontró ningún teclado por MIDI" | Comprueba el cable USB y que el teclado esté encendido. Usa Chrome o Edge, y permite el MIDI cuando se te pida. |
| No se oyen las notas de prueba | Comprueba el **Canal** (4 para un GO:KEYS 3) y el volumen del teclado. |
| Una toma vuelve en silencio, o el teclado deja de responder a mitad de una sesión | La conexión de Windows con el MIDI del teclado se ha quedado colgada. Desconecta el cable USB del teclado, espera cinco segundos y vuelve a conectarlo (o apaga y enciende el teclado), y luego pulsa de nuevo **Comprobar el teclado**. Si sigue sin responder, reinicia el equipo. |
| Una toma suena distorsionada | El asistente la vuelve a grabar más baja por sí solo (hasta tres intentos). Si sigue diciéndolo, el mando de volumen del propio teclado está muy alto: bájalo a la mitad, más o menos, y graba de nuevo. |
| La toma llega tarde o adelantada | Pulsa de nuevo **Medir el retardo**, sin que suene nada más. |
| El teclado toca un sonido equivocado | Elige la voz en la aplicación y no en el teclado, y pulsa **Escuchar** antes de grabar. |

<a id="notes"></a>
### Notas

| Problema | Qué hacer |
|---|---|
| Notas raras que no vienen a cuento | Dile al asistente qué es la grabación (*Solo un piano*, *Una voz*…). Instala la separación de stems con IA y la transcripción de notas con IA. Comprueba el resultado de oído y corrígelo en el piano roll. |
| Las notas son demasiado cortas | Conservan la duración que tienen en la grabación. Para voces cantadas, elige **Duración de las notas: Mantenida hasta la siguiente** en el asistente. |
| Un piano vuelve repartido en varias pistas | Elige *Solo un piano*, o usa 4 stems en lugar de 6. |
| Una parte de batería inventada | Corregido: una canción sin batería ya no recibe una. Elimina la pista si una sesión antigua la tiene. |

<a id="the-editor"></a>
### El editor

| Problema | Qué hacer |
|---|---|
| "Error al guardar: se reintentará en la próxima edición" | El servicio en segundo plano de Music Suite no responde. Haz cualquier pequeña edición para reintentarlo; si sigue fallando, reinicia con stop.bat y start.bat. Tu último estado guardado está a salvo. |
| Una herramienta dice que falta un motor | Instálalo desde [Modelos y motores](#models-and-engines) y luego recarga la página del editor. |
| La tecla Delete eliminó un clip entero | Deshacer (Ctrl+Z). En el piano roll, elimina las notas con el clic derecho o con el botón **Eliminar**. |
| Se rechaza la grabación | Permite el micrófono para la página en la barra de direcciones del navegador. |
| A una exportación le falta un plug-in del navegador | Algunos plug-ins de la comunidad no pueden funcionar durante la exportación; el aviso los nombra. |

<a id="analysis-and-mastering"></a>
### Análisis y masterización

| Problema | Qué hacer |
|---|---|
| El análisis se queda en el mismo porcentaje | Los espectrogramas largos pueden tardar un rato. Tras diez minutos sin avanzar se detiene solo; si un análisis sigue pareciendo atascado, usa **Reinicio forzado**. |
| No hay informe PDF | El PDF necesita WeasyPrint; el informe HTML tiene el mismo contenido. |
| Elegir un preset no cambió la sonoridad | Las casillas LUFS objetivo y Pico real mandan. Vacíalas, o usa Aplicar ajustes sugeridos o un Perfil de normalización. |
| «Motor seleccionado: internal» cuando elegiste otro | Ese motor no está instalado; la masterización usó la cadena integrada en su lugar. |
| Un error muestra texto en bruto como `{"detail": …}` | El mensaje dentro de "detail" es el motivo. |

<a id="generating-songs"></a>
### Generar canciones

| Problema | Qué hacer |
|---|---|
| "Aún no está instalado" | Ajustes → **Instalar motor local**. |
| "Solo está libre el N% de la memoria…" | Cierra otras aplicaciones o pestañas del navegador, o baja **No empezar por debajo de** en Ajustes. |
| "Necesita el modelo de edición" | Ajustes → **Descargar modelo de edición**. |
| ElevenLabs rechaza la clave o no tiene crédito | Comprueba la clave y tu cuenta de ElevenLabs. |
| "El motor de IA se detuvo al arrancar" | Consulta `data\generation\engine.log`. |

<a id="starting-music-suite"></a>
### Iniciar Music Suite

| Problema | Qué hacer |
|---|---|
| "did not open port N within S seconds" | El equipo tarda en arrancarlo: ejecuta `.\start.ps1 -StartupTimeoutSeconds 600`. |
| "No se pudo conectar con la API de Music Suite" | El servicio en segundo plano de Music Suite se ha detenido: ejecuta stop.bat y luego start.bat. |
| Otra cosa | Mira en la carpeta `logs`: `api.error.log` y `web.error.log` suelen decir por qué. |

<a id="glossary"></a>
## Glosario

| Término | Significado |
|---|---|
| **Bus (bus)** | Una pista compartida a la que envían varias pistas, para una reverb o un delay comunes, o para agruparlas. |
| **Clip (clip)** | Un fragmento de audio o de notas en la línea de tiempo. |
| **Crest factor (factor de cresta)** | La distancia entre los picos de una canción y su nivel medio. Más cresta suena con más pegada y más abierto. |
| **dBFS / dBTP** | Nivel relativo a la escala completa; el pico real (true peak, dBTP) incluye los picos que se producen entre muestras. |
| **LRA** | Rango de sonoridad: cuánto cambia la sonoridad a lo largo de una canción. |
| **LUFS** | La sonoridad tal como la oyen las personas. Los servicios de streaming reproducen las canciones a unos −14 LUFS. |
| **MIDI** | Notas como instrucciones (qué tecla, cuándo, con qué fuerza) en lugar de sonido. |
| **Mono compatibility (compatibilidad mono)** | Si una canción sigue sonando bien cuando se mezclan izquierda y derecha (teléfonos, equipos de club). |
| **Normalise (normalizar)** | Subir o bajar el conjunto hasta un nivel objetivo. |
| **Run (análisis)** | Una canción subida al analizador, y todo lo que se haga a partir de ella. |
| **Session / project (sesión / proyecto)** | Un trabajo en el Editor de estudio. |
| **Stem (stem)** | Un instrumento separado de una mezcla: voz, batería, bajo, otros… |
| **Take (toma)** | Un intento grabado. |
| **Velocity (velocidad)** | Con qué fuerza se toca una nota. |
| **Voice (voz del teclado)** | Un sonido de un teclado físico: un piano, un coro, una voz Minion. |

