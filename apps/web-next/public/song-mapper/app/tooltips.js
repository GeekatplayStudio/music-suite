// Hover-and-hold help popups.
//
// A tooltip appears only after the pointer rests on a control for DWELL_MS, so
// sweeping across the panel never produces a burst of popups. The popup is a
// single shared element positioned in viewport coordinates, which keeps it out
// of the scrolling control panel and lets it flip sides near an edge instead of
// being clipped.
import { HELP_CONTENT, HELP_FALLBACK } from "./help-content.js";

const DWELL_MS = 550;
const TOUCH_DWELL_MS = 450;
const GAP = 12;

export function initTooltips() {
  const host = document.createElement("div");
  host.className = "help-tip";
  host.setAttribute("role", "tooltip");
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `
    <div class="help-tip-title"></div>
    <div class="help-tip-what"></div>
    <div class="help-tip-when"></div>
  `;
  document.body.appendChild(host);

  const titleEl = host.querySelector(".help-tip-title");
  const whatEl = host.querySelector(".help-tip-what");
  const whenEl = host.querySelector(".help-tip-when");

  let dwellTimer = null;
  let activeAnchor = null;

  function cancelDwell() {
    if (dwellTimer !== null) {
      window.clearTimeout(dwellTimer);
      dwellTimer = null;
    }
  }

  function hide() {
    cancelDwell();
    activeAnchor = null;
    host.classList.remove("is-visible");
    host.setAttribute("aria-hidden", "true");
  }

  function place(anchor) {
    const rect = anchor.getBoundingClientRect();
    // Measure while visible but un-positioned so the size is final.
    host.style.left = "0px";
    host.style.top = "0px";
    const tip = host.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - tip.width / 2;
    left = Math.max(GAP, Math.min(left, window.innerWidth - tip.width - GAP));

    // Prefer above; flip below when there is not enough headroom.
    let top = rect.top - tip.height - GAP;
    let placement = "above";
    if (top < GAP) {
      top = rect.bottom + GAP;
      placement = "below";
    }
    if (top + tip.height > window.innerHeight - GAP) {
      top = Math.max(GAP, window.innerHeight - tip.height - GAP);
    }

    host.dataset.placement = placement;
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
  }

  function show(anchor) {
    // A control in an inactive tab has a zero-sized rect; anchoring to it would
    // strand the popup in the corner of the screen.
    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.width === 0 || anchorRect.height === 0) {
      return;
    }

    const key = anchor.dataset.help;
    const content = HELP_CONTENT[key] || HELP_FALLBACK;
    titleEl.textContent = content.title || "";
    whatEl.textContent = content.what || "";
    whenEl.textContent = content.when || "";
    whenEl.style.display = content.when ? "" : "none";

    activeAnchor = anchor;
    host.classList.add("is-visible");
    host.setAttribute("aria-hidden", "false");
    place(anchor);
  }

  function scheduleShow(anchor, delay) {
    if (activeAnchor === anchor) return;
    cancelDwell();
    dwellTimer = window.setTimeout(() => {
      dwellTimer = null;
      show(anchor);
    }, delay);
  }

  function anchorFrom(target) {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-help]");
  }

  document.addEventListener(
    "pointerover",
    (event) => {
      const anchor = anchorFrom(event.target);
      if (!anchor) {
        if (activeAnchor && !activeAnchor.contains(event.target)) hide();
        return;
      }
      if (event.pointerType === "touch") return;
      scheduleShow(anchor, DWELL_MS);
    },
    true,
  );

  document.addEventListener(
    "pointerout",
    (event) => {
      const anchor = anchorFrom(event.target);
      if (!anchor) return;
      const next = event.relatedTarget;
      if (next instanceof Node && anchor.contains(next)) return;
      hide();
    },
    true,
  );

  // Long-press on touch, without hijacking a normal tap.
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType !== "touch") return;
      const anchor = anchorFrom(event.target);
      if (anchor) scheduleShow(anchor, TOUCH_DWELL_MS);
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel"]) {
    document.addEventListener(type, (event) => {
      if (event.pointerType === "touch") hide();
    }, true);
  }

  // Keyboard users get the same help by focusing the control.
  document.addEventListener(
    "focusin",
    (event) => {
      const anchor = anchorFrom(event.target);
      if (anchor) scheduleShow(anchor, DWELL_MS);
    },
    true,
  );
  document.addEventListener("focusout", hide, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });

  // Any movement of the anchor invalidates the placement.
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);

  return { hide };
}

/**
 * Gives every control described in HELP_CONTENT a help affordance:
 * the whole labelled row becomes the hover target, and a "?" badge is
 * appended so the affordance is discoverable.
 */
export function decorateControls() {
  const badge = () => {
    const span = document.createElement("span");
    span.className = "info-icon";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "?";
    return span;
  };

  for (const id of Object.keys(HELP_CONTENT)) {
    let control = document.getElementById(id);
    if (!control) {
      // Radio groups are addressed by name rather than id.
      control = document.querySelector(`[name="${id}"]`);
    }
    if (!control) continue;

    // A radio's own <label> wraps just that one option, so the help belongs to
    // the group container instead; otherwise the badge sits on top of the first
    // option's text.
    const row =
      control.type === "radio"
        ? control.closest(".control-group") || control.closest("label")
        : control.closest("label, .control-row, .control-group") || control.parentElement;
    if (!row) continue;

    row.dataset.help = id;
    if (!row.querySelector(".info-icon")) {
      const head = row.querySelector(".label-head") || row;
      head.appendChild(badge());
    }
  }
}
