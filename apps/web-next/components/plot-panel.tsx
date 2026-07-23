"use client";

import dynamic from "next/dynamic";
import { CircleHelp } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });
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

export function PlotPanel({ title, figure, height = 520, className, helpText, xRange }: PlotPanelProps) {
  const [plotError, setPlotError] = useState<string | null>(null);

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
    .replace(/[^a-z0-9]+/g, "_")
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
        autosize: true,
        height,
      };
      if (figureYaxis2 && typeof figureYaxis2 === "object") {
        layout.yaxis2 = figureYaxis2;
      } else {
        delete layout.yaxis2;
      }
      return layout;
    },
    [figureLayout, scopedXaxis, figureYaxis, figureYaxis2, mergedMargin, height]
  );

  const plotConfig = useMemo(
    () => ({
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
    [downloadName, height]
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
          <>
            <Plot
              data={highFidelityData as never[]}
              layout={layoutWithHeight as never}
              config={plotConfig as never}
              onError={(err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);
                setPlotError(message);
              }}
              onInitialized={() => setPlotError(null)}
              onUpdate={() => setPlotError(null)}
              useResizeHandler
              style={{ width: "100%", height: `${height}px` }}
            />
            {plotError ? (
              <p className="mt-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">
                Plotly render error: {plotError}
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Chart data unavailable for this run.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
