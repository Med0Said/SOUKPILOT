"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, CornerDownLeft, FileText, Package, Search, ShoppingCart, Truck, UserRound, Zap, type LucideIcon } from "lucide-react";
import type { SearchResult } from "@/app/app/search/route";
import { fr } from "@/i18n/fr";

export type PaletteCommand = { id: string; group: "goTo" | "actions"; label: string; href: string; keywords?: string };

type Item = { id: string; group: "goTo" | "actions" | "results"; label: string; detail?: string | null; href: string; icon: LucideIcon };

const KIND_ICON: Record<SearchResult["kind"], LucideIcon> = {
  product: Package,
  customer: UserRound,
  supplier: Building2,
  sale: ShoppingCart,
  purchase_order: Truck,
};

/** Lower case without accents, for local matching ("creme" = "Crème"). */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Ctrl/Cmd+K command palette: pages and actions (filtered locally) and live
 * data results from /app/search. Native <dialog> (focus trap, Esc, inert
 * background) with the ARIA combobox / listbox pattern.
 */
const OPEN_EVENT = "sp:open-palette";

/** A button that opens the (single) palette mounted by the app shell. */
export function PaletteTrigger({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = fr.palette;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={className}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      aria-label={compact ? t.open : undefined}
      title={`${t.open} (${t.shortcut})`}
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      {compact ? null : (
        <>
          <span className="flex-1 text-start">{t.open}</span>
          <kbd className="rounded border border-border px-1.5 font-sans text-[11px] text-muted">{t.shortcut}</kbd>
        </>
      )}
    </button>
  );
}

export function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const t = fr.palette;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = useState(0);

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    inputRef.current?.select();
  }

  function close() {
    dialogRef.current?.close();
  }

  // Ctrl/Cmd+K anywhere, or a PaletteTrigger click.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialogRef.current?.open) close();
        else open();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, open);
    };
  }, []);

  function search(value: string) {
    setQuery(value);
    setActive(0);
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    if (value.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await fetch(`/app/search?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { results: SearchResult[] };
        setResults(body.results);
        setStatus("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 200);
  }

  const items = useMemo<Item[]>(() => {
    const needle = normalize(query.trim());
    const local = commands
      .filter((c) => !needle || normalize(`${c.label} ${c.keywords ?? ""}`).includes(needle))
      .map((c) => ({ id: c.id, group: c.group, label: c.label, href: c.href, icon: c.group === "actions" ? Zap : FileText }));
    const remote = results.map((r) => ({
      id: `${r.kind}:${r.id}`,
      group: "results" as const,
      label: r.label,
      detail: [t.kinds[r.kind], r.detail].filter(Boolean).join(" · "),
      href: r.href,
      icon: KIND_ICON[r.kind],
    }));
    // Data results first when searching: that is usually what is wanted.
    return needle ? [...remote, ...local] : local;
  }, [commands, query, results, t.kinds]);

  const activeIndex = Math.min(active, Math.max(items.length - 1, 0));

  function go(item: Item | undefined) {
    if (!item) return;
    close();
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % Math.max(items.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeIndex - 1 + items.length) % Math.max(items.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(items[activeIndex]);
    }
  }

  const groups: { key: Item["group"]; title: string }[] = [
    { key: "results", title: t.results },
    { key: "actions", title: t.actions },
    { key: "goTo", title: t.goTo },
  ];
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <>

      <dialog
        ref={dialogRef}
        aria-label={t.title}
        className="mx-auto mt-[10vh] w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-0 text-foreground shadow-2xl backdrop:bg-black/40"
        onClose={() => {
          abort.current?.abort();
          if (timer.current) clearTimeout(timer.current);
        }}
      >
        {/* The field is the dialog's only control: its focus shows as a coloured divider. */}
        <div className="flex items-center gap-2 border-b-2 border-border px-3 focus-within:border-primary">
          <Search aria-hidden="true" className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items.length ? optionId(activeIndex) : undefined}
            aria-label={t.label}
            placeholder={t.placeholder}
            autoComplete="off"
            spellCheck={false}
            className="min-h-12 flex-1 bg-transparent text-base outline-none focus-visible:outline-none"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          <ul id={listId} role="listbox" aria-label={t.title}>
            {groups.map((g) => {
              const entries = items.map((item, index) => ({ item, index })).filter(({ item }) => item.group === g.key);
              if (entries.length === 0) return null;
              return (
                <li key={g.key} role="presentation">
                  <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted" aria-hidden="true">
                    {g.title}
                  </p>
                  <ul role="group" aria-label={g.title}>
                    {entries.map(({ item, index }) => (
                      <li
                        key={item.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseMove={() => setActive(index)}
                        onClick={() => go(item)}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm ${
                          index === activeIndex ? "bg-primary-soft text-primary" : ""
                        }`}
                      >
                        <item.icon aria-hidden="true" className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.label}</span>
                          {item.detail ? <span className="block truncate text-xs text-muted">{item.detail}</span> : null}
                        </span>
                        {index === activeIndex ? <CornerDownLeft aria-hidden="true" className="size-3.5" /> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <p className="px-2 py-2 text-sm text-muted" role="status" aria-live="polite">
            {status === "loading"
              ? t.searching
              : status === "error"
                ? t.error
                : query.trim().length < 2
                  ? t.minChars
                  : items.length === 0
                    ? t.noResults
                    : ""}
          </p>
        </div>
        <p className="hidden border-t border-border px-3 py-2 text-xs text-muted sm:block">{t.hint}</p>
      </dialog>
    </>
  );
}
