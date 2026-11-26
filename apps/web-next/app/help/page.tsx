import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";

import { HelpView } from "@/components/help/help-view";
import { parseHelp } from "@/lib/help/markdown";

export const metadata: Metadata = {
  title: "Help | Music Suite"
};

// The manual is read from the same file that is in the repository. The page is rendered per
// request (not ahead of time) so it follows the language and colour theme saved in cookies.

export default function Page() {
  const source = readFileSync(path.join(process.cwd(), "..", "..", "docs", "USER_MANUAL.md"), "utf8");
  return <HelpView doc={parseHelp(source)} />;
}
