/**
 * General MIDI: the 128 program names, the drum map, and a sound for every program.
 *
 * A track whose instrument is `kind: "gm"` names a program here. How it is heard depends
 * on what is available: a loaded SoundFont plays the real recorded instrument, and without
 * one the built-in synthesizer plays the nearest sound it can make (`gmPatch`). The program
 * number is what travels in and out of MIDI files, so the choice survives a round trip.
 */

import { FACTORY_PRESETS, type Oscillator, type OscWave, type Patch, initPatch } from "@/lib/editor/synth";

/** Program names in General MIDI order; the index is the program number sent in a MIDI file. */
export const GM_PROGRAMS: string[] = [
  "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
  "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
  "Celesta", "Glockenspiel", "Music Box", "Vibraphone",
  "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
  "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ",
  "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
  "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
  "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
  "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
  "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
  "Violin", "Viola", "Cello", "Contrabass",
  "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
  "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
  "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
  "Trumpet", "Trombone", "Tuba", "Muted Trumpet",
  "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
  "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax",
  "Oboe", "English Horn", "Bassoon", "Clarinet",
  "Piccolo", "Flute", "Recorder", "Pan Flute",
  "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
  "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)",
  "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
  "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)",
  "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
  "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)",
  "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
  "Sitar", "Banjo", "Shamisen", "Koto",
  "Kalimba", "Bag pipe", "Fiddle", "Shanai",
  "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock",
  "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
  "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet",
  "Telephone Ring", "Helicopter", "Applause", "Gunshot"
];

/** The sixteen families General MIDI groups its programs into, eight programs each. */
export const GM_FAMILIES: string[] = [
  "Piano", "Chromatic percussion", "Organ", "Guitar",
  "Bass", "Strings", "Ensemble", "Brass",
  "Reed", "Pipe", "Synth lead", "Synth pad",
  "Synth effects", "Ethnic", "Percussive", "Sound effects"
];

/** General MIDI's percussion map: the note numbers a drum kit answers to. */
export const GM_DRUM_NAMES: Record<number, string> = {
  35: "Acoustic bass drum", 36: "Bass drum 1", 37: "Side stick", 38: "Acoustic snare",
  39: "Hand clap", 40: "Electric snare", 41: "Low floor tom", 42: "Closed hi-hat",
  43: "High floor tom", 44: "Pedal hi-hat", 45: "Low tom", 46: "Open hi-hat",
  47: "Low-mid tom", 48: "Hi-mid tom", 49: "Crash cymbal 1", 50: "High tom",
  51: "Ride cymbal 1", 52: "Chinese cymbal", 53: "Ride bell", 54: "Tambourine",
  55: "Splash cymbal", 56: "Cowbell", 57: "Crash cymbal 2", 58: "Vibraslap",
  59: "Ride cymbal 2", 60: "Hi bongo", 61: "Low bongo", 62: "Mute hi conga",
  63: "Open hi conga", 64: "Low conga", 65: "High timbale", 66: "Low timbale",
  67: "High agogo", 68: "Low agogo", 69: "Cabasa", 70: "Maracas",
  71: "Short whistle", 72: "Long whistle", 73: "Short guiro", 74: "Long guiro",
  75: "Claves", 76: "Hi wood block", 77: "Low wood block", 78: "Mute cuica",
  79: "Open cuica", 80: "Mute triangle", 81: "Open triangle"
};

/** The MIDI channel General MIDI reserves for percussion, counted from zero. */
export const DRUM_CHANNEL = 9;

export function gmProgramName(program: number): string {
  return GM_PROGRAMS[clampProgram(program)];
}

export function clampProgram(program: number): number {
  return Math.min(127, Math.max(0, Math.round(Number.isFinite(program) ? program : 0)));
}

/* ---------- Sounds for the built-in synthesizer ---------- */

function osc(wave: OscWave, extra: Partial<Oscillator> = {}): Oscillator {
  return { on: true, wave, octave: 0, semi: 0, fine: 0, level: 0.8, unison: 1, detune: 0, spread: 0, ...extra };
}

const off = (wave: OscWave = "sawtooth"): Oscillator => osc(wave, { on: false, level: 0.6 });

function factory(name: string): Patch {
  const found = FACTORY_PRESETS.find((preset) => preset.name === name);
  return found ? structuredClone(found) : initPatch();
}

/** A factory preset with a few settings changed, keeping its measured output level. */
function from(name: string, label: string, change: (patch: Patch) => void): Patch {
  const patch = factory(name);
  patch.name = label;
  change(patch);
  return patch;
}

function built(label: string, change: (patch: Patch) => void): Patch {
  const patch = initPatch();
  patch.name = label;
  change(patch);
  return patch;
}

/**
 * One sound per instrument archetype. Those built on a factory preset keep its measured
 * level; the levels on the rest were set by ear against Init and are not measured, so a
 * SoundFont is the better answer when one is loaded.
 */
const ARCHETYPES = {
  piano: built("Piano", (p) => {
    p.osc = [osc("triangle", { level: 0.9 }), osc("sine", { octave: 1, level: 0.3 }), osc("sawtooth", { level: 0.12 })];
    p.filter = { ...p.filter, cutoff: 5200, resonance: 0.05, keytrack: 0.6, envAmount: 1.6 };
    p.modEnv = { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 };
    p.ampEnv = { attack: 0.002, decay: 1.8, sustain: 0.12, release: 0.35 };
    p.matrix = [{ source: "velocity", dest: "cutoff", amount: 0.3 }];
    p.velocity = 0.75;
    p.gainDb = 3;
  }),
  epiano: from("FM electric piano", "Electric piano", () => {}),
  harpsichord: built("Harpsichord", (p) => {
    p.osc = [osc("pulse25", { level: 0.8 }), osc("sawtooth", { octave: 1, level: 0.35 }), off()];
    p.filter = { ...p.filter, cutoff: 4200, resonance: 0.2, keytrack: 0.7, envAmount: 2 };
    p.modEnv = { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 };
    p.ampEnv = { attack: 0.001, decay: 0.9, sustain: 0.05, release: 0.2 };
    p.gainDb = 4;
  }),
  bells: from("FM bell", "Bells", () => {}),
  vibraphone: built("Vibraphone", (p) => {
    p.osc = [osc("sine", { level: 1 }), osc("sine", { octave: 2, level: 0.18 }), off()];
    p.filter = { ...p.filter, cutoff: 9000, resonance: 0 };
    p.ampEnv = { attack: 0.004, decay: 1.4, sustain: 0.08, release: 0.8 };
    p.lfo[0] = { wave: "sine", rate: 4.5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "amp", amount: 0.3 }];
    p.gainDb = 5;
  }),
  marimba: built("Marimba", (p) => {
    p.osc = [osc("sine", { level: 1 }), osc("triangle", { octave: 1, level: 0.22 }), off()];
    p.filter = { ...p.filter, cutoff: 6000, resonance: 0, keytrack: 0.5 };
    p.ampEnv = { attack: 0.002, decay: 0.42, sustain: 0, release: 0.2 };
    p.gainDb = 7;
  }),
  organ: from("Organ", "Organ", () => {}),
  churchOrgan: from("Organ", "Church organ", (p) => {
    p.osc = [osc("organ"), osc("organ", { octave: -1, level: 0.6 }), osc("sine", { octave: 1, semi: 7, level: 0.3 })];
    p.ampEnv = { attack: 0.08, decay: 0.2, sustain: 1, release: 0.5 };
    p.matrix = [];
  }),
  accordion: built("Accordion", (p) => {
    p.osc = [osc("sawtooth", { unison: 3, detune: 16, spread: 0.4 }), osc("pulse25", { fine: 9, level: 0.5 }), off()];
    p.filter = { ...p.filter, cutoff: 3000, resonance: 0.15 };
    p.ampEnv = { attack: 0.05, decay: 0.2, sustain: 0.95, release: 0.12 };
    p.lfo[0] = { wave: "sine", rate: 5.5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "amp", amount: 0.1 }];
    p.gainDb = -2;
  }),
  guitarNylon: from("Pluck", "Nylon guitar", (p) => {
    p.osc = [osc("triangle", { level: 0.9 }), osc("sawtooth", { level: 0.25 }), off()];
    p.filter = { ...p.filter, cutoff: 900, resonance: 0.15, envAmount: 3, keytrack: 0.5 };
    p.ampEnv = { attack: 0.004, decay: 1, sustain: 0, release: 0.3 };
  }),
  guitarSteel: from("Pluck", "Steel guitar", (p) => {
    p.filter = { ...p.filter, cutoff: 1100, resonance: 0.2, envAmount: 3.6, keytrack: 0.55 };
    p.ampEnv = { attack: 0.002, decay: 1.2, sustain: 0, release: 0.3 };
  }),
  guitarClean: from("Pluck", "Electric guitar", (p) => {
    p.osc = [osc("sawtooth", { level: 0.8 }), osc("square", { fine: 6, level: 0.3 }), off()];
    p.filter = { ...p.filter, cutoff: 1300, resonance: 0.25, envAmount: 2.8 };
    p.ampEnv = { attack: 0.003, decay: 1.4, sustain: 0.06, release: 0.3 };
  }),
  guitarDrive: built("Overdriven guitar", (p) => {
    p.osc = [osc("sawtooth", { unison: 2, detune: 8 }), osc("square", { octave: -1, level: 0.4 }), off()];
    p.filter = { ...p.filter, slope: 24, cutoff: 2400, resonance: 0.3, drive: 0.75, envAmount: 1 };
    p.ampEnv = { attack: 0.004, decay: 0.5, sustain: 0.7, release: 0.2 };
    p.gainDb = -6;
  }),
  bassAcoustic: from("Sub bass", "Acoustic bass", (p) => {
    p.osc = [osc("sine", { octave: -1, level: 1 }), osc("triangle", { level: 0.35 }), off()];
    p.ampEnv = { attack: 0.006, decay: 0.7, sustain: 0.25, release: 0.15 };
  }),
  bassElectric: from("Analog bass", "Electric bass", () => {}),
  bassSynth: from("Acid bass", "Synth bass", () => {}),
  stringsSolo: from("Strings", "Solo strings", (p) => {
    p.osc = [osc("sawtooth", { unison: 2, detune: 7, spread: 0.3 }), osc("triangle", { level: 0.3 }), off()];
    p.ampEnv = { attack: 0.12, decay: 0.4, sustain: 0.9, release: 0.4 };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.009 }];
  }),
  strings: from("Strings", "String ensemble", () => {}),
  tremoloStrings: from("Strings", "Tremolo strings", (p) => {
    p.lfo[0] = { wave: "sine", rate: 7.5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "amp", amount: 0.45 }];
  }),
  pizzicato: from("Pluck", "Pizzicato", (p) => {
    p.osc = [osc("sawtooth", { unison: 2, detune: 10 }), off(), off()];
    p.ampEnv = { attack: 0.002, decay: 0.26, sustain: 0, release: 0.14 };
  }),
  harp: from("Pluck", "Harp", (p) => {
    p.osc = [osc("triangle", { level: 0.9 }), osc("sine", { octave: 1, level: 0.25 }), off()];
    p.filter = { ...p.filter, cutoff: 2200, resonance: 0.05, envAmount: 2, keytrack: 0.6 };
    p.ampEnv = { attack: 0.002, decay: 1.6, sustain: 0, release: 0.5 };
  }),
  timpani: built("Timpani", (p) => {
    p.osc = [osc("sine", { level: 1 }), off(), off()];
    p.noise = 0.25;
    p.filter = { ...p.filter, cutoff: 500, resonance: 0.2, envAmount: 1.5 };
    p.modEnv = { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 };
    p.ampEnv = { attack: 0.002, decay: 0.9, sustain: 0, release: 0.4 };
    p.gainDb = 2;
  }),
  choir: from("Warm pad", "Choir", (p) => {
    p.osc = [osc("hollow", { unison: 3, detune: 14, spread: 0.7, level: 0.8 }), osc("organ", { level: 0.3 }), off()];
    p.filter = { ...p.filter, cutoff: 1800, resonance: 0.12 };
    p.ampEnv = { attack: 0.25, decay: 0.5, sustain: 0.9, release: 0.7 };
    p.lfo[0] = { wave: "sine", rate: 4.5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.007 }];
  }),
  orchestraHit: built("Orchestra hit", (p) => {
    p.osc = [osc("sawtooth", { unison: 5, detune: 24, spread: 0.8 }), osc("square", { octave: -1, level: 0.5 }), off()];
    p.noise = 0.3;
    p.filter = { ...p.filter, slope: 24, cutoff: 2600, resonance: 0.2, envAmount: 2 };
    p.modEnv = { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 };
    p.ampEnv = { attack: 0.002, decay: 0.34, sustain: 0, release: 0.2 };
    p.gainDb = -6;
  }),
  brass: from("Brass", "Brass section", () => {}),
  brassSolo: from("Brass", "Trumpet", (p) => {
    p.osc = [osc("sawtooth"), osc("pulse25", { level: 0.4 }), off()];
    p.filter = { ...p.filter, cutoff: 1100, resonance: 0.2, envAmount: 2.8 };
    p.ampEnv = { attack: 0.03, decay: 0.3, sustain: 0.88, release: 0.16 };
  }),
  brassMuted: from("Brass", "Muted brass", (p) => {
    p.osc = [osc("pulse12"), osc("sawtooth", { level: 0.35 }), off()];
    p.filter = { ...p.filter, type: "bandpass", cutoff: 1500, resonance: 0.35, envAmount: 1.5 };
    p.ampEnv = { attack: 0.02, decay: 0.25, sustain: 0.8, release: 0.12 };
  }),
  horn: from("Brass", "French horn", (p) => {
    p.osc = [osc("sawtooth", { unison: 2, detune: 5 }), osc("triangle", { level: 0.45 }), off()];
    p.filter = { ...p.filter, cutoff: 700, resonance: 0.1, envAmount: 1.8 };
    p.ampEnv = { attack: 0.09, decay: 0.4, sustain: 0.85, release: 0.3 };
  }),
  synthBrass: from("Brass", "Synth brass", (p) => {
    p.osc = [osc("sawtooth", { unison: 3, detune: 12, spread: 0.4 }), osc("square", { octave: -1, level: 0.45 }), off()];
    p.filter = { ...p.filter, slope: 24, cutoff: 1000, resonance: 0.25, envAmount: 3 };
    p.ampEnv = { attack: 0.03, decay: 0.3, sustain: 0.85, release: 0.2 };
  }),
  sax: built("Saxophone", (p) => {
    p.osc = [osc("sawtooth", { level: 0.85 }), osc("pulse25", { fine: -6, level: 0.4 }), off()];
    p.noise = 0.05;
    p.filter = { ...p.filter, type: "bandpass", cutoff: 1300, resonance: 0.3, envAmount: 1.6, keytrack: 0.4 };
    p.modEnv = { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.2 };
    p.ampEnv = { attack: 0.03, decay: 0.3, sustain: 0.85, release: 0.18 };
    p.lfo[0] = { wave: "sine", rate: 5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.008 }];
    p.mode = "mono";
    p.glide = 0.03;
    p.gainDb = -3;
  }),
  reed: built("Reed", (p) => {
    p.osc = [osc("pulse12", { level: 0.8 }), osc("triangle", { level: 0.35 }), off()];
    p.noise = 0.04;
    p.filter = { ...p.filter, cutoff: 1900, resonance: 0.2, keytrack: 0.5 };
    p.ampEnv = { attack: 0.04, decay: 0.3, sustain: 0.9, release: 0.14 };
    p.lfo[0] = { wave: "sine", rate: 5.2, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.006 }];
    p.mode = "mono";
    p.gainDb = -1;
  }),
  flute: built("Flute", (p) => {
    p.osc = [osc("sine", { level: 0.95 }), osc("triangle", { octave: 1, level: 0.12 }), off()];
    p.noise = 0.12;
    p.filter = { ...p.filter, cutoff: 3600, resonance: 0.1, keytrack: 0.6 };
    p.ampEnv = { attack: 0.06, decay: 0.2, sustain: 0.92, release: 0.16 };
    p.lfo[0] = { wave: "sine", rate: 5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.006 }];
    p.mode = "mono";
    p.gainDb = 2;
  }),
  whistle: built("Whistle", (p) => {
    p.osc = [osc("sine", { level: 1 }), off(), off()];
    p.filter = { ...p.filter, cutoff: 5000, resonance: 0 };
    p.ampEnv = { attack: 0.05, decay: 0.2, sustain: 0.9, release: 0.2 };
    p.lfo[0] = { wave: "sine", rate: 5.5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.01 }];
    p.mode = "mono";
    p.gainDb = 3;
  }),
  leadSquare: from("Chip square", "Square lead", (p) => {
    p.mode = "mono";
    p.glide = 0.03;
  }),
  leadSaw: from("Mono lead", "Saw lead", () => {}),
  leadSuper: from("Supersaw lead", "Supersaw lead", () => {}),
  padWarm: from("Warm pad", "Warm pad", () => {}),
  padSweep: from("Sweep pad", "Sweep pad", () => {}),
  padMetallic: from("Sweep pad", "Metallic pad", (p) => {
    p.osc = [osc("bright", { unison: 3, detune: 14, spread: 0.7 }), osc("sine", { octave: 2, level: 0.2 }), off()];
    p.fm = 0.2;
    p.filter = { ...p.filter, cutoff: 2600, resonance: 0.3 };
  }),
  noiseFx: from("Noise riser", "Effects", () => {}),
  ethnicPluck: from("Pluck", "Plucked string", (p) => {
    p.osc = [osc("sawtooth", { level: 0.7 }), osc("pulse25", { octave: 1, level: 0.3 }), off()];
    p.filter = { ...p.filter, cutoff: 1500, resonance: 0.35, envAmount: 3.2 };
    p.ampEnv = { attack: 0.002, decay: 1.1, sustain: 0, release: 0.3 };
  }),
  kalimba: built("Kalimba", (p) => {
    p.osc = [osc("sine", { level: 1 }), osc("sine", { octave: 2, level: 0.12 }), off()];
    p.filter = { ...p.filter, cutoff: 4000, resonance: 0, keytrack: 0.6 };
    p.ampEnv = { attack: 0.002, decay: 0.55, sustain: 0, release: 0.3 };
    p.gainDb = 6;
  }),
  steelDrum: built("Steel drum", (p) => {
    p.osc = [osc("sine", { level: 1 }), osc("sine", { semi: 7, octave: 1, level: 0.3 }), off()];
    p.fm = 0.2;
    p.filter = { ...p.filter, cutoff: 5200, resonance: 0.1 };
    p.ampEnv = { attack: 0.002, decay: 0.6, sustain: 0, release: 0.3 };
    p.modEnv = { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 };
    p.matrix = [{ source: "env2", dest: "fm", amount: 0.3 }];
    p.gainDb = 4;
  }),
  taiko: built("Taiko", (p) => {
    p.osc = [osc("sine", { octave: -1, level: 1 }), off(), off()];
    p.noise = 0.2;
    p.filter = { ...p.filter, cutoff: 380, resonance: 0.15 };
    p.ampEnv = { attack: 0.002, decay: 0.5, sustain: 0, release: 0.25 };
    p.gainDb = 1;
  }),
  woodblock: built("Woodblock", (p) => {
    p.osc = [osc("square", { level: 0.6 }), off(), off()];
    p.noise = 0.5;
    p.filter = { ...p.filter, type: "bandpass", cutoff: 2200, resonance: 0.45, keytrack: 0.8 };
    p.ampEnv = { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 };
    p.gainDb = 6;
  })
} satisfies Record<string, Patch>;

type Archetype = keyof typeof ARCHETYPES;

/** Programs 0-127 in order, each naming the archetype that plays it. */
const PROGRAM_ARCHETYPES: Archetype[] = [
  // 0-7 Piano
  "piano", "piano", "piano", "harpsichord", "epiano", "epiano", "harpsichord", "epiano",
  // 8-15 Chromatic percussion
  "bells", "bells", "bells", "vibraphone", "marimba", "marimba", "bells", "ethnicPluck",
  // 16-23 Organ
  "organ", "organ", "organ", "churchOrgan", "accordion", "accordion", "reed", "accordion",
  // 24-31 Guitar
  "guitarNylon", "guitarSteel", "guitarClean", "guitarClean", "pizzicato", "guitarDrive", "guitarDrive", "bells",
  // 32-39 Bass
  "bassAcoustic", "bassElectric", "bassElectric", "bassAcoustic", "bassSynth", "bassSynth", "bassSynth", "bassSynth",
  // 40-47 Strings
  "stringsSolo", "stringsSolo", "stringsSolo", "stringsSolo", "tremoloStrings", "pizzicato", "harp", "timpani",
  // 48-55 Ensemble
  "strings", "strings", "strings", "strings", "choir", "choir", "choir", "orchestraHit",
  // 56-63 Brass
  "brassSolo", "brassSolo", "horn", "brassMuted", "horn", "brass", "synthBrass", "synthBrass",
  // 64-71 Reed
  "sax", "sax", "sax", "sax", "reed", "reed", "reed", "reed",
  // 72-79 Pipe
  "flute", "flute", "flute", "flute", "flute", "flute", "whistle", "flute",
  // 80-87 Synth lead
  "leadSquare", "leadSaw", "flute", "leadSquare", "leadSuper", "choir", "leadSuper", "bassSynth",
  // 88-95 Synth pad
  "padSweep", "padWarm", "leadSuper", "choir", "padWarm", "padMetallic", "padSweep", "padSweep",
  // 96-103 Synth effects
  "noiseFx", "padSweep", "bells", "padWarm", "padMetallic", "padMetallic", "noiseFx", "noiseFx",
  // 104-111 Ethnic
  "ethnicPluck", "ethnicPluck", "ethnicPluck", "harp", "kalimba", "reed", "stringsSolo", "reed",
  // 112-119 Percussive
  "bells", "woodblock", "steelDrum", "woodblock", "taiko", "timpani", "taiko", "noiseFx",
  // 120-127 Sound effects
  "woodblock", "noiseFx", "noiseFx", "whistle", "bells", "noiseFx", "noiseFx", "woodblock"
];

/** The built-in synthesizer's nearest sound for a General MIDI program. */
export function gmPatch(program: number): Patch {
  const patch = ARCHETYPES[PROGRAM_ARCHETYPES[clampProgram(program)]];
  return { ...structuredClone(patch), name: gmProgramName(program) };
}

/** Programs grouped by family, for a picker. */
export function gmFamilies(): { family: string; programs: { program: number; name: string }[] }[] {
  return GM_FAMILIES.map((family, index) => ({
    family,
    programs: Array.from({ length: 8 }, (_, offset) => {
      const program = index * 8 + offset;
      return { program, name: GM_PROGRAMS[program] };
    })
  }));
}
