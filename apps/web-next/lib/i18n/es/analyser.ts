import type { Dictionary } from "../index";

/** The analyser (app/page.tsx). */
export const analyser: Dictionary["analyser"] = {
  na: "N/D",
  yes: "sí",
  no: "no",
  idle: "Inactivo",
  status: {
    idle: "inactivo",
    uploaded: "subido",
    queued: "en cola",
    running: "en curso",
    completed: "completado",
    failed: "fallido",
    cancelled: "cancelado"
  },
  severity: {
    critical: "crítica",
    high: "alta",
    medium: "media",
    low: "baja",
    info: "info",
    warning: "aviso",
    error: "error"
  },
  chartTitles: {
    waveform: "Forma de onda + envolvente",
    loudness: "Sonoridad en el tiempo",
    spectrum: "Espectro medio",
    stereo: "Correlación estéreo + M/S",
    correlation_meter: "Medidor de correlación",
    ms_view: "Vista Mid/Side",
    vectorscope: "Vectorscopio / goniómetro",
    spectrogram_stft_linear: "Espectrograma STFT (lineal)",
    spectrogram_stft_log: "Espectrograma STFT (log.)",
    spectrogram_mel: "Espectrograma Mel",
    spectrogram_cqt: "Espectrograma CQT"
  },
  chartHelp: {
    waveform:
      "Muestra la amplitud en el tiempo con envolventes de pico y RMS. Úsalo para detectar transitorios, limitación densa y la forma de la envolvente.",
    loudness:
      "LUFS momentáneos y de corto plazo en el tiempo. Busca regularidad y caídas o picos frente a tu nivel de entrega objetivo.",
    spectrum:
      "Balance de frecuencias medio. Útil para revisar la inclinación tonal y detectar exceso de subgraves, aspereza o falta de aire.",
    stereo: "Correlación y relación Mid/Side juntas. Una correlación negativa avisa de problemas de compatibilidad con mono.",
    correlation_meter:
      "Correlación de -1 a +1. Los valores cercanos a +1 son compatibles con mono; por debajo de 0 pueden anularse en mono.",
    ms_view: "Tendencias de la relación Mid/Side y del balance L-R. Ayuda a detectar desequilibrios de amplitud o pasajes con exceso de Side.",
    vectorscope:
      "Dispersión de la imagen estéreo, izquierdo frente a derecho. Una tendencia vertical es casi mono; una nube ancha indica una apertura estéreo mayor.",
    spectrogram_stft_linear:
      "Energía en tiempo y frecuencia con eje de frecuencia lineal. Bueno para una inspección técnica detallada de todo el espectro.",
    spectrogram_stft_log: "STFT en escala de frecuencia logarítmica. Más fácil de leer musicalmente, sobre todo la estructura de graves.",
    spectrogram_mel: "Espectrograma con ponderación perceptiva, alineado con la forma en que el oído agrupa las bandas de frecuencia.",
    spectrogram_cqt: "Espectrograma Constant-Q con espaciado musical por octavas, útil para la estructura de tonos y armónicos."
  },
  chartHelpMissing: "No hay descripción disponible para interpretar el gráfico.",
  groups: {
    all: { label: "Todas las vistas", description: "Superficie de análisis completa para una revisión técnica." },
    mix: { label: "Revisión de mezcla", description: "Forma de onda, sonoridad, balance tonal y marcadores de problemas." },
    stereo: { label: "Enfoque estéreo", description: "Amplitud, compatibilidad con mono y balance espacial." },
    spectral: { label: "Espectral", description: "Inspección detallada en tiempo y frecuencia con vistas STFT, mel y CQT." }
  },
  guide: {
    title: "Guía: qué significa cada cosa",
    intro: "Este glosario explica cada métrica y gráfico de esta vista para que interpretes los resultados rápidamente.",
    element: "Elemento",
    whatItTells: "Qué te dice",
    graph: "Gráfico",
    howToRead: "Cómo leerlo",
    rows: {
      compressionLoss: {
        element: "Estimación de pérdida por compresión",
        meaning:
          "Cuánto por debajo del límite audible (20 kHz, o Nyquist en frecuencias de muestreo bajas) termina el contenido medido. 0 Hz significa que no falta nada audible; un valor grande en un archivo sin pérdida sugiere que se transcodificó desde una fuente con pérdida."
      },
      peakToNoise: {
        element: "Detalle de rango | Pico a ruido",
        meaning:
          "Diferencia entre el nivel de pico y el ruido de fondo medido. Los valores mayores suelen indicar un margen dinámico más limpio. N/D cuando la pista no tiene huecos silenciosos donde medir el ruido de fondo."
      },
      peakToLufs: {
        element: "Detalle de rango | Pico a LUFS",
        meaning: "Diferencia entre el pico real y la sonoridad integrada. Útil como contexto de headroom y contraste de transitorios."
      },
      compressionAssessment: {
        element: "Evaluación de compresión",
        meaning:
          "Resumen heurístico a partir de los metadatos del códec/contenedor y del comportamiento espectral. Es informativo, no un detector forense de códecs."
      },
      metadataTags: {
        element: "Etiquetas de metadatos",
        meaning:
          "Etiquetas incrustadas como artista/título/álbum. 'No se detectaron etiquetas incrustadas' significa que faltan o no se pueden leer en este archivo."
      },
      rawMetadata: {
        element: "Mostrar JSON de metadatos sin procesar",
        meaning: "Datos de metadatos sin filtrar de ffprobe y mutagen para inspección técnica."
      },
      integratedLufs: {
        element: "LUFS integrados",
        meaning: "Sonoridad percibida global de toda la pista, medida con un modelo de sonoridad tipo BS.1770."
      },
      truePeak: {
        element: "Pico real dBFS",
        meaning: "Estimación de pico con sobremuestreo que incluye posibles picos entre muestras que pueden saturar al reproducir o codificar."
      },
      crestFactor: {
        element: "Factor de cresta dB",
        meaning: "Contraste entre pico y RMS. Un factor de cresta más alto suele significar más pegada en los transitorios y menos limitación constante."
      },
      noiseFloor: {
        element: "Ruido de fondo dBFS",
        meaning:
          "Nivel del ruido que se oye donde la música se detiene (fundidos, huecos, intros suaves). Cuanto más negativo, más limpio. Las pistas densas sin esos pasajes muestran N/D, porque la música enmascara el ruido de fondo."
      },
      markersAround: {
        element: "Marcadores cerca de la posición actual",
        meaning: "Avisos activos cerca del cursor de reproducción. 'No hay filas' significa que no hay avisos activos en ese punto."
      },
      stageTicker: {
        element: "Control de sesión | Indicador de etapa",
        meaning:
          "Detalle del progreso en vivo de la etapa de análisis actual (decodificación, escaneo, espectrogramas, generación del informe). Útil cuando el porcentaje parece detenido."
      },
      hardReset: {
        element: "Control de sesión | Reinicio forzado",
        meaning: "Borra el historial de análisis y reinicia las tareas en cola o en curso para recuperarse de bucles de análisis bloqueados."
      },
      masteringBackend: {
        element: "Masterización con IA | Motor",
        meaning:
          "Ruta de ejecución de la masterización. 'auto' elige el mejor motor disponible al ejecutar; los motores no disponibles recurren a una alternativa segura."
      },
      masteringReference: {
        element: "Masterización con IA | Canción de referencia",
        meaning:
          "ID de un análisis previo opcional usado como referencia tonal y de sonoridad (sobre todo para masterización por referencia tipo matchering)."
      },
      refinePasses: {
        element: "Masterización con IA | Pasadas de refinado",
        meaning:
          "Máximo de pasadas correctivas que tienen en cuenta los marcadores. Más pasadas pueden mejorar problemas persistentes, pero están limitadas para evitar bucles."
      },
      adaptation: {
        element: "Masterización con IA | Adaptación a la fuente",
        meaning:
          "Antes de renderizar los resultados, AudioQI puede ajustar el de-esser, el balance graves/agudos, la compresión, la saturación del limitador y el margen de pico según los problemas detectados en la fuente. Los objetivos de sonoridad manuales se mantienen, salvo que haga falta más seguridad de pico."
      },
      selfCheckAssessment: {
        element: "Autocomprobación posmáster | Evaluación",
        meaning:
          "Etiqueta del resultado global: mejora clara, mejora parcial, sin cambios o regresión (se aplica protección con reversión)."
      },
      selfCheckScore: {
        element: "Autocomprobación posmáster | Puntuación de problemas",
        meaning: "Recuento ponderado de clases de problemas activas antes y después de masterizar. Una puntuación posterior más baja indica mejora."
      },
      selfCheckLists: {
        element: "Autocomprobación posmáster | Pendientes/Resueltos/Empeorados",
        meaning:
          "Clases de problemas que siguen presentes, que desaparecieron o que aumentaron tras masterizar. Los problemas graves pendientes suelen requerir arreglos en la mezcla o los stems."
      },
      selfCheckMatch: {
        element: "Autocomprobación posmáster | Coincidencia con la recomendación IA",
        meaning: "Compara el modo/preset/objetivos aplicados con las recomendaciones del analizador. Coincidir no garantiza que se resuelvan los problemas."
      },
      refinementDiagnostics: {
        element: "Diagnóstico del refinado",
        meaning: "Muestra las pasadas aceptadas, las reversiones, la puntuación final de problemas y si se usó la alternativa por stems."
      },
      proModules: {
        element: "Módulos pro",
        meaning: "Disponibilidad en tiempo de ejecución de integraciones opcionales (ffmpeg, pedalboard, matchering, pyebur128)."
      },
      naValues: {
        element: "Valores N/D",
        meaning:
          "Se muestran cuando la señal o los metadatos no bastan para una métrica (p. ej., no hay un ruido de fondo estable o faltan metadatos del códec)."
      }
    }
  },
  norm: {
    off: { label: "Desactivado (preset/manual)", help: "Usa los valores del preset o valores manuales de LUFS/TP." },
    youtube: { label: "YouTube", help: "Objetivo de normalización habitual de YouTube." },
    spotify: { label: "Spotify", help: "Alineación típica con la normalización de Spotify." },
    apple_music: { label: "Apple Music", help: "Sonoridad conservadora al estilo de Apple Music." },
    instagram: { label: "Instagram", help: "Objetivo equilibrado para redes y móvil." },
    tiktok: { label: "TikTok", help: "Objetivo para plataformas de formato corto." },
    broadcast_ebu: { label: "Emisión EBU", help: "Entrega para emisión EBU R128." },
    podcast_voice: { label: "Voz de pódcast", help: "Normalización de pódcast centrada en la voz." }
  },
  bassMono: {
    presetDefault: "Predeterminado del preset",
    off: "Desactivado"
  },
  readiness: {
    aligned: "Alineado",
    hot: "Alto",
    quiet: "Bajo",
    safe: "Seguro",
    tight: "Justo",
    risk: "Riesgo",
    clean: "Limpio",
    review: "Revisar",
    attention: "Atención",
    open: "Abierto",
    controlled: "Controlado",
    dense: "Denso"
  },
  header: {
    title: "Music Suite de Geekatplay Studio",
    stack:
      "Tecnología del motor: FFmpeg/ffprobe, SoundFile (libsndfile), Mutagen, NumPy, SciPy, Librosa, pyloudnorm, Plotly y aceleración opcional de espectrogramas con CUDA mediante torchaudio + nnAudio.",
    configuration: "Configuración",
    refreshRuns: "Actualizar análisis",
    mapperTitle: "Abrir la canción seleccionada en Geometría de la canción",
    needSong: "Primero selecciona o sube una canción",
    songFromThisTitle:
      "Empezar una nueva canción con IA a partir de la pista seleccionada: su tempo, tonalidad y estilo rellenan el formulario, y puedes cambiarle el estilo, alargarla o añadirle partes",
    newSongTitle: "Escribir y generar una canción nueva con IA en este equipo",
    songFromThis: "Hacer una canción con esto",
    editorAddTitle: "Añadir la canción seleccionada a una sesión del Editor de estudio (nueva o existente), con opción de separarla en stems",
    editorOpenTitle: "Abrir el Editor de estudio multipista",
    synthTitle: "Diseñar y tocar sonidos de sintetizador y explorar la biblioteca de Surge XT",
    modelsTitle: "Instalar motores y modelos de IA opcionales: más stems, el motor de música, el letrista",
    helpTitle: "El manual de usuario: cada área de trabajo y cada ajuste explicados",
    clearHistory: "Borrar historial",
    hardReset: "Reinicio forzado",
    hardResetTitle: "Forzar el reinicio de los procesos de tareas y borrar todos los análisis (incluidos los activos)."
  },
  config: {
    title: "Configuración y actualizaciones",
    product: "Producto",
    createdBy: "Creado por Geekatplay Studio",
    installedVersion: "Versión instalada",
    revision: "Revisión {rev}",
    notAvailable: "no disponible",
    officialSource: "Fuente oficial",
    stableBranch: "Rama estable: main",
    updateAvailable: "Hay una actualización disponible",
    upToDate: "Music Suite está actualizado",
    readyToCheck: "Listo para buscar actualizaciones",
    dirty: "Se detectaron cambios locales. La instalación está bloqueada hasta que se confirmen o se eliminen.",
    officialOnly:
      "Solo comprueba el repositorio oficial de Geekatplay Studio. Las actualizaciones son solo fast-forward y nunca sobrescriben los cambios locales.",
    checking: "Comprobando...",
    check: "Buscar actualizaciones",
    installing: "Instalando...",
    install: "Instalar actualización"
  },
  session: {
    title: "Control de sesión",
    dropHint: "Arrastra y suelta audio aquí o examina",
    browse: "Examinar archivo",
    upload: "Subir",
    analyze: "Analizar",
    visualTitle: "Abrir visuales en tiempo real para la canción subida",
    visual: "Visual AI",
    useGpu: "Usar la ruta opcional de espectrogramas en GPU",
    staleHeartbeat:
      "La señal de la etapa es inusualmente antigua. El trabajo largo de espectrogramas puede tardar, pero la protección de bucles del motor abortará automáticamente un análisis realmente bloqueado.",
    stage: "Etapa: {stage}",
    stageUpdated: "Etapa: {stage} | Actualizada hace {n} s",
    exports: "Exportaciones",
    saveReady: "Guardar archivos listos ({n})"
  },
  convert: {
    title: "Conversión de formato",
    intro: "Convierte la canción seleccionada a otros formatos de entrega con progreso en segundo plano.",
    convertSelected: "Convertir selección",
    files: "Archivos convertidos",
    none: "Aún no se han generado archivos convertidos."
  },
  mastering: {
    title: "Masterización con IA",
    helpLabel: "los ajustes de masterización",
    modesIntro: "V1 = cadena transparente, V2 = variantes del optimizador, V3 = flujo correctivo por stems.",
    preflightIntro:
      "AudioQI aplica ahora una pasada de ajuste previo adaptada a la fuente antes de renderizar variantes o el rescate por stems. Usa Motor, Pasadas de refinado y Canción de referencia para un control de masterización avanzado.",
    suggested: "Sugerido por el análisis",
    noAdvice: "Sin consejos",
    mode: "Modo",
    preset: "Preset",
    targetsLine: "LUFS objetivo {lufs} | Pico real {tp} | Variantes {variants} | Motor {backend} | Refinado {refine}",
    issueScore: " | Puntuación de problemas {n}",
    scorePolicy:
      "Criterio de puntuación: las fuentes densas, con pérdida o sensibles a los picos se quedan en V1; los casos correctivos más limpios pasan a V2; V3 se reserva para intervenciones más fuertes en material recuperable.",
    apply: "Aplicar ajustes sugeridos",
    analyzeFirst: "Analiza primero una pista para obtener el modo, el preset y los objetivos de masterización con IA recomendados.",
    awaiting: "Esperando la recomendación del analizador",
    settings: "Ajustes de masterización",
    normProfile: "Perfil de normalización",
    profileTargets: "Objetivos del perfil",
    profileTargetsValue: "{lufs} LUFS | {tp} dBFS TP",
    presetTargets: "Usando objetivos del preset/manuales",
    backend: "Motor",
    reference: "Canción de referencia (matchering)",
    referenceAria: "Canción de referencia para matchering",
    none: "Ninguna",
    runShort: "Análisis {id}…",
    targetLufs: "LUFS objetivo",
    truePeak: "Pico real dBFS",
    inputGain: "Ganancia de entrada (dB)",
    gainStaging: "Estructura de ganancia",
    unity: "Unidad (nivel de la fuente sin tocar)",
    gainBefore: "{gain} dB antes de la cadena",
    reset: "Restablecer",
    bassMono: "Graves en mono",
    stereoWidth: "Amplitud estéreo",
    widthPlaceholder: "predeterminado del preset (1.0)",
    variants: "Variantes V2",
    refinePasses: "Pasadas de refinado",
    backendNotes:
      "Notas sobre motores: `internal` es la opción predeterminada más segura, `auto` es para la selección avanzada del motor y `matchering` requiere una Canción de referencia válida. La Ganancia de entrada (-12..+12 dB) ajusta la fuente antes del perfilado, la adaptación y cada pasada del motor, así que cambia cómo la cadena escucha la mezcla. Graves en mono colapsa la energía lateral fuera de fase por debajo del corte (el Mid no se toca) y Amplitud estéreo escala el canal Side; si dejas ambos en el valor del preset, el ajuste previo puede estrecharlos cuando saltan los marcadores de compatibilidad con mono. Las Pasadas de refinado están protegidas contra bucles. El perfil de normalización fija los objetivos de cada plataforma; los valores manuales de LUFS/TP prevalecen sobre los del perfil. La adaptación a la fuente puede reducir la aspereza, los subgraves, la densidad o el riesgo de pico real antes de renderizar el máster principal.",
    run: "Masterizar",
    bestOutput: "Mejor resultado: {id}",
    backendSelected: "Motor seleccionado: {backend}",
    outputHash: "SHA256 del resultado: {hash}...",
    refinement: "Refinado: {accepted} / {max} aceptadas",
    finalScore: " | Puntuación final de problemas {n}",
    rollbacks: " | Reversiones {n}",
    stemFallback: " | Se aplicó la alternativa por stems",
    nonRegression: " | Protección contra regresión ({reason})",
    applied: "aplicado",
    proModules: "Módulos pro:",
    adaptationTitle: "Adaptación a la fuente",
    sourceScore: "Puntuación de problemas de la fuente: {n}",
    adjustments: " | Ajustes {n}",
    noChanges: "Esta fuente no necesitó cambios de parámetros en el ajuste previo.",
    selfCheckTitle: "Autocomprobación posmáster",
    assessment: "Evaluación:",
    issueScoreLabel: "Puntuación de problemas:",
    appliedSettings: "Ajustes aplicados: {name} | Objetivo {target} | TP {tp} | Norm. {norm} | Ganancia de entrada {gain}",
    stereoStage: "Etapa estéreo: graves en mono {bass} | amplitud {width}",
    off: "desactivado",
    aiMatch: "Coincidencia con la recomendación IA: modo {mode} | preset {preset} | objetivo {target} | TP {tp}",
    compliance: "Cumplimiento: {result}",
    pass: "correcto",
    reviewRequired: "requiere revisión",
    lufsDelta: " | Diferencia LUFS {n}",
    tpDelta: " | Diferencia TP {n} dB",
    crestDelta: " | Diferencia de cresta {n} dB",
    complianceIssues: "Problemas de cumplimiento: {list}",
    rescue: "Rescate posterior: {state}",
    rescueAttempted: "solo intentado",
    round: " | ronda {n}",
    resolved: "Resueltos: {list}",
    remaining: "Pendientes: {list}",
    worsened: "Empeorados: {list}",
    outputs: "Resultados masterizados",
    noOutputs: "Aún no se han generado resultados de masterización."
  },
  history: {
    title: "Historial de análisis"
  },
  columns: {
    file: "Archivo",
    status: "Estado",
    stage: "Etapa",
    progress: "Progreso",
    updated: "Actualizado",
    type: "Tipo",
    severity: "Gravedad",
    window: "Ventana",
    note: "Nota",
    format: "Formato",
    details: "Detalles",
    size: "Tamaño",
    download: "Descargar",
    output: "Resultado",
    score: "Puntuación",
    truePeak: "Pico real",
    verify: "Verificar"
  },
  playback: {
    title: "Reproducción + línea de tiempo",
    playhead: "Cursor",
    rate: "Reproducción {rate}x",
    loopOn: "Bucle de selección activo",
    loopOff: "Bucle de selección desactivado",
    eqOn: "Monitorización con EQ activada",
    eqOff: "EQ en bypass",
    segment: "Segmento seleccionado (rango de zoom)",
    fullTrack: "Pista completa",
    segmentLine: "Inicio {start} s | Fin {end} s | Duración {length} s",
    leftMarker: "Marcador izquierdo",
    rightMarker: "Marcador derecho",
    markers: "Marcadores (clic para saltar + zoom)",
    noMarkers: "Aún no hay marcadores."
  },
  tiles: {
    activeRun: "Análisis activo",
    noRun: "Ningún análisis seleccionado",
    runId: "ID de análisis {id}",
    copyRunId: "Copiar el ID completo del análisis",
    uploadToCreate: "Sube un archivo para crear un análisis.",
    analysisState: "Estado del análisis",
    complete: "{pct}% completado",
    reviewAssets: "Recursos de revisión",
    chartsLoaded: "{loaded}/{total} gráficos cargados",
    markersLine: "{markers} marcadores detectados | {attention} elementos de atención",
    selectionWindow: "Ventana de selección {length} s",
    strategy: "Estrategia de masterización",
    backendProfile: "Motor {backend} | Perfil {profile}",
    masteredReady: { one: "{n} resultado masterizado listo", other: "{n} resultados masterizados listos" },
    noMastered: "Aún no hay resultados masterizados"
  },
  overview: {
    title: "Panel general",
    pause: "Pausa",
    play: "Reproducir",
    selectionStart: "Inicio de la selección",
    loopSelection: "Repetir selección",
    speed: "Velocidad",
    setStart: "Fijar inicio @ {time} s",
    setEnd: "Fijar fin @ {time} s",
    resetRange: "Restablecer rango",
    readiness: "Preparación para la entrega",
    loudness: "Sonoridad",
    loudnessLine: "{lufs} LUFS frente a {target} objetivo",
    truePeak: "Pico real",
    peakLine: "{tp} dBFS de techo actual",
    markerLoad: "Carga de marcadores",
    markerLine: { one: "{n} marcador de atención alta", other: "{n} marcadores de atención alta" },
    dynamics: "Dinámica",
    dynamicsLine: "Cresta {crest} dB | LRA {lra} LU",
    flatSections: " (secciones planas)",
    manualEq: "EQ manual",
    live: "En vivo",
    bypass: "Bypass",
    eqExportNote: "La exportación con EQ renderiza un WAV de la pista completa en el navegador, así el proceso del motor no cambia.",
    guidanceTitle: "Guía de revisión",
    guidance1: "Usa la tira de revisión para recorrer rápidamente el archivo antes de abrir los gráficos completos del análisis.",
    guidance2:
      "Deja el grupo de gráficos en Revisión de mezcla para el primer diagnóstico y luego cambia a Espectral para buscar la causa.",
    guidance3:
      "Si la preparación para la entrega no está alineada, aplica el perfil de masterización sugerido antes de una nueva pasada de masterización.",
    guidance4:
      "Usa el EQ opcional para escuchar de forma manual y exporta la pista completa procesada como WAV cuando quieras conservar esa curva."
  },
  file: {
    title: "Información del archivo",
    titleHelp:
      "Detalles principales de grabación y codificación, contenido de frecuencias estimado, implicaciones de la compresión y contexto del rango dinámico.",
    formatHelp: "El formato del contenedor y el códec indican cómo se guardó y codificó el audio.",
    formatCodec: "Formato / códec",
    compression: "Compresión:",
    freqHelp: "La frecuencia de muestreo define el límite de Nyquist; la referencia práctica del oído va de unos 20 Hz a 20 kHz.",
    freqRange: "Rango de frecuencias",
    estimatedContent: "Contenido estimado:",
    dynHelp: "El rango dinámico combina el factor de cresta, el rango de sonoridad y el margen de pico a ruido.",
    dynSnapshot: "Resumen del rango dinámico",
    crest: "Cresta {n} dB",
    lra: "LRA {n} LU (aprox. con compuerta)",
    signalHelp: "La tasa de bits y la profundidad de bits influyen en la calidad potencial y el headroom.",
    signal: "Propiedades de la señal",
    channels: "{rate} Hz, {ch} canales",
    kbps: "{n} kbps",
    bitrateNa: "Tasa de bits N/D",
    bitDepth: "{n} bits",
    bitDepthFloat: "{n} bits float",
    bitDepthNa: "Profundidad de bits N/D",
    lossHelp: "La pérdida estimada de agudos se deduce del contenido medido en la banda superior frente al límite de Nyquist.",
    lossEstimate: "Estimación de pérdida por compresión",
    lossOfBand: "{pct}% de la banda {band}",
    audible: "audible",
    rangeHelp: "La relación pico-sonoridad y el margen de pico a ruido ayudan a evaluar la pegada y el headroom dinámico útil.",
    rangeDetail: "Detalle de rango",
    peakToNoise: "Pico a ruido: {value}",
    peakToLufs: "Pico a LUFS: {value}",
    compressionAssessment: "Evaluación de compresión",
    noAssessment: "No hay evaluación disponible.",
    whyNa: "Por qué algunos valores son N/D",
    metadataTags: "Etiquetas de metadatos",
    hiddenTags: { one: "{n} etiqueta voluminosa o de sistema oculta", other: "{n} etiquetas voluminosas o de sistema ocultas" },
    noTags: "No se detectaron etiquetas incrustadas.",
    rawJson: "Mostrar JSON de metadatos sin procesar"
  },
  hints: {
    lossUnavailable:
      "La estimación de pérdida por compresión no está disponible porque faltan los metadatos del códec o la estimación espectral, o este análisis es anterior al analizador actual (vuelve a analizar para actualizarlo).",
    noiseStale:
      "El pico a ruido y el ruido de fondo están ocultos porque este análisis es anterior al estimador de ruido de fondo actual; vuelve a analizar para medirlos.",
    noiseDigital:
      "El pico a ruido no está disponible porque los huecos son silencio digital, así que no hay ruido de fondo que medir.",
    noiseMasked:
      "El pico a ruido no está disponible porque la pista no tiene huecos silenciosos (fundidos, intros, pausas) donde leer el ruido de fondo; la música lo enmascara.",
    peakLufs: "El pico a LUFS no está disponible cuando la sonoridad integrada no está definida (material muy corto o en silencio).",
    noTags: "No se detectaron etiquetas de metadatos incrustadas en este archivo.",
    hiddenOnly: {
      one: "No se encontraron etiquetas descriptivas incrustadas. Hay {n} etiqueta voluminosa o de sistema oculta; abre el JSON de metadatos sin procesar para revisarla.",
      other: "No se encontraron etiquetas descriptivas incrustadas. Hay {n} etiquetas voluminosas o de sistema ocultas; abre el JSON de metadatos sin procesar para revisarlas."
    }
  },
  kpi: {
    integratedHelp: "LUFS integrados: sonoridad percibida global de toda la pista.",
    integrated: "LUFS integrados",
    truePeakHelp: "Pico real dBFS: estimación de pico con sobremuestreo, incluidos los picos entre muestras.",
    truePeak: "Pico real dBFS",
    crestHelp: "Factor de cresta: pegada de los transitorios / contraste de pico frente al nivel RMS.",
    crest: "Factor de cresta dB",
    noiseHelp:
      "Ruido de fondo leído en fundidos, huecos e intros suaves. Las pistas densas sin esos pasajes no tienen un ruido de fondo medible.",
    noise: "Ruido de fondo dBFS",
    reanalyze: "Vuelve a analizar para medir",
    digitalSilence: "Los huecos son silencio digital",
    masked: "Sin huecos silenciosos; la música lo enmascara"
  },
  recs: {
    title: "Recomendaciones de remasterización",
    none: "Aún no hay recomendaciones de remasterización."
  },
  markers: {
    title: "Marcadores cerca del cursor / la selección",
    hint: "Haz clic en una fila de marcador para saltar y fijar la selección. La tabla no tiene duplicados y se ordena por cercanía al cursor."
  },
  chartStudio: {
    title: "Estudio de gráficos",
    viewFocus: "Enfoque de la vista",
    showing: { one: "Mostrando {n} panel.", other: "Mostrando {n} paneles." },
    loadedOf: "Cargados {loaded} de {total} gráficos esperados.",
    quickJump: "Salto rápido",
    timelineTip: "Consejo: haz clic derecho y arrastra en el área del gráfico para desplazar la ventana de tiempo seleccionada."
  },
  saveDialog: {
    title: "Resultados listos para guardar",
    intro: "Elige dónde guardar cada archivo convertido o masterizado.",
    later: "Más tarde",
    conversion: "Conversión",
    mastering: "Masterización",
    saving: "Guardando...",
    saveAs: "Guardar como...",
    quickDownload: "Descarga rápida",
    dismiss: "Cerrar"
  },
  footer: {
    rights: "© {year} Geekatplay Studio. Todos los derechos reservados.",
    version: "Music Suite • Creado por Geekatplay Studio • Versión 1.0.0"
  },
  msg: {
    pickFile: "Elige un archivo de audio para empezar.",
    saved: "Se guardó {name}.",
    saveFailed: "No se pudo guardar {name}: {reason}",
    saveTimedOut: "El cuadro de guardado agotó el tiempo. Se inició la descarga de {name} en el navegador.",
    fetchRunsFailed: "No se pudieron obtener los análisis.",
    chartsPartial: "Cargados {loaded}/{total} gráficos. Reintentando los que faltan: {missing}",
    noStageUpdate: " (sin actualización de etapa desde hace {n} s)",
    chartsLoading: "Análisis completado. Cargando gráficos ({loaded}/{total})... Faltan: {missing}",
    masteringProgress: "Masterización {status}... {pct}%",
    conversionProgress: "Conversión {status}... {pct}%",
    masteringFailed: "La masterización falló.",
    conversionFailed: "La conversión falló.",
    analysisComplete: "Análisis completado.",
    analysisFailed: "El análisis falló.",
    runProgress: "{status}... {pct}% | {ticker}",
    fetchRunFailed: "No se pudieron obtener los detalles del análisis.",
    outputsReady: {
      one: "Hay un archivo de resultado nuevo. Elige dónde guardarlo.",
      other: "Hay archivos de resultado nuevos. Elige dónde guardar {n} archivos."
    },
    uploading: "Subiendo...",
    uploaded: "Se subió {name}. Listo para analizar.",
    uploadFailed: "La subida falló.",
    analysisQueued: "Análisis en cola.",
    analysisStartFailed: "No se pudo iniciar el análisis.",
    pickFormat: "Selecciona al menos un formato de destino para la conversión.",
    queueingConversion: "Poniendo la conversión en cola...",
    conversionQueued: "Conversión en cola: {formats}",
    conversionStartFailed: "No se pudo iniciar la conversión.",
    queueingMastering: "Poniendo la masterización en cola...",
    masteringQueued: "Masterización en cola ({mode}, {preset}, {backend}, norm.: {norm}, ganancia de entrada: {gain} dB).",
    masteringStartFailed: "No se pudo iniciar la masterización.",
    confirmHardReset:
      "¿Reiniciar a la fuerza los servicios y borrar todos los análisis (incluidas las tareas activas o en cola)? Se cancelarán los procesos en cola.",
    confirmClear: "¿Borrar el historial de todos los análisis que no estén activos?",
    hardResetting: "Reiniciando a la fuerza los servicios y borrando el historial...",
    clearing: "Borrando el historial de análisis...",
    cleared: { one: "Se borró {n} análisis.", other: "Se borraron {n} análisis." },
    keptActive: { one: " (se conservó {n} análisis activo)", other: " (se conservaron {n} análisis activos)" },
    jobsReset: " Tareas reiniciadas: canceladas {cancelled}, en curso {running}.",
    hardResetFailed: "No se pudieron reiniciar a la fuerza los servicios.",
    clearFailed: "No se pudo borrar el historial de análisis.",
    appliedAdvice: "Se aplicaron los ajustes de masterización sugeridos ({mode} / {preset} / {backend}).",
    playbackFailed: "No se pudo iniciar la reproducción.",
    selectRunForEq: "Selecciona un análisis antes de exportar el audio con EQ.",
    sourceFetchFailed: "No se pudo obtener el audio de origen: {status}",
    noOfflineRendering: "El renderizado sin conexión de Web Audio no está disponible en este navegador.",
    eqExported: "Exportación con EQ completada. Se guardó el WAV procesado.",
    eqExportFailed: "La exportación con EQ falló.",
    updateAvailable: "Hay una actualización de Music Suite disponible.",
    updateCheckFailed: "La comprobación de actualizaciones falló.",
    updateInstallFailed: "La instalación de la actualización falló.",
    audioLoadFailed: "No se pudo cargar el audio de este análisis para reproducirlo."
  },
  popout: {
    visual: "Visual AI",
    visualTitle: "Visual AI",
    charts: "los gráficos",
    chartsTitle: "Gráficos"
  },
};
