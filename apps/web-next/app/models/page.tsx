import type { Metadata } from "next";

import { ModelsPage } from "@/components/addons/models-page";

export const metadata: Metadata = {
  title: "Models & engines | Music Suite"
};

export default function Page() {
  return <ModelsPage />;
}
