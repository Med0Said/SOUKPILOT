"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import type { Theme } from "@/lib/ui/preferences";
import { applyTheme } from "@/lib/ui/browser-preferences";
import { fr } from "@/i18n/fr";

const OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: fr.ui.theme.light },
  { value: "dark", icon: Moon, label: fr.ui.theme.dark },
  { value: "system", icon: Monitor, label: fr.ui.theme.system },
];

/** Segmented light / dark / system switch. Applies instantly and remembers the choice. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  function choose(value: Theme) {
    setTheme(value);
    applyTheme(value);
  }

  return (
    <div role="radiogroup" aria-label={fr.ui.theme.label} className="inline-flex rounded-lg border border-border bg-background p-0.5">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={`inline-flex size-9 items-center justify-center rounded-md transition-colors ${
            theme === value ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          <Icon aria-hidden="true" className="size-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
