import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Geekatplay Studio | Music Suite",
  description: "Geekatplay Studio Music Suite by Vladimir Chopine: analysis, mastering, visualization, and AI generation."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className="bg-background font-[var(--font-manrope)] text-foreground">
        {children}
      </body>
    </html>
  );
}
