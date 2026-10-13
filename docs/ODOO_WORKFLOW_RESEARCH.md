# Odoo Workflow Research (functional reference only)

Last updated 2026-10-13.

## Scope and licensing position

- Odoo Community (https://github.com/odoo/odoo) is used as a **functional
  reference** for ERP concepts. Odoo Community source is published under
  **LGPL-3.0**; Odoo Enterprise modules are proprietary and are **never**
  consulted for code or copied.
- **No Odoo source code, data files, assets, branding or UI has been copied
  into SoukPilot.** SoukPilot's schema, SQL, TypeScript and UI are independent
  implementations.
- Milestone 1 notes below come from general knowledge of Odoo's documented
  data model. Before each later milestone, the relevant Community module will
  be reviewed at a pinned version (record: branch/tag + commit hash here), and
  only behaviours/business rules will be noted — no code transcription.

| Milestone | Odoo Community modules to review | Version reviewed |
| --- | --- | --- |
| M2 Catalog | `product` (templates, variants, attributes) | _to record_ |
| M3 Inventory | `stock` (moves, quants, inventory adjustments, locations) | _to record_ |
| M4 Sales | `sale`, `point_of_sale` (sessions, orders, payments, refunds) | _to record_ |
| M5 Purchasing | `purchase`, `stock` receipts | _to record_ |

## Concepts that influenced SoukPilot, and how we differ

| Odoo concept | What we take from it | SoukPilot implementation |
| --- | --- | --- |
| Companies + user access groups | Tenant + role separation | One `organization` per customer; 3 fixed roles; isolation by PostgreSQL RLS (Odoo uses record rules in the ORM) |
| `product.template` / `product.product` | A sellable/stockable identity per combination of attributes | `products` + `product_variants`; every product has ≥ 1 variant so stock always references a stable variant id |
| `stock.move` / `stock.quant` | Movements are the history; quants are the current balance | Append-only `stock_movements` ledger + `stock_levels` balance updated in the same transaction under row lock; reconciliation test |
| Inventory adjustments | Counted vs. theoretical quantity, applied as moves | `stock_counts` with expected-quantity snapshot; approval generates `adjustment` movements with a mandatory reason |
| Document state machines (draft → confirmed → done → cancel) | Explicit states; done documents are not edited | Draft/finalized/cancelled; corrections via reversal documents (returns, cancellations), never by editing or deleting history |
| POS sessions | Cash control per session | Lightweight `cash_sessions` (M4/M7) — expected vs. counted cash, not an accounting ledger |
| `account.payment` / partial reconciliation | Multiple payments per order; outstanding balance | `sale_payments` in integer millimes; paid/outstanding computed consistently in SQL |
| Purchase order → receipt | Ordering does not move stock; receiving does | Same rule; receipts are idempotent documents |

## Deliberate simplifications vs. Odoo

- No double-entry accounting, no multi-currency, no taxes engine (MVP).
- No routes/rules/procurement engine; no lots/serials; integer quantities.
- No generic ORM/module system — a fixed modular monolith.
