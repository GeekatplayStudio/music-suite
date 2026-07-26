// Help copy for every adjustable control in the Song Geometry Mapper.
// Keyed by the control's DOM id. `what` says what the control does; `when`
// says when you would reach for it. The tooltip engine renders both.
export const HELP_CONTENT = {
  // ---------------------------------------------------------------- session
  "analysis-mode": {
    title: "Analysis Model",
    what: "Chooses which engine turns your audio into geometry. Classic runs a Hann-windowed FFT in the browser. Voice / Deep sends the file to the local Music Suite backend, which can separate stems first.",
    when: "Stay on Classic for instant results. Switch to Voice / Deep when you want the geometry driven by one isolated instrument.",
  },
  "voice-stem": {
    title: "Voice Focus",
    what: "Selects which separated stem the backend analyzer maps. Full Mix skips separation entirely.",
    when: "Pick Vocals to watch a lead line move through the space, or Drums to see the rhythmic skeleton without harmonic clutter.",
  },
  "voice-cache-dir": {
    title: "Cache Folder",
    what: "Where the backend stores completed analyses. Music Suite manages this path, so it is read-only here.",
    when: "Informational. Use Clear Cached Analyses if a song changed on disk but still loads its old geometry.",
  },
  "audio-file": {
    title: "Load Audio File",
    what: "Loads a .mp3 or .wav for analysis, or a previously exported geometry .json to restore a map without re-analyzing.",
    when: "Drag and drop works anywhere on the stage.",
  },
  "playback-speed": {
    title: "Playback Speed",
    what: "Slows or accelerates playback from 0.05x to 2x. The geometry follows the audio clock, so at 0.25x the trail crawls through the structure four times slower while trail length and glow stay identical.",
    when: "Drop to 0.1x-0.25x to study exactly how one transition is built, or how a section's spectral centroid drifts. Use 2x to skim a long track.",
  },
  "preserve-pitch": {
    title: "Preserve Pitch",
    what: "Keeps the original musical pitch when speed changes, using the browser's time-stretch. Turn it off for classic tape-style pitch shifting.",
    when: "Leave on for musical inspection. Turn off when the raw slowed-down waveform is what you want to hear.",
  },
  "show-connections": {
    title: "Connections",
    what: "Draws the edges between related frames. With edges off you see only the node cloud.",
    when: "Turn off when the graph is dense enough that edges hide the shape of the cloud itself.",
  },
  "show-labels": {
    title: "Labels",
    what: "Prints frequency and time markers next to significant nodes.",
    when: "Keep on while analyzing; turn off for clean captures and recordings.",
  },
  "cinema-mode": {
    title: "Cinema FX",
    what: "Master switch for bloom, glow, lens flare, fog, and motion blur. Disabling it bypasses every post-effect pass.",
    when: "Turn off to see the unfiltered data, or to recover frame rate on a slow machine.",
  },
  "nodes-only": {
    title: "Nodes Only",
    what: "Hides all edges and effects at once, leaving raw data points.",
    when: "The fastest way to judge the true distribution of the point cloud.",
  },

  // ---------------------------------------------------------- mapping/geometry
  "mapping-mode": {
    title: "Mapping Mode",
    what: "Decides how a frame's descriptors become an XYZ position. Manifold (PCA) places similar-sounding frames near each other. Time Spine lays frames along a chronological line. Hybrid Flow blends structure with time. Helix Orbit wraps the timeline into a spiral.",
    when: "Manifold reveals how many distinct textures a song has. Time Spine and Helix make song form and repetition legible.",
  },
  "freq-spread": {
    title: "3D Frequency Spread",
    what: "Multiplies how far frames are pushed apart on the X and Z axes.",
    when: "Raise it when the cloud collapses into a dense ball; lower it when points scatter past the edges of the frame.",
  },
  "auto-freq-spread": {
    title: "Auto Spread by Song",
    what: "Recalculates spread from each song's own statistics after analysis and after any mapping-mode change, targeting a balanced cloud radius.",
    when: "Leave on. Turn off only when comparing two songs at a deliberately identical scale.",
  },
  "offset-x": {
    title: "Offset X",
    what: "Shifts the whole point cloud left or right in world space, before the camera transform.",
    when: "Use to re-centre a lopsided map, or to move the cloud out from behind an overlay panel.",
  },
  "offset-y": {
    title: "Offset Y",
    what: "Shifts the point cloud vertically in world space.",
    when: "Handy when a Time Spine sits too low in frame for a capture.",
  },
  "offset-z": {
    title: "Offset Z",
    what: "Pushes the cloud toward or away from the camera, changing how strongly perspective and fog act on it.",
    when: "Move it away for a flatter, more diagram-like read; move it closer for depth and drama.",
  },
  "edge-mode": {
    title: "Edge Mode",
    what: "Chooses which relationships become edges. Temporal links each frame to the next. kNN links each frame to its nearest neighbours in descriptor space, regardless of when they occurred.",
    when: "kNN exposes repetition: a chorus returning links back to its earlier occurrence. Temporal alone reads as a single continuous path.",
  },
  "knn-neighbors": {
    title: "Neighbour Links",
    what: "How many nearest neighbours each frame connects to, from 1 to 10.",
    when: "Low values give a clean skeleton. High values expose fine similarity structure but quickly become a hairball.",
  },
  "knn-boost": {
    title: "Neighbour Boost",
    what: "Scales the drawn weight of similarity edges relative to temporal ones.",
    when: "Raise it to make repeated sections pop out against the timeline path.",
  },
  "camera-preset": {
    title: "Camera Preset",
    what: "Selects the automatic camera behaviour: Static holds still, Drift moves slowly, Orbit circles the cloud, Pulse pushes in on transients.",
    when: "Static for measurement and screenshots, Orbit or Pulse for recordings.",
  },
  "drag-mode": {
    title: "Drag Mode",
    what: "Sets what a mouse drag on the stage does: Orbit rotates the camera around the cloud, Pan slides it laterally.",
    when: "Switch to Pan when you have zoomed in and want to travel along a Time Spine.",
  },
  "display-decimation": {
    title: "Display Decimation",
    what: "Draws only every Nth point. The analysis keeps every frame; this affects rendering only.",
    when: "Raise it to recover frame rate on long tracks. Return to 1 before exporting or capturing.",
  },
  "point-scale": {
    title: "Point Size",
    what: "Base radius of each node before per-frame loudness scaling.",
    when: "Shrink for dense songs so individual frames stay distinguishable.",
  },
  "point-opacity": {
    title: "Point Opacity",
    what: "Alpha of each node. Lower values let overlapping nodes accumulate into visible density instead of a flat mass.",
    when: "Lower it when the cloud reads as a solid blob.",
  },
  "point-solidness": {
    title: "Point Solidness",
    what: "Controls the radial falloff inside each node, from a soft glowing puff to a hard-edged disc.",
    when: "Solid for analytical clarity, soft for atmosphere.",
  },
  "point-depth": {
    title: "Point Depth",
    what: "Strengthens how much size and brightness fall off with distance from the camera.",
    when: "Raise it when the cloud looks flat and you cannot tell near from far.",
  },
  "edge-style": {
    title: "Edge Style",
    what: "Straight draws direct lines. Wave bends each edge into a ribbon whose shape is driven by the audio between its endpoints.",
    when: "Straight for reading topology, Wave for motion and beauty.",
  },
  "edge-opacity": {
    title: "Edge Opacity",
    what: "Alpha of every connection line.",
    when: "Drop it as neighbour count rises so the graph stays readable.",
  },
  "edge-brightness": {
    title: "Edge Brightness",
    what: "Multiplies edge luminance after colour mapping, independent of opacity.",
    when: "Raise for dark palettes where edges disappear into the background.",
  },
  "edge-width-boost": {
    title: "Edge Width",
    what: "Scales the thickness of all connections.",
    when: "Thicken for recordings viewed at small sizes; thin for dense graphs.",
  },
  "edge-ribbon-softness": {
    title: "Ribbon Softness",
    what: "Feathering applied to ribbon edges and their glow.",
    when: "Soft ribbons blend into the fog; hard ribbons stay legible as individual strands.",
  },
  "edge-ribbon-wave-speed": {
    title: "Ribbon Wave Speed",
    what: "How fast the light-wave travels along each ribbon.",
    when: "Slow it right down when you are also slowing playback, so the two motions agree.",
  },
  "edge-ribbon-flexibility": {
    title: "Ribbon Flexibility",
    what: "How strongly ribbons bend to follow the waveform between their endpoints.",
    when: "Low values approach straight lines; high values make the audio's shape the dominant visual.",
  },
  "edge-solidness": {
    title: "Edge Solidness",
    what: "Blends each connection between a continuous line and a dashed one.",
    when: "Dashes help separate overlapping edges in a crowded graph.",
  },
  "edge-trail-length": {
    title: "Edge Trail Length",
    what: "How far the travelling highlight stretches behind the playhead along each connection.",
    when: "Longer trails read as flow; shorter trails read as precise timing.",
  },
  "edge-tail-fade": {
    title: "Edge Tail Fade",
    what: "How quickly those connection trails fade to nothing.",
    when: "Fast fade keeps the frame clean at high tempo.",
  },
  "wave-amplification": {
    title: "Wave Amplification",
    what: "Boosts ribbon displacement when the source audio is too quiet or too compressed to produce visible shape.",
    when: "Raise it for heavily limited masters where every frame has similar amplitude.",
  },
  "edge-wave-harmonics": {
    title: "Harmonic Detail",
    what: "Sets how many partials build each connection's waveform. At 0 an edge is a pure sine; higher values stack overtones whose weighting comes from the frames' own spectral flatness, so tonal passages stay smooth while noisy or percussive ones draw a dense, ragged wave.",
    when: "Raise it to read the difference between a sustained pad and a drum fill at a glance. Lower it when the graph is dense and you want clean, legible lines.",
  },
  "trail-persistence": {
    title: "Trail Persistence",
    what: "How long the playhead's motion trail stays on screen. Persistence is measured against the audio clock, so it looks the same at any playback speed.",
    when: "Long trails draw the shape of a whole phrase; short trails isolate the current moment.",
  },
  "trail-flare": {
    title: "Trail Flare",
    what: "Extra brightness on the leading tip of the trail, where playback currently is.",
    when: "Raise it when you lose track of the playhead in a busy scene.",
  },
  "flow-density": {
    title: "Flow Density",
    what: "How many particles travel along the connections.",
    when: "A strong sense of direction, but the most expensive effect here. Reduce it first when hunting frame rate.",
  },
  "show-flow-arrows": {
    title: "Flow Arrows",
    what: "Draws small moving arrow streaks showing which way each connection flows in time.",
    when: "Useful in kNN mode where an edge's direction is not otherwise obvious.",
  },
  "pulse-strength": {
    title: "Pulse Strength",
    what: "Flash intensity when the playhead activates a node.",
    when: "Raise for percussive material, lower for sustained ambient music.",
  },
  "node-hit-pulse": {
    title: "Node Hit Size",
    what: "How far a node expands when it is struck by the playhead.",
    when: "Large values give a satisfying beat response; keep it small for dense clouds.",
  },
  "motion-strength": {
    title: "Motion Strength",
    what: "How much the whole scene displaces in response to audio energy.",
    when: "Subtle values add life. High values can make measurement difficult.",
  },
  "motion-blur": {
    title: "Motion Blur",
    what: "Blur applied in proportion to movement speed.",
    when: "Smooths fast camera moves in recordings. Turn off when reading exact node positions.",
  },
  "rotation-speed": {
    title: "Rotation Speed",
    what: "Angular speed of the automatic camera rotation.",
    when: "Set to zero and use Static when you need a fixed viewpoint for comparison.",
  },

  // ------------------------------------------------------------- visual / FX
  "visual-preset": {
    title: "Visual Preset",
    what: "Loads a complete colour palette and background treatment. Observatory and Cathedral also load matching camera and FX profiles, and switching back restores your previous settings.",
    when: "Start here, then adjust individual controls.",
  },
  "observatory-overlay": {
    title: "Observatory Overlay",
    what: "Adds structural scan halos and orbit rings on top of the current map without replacing it.",
    when: "Analytical presentation, where you want reference geometry around the cloud.",
  },
  "cathedral-overlay": {
    title: "Cathedral Overlay",
    what: "Adds vaulted arches and beacon spires as an extra scene layer.",
    when: "Theatrical presentation and title shots.",
  },
  "custom-preset-select": {
    title: "Custom Presets",
    what: "Loads one of your saved control snapshots. Presets store every adjustment except the loaded file and palette image.",
    when: "Save a preset once you find a look worth reusing across songs.",
  },
  "custom-preset-name": {
    title: "Preset Name",
    what: "Name used when you save the current settings as a custom preset.",
    when: "Reusing an existing name overwrites that preset.",
  },
  "bloom-strength": {
    title: "Bloom",
    what: "Intensity of light bleeding out of bright areas.",
    when: "The single biggest contributor to a cinematic look, and a common cause of an illegible white-out.",
  },
  "glow-intensity": {
    title: "Glow Intensity",
    what: "Overall brightness of the glow pass across the scene.",
    when: "Pair with Glow Threshold: intensity sets how bright, threshold sets how much qualifies.",
  },
  "glow-threshold": {
    title: "Glow Threshold",
    what: "Minimum brightness a pixel needs before it glows.",
    when: "Raise it so only true peaks bloom, keeping mid-level detail crisp.",
  },
  "glow-shift": {
    title: "Glow Colour Shift",
    what: "Pushes glow colour toward warm infrared.",
    when: "Adds heat to cool palettes without changing the underlying colour mapping.",
  },
  "glow-decay": {
    title: "Glow Decay",
    what: "How quickly the glow falls off with distance from its source.",
    when: "Tight decay keeps glow attached to nodes; loose decay produces atmospheric haze.",
  },
  "fog-strength": {
    title: "Fog",
    what: "Distance-based fog that fades far geometry into the background colour.",
    when: "The most reliable depth cue available. Raise it when the cloud reads as flat.",
  },
  "lens-flare-strength": {
    title: "Lens Flare",
    what: "Optical flare around the brightest active light source.",
    when: "Effective on sparse material; distracting on dense clouds.",
  },
  "lens-streak-strength": {
    title: "Anamorphic Streaks",
    what: "Horizontal light streaks that react to source intensity.",
    when: "A widescreen film signature. Keep it low or it dominates every frame.",
  },
  "color-metric": {
    title: "Colour Metric",
    what: "Which measured descriptor drives node colour: spectral spread, centroid, loudness, flux, and so on. The legend updates to match.",
    when: "This is the main analytical choice here. Centroid shows brightness over time; flux shows where change happens.",
  },
  "palette-saturation": {
    title: "Palette Saturation",
    what: "Scales colour intensity of the active palette.",
    when: "Reduce toward grey for a scientific read; raise for presentation.",
  },
  "palette-file": {
    title: "Custom Palette",
    what: "Samples a colour ramp out of any image you supply and uses it as the palette.",
    when: "Match the visualization to album art or a brand palette.",
  },
  "export-mode": {
    title: "Export Mode",
    what: "Sets resolution and framing used by Capture Still and the recorder.",
    when: "Choose the target format before capturing rather than cropping afterwards.",
  },
};

export const HELP_FALLBACK = {
  title: "Control",
  what: "No description has been written for this control yet.",
  when: "",
};
