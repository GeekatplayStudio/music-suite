# Tu primera canción en Music Suite, paso a paso

*[English](FIRST_PROJECT.md) · **Español** · [Deutsch](FIRST_PROJECT.de.md) · [Français](FIRST_PROJECT.fr.md) · [Русский](FIRST_PROJECT.ru.md) · [Українська](FIRST_PROJECT.uk.md)*

De una melodía que tocas en un teclado (o tarareas, o subes) a una canción terminada y limpia
con tu propia letra. Cada paso dice qué botón pulsar. La primera vez tarda unos 20–30 minutos,
la mayor parte en instalar y esperar al modelo.

No necesitas saber teoría musical. Necesitas:

- Music Suite instalado y en marcha (consulta la [guía de instalación en Windows](WINDOWS_INSTALL_GUIDE.md);
  en macOS haz doble clic en `install.command` y luego en `start.command`).
- Chrome o Edge (pueden comunicarse con teclados MIDI; Safari no).
- Opcional: un teclado MIDI USB. Sin él, el piano en pantalla funciona igual.
- Opcional, pero recomendable: una tarjeta gráfica NVIDIA. Todo funciona también en el procesador,
  solo que más despacio (medido en un equipo: una canción de 30 segundos tardó 49 s en el procesador y
  7.8 s en una RTX 3090).

> **Dos caminos.** Si solo quieres una canción a partir de una descripción, salta a
> [Atajo: una canción a partir de una idea](#shortcut-a-song-from-an-idea). El camino completo de abajo sirve para
> convertir *tu propia* melodía en una canción.

---

## 1. Instala el motor de música (solo la primera vez)

1. Abre **Estudio de canciones IA** (botón de la página principal).
2. Si una tarjeta dice **Un paso antes de tu primera canción**, pulsa **Instalar motor local**. Se
   descargan unos 5.3 GB y se compila el motor; tarda varios minutos.
3. Abre **Modelos y motores** (botón en la cabecera de cada área de trabajo) y mira la fila **Motor de música**.
   Dice en qué funciona el motor, por ejemplo *Se ejecuta en la tarjeta gráfica (Vulkan)*. Si dice
   el procesador y tu equipo tiene tarjeta gráfica, sigue la indicación de esa fila.
4. Para **Construir una canción completa a su alrededor** en el paso 5 también necesitas el **Modelo de edición** (2.4 GB):
   pulsa **Instalar** en su fila.

## 2. Crea una sesión y una pista de instrumento

1. Abre **Editor de estudio**, escribe un nombre como *Mi primera canción* y pulsa **Nueva sesión**.
2. Conecta tu teclado MIDI. Pulsa el **icono del teclado** en la cabecera del editor, luego
   **Conectar**, y permite el MIDI cuando el navegador lo pida. (¿No tienes teclado? Pulsa el **icono del piano** en
   la cabecera para abrir el piano en pantalla; toca y graba igual.)
3. En ese mismo panel pulsa **Añadir una pista de instrumento**. Obtienes una pista con un clip de notas
   vacío de cuatro compases, listo para tocar en él. Selecciónala (haz clic en su cabecera).

## 3. Graba tu melodía

1. Pon el tempo que quieras en el panel del proyecto de la derecha (**Tempo**, por ejemplo 100 BPM).
2. Pulsa **Grabar** (el botón del micrófono). Con una pista de instrumento seleccionada y un teclado
   conectado (o el piano en pantalla abierto), graba **notas**, no audio; su descripción emergente dice
   cuál.
3. Toca tu melodía. Pulsa **Grabar** otra vez (o Espacio) para detener. Aparece un clip llamado
   *Played HH:MM:SS*.
4. Corrige las notas equivocadas: selecciona el clip y el **piano roll** se abre bajo la línea de tiempo (P lo muestra u
   oculta). Arrastra una nota para moverla, arrastra su borde derecho para cambiar su duración, haz clic derecho en una
   nota para eliminarla. **Mostrar como partitura** la muestra como música escrita, si lo prefieres.
5. Escúchala con Espacio. ¿Te gusta? Sigue adelante.

> ¿Prefieres cantar o tararear? Pulsa entonces el botón del **micrófono** para grabar audio y luego usa
> **Convertir audio en notas** (Ayuda ▸ Convertir audio en notas) para pasarlo a notas, o
> envía la grabación directamente al paso 4.

## 4. Envía la melodía al Estudio de canciones IA

1. **Exportar ▸ Empezar una canción con IA a partir de la mezcla →**. El Estudio de canciones IA se abre con tu melodía en
   el panel **Partiendo de**. Ha medido el tempo, la tonalidad y la duración, y los ha rellenado.
2. En **Qué hacer con ella**, elige:
   - **Cambiar de estilo**: tu melodía se convierte en una canción completa en el estilo que describas, **con tu
     letra**. Usa esta opción para una canción cantada.
   - **Construir una canción completa a su alrededor**: un arreglo alrededor de tu melodía (sin letra; necesita el
     modelo de edición).
   - **Canción nueva en su estilo**: una canción nueva con el mismo tempo, tonalidad y carácter (se admite tu
     letra, pero tu melodía no se conserva).

## 5. Añade la letra y un estilo, y genera

1. **Descripción del estilo** (obligatoria): género, ambiente, instrumentos y voz con palabras sencillas, por
   ejemplo *warm pop ballad, female vocal, piano and strings, slow build*.
2. **Letra**: escríbela, usando **+ Estrofa** y **+ Estribillo** para añadir etiquetas de sección. O describe la
   canción en **Empezar desde una idea** y pulsa **Escribir estilo y letra** (para letras más completas hace falta
   Ollama, que se ofrece en Ajustes).
3. Para **Cambiar de estilo**: **Cuánto conservar del original**. Más alto se queda más cerca de tu melodía;
   más bajo sigue el nuevo estilo con más libertad. Empieza por la mitad, más o menos. **Mantenerse cerca del
   original (remix)** conserva la melodía y el tiempo y cambia sobre todo la producción.
4. **Versiones a crear**: 2 es un buen comienzo, para que puedas elegir la mejor.
5. Pulsa el botón **Generar** (su texto nombra la opción, por ejemplo *Cambiar el estilo de …*).
   La barra muestra cada etapa y una estimación de tiempo.

El modelo sigue tu melodía, pero no nota por nota: es un punto de partida, no una copia. Si
un resultado se aleja demasiado, conserva más del original y genera de nuevo, o pulsa **Conservar esta
semilla para la próxima versión** en un resultado que te guste y cambia solo la letra o el estilo.

<a id="6-open-the-result-in-the-editor"></a>
## 6. Abre el resultado en el editor

Cada versión tiene un reproductor. Pulsa **Abrir en el Editor de estudio** (o **Añadir a una sesión**). Las
versiones caen en sus propias pistas junto a tu melodía; las versiones extra empiezan silenciadas para que puedas
compararlas con los botones M y S.

Opcional: **Separar en stems** en un resultado te da la voz, la batería, el bajo y el resto en pistas
separadas, para que puedas cambiar una parte (por ejemplo, sustituir la batería o tocar una parte con
tu teclado mediante el **Asistente**).

## 7. Limpia el sonido

Las canciones generadas a veces traen siseo o un leve ruido de fondo. En el editor, selecciona el
clip y usa el inspector:

1. **Reparar ▸ Reducir ruido.** Para el resultado más limpio, usa antes la **Herramienta de rango (R)** para
   resaltar un pasaje corto que sea *solo* ruido (de al menos 0.1 s), para que se use como huella
   de ruido. Empieza con una intensidad del 40–60%; más alta puede sonar acuosa.
2. **Restaurar**: **DeClick** para los clics, **DeHum** para el zumbido de la red eléctrica, **DeReverb** para el exceso de sala.
3. Una sola tos o un clic: abre la **vista espectral (W)** y dibuja un recuadro a su alrededor.

Todos los pasos se pueden deshacer (Ctrl+Z), y el clip original se conserva.

## 8. Termina y exporta

1. Equilibra las pistas con sus faders **Vol**; silencia lo que no quieras.
2. Para una sonoridad pulida y lista para streaming: **Exportar ▸ Enviar la mezcla al analizador y
   masterización →** y luego usa **Masterización con IA** en la página del analizador.
3. O exporta directamente: **Exportar ▸ Mezcla final · MP3 320 kbps** (o WAV para la mejor calidad).
   **Canción con las pistas elegidas…** te deja marcar exactamente qué pistas entran.
4. **Exportar ▸ Proyecto completo** guarda todo en un solo archivo para volver a abrirlo más tarde.

---

<a id="shortcut-a-song-from-an-idea"></a>
## Atajo: una canción a partir de una idea

1. **Estudio de canciones IA ▸ Crear**.
2. En **Empezar desde una idea**, describe la canción en una o dos frases, por ejemplo
   *a late-night drive along the coast, hopeful, dreamy synth-pop, female voice*, y pulsa
   **Escribir estilo y letra**.
3. Edita lo que quieras y pulsa **Generar**.
4. Continúa desde el [paso 6](#6-open-the-result-in-the-editor).

## Adónde ir después

- **Ayuda** (en la aplicación) es el manual completo, con búsqueda.
- **Asistente de teclado** (la varita del editor): toca las partes de una canción en un teclado
  físico con sus propias voces y grábalas de vuelta, o añade una voz para cantar.
- **Estudio de síntesis**: diseña tus propios sonidos, o abre la interfaz completa de Surge XT.
