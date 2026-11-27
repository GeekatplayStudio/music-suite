"use client";

import { AppPrefs } from "@/components/app-prefs";
import { Lightbulb, Search, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import type { Block, HelpDocument, Inline } from "@/lib/help/markdown";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const quiet =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 " +
  "hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300";

/** Where a link in the manual goes: a section of this page, another part of the app, or the web. */
function target(href: string): { href: string; external: boolean } {
  if (href.startsWith("#") || href.startsWith("/")) return { href, external: false };
  // Links between the manual's own files on GitHub become sections of this page.
  const local = /USER_MANUAL(?:\.[a-z]{2})?\.md(#.*)?$/.exec(href);
  if (local) return { href: local[1] ?? "#", external: false };
  return { href, external: /^https?:/.test(href) };
}

function InlineView({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.t) {
          case "text":
            return <span key={index}>{node.v}</span>;
          case "code":
            return (
              <code key={index} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-cyan-200">
                {node.v}
              </code>
            );
          case "strong":
            return (
              <strong key={index} className="font-semibold text-slate-100">
                <InlineView nodes={node.c} />
              </strong>
            );
          case "em":
            return (
              <em key={index}>
                <InlineView nodes={node.c} />
              </em>
            );
          case "link": {
            const link = target(node.href);
            return (
              <a
                key={index}
                href={link.href}
                className="font-semibold text-cyan-300 underline-offset-2 hover:underline"
                {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                <InlineView nodes={node.c} />
              </a>
            );
          }
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.t) {
    case "heading": {
      const size = block.level === 3 ? "text-lg" : "text-base";
      const Tag = block.level === 3 ? "h3" : "h4";
      return (
        <Tag id={block.id} className={cn("display-font scroll-mt-24 pt-3 font-semibold text-slate-100", size)}>
          <a href={`#${block.id}`} className="hover:text-cyan-300">
            <InlineView nodes={block.c} />
          </a>
        </Tag>
      );
    }
    case "para":
      return (
        <p className="leading-relaxed text-slate-300">
          <InlineView nodes={block.c} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cn("space-y-1 pl-6 leading-relaxed text-slate-300", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <InlineView nodes={item.content} />
              {item.children ? <div className="mt-1">{BlockView({ block: item.children })}</div> : null}
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-slate-800/80 text-slate-100">
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} className="px-3 py-2 font-semibold">
                    <InlineView nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-white/5 align-top">
                  {row.map((cell, index) => (
                    <td key={index} className="px-3 py-2 text-slate-300">
                      <InlineView nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return (
        <div className="flex gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
          <div className="space-y-2">
            {block.blocks.map((inner, index) => (
              <BlockView key={index} block={inner} />
            ))}
          </div>
        </div>
      );
    case "code":
      return <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 font-mono text-[12px] text-slate-200">{block.v}</pre>;
    case "rule":
      return <hr className="border-white/10" />;
  }
}

/** The user manual: a contents list, a search box, and every section. */
export function HelpView({ doc }: { doc: HelpDocument }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const words = useMemo(
    () =>
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 1),
    [query]
  );
  const shown = useMemo(() => (words.length ? doc.sections.filter((section) => words.every((word) => section.text.includes(word))) : doc.sections), [doc, words]);

  // Arriving from a "?" link elsewhere in the app: show that section even after a search.
  useEffect(() => {
    const onHash = () => setQuery("");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-4 px-3 pb-16 pt-6 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="display-font text-xl font-semibold text-slate-100 sm:text-2xl">
            {t("common.appName")} <span className="text-cyan-300">/ {t("common.workspaces.help")}</span>
          </p>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">{t("charts.help.subtitle", { title: doc.title })}</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label={t("common.appName")}>
          <Link href="/" className={quiet}>
            {t("charts.help.analyser")}
          </Link>
          <Link href="/editor" className={quiet}>
            {t("common.workspaces.editor")}
          </Link>
          <Link href="/generate" className={quiet}>
            {t("common.workspaces.studio")}
          </Link>
          <Link href="/synth" className={quiet}>
            {t("common.workspaces.synth")}
          </Link>
          <Link href="/models" className={quiet}>
            {t("common.workspaces.models")}
          </Link>
          <AppPrefs />
        </nav>
      </header>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("charts.help.search")}
              aria-label={t("charts.help.search")}
              className="h-10 w-full rounded-lg border border-white/10 bg-slate-900 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-hidden"
            />
            {query ? (
              <button type="button" aria-label={t("charts.help.clear")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-100" onClick={() => setQuery("")}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <nav aria-label={t("charts.help.contents")} className="mt-3 space-y-0.5 text-[13px]">
            {shown.map((section) => (
              <div key={section.id}>
                <a href={`#${section.id}`} className="block rounded px-2 py-1 font-semibold text-slate-200 hover:bg-slate-800 hover:text-cyan-300">
                  {section.title}
                </a>
                {words.length ? null : (
                  <div className="ml-3 border-l border-white/10">
                    {section.parts.map((part) => (
                      <a key={part.id} href={`#${part.id}`} className="block rounded px-2 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-cyan-300">
                        {part.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!shown.length ? <p className="px-2 py-1 text-slate-500">{t("charts.help.noMatch")}</p> : null}
          </nav>
        </aside>

        <article className="min-w-0 space-y-8">
          {words.length ? null : doc.intro.length ? (
            <section className="glass space-y-3 rounded-2xl border border-white/10 p-5">
              {doc.intro.map((block, index) => (
                <BlockView key={index} block={block} />
              ))}
            </section>
          ) : null}
          {shown.map((section) => (
            <section key={section.id} aria-labelledby={section.id} className="glass space-y-3 rounded-2xl border border-white/10 p-5">
              <h2 id={section.id} className="display-font scroll-mt-24 text-xl font-semibold text-cyan-200">
                <a href={`#${section.id}`}>{section.title}</a>
              </h2>
              {section.blocks.map((block, index) => (
                <BlockView key={index} block={block} />
              ))}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
