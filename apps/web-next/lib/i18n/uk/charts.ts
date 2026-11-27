import type { Dictionary } from "../index";

/** Shared analysis views: charts, tables, equaliser, visuals, review strip, help page, mapper. */
export const charts: Dictionary["charts"] = {
  visualizer: {
    subtitle: "Частоти, хвильова форма та енергія в реальному часі",
    modes: {
      spectrum: "Спектр",
      orbit: "Орбіта",
      waveform: "Хвиля"
    },
    fullscreen: "Візуалізація на весь екран",
    canvas: "Жива візуалізація звуку",
    playVisualizer: "Запустити візуалізацію",
    play: "Відтворити",
    pause: "Пауза",
    ready: "Готово",
    bass: "Низи {value}%",
    mid: "Середина {value}%",
    high: "Верхи {value}%",
    cannotStart: "Не вдалося запустити відтворення для візуалізації.",
    cannotLoad: "Не вдалося завантажити вибраний звук."
  },
  plot: {
    renderError: "Помилка малювання графіка: {message}",
    noData: "Для цього запуску немає даних графіка.",
    /** Plotly's own toolbar and hints (its English text is the key it looks up). */
    toolbar: {
      zoom: "Масштаб",
      pan: "Зсув",
      zoomIn: "Наблизити",
      zoomOut: "Віддалити",
      autoscale: "Автомасштаб",
      resetAxes: "Скинути осі",
      download: "Завантажити графік як PNG",
      spikes: "Лінії-вказівники",
      closest: "Найближчі дані під курсором",
      compare: "Порівнювати дані під курсором",
      boxSelect: "Виділення рамкою",
      lasso: "Виділення ласо",
      doubleClick: "Подвійне клацання — повернути масштаб"
    }
  },
  equalizer: {
    title: "Еквалайзер (за бажанням)",
    intro: "Прослухайте файл через власну криву еквалайзера й експортуйте оброблений результат у WAV.",
    enable: "Увімкнути EQ",
    reset: "Скинути EQ",
    exporting: "Експорт WAV з EQ…",
    export: "Експортувати WAV з EQ"
  },
  review: {
    title: "Смуга перегляду хвилі",
    intro: "Клацніть, щоб перейти. Кнопками «Початок» і «Кінець» нижче позначте ділянку для перевірки.",
    playhead: "Курсор {time} с",
    selection: "Виділено з {start} до {end} с"
  },
  table: {
    empty: "Немає рядків."
  },
  helpLink: "Довідка: {label}",
  help: {
    subtitle: "{title}: як працює кожна частина програми і що робить кожне налаштування.",
    analyser: "Аналіз і мастеринг",
    search: "Пошук у посібнику",
    clear: "Очистити пошук",
    contents: "Зміст",
    noMatch: "У посібнику нічого не знайдено."
  },
  mapper: {
    title: "Геометрія пісні",
    loaded: "Завантажено пісню: {name}",
    none: "Завантажте пісню тут або поверніться до Music Suite, щоб вибрати її."
  },
  notFound: {
    title: "Сторінку не знайдено",
    body: "Запитаної сторінки немає в цій програмі."
  }
};
