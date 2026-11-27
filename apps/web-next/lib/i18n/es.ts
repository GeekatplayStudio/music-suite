/** Spanish. Every area must have exactly the keys of its English file (TypeScript checks). */

import type { Dictionary } from "./index";
import { common } from "./es/common";
import { windows } from "./es/windows";
import { analyser } from "./es/analyser";
import { charts } from "./es/charts";
import { editor } from "./es/editor";
import { inspector } from "./es/inspector";
import { editorTools } from "./es/editorTools";
import { synth } from "./es/synth";
import { studioTabs } from "./es/studioTabs";
import { detach } from "./es/detach";
import { models } from "./es/models";
import { prefs } from "./es/prefs";
import { sessions } from "./es/sessions";
import { source } from "./es/source";
import { studio } from "./es/studio";

export const es: Dictionary = { common, prefs, models, sessions, studio, source, detach, analyser, charts, editor, inspector, editorTools, synth, studioTabs, windows };
