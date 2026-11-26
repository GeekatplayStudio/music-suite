"use client";

import { CircleHelp } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * A small "?" that opens the manual at the section explaining the controls next to it. It
 * opens in a new tab, so nothing on the page the user is working in is lost.
 */
export function HelpLink({ section, label, className }: { section: string; label: string; className?: string }) {
  const { t } = useI18n();
  const text = t("charts.helpLink", { label });
  return (
    <a
      href={`/help#${section}`}
      target="_blank"
      rel="noreferrer"
      title={text}
      aria-label={text}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-cyan-300",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300",
        className
      )}
    >
      <CircleHelp className="h-4 w-4" aria-hidden />
    </a>
  );
}
