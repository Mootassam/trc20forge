"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cx } from "./ui";

export type ChecklistStep = { id: string; title: string; detail: string; href?: string };

const KEY = "trc20-forge:guide-checklist:v1";

/** Tickable launch checklist; progress is kept in this browser only. */
export function GuideChecklist({ steps }: { steps: ChecklistStep[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && typeof saved === "object") setDone(saved);
    } catch { /* storage unavailable */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* ignore */ }
  }, [done, hydrated]);

  const count = steps.filter((s) => done[s.id]).length;
  const pct = Math.round((count / steps.length) * 100);

  return (
    <div className="not-prose space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Launch checklist · {count}/{steps.length}</p>
        <button
          type="button"
          onClick={() => setDone({})}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <RotateCcw className="h-3 w-3" aria-hidden /> Reset for a new token
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="!list-none space-y-1.5 !pl-0">
        {steps.map((s, i) => (
          <li key={s.id}>
            <label className={cx("flex cursor-pointer gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50", done[s.id] && "opacity-60")}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                checked={!!done[s.id]}
                onChange={(e) => setDone((d) => ({ ...d, [s.id]: e.target.checked }))}
              />
              <span className="min-w-0">
                <span className={cx("font-medium text-zinc-900 dark:text-zinc-100", done[s.id] && "line-through")}>
                  {i + 1}. {s.title}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {s.detail}
                  {s.href && <> · <a href={s.href} className="text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">details</a></>}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ol>
    </div>
  );
}
