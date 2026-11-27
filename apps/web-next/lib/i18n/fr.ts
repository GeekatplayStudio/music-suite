/** French. Every area must have exactly the keys of its English file (TypeScript checks). */

import type { Dictionary } from "./index";
import { common } from "./fr/common";
import { windows } from "./fr/windows";
import { analyser } from "./fr/analyser";
import { charts } from "./fr/charts";
import { editor } from "./fr/editor";
import { inspector } from "./fr/inspector";
import { editorTools } from "./fr/editorTools";
import { synth } from "./fr/synth";
import { studioTabs } from "./fr/studioTabs";
import { detach } from "./fr/detach";
import { models } from "./fr/models";
import { prefs } from "./fr/prefs";
import { sessions } from "./fr/sessions";
import { source } from "./fr/source";
import { studio } from "./fr/studio";

export const fr: Dictionary = { common, prefs, models, sessions, studio, source, detach, analyser, charts, editor, inspector, editorTools, synth, studioTabs, windows };
