import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { EXPORT_MAX_ROWS } from "@/lib/domain/exports";
import { buttonClasses } from "./button";
import { fr } from "@/i18n/fr";

const SELECT = "block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";

/** Sort choice inside a list's GET filter form (works without JavaScript). */
export function SortSelect<T extends string>({ value, options }: { value: T; options: Record<T, string> }) {
  return (
    <div>
      <label htmlFor="sort" className="mb-1.5 block text-sm font-medium">
        {fr.lists.sortBy}
      </label>
      <select id="sort" name="sort" defaultValue={value} className={SELECT}>
        {(Object.entries(options) as [T, string][]).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** "N résultats" + CSV export of every row matching the filters. */
export function ListSummary({ total, exportHref }: { total: number; exportHref?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-muted" aria-live="polite">
        {fr.lists.results(total)}
      </p>
      {exportHref && total > 0 ? (
        <span className="flex flex-col items-end">
          <a href={exportHref} download className="inline-flex min-h-9 items-center gap-1.5 text-primary hover:underline">
            <Download aria-hidden="true" className="size-4" />
            {fr.lists.export}
          </a>
          {total > EXPORT_MAX_ROWS ? (
            <span className="text-xs text-muted">{fr.lists.exportCapped(EXPORT_MAX_ROWS.toLocaleString("fr-TN"))}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  href,
  label = fr.lists.pagination,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
  /** Distinct name when a page has several paginated lists. */
  label?: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className="mt-4 flex items-center justify-between gap-2 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonClasses("secondary")} rel="prev">
          <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
          {fr.lists.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">{fr.lists.pageOf(page, pages)}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={buttonClasses("secondary")} rel="next">
          {fr.lists.next}
          <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
