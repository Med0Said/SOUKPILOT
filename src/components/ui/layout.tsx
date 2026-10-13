import type { ReactNode } from "react";
import type { ActionState } from "@/lib/actions";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 sm:p-6 ${className}`}>{children}</section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-danger/30 bg-danger-soft text-danger",
    success: "border-success/30 bg-success-soft text-success",
    info: "border-border bg-background text-foreground",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Renders the top-level message of a server action result, if any. */
export function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message || state.status === "idle") return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger"; children: ReactNode }) {
  const styles = {
    neutral: "bg-background text-muted border-border",
    success: "bg-success-soft text-success border-success/30",
    warning: "bg-[#fffbeb] text-[#92400e] border-[#f59e0b]/40 dark:bg-[#2a2210] dark:text-[#fcd34d]",
    danger: "bg-danger-soft text-danger border-danger/30",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}
