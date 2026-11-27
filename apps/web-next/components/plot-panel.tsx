"use client";

import dynamic from "next/dynamic";
import { CircleHelp } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { localizeServerText } from "@/lib/i18n/server-messages";
import { cn } from "@/lib/utils";

// The factory entry binds react-plotly.js to the minified bundle; its default
// entry would pull in the full, unminified plotly.js build instead.
const Plot = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, plotly] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min")
    ]);
    return createPlotlyComponent(plotly.default ?? plotly);
  },
  { ssr: false }
);
const PLOT_SURFACE_BG = "rgba(23, 33, 58, 0.46)";
const PLOT_PAPER_BG = "rgba(17, 25, 45, 0.26)";
const PLOT_FONT_COLOR = "#e7eefc";
const PLOT_GRID_COLOR = "rgba(176, 196, 225, 0.18)";
const PLOT_AXIS_LINE_COLOR = "rgba(193, 209, 234, 0.44)";
const PLOT_ZERO_LINE_COLOR = "rgba(224, 236, 255, 0.28)";

interface PlotPanelProps {
  title: string;
  figure?: Record<string, unknown>;
  height?: number;
  className?: string;
  helpText?: string;
  xRange?: [number, number];
}

type Json = Record<string, unknown>;

/** An axis or colour-bar title, as a string or { text }. */
function localTitle(value: unknown, tr: (text: string) => string): unknown {
  if (typeof value === "string") return tr(value);
  if (value && typeof value === "object" && typeof (value as Json).text === "string") {
    return { ...(value as Json), text: tr((value as Json).text as string) };
  }
  return value;
}

/**
 * The chart's words in the interface language: trace names, axis and colour-bar titles and
 * notes come from the backend in English and are looked up in the backend-message catalogue.
 * The chart's own title is dropped, since the panel heading shows it already, translated.
 */
function localizeFigure(figure: Json | undefined, locale: string): Json | undefined {
  if (!figure) return figure;
  const tr = (text: string) => localizeServerText(text, locale);
  const data = Array.isArray(figure.data)
    ? (figure.data as unknown[]).map((trace) => {
        if (!trace || typeof trace !== "object") return trace;
        const item = { ...(trace as Json) };
        if (typeof item.name === "string") item.name = tr(item.name);
        if (item.colorbar && typeof item.colorbar === "object") {
          item.colorbar = { ...(item.colorbar as Json), title: localTitle((item.colorbar as Json).title, tr) };
        }
        return item;
      })
    : figure.data;
  const layout: Json = { ...((figure.layout as Json | undefined) ?? {}) };
  delete layout.title;
  for (const key of Object.keys(layout)) {
    const axis = layout[key];
    if (/^[xy]axis\d*$/.test(key) && axis && typeof axis === "object") layout[key] = { ...(axis as Json), title: localTitle((axis as Json).title, tr) };
  }
  if (Array.isArray(layout.annotations)) {
    layout.annotations = (layout.annotations as unknown[]).map((note) =>
      note && typeof note === "object" && typeof (note as Json).text === "string"
        ? { ...(note as Json), text: tr((note as Json).text as string) }
        : note
    );
  }
  return { ...figure, data, layout };
}

function maybeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function heatmapPointCount(trace: Record<string, unknown>): number | null {
  const zRaw = trace.z;
  if (!Array.isArray(zRaw) || zRaw.length === 0) {
    return null;
  }
  const row = zRaw[0];
  if (!Array.isArray(row) || row.length === 0) {
    return null;
  }
  return row.length;
}

function traceXBounds(trace: Record<string, unknown>): [number, number] | null {
  const xRaw = trace.x;
  if (Array.isArray(xRaw)) {
    let left = 0;
    let right = xRaw.length - 1;
    let start: number | null = null;
    let end: number | null = null;
    while (left <= right && start === null) {
      start = maybeFiniteNumber(xRaw[left]);
      left += 1;
    }
    while (right >= 0 && end === null) {
      end = maybeFiniteNumber(xRaw[right]);
      right -= 1;
    }
    if (start !== null && end !== null && start !== end) {
      return start < end ? [start, end] : [end, start];
    }
  }

  const x0 = maybeFiniteNumber(trace.x0);
  const dx = maybeFiniteNumber(trace.dx);
  const points = heatmapPointCount(trace);
  if (x0 !== null && dx !== null && points !== null && points > 1) {
    const end = x0 + dx * (points - 1);
    return end > x0 ? [x0, end] : [end, x0];
  }

  return null;
}

function figureXBounds(data: Array<Record<string, unknown>>): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const trace of data) {
    const bounds = traceXBounds(trace);
    if (!bounds) continue;
    if (bounds[0] < min) min = bounds[0];
    if (bounds[1] > max) max = bounds[1];
  }
  if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
    return [min, max];
  }
  return null;
}

function clampRangeToBounds(range: [number, number], bounds: [number, number]): [number, number] {
  const ordered: [number, number] = range[0] <= range[1] ? range : [range[1], range[0]];
  const start = Math.max(ordered[0], bounds[0]);
  const end = Math.min(ordered[1], bounds[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= 1e-6) {
    return bounds;
  }
  return [start, end];
}

function PlotPanelView({ title, figure: sourceFigure, height = 520, className, helpText, xRange }: PlotPanelProps) {
  const { t, locale } = useI18n();
  const figure = useMemo(() => localizeFigure(sourceFigure, locale), [sourceFigure, locale]);
  const [plotError, setPlotError] = useState<string | null>(null);
  // In a popped-out window the chart library cannot measure its box (it asks the main page's
  // window), so the width is measured here and given to it.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hasPlot = Array.isArray(figure?.data) && figure.data.length > 0;
  const [ownWidth, setOwnWidth] = useState<number | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    const view = box?.ownerDocument.defaultView as (Window & typeof globalThis) | null | undefined;
    if (!box || !view || view === window) return;
    const observer = new view.ResizeObserver(([entry]) => setOwnWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    observer.observe(box);
    return () => {
      observer.disconnect();
      setOwnWidth(null);
    };
  }, [hasPlot]);

  const figureData = useMemo(
    () =>
      ((Array.isArray(figure?.data) ? figure.data : []) as Array<unknown>).filter(
        (trace) => trace !== null && typeof trace === "object"
      ) as Array<Record<string, unknown>>,
    [figure]
  );

  const figureLayout = useMemo(
    () =>
      ((figure?.layout as Record<string, unknown>) ?? {
        template: "plotly_white",
      }) as Record<string, unknown>,
    [figure]
  );

  const figureXaxis = useMemo(
    () => ((figureLayout.xaxis as Record<string, unknown>) ?? {}) as Record<string, unknown>,
    [figureLayout.xaxis]
  );
  const figureYaxis = useMemo(
    () => ((figureLayout.yaxis as Record<string, unknown>) ?? {}) as Record<string, unknown>,
    [figureLayout.yaxis]
  );

  const scopedXaxis = useMemo(() => {
    const chartBounds = figureXBounds(figureData);
    const scopedRange = xRange && chartBounds ? clampRangeToBounds(xRange, chartBounds) : null;
    const commonAxisStyle = {
      automargin: true,
      gridcolor: PLOT_GRID_COLOR,
      zerolinecolor: PLOT_ZERO_LINE_COLOR,
      linecolor: PLOT_AXIS_LINE_COLOR,
      tickcolor: PLOT_AXIS_LINE_COLOR,
    };
    if (scopedRange) {
      return {
        ...figureXaxis,
        ...commonAxisStyle,
        range: [scopedRange[0], scopedRange[1]],
        autorange: false,
        constrain: "domain",
      };
    }
    return { ...figureXaxis, ...commonAxisStyle };
  }, [figureData, figureXaxis, xRange]);

  const figureYaxis2 = useMemo(() => {
    const figureYaxis2Raw = figureLayout.yaxis2;
    return figureYaxis2Raw && typeof figureYaxis2Raw === "object"
      ? ({
          ...(figureYaxis2Raw as Record<string, unknown>),
          automargin: true,
          gridcolor: PLOT_GRID_COLOR,
          zerolinecolor: PLOT_ZERO_LINE_COLOR,
          linecolor: PLOT_AXIS_LINE_COLOR,
          tickcolor: PLOT_AXIS_LINE_COLOR,
        } as Record<string, unknown>)
      : figureYaxis2Raw;
  }, [figureLayout.yaxis2]);

  const mergedMargin = useMemo(
    () => ({
      l: 64,
      r: 32,
      t: 56,
      b: 60,
      ...((figureLayout.margin as Record<string, unknown> | undefined) ?? {}),
    }),
    [figureLayout.margin]
  );

  const highFidelityData = useMemo(
    () =>
      figureData.map((trace) => {
        if (trace.type === "heatmap") {
          return { ...trace, zsmooth: false };
        }
        return trace;
      }),
    [figureData]
  );

  const downloadName = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "") || "audioqi_chart";

  const layoutWithHeight = useMemo(
    () => {
      const layout: Record<string, unknown> = {
        ...figureLayout,
        xaxis: scopedXaxis,
        yaxis: {
          ...figureYaxis,
          automargin: true,
          gridcolor: PLOT_GRID_COLOR,
          zerolinecolor: PLOT_ZERO_LINE_COLOR,
          linecolor: PLOT_AXIS_LINE_COLOR,
          tickcolor: PLOT_AXIS_LINE_COLOR,
        },
        template: figureLayout.template ?? "plotly_white",
        paper_bgcolor: PLOT_PAPER_BG,
        plot_bgcolor: PLOT_SURFACE_BG,
        font: { color: PLOT_FONT_COLOR, ...(figureLayout.font as Record<string, unknown> | undefined) },
        margin: mergedMargin,
        autosize: ownWidth === null,
        ...(ownWidth === null ? {} : { width: ownWidth }),
        height,
      };
      if (figureYaxis2 && typeof figureYaxis2 === "object") {
        layout.yaxis2 = figureYaxis2;
      } else {
        delete layout.yaxis2;
      }
      return layout;
    },
    [figureLayout, scopedXaxis, figureYaxis, figureYaxis2, mergedMargin, height, ownWidth]
  );

  // Plotly looks its toolbar text up by the English wording.
  const toolbar = useMemo(() => {
    const entries: [string, Parameters<typeof t>[0]][] = [
      ["Zoom", "charts.plot.toolbar.zoom"],
      ["Pan", "charts.plot.toolbar.pan"],
      ["Zoom in", "charts.plot.toolbar.zoomIn"],
      ["Zoom out", "charts.plot.toolbar.zoomOut"],
      ["Autoscale", "charts.plot.toolbar.autoscale"],
      ["Reset axes", "charts.plot.toolbar.resetAxes"],
      ["Download plot as a PNG", "charts.plot.toolbar.download"],
      ["Download plot", "charts.plot.toolbar.download"],
      ["Toggle Spike Lines", "charts.plot.toolbar.spikes"],
      ["Show closest data on hover", "charts.plot.toolbar.closest"],
      ["Compare data on hover", "charts.plot.toolbar.compare"],
      ["Box Select", "charts.plot.toolbar.boxSelect"],
      ["Lasso Select", "charts.plot.toolbar.lasso"],
      ["Double-click to zoom back out", "charts.plot.toolbar.doubleClick"]
    ];
    return Object.fromEntries(entries.map(([english, key]) => [english, t(key)]));
  }, [t]);

  const plotConfig = useMemo(
    () => ({
      locale,
      locales: { [locale]: { dictionary: toolbar } },
      responsive: true,
      displaylogo: false,
      scrollZoom: true,
      doubleClick: "reset+autosize",
      plotGlPixelRatio: 2,
      toImageButtonOptions: {
        format: "png",
        filename: downloadName,
        width: 2200,
        height: Math.max(height, 1200),
        scale: 2
      }
    }),
    [downloadName, height, locale, toolbar]
  );

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span>{title}</span>
          {helpText ? (
            <span
              title={helpText}
              className="inline-flex cursor-help rounded-full bg-secondary/80 p-1 text-muted-foreground"
            >
              <CircleHelp className="h-4 w-4" />
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {figure && highFidelityData.length > 0 ? (
          <div ref={boxRef}>
            <Plot
              data={highFidelityData as never[]}
              layout={layoutWithHeight as never}
              config={plotConfig as never}
              onError={(err: Error) => setPlotError(err.message)}
              onInitialized={() => setPlotError(null)}
              onUpdate={() => setPlotError(null)}
              useResizeHandler
              style={{ width: "100%", height: `${height}px` }}
            />
            {plotError ? (
              <p className="mt-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">
                {t("charts.plot.renderError", { message: plotError })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("charts.plot.noData")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function sameRange(a?: [number, number], b?: [number, number]): boolean {
  if (!a || !b) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * A chart redraws only when what it shows changes. The analyser page re-renders several
 * times a second while audio plays (the playhead moves), and its eleven charts include
 * large spectrogram heatmaps: redrawing them all on every tick froze the page on slower
 * computers. The page builds `xRange` afresh each render, so it is compared by value.
 */
export const PlotPanel = memo(
  PlotPanelView,
  (prev, next) =>
    prev.figure === next.figure &&
    prev.title === next.title &&
    prev.height === next.height &&
    prev.className === next.className &&
    prev.helpText === next.helpText &&
    sameRange(prev.xRange, next.xRange)
);
