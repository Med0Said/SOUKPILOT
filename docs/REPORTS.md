# SoukPilot — Reports & dashboards (Milestone 6, modernization phase 3)

Every figure on the dashboard and on **Rapports** comes from live data through
read-only SQL functions (`supabase/migrations/20261019090000_reports.sql`). No
placeholder numbers are ever shown. These reports are management figures,
**not accounting**.

## Who sees what

| Screen | Owner / manager | Cashier |
| --- | --- | --- |
| Dashboard — today (sales, net, collected, average basket) | ✅ | ✅ (same figures as the Ventes daily summary) |
| Dashboard — last 7 days chart, "À traiter" list | ✅ | — |
| Rapports page and its CSV exports | ✅ | — (page refused, export 403, functions raise `forbidden`) |

Report functions are `SECURITY DEFINER` with an explicit owner/manager check
(`private.require_org_role`) because they read purchase costs, which cashiers
must never see. Every query filters on the organization.

## Definitions

- **Days** are calendar days in the **organization's time zone**
  (Paramètres → Organisation). A sale at 00:30 in Tunis counts on that local
  day, whatever the server's time zone.
- **Period**: `from`–`to` inclusive, at most 367 days. Presets: today,
  yesterday, 7 days (default), 30 days, this month, last month, custom.
  "vs previous period" compares with the same number of days just before.
- A **sale** counts on the day it was **finalized**; a **return** on the day it
  was **recorded**; a **payment / refund** on the day it was **received / paid**.
  This is the same rule as the daily summary on Ventes, and a database test
  checks that `report_sales_by_day` equals `sales_daily_summary` for every day.
- **Sales total** = Σ totals of finalized sales (line and order discounts deducted).
- **Returns** = Σ amounts of returns recorded in the period.
- **Net sales** = sales total − returns.
- **Credit given** = what is still unpaid on the period's sales (never negative per sale).
- **Cost of sales** = quantity × unit cost **snapshotted when the sale was
  finalized** (the article's purchase cost at that moment), minus the same for
  returned quantities.
- **Revenue without cost** = revenue of lines whose cost was unknown (no
  purchase price set), net of their returns. It is **excluded** from cost and
  margin and shown separately, so the margin is never overstated silently.
- **Estimated gross margin** = (net sales − revenue without cost) − cost of sales.
- **Margin rate** = margin ÷ (net sales − revenue without cost).
- **Average basket** = net sales ÷ number of sales (rounded to the millime).
- **By article / by category**: lines of sales finalized in the period, minus
  the returns already recorded on those lines (whatever their date). Category =
  the article's current category. Totals here can therefore differ from "net
  sales" when a return happens in another period than its sale.
- **Collected per payment method** = payments received − refunds paid in the
  period, per method.

## "À traiter" (owners and managers)

`dashboard_attention(org)`: stock adjustments pending approval, stock counts
submitted for approval, purchase orders past their expected date and not fully
received, customers who owe money and how much. The dashboard adds supplier
balances (owed) and the number of articles in low stock.

## Charts

Hand-written SVG (no chart library): `src/components/charts/`. Geometry is
computed on the server (`barLayout`), colours come from the theme tokens, and
every chart has a text alternative plus a "Voir les chiffres" table with the
exact values. The `<svg>` is drawn by a small client component: when React
streams a large page, a chunk boundary inside server-rendered SVG produces an
inline-styled placeholder that the CSP blocks (found by the E2E CSP guard).

## CSV exports

Each report table exports to CSV (UTF-8 with BOM, `;`, amounts as decimal
dinars with a comma, formula-injection guard on text). The export reads the same
period as the page, with the user's own session (same access rules).

## Installable app (PWA)

`src/app/manifest.ts` + icons in `public/icons/` (and `src/app/apple-icon.png`):
the app can be installed on a phone's home screen or a desktop, opens on the
dashboard, with shortcuts to Nouvelle vente and Stock. **No service worker and
no offline mode, on purpose**: an offline cache could show stale stock or
prices, and sales must be recorded in the database (stock locks, numbering)
— a sale cannot be safely taken offline.
