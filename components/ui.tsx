"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type CSSProperties } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Loader2, XCircle } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-500",
        variant === "secondary" && "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
        variant === "ghost" && "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-500",
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/60", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800/80">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{icon}</div>}
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function Field({ id, label, hint, error, children, aside }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {aside && <span className="text-xs text-zinc-500 dark:text-zinc-400">{aside}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
          <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass = (invalid?: boolean) =>
  cx(
    "h-11 w-full rounded-xl border bg-white px-3.5 text-sm shadow-sm transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:bg-zinc-950 dark:disabled:bg-zinc-900",
    invalid
      ? "border-red-400 focus:ring-red-500/30 dark:border-red-500/60"
      : "border-zinc-300 focus:border-rose-400 focus:ring-rose-500/20 dark:border-zinc-700 dark:focus:border-rose-500/60",
  );

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "success" | "warning" | "danger" | "brand"; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone === "neutral" && "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
        tone === "success" && "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
        tone === "warning" && "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
        tone === "danger" && "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
        tone === "brand" && "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20",
        className,
      )}
    >
      {children}
    </span>
  );
}

const calloutStyles = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200", Icon: Info },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200", Icon: AlertTriangle },
  danger: { box: "border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200", Icon: XCircle },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200", Icon: CheckCircle2 },
};

export function Callout({ tone = "info", title, children, className }: { tone?: keyof typeof calloutStyles; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { box, Icon } = calloutStyles[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="opacity-90 [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}

export function CopyButton({ value, label = "Copy", className, size = "sm" }: { value: string; label?: string; className?: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      aria-label={`${label} to clipboard`}
      icon={copied ? <Check className="h-4 w-4 text-emerald-500" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = value;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

export function downloadFile(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KV({ rows }: { rows: { k: ReactNode; v: ReactNode; copy?: string; mono?: boolean }[] }) {
  return (
    <dl className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_1fr_auto] sm:items-center sm:gap-4">
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">{r.k}</dt>
          <dd className={cx("min-w-0 break-all text-sm font-medium", r.mono && "font-mono text-[13px]")}>{r.v}</dd>
          {r.copy !== undefined ? <CopyButton value={r.copy} className="justify-self-start sm:justify-self-end" /> : <span className="hidden sm:block" />}
        </div>
      ))}
    </dl>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx("font-medium text-rose-600 underline-offset-4 hover:underline dark:text-rose-400", className)}>
      {children}
    </a>
  );
}

/** Shimmer placeholder. Pulses only when the user hasn't asked for reduced motion. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cx("rounded-lg bg-zinc-200/80 motion-safe:animate-pulse dark:bg-zinc-800/80", className)} style={style} />;
}
