/** Panels moved into windows of their own (components/detachable.tsx). */
export const detach = {
  detach: "Open {panel} in its own window (for another monitor)",
  attach: "Bring {panel} back into the page",
  away: "“{panel}” is open in its own window.",
  bringBack: "Bring it back",
  floatNamed: "Float “{panel}” in a window of its own",
  dockNamed: "Dock “{panel}” back into the page",
  menu: {
    heading: "Panels on this page",
    none: "Nothing on this page floats.",
    float: "Float",
    dock: "Dock",
    reopen: "Reopen my floating panels",
    dockAll: "Dock every panel",
    auto: "Reopen floating panels when their page opens",
    note: "A floating panel gets a window of its own: move it, size it, or put it on another monitor. Music Suite remembers where each one goes. Reopening by itself needs pop-ups allowed for Music Suite.",
    blocked: "The browser opened only one window for that click. Allow pop-ups for Music Suite (the icon at the right of the address bar) to reopen them all at once."
  },
  warning:
    "This opens the panel in a separate window that you can move to another monitor.\n\nEach extra window is another page for the computer to draw, so it uses more memory, processor and graphics power, especially with live meters, visuals or the spectral view. Close the window (or use “Bring it back”) to return the panel.\n\nOpen it?",
  blocked: "The browser blocked the new window. Allow pop-ups for Music Suite and try again.",
  titles: {
    arrange: "Tracks and timeline",
    summary: "Run summary",
    loudness: "Loudness numbers",
    song: "Song settings",
    results: "Results",
    synthControls: "Synth controls",
    inspector: "Inspector",
    lower: "Piano roll and views",
    keys: "On-screen piano"
  },
  emptyLower: "Select a notes clip (or open the spectral view) and it appears here.",
  panels: {
    arrange: "the tracks and timeline",
    inspector: "the inspector",
    lower: "the piano roll and views",
    keys: "the on-screen piano"
  }
};
