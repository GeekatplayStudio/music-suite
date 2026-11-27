/** German. Every area must have exactly the keys of its English file (TypeScript checks). */

import type { Dictionary } from "./index";
import { common } from "./de/common";
import { windows } from "./de/windows";
import { analyser } from "./de/analyser";
import { charts } from "./de/charts";
import { editor } from "./de/editor";
import { inspector } from "./de/inspector";
import { editorTools } from "./de/editorTools";
import { synth } from "./de/synth";
import { studioTabs } from "./de/studioTabs";
import { detach } from "./de/detach";
import { models } from "./de/models";
import { prefs } from "./de/prefs";
import { sessions } from "./de/sessions";
import { source } from "./de/source";
import { studio } from "./de/studio";

export const de: Dictionary = { common, prefs, models, sessions, studio, source, detach, analyser, charts, editor, inspector, editorTools, synth, studioTabs, windows };
