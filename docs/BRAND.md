# SoukPilot — Brand & Design System (proposal, phase 1)

Status: proposed 2026-10-14, implemented as design tokens in `src/app/globals.css`.
Everything below is a proposal you can change; all colours are tokens, so a
change is one edit.

## Direction: « Sidi Bou Saïd »

Calm, trustworthy, local. Inspired by the blue doors and whitewashed walls of
Sidi Bou Saïd: a deep blue for action and identity, a terracotta accent used
sparingly, cool neutral surfaces. Professional enough for a back office,
recognisably Tunisian without folklore.

## Logo

`src/components/brand/logo.tsx` (and `src/app/icon.svg` for the browser tab):
a horseshoe-arch door (Tunisian architecture) in a rounded blue tile, with a
terracotta stud above the arch. Wordmark: **Souk** (medium) **Pilot** (semibold,
blue). Works at 16 px (favicon) and in monochrome.

## Colour tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `primary` | `#1E5BA8` | `#7AAEFF` | Buttons, links, active navigation, logo tile |
| `primary-soft` | `#E8F0FA` | `#18294D` | Selected navigation, icon chips |
| `accent` | `#C4512D` | `#F08A5D` | Logo stud, focus ring — never for large areas |
| `background` | `#F5F7FA` | `#0B1220` | Page |
| `surface` / `surface-raised` | `#FFFFFF` | `#111A2E` / `#17223A` | Cards, dialogs |
| `foreground` | `#14213D` | `#E6EAF2` | Text |
| `muted` | `#5B6478` | `#9AA4B8` | Secondary text |
| `border` | `#E2E7EF` | `#24324D` | Separators |
| `success` / `warning` / `danger` (+ `-soft`) | green / amber / red | lighter variants | Status only |

Contrast: white on `primary` ≈ 6.7:1, `foreground` on `background` > 14:1,
`muted` on `surface` ≈ 6:1 (WCAG AA for body text). Dark theme values were
chosen for the same ratios.

## Typography

Inter (self-hosted at build by `next/font`; no runtime request to Google, CSP
`font-src 'self'`), with system fallbacks and `Noto Sans Arabic` reserved for
the future Arabic interface. Amounts use `tabular-nums`.

## Components and rules

- **Themes**: light / dark / automatic (system), switch in the user menu,
  remembered in the `sp_theme` cookie and applied server-side (no flash).
- **Icons**: `lucide-react`, always `aria-hidden` next to a visible or
  screen-reader label.
- **Confirmations**: native `<dialog>` (focus trap, Esc, inert background) via
  `SubmitButton confirmMessage`; no `window.confirm`.
- **States**: `EmptyState` (icon + title + hint), `Alert` (icon + text),
  `PageSkeleton` on list pages, a shared error screen with retry.
- **Navigation**: grouped sidebar (Vente / Stock & achats), collapsible to
  icons (`sp_sidebar` cookie); phone bottom bar with the five daily workflows;
  breadcrumbs on detail pages.
- **CSP rule**: no inline `style` attributes anywhere (blocked by the policy);
  use classes or SVG presentation attributes.
- **Motion**: short (≤150 ms) and disabled with `prefers-reduced-motion`.
