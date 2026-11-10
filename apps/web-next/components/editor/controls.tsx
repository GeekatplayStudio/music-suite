"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
}

/** Labelled range slider. Double-click resets to the default. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  format,
  onChange,
  compact,
  disabled
}: SliderProps) {
  return (
    <label className={cn("flex items-center gap-2 text-[11px] text-slate-300", compact ? "h-6" : "h-7")}>
      <span className={cn("shrink-0 text-slate-400", compact ? "w-7" : "w-16")}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        title={`${label}: ${format(value)} (double-click to reset)`}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
        className="h-6 min-w-0 flex-1 cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="w-14 shrink-0 text-right font-mono tabular-nums text-slate-200">{format(value)}</span>
    </label>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function IconButton({ label, shortcut, active, size = "md", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-slate-200 transition-colors",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-6 w-6",
        size === "md" && "h-9 w-9",
        size === "lg" && "h-11 w-11",
        active ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : "bg-slate-800 hover:bg-slate-700",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function PanelSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/10 px-4 py-3">
      <h3 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p> : null}
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function ActionButton({
  className,
  children,
  variant = "secondary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300",
        "disabled:pointer-events-none disabled:opacity-40",
        variant === "primary" && "bg-cyan-400 text-slate-950 hover:bg-cyan-300",
        variant === "secondary" && "bg-slate-800 text-slate-100 hover:bg-slate-700",
        variant === "danger" && "bg-rose-500/90 text-white hover:bg-rose-500",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export const fieldClass =
  "h-8 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-slate-100 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300";

export function formatDb(value: number): string {
  if (value <= -60) return "-∞ dB";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

export function formatPan(value: number): string {
  if (Math.abs(value) < 0.005) return "C";
  return `${Math.round(Math.abs(value) * 100)}${value < 0 ? "L" : "R"}`;
}
