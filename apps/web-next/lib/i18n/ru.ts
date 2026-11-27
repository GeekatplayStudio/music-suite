/** Russian. Every area must have exactly the keys of its English file (TypeScript checks). */

import type { Dictionary } from "./index";
import { common } from "./ru/common";
import { windows } from "./ru/windows";
import { analyser } from "./ru/analyser";
import { charts } from "./ru/charts";
import { editor } from "./ru/editor";
import { inspector } from "./ru/inspector";
import { editorTools } from "./ru/editorTools";
import { synth } from "./ru/synth";
import { studioTabs } from "./ru/studioTabs";
import { detach } from "./ru/detach";
import { models } from "./ru/models";
import { prefs } from "./ru/prefs";
import { sessions } from "./ru/sessions";
import { source } from "./ru/source";
import { studio } from "./ru/studio";

export const ru: Dictionary = { common, prefs, models, sessions, studio, source, detach, analyser, charts, editor, inspector, editorTools, synth, studioTabs, windows };
