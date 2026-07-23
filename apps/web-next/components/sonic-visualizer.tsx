"use client";

import { Activity, CircleStop, Maximize2, Pause, Play, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VisualMode = "spectrum" | "orbit" | "waveform";

type SonicVisualizerProps = {
  audioSrc: string;
  filename: string;
  className?: string;
};

type EnergyBands = {
  bass: number;
  mid: number;
  high: number;
};

type RenderCache = {
  width: number;
  height: number;
  frequencyLength: number;
  background: CanvasGradient | null;
  glow: CanvasGradient | null;
  spectrum: CanvasGradient | null;
  waveform: CanvasGradient | null;
  spectrumBins: Uint16Array<ArrayBuffer>;
  orbitBins: Uint16Array<ArrayBuffer>;
  orbitCos: Float32Array<ArrayBuffer>;
  orbitSin: Float32Array<ArrayBuffer>;
  orbitColors: string[];
};

const EMPTY_BANDS: EnergyBands = { bass: 0, mid: 0, high: 0 };
const FFT_SIZE = 2048;
const ORBIT_BAR_COUNT = 180;

const EMPTY_RENDER_CACHE: RenderCache = {
  width: 0,
  height: 0,
  frequencyLength: 0,
  background: null,
  glow: null,
  spectrum: null,
  waveform: null,
  spectrumBins: new Uint16Array(0),
  orbitBins: new Uint16Array(0),
  orbitCos: new Float32Array(0),
  orbitSin: new Float32Array(0),
  orbitColors: []
};

function averageRange(values: Uint8Array, from: number, to: number) {
  const end = Math.min(to, values.length);
  if (from >= end) return 0;
  let total = 0;
  for (let index = from; index < end; index += 1) total += values[index];
  return total / (end - from) / 255;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

export function SonicVisualizer({ audioSrc, filename, className }: SonicVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(FFT_SIZE / 2));
  const timeDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(FFT_SIZE));
  const visibleRef = useRef(true);
  const playingRef = useRef(false);
  const modeRef = useRef<VisualMode>("spectrum");
  const lastMetricUpdateRef = useRef(0);
  const renderCacheRef = useRef<RenderCache>(EMPTY_RENDER_CACHE);
  const fpsCounterRef = useRef({ frames: 0, startedAt: 0 });
  const [mode, setMode] = useState<VisualMode>("spectrum");
  const [isPlaying, setIsPlaying] = useState(false);
  const [bands, setBands] = useState<EnergyBands>(EMPTY_BANDS);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (!audioContextRef.current) {
      const context = new AudioContext({ latencyHint: "interactive" });
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.82;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -18;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyser.fftSize);
    }
    if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
    return analyserRef.current;
  }, []);

  const draw = useCallback(function drawFrame(timestamp: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;

    const frequencies = frequencyDataRef.current;
    let cache = renderCacheRef.current;
    if (
      cache.width !== width ||
      cache.height !== height ||
      cache.frequencyLength !== frequencies.length
    ) {
      const background = context.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#050b17");
      background.addColorStop(0.55, "#0a1427");
      background.addColorStop(1, "#170914");

      const glow = context.createRadialGradient(
        width * 0.5,
        height * 0.5,
        0,
        width * 0.5,
        height * 0.5,
        width * 0.55
      );
      glow.addColorStop(0, "rgba(34, 211, 238, .34)");
      glow.addColorStop(0.55, "rgba(99, 102, 241, .13)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");

      const spectrum = context.createLinearGradient(0, height, width, 0);
      spectrum.addColorStop(0, "rgba(59, 130, 246, .25)");
      spectrum.addColorStop(0.42, "#67e8f9");
      spectrum.addColorStop(0.78, "#a5b4fc");
      spectrum.addColorStop(1, "#fb7185");

      const waveformGradient = context.createLinearGradient(0, 0, width, 0);
      waveformGradient.addColorStop(0, "#22d3ee");
      waveformGradient.addColorStop(0.55, "#a5b4fc");
      waveformGradient.addColorStop(1, "#fb7185");

      const spectrumCount = Math.max(24, Math.min(128, Math.floor(width / 8)));
      const spectrumBins = new Uint16Array(spectrumCount);
      for (let index = 0; index < spectrumCount; index += 1) {
        spectrumBins[index] = Math.floor(
          Math.pow(index / spectrumCount, 1.75) * (frequencies.length - 1)
        );
      }

      const orbitCount = Math.min(ORBIT_BAR_COUNT, frequencies.length);
      const orbitBins = new Uint16Array(orbitCount);
      const orbitCos = new Float32Array(orbitCount);
      const orbitSin = new Float32Array(orbitCount);
      const orbitColors = new Array<string>(orbitCount);
      for (let index = 0; index < orbitCount; index += 1) {
        const angle = (index / orbitCount) * Math.PI * 2 - Math.PI / 2;
        orbitBins[index] = Math.floor(
          Math.pow(index / orbitCount, 1.7) * (frequencies.length - 1)
        );
        orbitCos[index] = Math.cos(angle);
        orbitSin[index] = Math.sin(angle);
        orbitColors[index] = `hsl(${188 + index * 0.8} 92% 68%)`;
      }

      cache = {
        width,
        height,
        frequencyLength: frequencies.length,
        background,
        glow,
        spectrum,
        waveform: waveformGradient,
        spectrumBins,
        orbitBins,
        orbitCos,
        orbitSin,
        orbitColors
      };
      renderCacheRef.current = cache;
    }

    context.fillStyle = cache.background ?? "#050b17";
    context.fillRect(0, 0, width, height);

    const analyser = analyserRef.current;
    const waveform = timeDataRef.current;
    if (analyser) {
      analyser.getByteFrequencyData(frequencies);
      analyser.getByteTimeDomainData(waveform);
    } else {
      frequencies.fill(0);
      waveform.fill(128);
    }

    const nyquist = audioContextRef.current ? audioContextRef.current.sampleRate / 2 : 24000;
    const binHz = nyquist / Math.max(1, frequencies.length);
    const bass = averageRange(frequencies, Math.floor(30 / binHz), Math.ceil(250 / binHz));
    const mid = averageRange(frequencies, Math.floor(250 / binHz), Math.ceil(4000 / binHz));
    const high = averageRange(frequencies, Math.floor(4000 / binHz), Math.ceil(16000 / binHz));
    if (timestamp - lastMetricUpdateRef.current > 120) {
      lastMetricUpdateRef.current = timestamp;
      setBands({ bass, mid, high });
    }

    context.save();
    context.globalAlpha = 0.28 + bass * 0.48 + mid * 0.16;
    context.fillStyle = cache.glow ?? "rgba(34, 211, 238, .1)";
    context.fillRect(0, 0, width, height);
    context.restore();

    const fpsCounter = fpsCounterRef.current;
    if (fpsCounter.startedAt === 0) fpsCounter.startedAt = timestamp;
    fpsCounter.frames += 1;
    const fpsWindow = timestamp - fpsCounter.startedAt;
    if (fpsWindow >= 750) {
      setFps(Math.round((fpsCounter.frames * 1000) / fpsWindow));
      fpsCounter.frames = 0;
      fpsCounter.startedAt = timestamp;
    }

    if (modeRef.current === "waveform") {
      context.lineWidth = 2;
      context.shadowBlur = 18;
      context.shadowColor = "rgba(34, 211, 238, .8)";
      context.strokeStyle = cache.waveform ?? "#67e8f9";
      context.beginPath();
      const stride = Math.max(1, Math.floor(waveform.length / Math.max(1, width)));
      for (let index = 0; index < waveform.length; index += stride) {
        const x = (index / (waveform.length - 1)) * width;
        const sample = (waveform[index] - 128) / 128;
        const y = height * 0.5 + sample * height * 0.36;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.shadowBlur = 0;
    } else if (modeRef.current === "orbit") {
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.22;
      const bars = cache.orbitBins.length;
      context.lineCap = "round";
      for (let index = 0; index < bars; index += 1) {
        const sourceIndex = cache.orbitBins[index];
        const energy = frequencies[sourceIndex] / 255;
        const inner = baseRadius + 2;
        const outer = inner + energy * Math.min(width, height) * 0.25;
        context.globalAlpha = 0.3 + energy * 0.7;
        context.strokeStyle = cache.orbitColors[index];
        context.lineWidth = Math.max(1.2, (Math.min(width, height) / bars) * 0.9);
        context.beginPath();
        context.moveTo(centerX + cache.orbitCos[index] * inner, centerY + cache.orbitSin[index] * inner);
        context.lineTo(centerX + cache.orbitCos[index] * outer, centerY + cache.orbitSin[index] * outer);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.fillStyle = `rgba(34, 211, 238, ${0.08 + bass * 0.18})`;
      context.beginPath();
      context.arc(centerX, centerY, baseRadius * (0.9 + bass * 0.08), 0, Math.PI * 2);
      context.fill();
    } else {
      const gap = 3;
      const barCount = cache.spectrumBins.length;
      const barWidth = Math.max(2, width / barCount - gap);
      context.fillStyle = cache.spectrum ?? "#67e8f9";
      for (let index = 0; index < barCount; index += 1) {
        const sourceIndex = cache.spectrumBins[index];
        const energy = frequencies[sourceIndex] / 255;
        const barHeight = Math.max(2, energy * height * 0.78);
        const x = index * (barWidth + gap);
        const y = height - barHeight;
        context.globalAlpha = 0.42 + energy * 0.58;
        roundedRect(context, x, y, barWidth, barHeight, Math.min(4, barWidth / 2));
      }
      context.globalAlpha = 1;
    }

    if (playingRef.current && visibleRef.current) frameRef.current = requestAnimationFrame(drawFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting && playingRef.current) startLoop();
      else if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    }, { rootMargin: "120px" });
    observer.observe(canvas);
    startLoop();
    return () => observer.disconnect();
  }, [startLoop]);

  useEffect(() => {
    const handleVisibility = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden && playingRef.current) startLoop();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [startLoop]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    void audioContextRef.current?.close();
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await ensureAudioGraph();
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Unable to start visualizer playback.");
    }
  };

  const toggleFullscreen = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await canvas.requestFullscreen();
  };

  return (
    <section className={cn("overflow-hidden rounded-3xl border border-cyan-300/20 bg-slate-950/85 shadow-2xl", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" /> Sonic Visual AI
          </p>
          <h2 className="mt-1 truncate display-font text-xl font-semibold">{filename}</h2>
          <p className="text-xs text-slate-400">Real-time frequency, waveform, and energy analysis</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["spectrum", "orbit", "waveform"] as const).map((item) => (
            <Button key={item} size="sm" variant={mode === item ? "default" : "secondary"} onClick={() => setMode(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </Button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => void toggleFullscreen()} title="Fullscreen visualizer">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} className="block h-[360px] w-full md:h-[480px]" aria-label="Live audio visualization" />
        {!isPlaying ? (
          <button
            type="button"
            onClick={() => void togglePlayback()}
            className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-200/40 bg-slate-950/70 text-cyan-200 shadow-[0_0_45px_rgba(34,211,238,.25)] backdrop-blur transition hover:scale-105 hover:bg-cyan-400/15"
            aria-label="Play visualizer"
          >
            <Play className="ml-1 h-8 w-8" />
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        <Button onClick={() => void togglePlayback()}>
          {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <audio
          ref={audioRef}
          src={audioSrc}
          crossOrigin="anonymous"
          preload="metadata"
          controls
          className="h-10 w-full min-w-0"
          onLoadStart={() => {
            playingRef.current = false;
            setIsPlaying(false);
            setBands(EMPTY_BANDS);
            setAudioError(null);
            setFps(0);
            fpsCounterRef.current = { frames: 0, startedAt: 0 };
          }}
          onPlay={() => {
            playingRef.current = true;
            setIsPlaying(true);
            void ensureAudioGraph().then(startLoop);
          }}
          onPause={() => {
            playingRef.current = false;
            setIsPlaying(false);
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
          }}
          onEnded={() => {
            playingRef.current = false;
            setIsPlaying(false);
            setBands(EMPTY_BANDS);
          }}
          onError={() => setAudioError("The selected audio could not be loaded.")}
        />
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <Activity className="h-4 w-4 text-cyan-300" />
          <span className="text-slate-300">{isPlaying ? `${fps || "—"} FPS` : "Ready"}</span>
          <span className="text-cyan-200">Bass {Math.round(bands.bass * 100)}%</span>
          <span className="text-indigo-200">Mid {Math.round(bands.mid * 100)}%</span>
          <span className="text-rose-200">High {Math.round(bands.high * 100)}%</span>
        </div>
      </div>
      {audioError ? (
        <p className="flex items-center gap-2 border-t border-red-400/20 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          <CircleStop className="h-4 w-4" /> {audioError}
        </p>
      ) : null}
    </section>
  );
}
