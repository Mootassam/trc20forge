"use client";

import { memo, useMemo } from "react";
import { tokenLines, type Token } from "@/lib/highlight";
import { cx } from "./ui";

const COLORS: Record<Token["t"], string> = {
  comment: "text-zinc-500 italic dark:text-zinc-500",
  string: "text-emerald-700 dark:text-emerald-400",
  keyword: "text-rose-600 dark:text-rose-400",
  type: "text-sky-700 dark:text-sky-400",
  number: "text-amber-700 dark:text-amber-300",
  fn: "text-violet-700 dark:text-violet-400",
  plain: "",
};

/** Syntax-highlighted code with line numbers. Rendered as React nodes, no innerHTML. */
export const CodeBlock = memo(function CodeBlock({ code, className, maxHeight = "32rem", label = "Source code" }: { code: string; className?: string; maxHeight?: string; label?: string }) {
  const lines = useMemo(() => tokenLines(code), [code]);
  return (
    <div
      className={cx("overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 text-[13px] leading-6 dark:border-zinc-800 dark:bg-zinc-950", className)}
      style={{ maxHeight }}
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <pre className="min-w-max p-4 font-mono">
        <code>
          {lines.map((toks, i) => (
            <span key={i} className="flex">
              <span aria-hidden className="mr-5 inline-block w-7 shrink-0 select-none text-right text-zinc-400 dark:text-zinc-600">{i + 1}</span>
              <span>
                {toks.length === 0 ? " " : toks.map((t, j) => (t.t === "plain" ? t.v : <span key={j} className={COLORS[t.t]}>{t.v}</span>))}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
});
