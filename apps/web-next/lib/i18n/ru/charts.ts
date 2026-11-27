import type { Dictionary } from "../index";

export const charts: Dictionary["charts"] = {
  visualizer: {
    subtitle: "Частоты, форма волны и энергия в реальном времени",
    modes: {
      spectrum: "Спектр",
      orbit: "Орбита",
      waveform: "Волна"
    },
    fullscreen: "Визуализация на весь экран",
    canvas: "Живая визуализация звука",
    playVisualizer: "Запустить визуализацию",
    play: "Играть",
    pause: "Пауза",
    ready: "Готово",
    bass: "Низы {value}%",
    mid: "Середина {value}%",
    high: "Верха {value}%",
    cannotStart: "Не удалось запустить воспроизведение для визуализации.",
    cannotLoad: "Не удалось загрузить выбранный звук."
  },
  plot: {
    renderError: "Ошибка отрисовки графика: {message}",
    noData: "Для этого анализа нет данных графика.",
    /** Plotly's own toolbar and hints (its English text is the key it looks up). */
    toolbar: {
      zoom: "Масштаб",
      pan: "Сдвиг",
      zoomIn: "Приблизить",
      zoomOut: "Отдалить",
      autoscale: "Автомасштаб",
      resetAxes: "Сбросить оси",
      download: "Скачать график как PNG",
      spikes: "Линии-указатели",
      closest: "Ближайшие данные при наведении",
      compare: "Сравнивать данные при наведении",
      boxSelect: "Выделение рамкой",
      lasso: "Выделение лассо",
      doubleClick: "Двойной щелчок — вернуть масштаб"
    }
  },
  equalizer: {
    title: "Эквалайзер (по желанию)",
    intro: "Прослушайте файл через свою кривую эквалайзера и сохраните обработанный результат в WAV.",
    enable: "Включить EQ",
    reset: "Сбросить EQ",
    exporting: "Сохранение WAV с EQ…",
    export: "Сохранить WAV с EQ"
  },
  review: {
    title: "Полоса просмотра волны",
    intro: "Щёлкните, чтобы перейти. Кнопками «Начало» и «Конец» ниже отметьте участок для проверки.",
    playhead: "Курсор {time} с",
    selection: "Выделено с {start} по {end} с"
  },
  table: {
    empty: "Нет строк."
  },
  helpLink: "Справка: {label}",
  help: {
    subtitle: "{title}: как работает каждая часть программы и что делает каждая настройка.",
    analyser: "Анализ и мастеринг",
    search: "Поиск по руководству",
    clear: "Очистить поиск",
    contents: "Содержание",
    noMatch: "В руководстве ничего не найдено."
  },
  mapper: {
    title: "Геометрия песни",
    loaded: "Загружена песня: {name}",
    none: "Загрузите песню здесь или вернитесь в Music Suite, чтобы выбрать её."
  },
  notFound: {
    title: "Страница не найдена",
    body: "Запрошенной страницы нет в этом приложении."
  }
};
