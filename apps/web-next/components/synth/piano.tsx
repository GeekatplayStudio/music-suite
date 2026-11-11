"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);
/** Computer keys for one octave and a bit, starting on C. */
const KEY_ROW = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p"];
const WHITE_MIN_PX = 26;

function noteName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

/**
 * A piano that fits its width: more octaves on a wide screen, fewer on a phone.
 * Plays by mouse, touch (slide across keys) or the computer keyboard (A–L, Z/X for octave).
 */
export function Piano({
  onNoteOn,
  onNoteOff,
  className,
  typing = true,
  compact = false
}: {
  onNoteOn: (pitch: number) => void;
  onNoteOff: (pitch: number) => void;
  className?: string;
  /** Play from the computer keyboard too. Off where those keys are shortcuts. */
  typing?: boolean;
  /** A lower strip without the hint line, for docking under other panels. */
  compact?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [octaves, setOctaves] = useState(3);
  const [keyOctave, setKeyOctave] = useState(4);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const heldRef = useRef(new Map<string, number>()); // input id -> pitch
  const handlers = useRef({ onNoteOn, onNoteOff });
  useEffect(() => {
    handlers.current = { onNoteOn, onNoteOff };
  }, [onNoteOn, onNoteOff]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => setOctaves(Math.max(1, Math.min(7, Math.floor(host.clientWidth / (7 * WHITE_MIN_PX)))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const press = (id: string, pitch: number) => {
    const before = heldRef.current.get(id);
    if (before === pitch) return;
    if (before !== undefined) release(id);
    heldRef.current.set(id, pitch);
    handlers.current.onNoteOn(pitch);
    setHeld(new Set(heldRef.current.values()));
  };
  const release = (id: string) => {
    const pitch = heldRef.current.get(id);
    if (pitch === undefined) return;
    heldRef.current.delete(id);
    // The same note may still be held another way (mouse and keyboard together).
    if (![...heldRef.current.values()].includes(pitch)) handlers.current.onNoteOff(pitch);
    setHeld(new Set(heldRef.current.values()));
  };
  const actions = useRef({ press, release });
  useEffect(() => {
    actions.current = { press, release };
  });

  useEffect(() => {
    if (!typing) {
      // Notes held by pointer still end when the window loses focus or the piano goes away.
      const drop = () => {
        for (const id of [...heldRef.current.keys()]) actions.current.release(id);
      };
      window.addEventListener("blur", drop);
      return () => {
        window.removeEventListener("blur", drop);
        drop();
      };
    }
    const inField = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || inField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z") setKeyOctave((o) => Math.max(1, o - 1));
      else if (key === "x") setKeyOctave((o) => Math.min(7, o + 1));
      const index = KEY_ROW.indexOf(key);
      if (index < 0) return;
      event.preventDefault();
      actions.current.press(`key-${key}`, Math.min(127, 12 * (keyOctave + 1) + index));
    };
    const up = (event: KeyboardEvent) => actions.current.release(`key-${event.key.toLowerCase()}`);
    const allUp = () => {
      for (const id of [...heldRef.current.keys()]) actions.current.release(id);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", allUp);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", allUp);
      allUp();
    };
  }, [keyOctave, typing]);

  // Centre the range around middle C.
  const first = 12 * (5 - Math.ceil(octaves / 2));
  const pitches = Array.from({ length: octaves * 12 + 1 }, (_, i) => first + i);
  const whites = pitches.filter((p) => !BLACK.has(p % 12));
  const whiteWidth = 100 / whites.length;

  const pointer = (event: React.PointerEvent, pitch: number | null) => {
    const id = `pointer-${event.pointerId}`;
    if (pitch === null) actions.current.release(id);
    else actions.current.press(id, pitch);
  };
  const keyProps = (pitch: number) => ({
    type: "button" as const,
    "aria-label": `Play ${noteName(pitch)}`,
    "aria-pressed": held.has(pitch),
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      // Let the pointer slide on to other keys instead of staying captured by this one.
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        /* this pointer was not captured: nothing to release */
      }
      pointer(event, pitch);
    },
    onPointerEnter: (event: React.PointerEvent) => event.buttons > 0 && pointer(event, pitch),
    onPointerUp: (event: React.PointerEvent) => pointer(event, null),
    onKeyDown: (event: React.KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
        event.preventDefault();
        actions.current.press(`focus-${pitch}`, pitch);
      }
    },
    onKeyUp: (event: React.KeyboardEvent) => (event.key === "Enter" || event.key === " ") && actions.current.release(`focus-${pitch}`),
    onBlur: () => actions.current.release(`focus-${pitch}`)
  });

  return (
    <div className={className}>
      <div
        ref={hostRef}
        role="group"
        aria-label="Piano"
        className={cn(
          "relative touch-none select-none overflow-hidden rounded-xl bg-slate-800 p-1",
          compact ? "h-20 sm:h-24" : "h-28 sm:h-36 lg:h-44"
        )}
        onPointerLeave={(event) => pointer(event, null)}
        onPointerCancel={(event) => pointer(event, null)}
      >
        <div className="relative flex h-full gap-px">
          {whites.map((pitch) => (
            <button
              key={pitch}
              {...keyProps(pitch)}
              className={cn(
                "flex h-full min-w-0 flex-1 items-end justify-center rounded-b-md pb-1.5 text-[10px] font-semibold text-slate-500",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500",
                held.has(pitch) ? "bg-cyan-300" : "bg-slate-100 hover:bg-white"
              )}
            >
              {pitch % 12 === 0 ? noteName(pitch) : ""}
            </button>
          ))}
          {pitches
            .filter((p) => BLACK.has(p % 12))
            .map((pitch) => {
              const whitesBefore = whites.filter((w) => w < pitch).length;
              return (
                <button
                  key={pitch}
                  {...keyProps(pitch)}
                  style={{ left: `${whitesBefore * whiteWidth - whiteWidth * 0.3}%`, width: `${whiteWidth * 0.6}%` }}
                  className={cn(
                    "absolute top-0 z-10 h-[62%] rounded-b-md border border-slate-950",
                    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300",
                    held.has(pitch) ? "bg-cyan-500" : "bg-slate-950 hover:bg-slate-700"
                  )}
                />
              );
            })}
        </div>
      </div>
      {compact ? null : (
      <p className="mt-1.5 text-xs text-slate-400">
        Click, touch and slide, or type <kbd className="rounded bg-slate-800 px-1">A</kbd>–<kbd className="rounded bg-slate-800 px-1">L</kbd>{" "}
        (black keys on the row above). <kbd className="rounded bg-slate-800 px-1">Z</kbd> / <kbd className="rounded bg-slate-800 px-1">X</kbd>{" "}
        move the typing octave: now {noteName(12 * (keyOctave + 1))}.
      </p>
      )}
    </div>
  );
}
