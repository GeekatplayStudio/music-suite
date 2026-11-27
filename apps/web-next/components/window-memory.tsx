"use client";

import { useEffect } from "react";

import { pageWindowId, saveGeometry } from "@/lib/windows";

/**
 * In a page opened with "Open in a new window": keep note of where the window is and how big,
 * so the next time it opens in the same place (on the same monitor). Renders nothing.
 */
export function WindowMemory() {
  useEffect(() => {
    const id = pageWindowId();
    if (!id) return;
    let last = "";
    const save = () => {
      last = saveGeometry(`page-${id}`, window, last);
    };
    const timer = window.setInterval(save, 1000);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", save);
    };
  }, []);
  return null;
}
