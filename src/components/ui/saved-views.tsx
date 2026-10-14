"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Bookmark, X } from "lucide-react";
import { fr } from "@/i18n/fr";

export type SavedView = { name: string; query: string };

const MAX_VIEWS = 10;
const CHANGE_EVENT = "sp:saved-views";

/**
 * Named filter combinations for a list, kept in this browser (localStorage,
 * per organization and list). A per-device convenience only: a view is just
 * a query string, so losing it loses nothing.
 */
function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}

function write(key: string, views: SavedView[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(views));
  } catch {
    // Storage blocked (private mode…): views simply are not kept.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function parseViews(raw: string): SavedView[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is SavedView => typeof v?.name === "string" && typeof v?.query === "string")
      .map((v) => ({ name: v.name.slice(0, 40), query: v.query.slice(0, 500) }))
      .slice(0, MAX_VIEWS);
  } catch {
    return [];
  }
}

export function SavedViews({
  organizationId,
  list,
  basePath,
  currentQuery,
}: {
  organizationId: string;
  list: string;
  basePath: string;
  /** Canonical query string of the filters on screen ("" = defaults). */
  currentQuery: string;
}) {
  const key = `sp_views:${organizationId}:${list}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "[]");
  const views = useMemo(() => parseViews(raw), [raw]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const t = fr.lists.views;
  const alreadySaved = views.some((v) => v.query === currentQuery);

  if (views.length === 0 && (currentQuery === "" || alreadySaved)) return null;

  function save(event: React.FormEvent) {
    event.preventDefault();
    const clean = name.trim().slice(0, 40);
    if (!clean || views.length >= MAX_VIEWS) return;
    write(key, [...views.filter((v) => v.name !== clean), { name: clean, query: currentQuery }]);
    setNaming(false);
    setName("");
  }

  return (
    <section aria-label={t.title} className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      {views.length > 0 ? <span className="text-muted">{t.title} :</span> : null}
      {views.map((v) => (
        <span
          key={v.name}
          className={`inline-flex items-center rounded-full border ${v.query === currentQuery ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface"}`}
        >
          <Link
            href={v.query ? `${basePath}?${v.query}` : basePath}
            aria-current={v.query === currentQuery ? "true" : undefined}
            className="inline-flex min-h-9 items-center gap-1.5 ps-3 pe-1"
          >
            <Bookmark aria-hidden="true" className="size-3.5" />
            {v.name}
          </Link>
          <button
            type="button"
            onClick={() => write(key, views.filter((x) => x.name !== v.name))}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:text-danger"
            aria-label={t.remove(v.name)}
            title={t.remove(v.name)}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      ))}
      {currentQuery !== "" && !alreadySaved && !naming ? (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-primary hover:border-primary"
        >
          <Bookmark aria-hidden="true" className="size-3.5" />
          {t.save}
        </button>
      ) : null}
      {naming ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`view-name-${list}`} className="sr-only">
            {t.name}
          </label>
          <input
            id={`view-name-${list}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            autoFocus
            placeholder={t.placeholder}
            className="min-h-9 rounded-lg border border-border bg-surface px-3"
          />
          <button type="submit" className="min-h-9 rounded-lg bg-primary px-3 font-medium text-primary-foreground" disabled={views.length >= MAX_VIEWS}>
            {t.confirm}
          </button>
          <button type="button" onClick={() => setNaming(false)} className="min-h-9 rounded-lg px-3 text-muted hover:text-foreground">
            {t.cancel}
          </button>
          {views.length >= MAX_VIEWS ? <span className="text-xs text-danger">{t.full}</span> : <span className="text-xs text-muted">{t.local}</span>}
        </form>
      ) : null}
    </section>
  );
}
