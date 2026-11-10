/** 90 -> "1 min 30 s", 90000 -> "1 day 1 h". Two largest units only. */
export function humanDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const parts: [number, string][] = [[Math.floor(s / 86_400), "day"], [Math.floor((s % 86_400) / 3600), "h"], [Math.floor((s % 3600) / 60), "min"], [s % 60, "s"]];
  const out = parts.filter(([n]) => n > 0).slice(0, 2).map(([n, u]) => (u === "day" ? `${n} day${n === 1 ? "" : "s"}` : `${n} ${u}`));
  return out.length ? out.join(" ") : "0 s";
}
