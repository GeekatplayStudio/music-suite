/**
 * English: the source language. Each area of the app has its own file under ./en, so
 * screens can be translated independently. Other languages mirror this file exactly.
 *
 * A nested object with an `other` key is a plural entry ({ one, few, many, other });
 * do not use `other` as an ordinary key.
 */

import { common } from "./en/common";
import { detach } from "./en/detach";
import { models } from "./en/models";
import { prefs } from "./en/prefs";
import { sessions } from "./en/sessions";
import { source } from "./en/source";
import { studio } from "./en/studio";

export const en = { common, prefs, models, sessions, studio, source, detach };
