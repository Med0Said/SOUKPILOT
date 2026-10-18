import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Info, Inbox } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { fr } from "@/i18n/fr";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(20_33_61/0.04)] sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export type Crumb = { label: string; href?: string };

/** Breadcrumb trail for detail pages ("Ventes › Vente n° 000012"). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label={fr.ui.breadcrumbs} className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="rounded px-0.5 hover:text-primary hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-foreground" : ""}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight aria-hidden="true" className="size-3.5 rtl:rotate-180" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const ALERT_ICONS = { error: AlertCircle, success: CheckCircle2, info: Info } as const;

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-danger/30 bg-danger-soft text-danger",
    success: "border-success/30 bg-success-soft text-success",
    info: "border-border bg-background text-foreground",
  }[tone];
  const Icon = ALERT_ICONS[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${styles}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Renders the top-level message of a server action result, if any. */
export function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message || state.status === "idle") return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon ?? <Inbox aria-hidden="true" className="size-5" />}
      </span>
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger"; children: ReactNode }) {
  const styles = {
    neutral: "bg-background text-muted border-border",
    success: "bg-success-soft text-success border-success/30",
    warning: "bg-warning-soft text-warning border-warning/30",
    danger: "bg-danger-soft text-danger border-danger/30",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${styles}`}>
      {children}
    </span>
  );
}

/** Loading placeholder blocks (used by route-level loading.tsx files). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-border/60 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{fr.common.loading}</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
