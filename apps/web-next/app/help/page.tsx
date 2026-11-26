import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { cookies } from "next/headers";

import { HelpView } from "@/components/help/help-view";
import { parseHelp } from "@/lib/help/markdown";
import { LOCALE_COOKIE } from "@/lib/prefs";

export const metadata: Metadata = {
  title: "Help | Music Suite"
};

// The manual is read from the same file that is in the repository: USER_MANUAL.ru.md when the
// interface is Russian. The page is rendered per request (not ahead of time) so it follows the
// language and colour theme saved in cookies.

const DOCS = path.join(process.cwd(), "..", "..", "docs");

function manualFor(locale: string | undefined): string {
  if (locale && locale !== "en") {
    try {
      return readFileSync(path.join(DOCS, `USER_MANUAL.${locale}.md`), "utf8");
    } catch {
      /* no translation yet: English */
    }
  }
  return readFileSync(path.join(DOCS, "USER_MANUAL.md"), "utf8");
}

export default async function Page() {
  const source = manualFor((await cookies()).get(LOCALE_COOKIE)?.value);
  return <HelpView doc={parseHelp(source)} />;
}
