/** Ukrainian. Every area must have exactly the keys of its English file (TypeScript checks). */

import type { Dictionary } from "./index";
import { common } from "./uk/common";
import { windows } from "./uk/windows";
import { analyser } from "./uk/analyser";
import { charts } from "./uk/charts";
import { editor } from "./uk/editor";
import { inspector } from "./uk/inspector";
import { editorTools } from "./uk/editorTools";
import { synth } from "./uk/synth";
import { studioTabs } from "./uk/studioTabs";
import { detach } from "./uk/detach";
import { models } from "./uk/models";
import { prefs } from "./uk/prefs";
import { sessions } from "./uk/sessions";
import { source } from "./uk/source";
import { studio } from "./uk/studio";

export const uk: Dictionary = { common, prefs, models, sessions, studio, source, detach, analyser, charts, editor, inspector, editorTools, synth, studioTabs, windows };
