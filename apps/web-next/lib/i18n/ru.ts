/** Russian. Every area must have exactly the keys of its English file (TypeScript checks). */

import type { Dictionary } from "./index";
import { common } from "./ru/common";
import { detach } from "./ru/detach";
import { models } from "./ru/models";
import { prefs } from "./ru/prefs";
import { sessions } from "./ru/sessions";
import { source } from "./ru/source";
import { studio } from "./ru/studio";

export const ru: Dictionary = { common, prefs, models, sessions, studio, source, detach };
