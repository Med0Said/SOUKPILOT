# SoukPilot — Product Specification (MVP)

Product name is provisional. Last updated 2026-10-13.

## Target customer

Independent Tunisian retailers — clothing & footwear, cosmetics & beauty,
small general goods — with 1–15 employees, usually one shop (multi-location in
the architecture), currently on spreadsheets, notebooks or disconnected apps.

**Value proposition**: « Gérez vos articles, votre stock, vos achats, vos ventes
et vos marges depuis un seul outil simple, sur téléphone ou ordinateur. »

## Hypotheses to validate (not facts)

- Retailers will pay a monthly subscription in TND. Provisional prices:
  Solo 39 TND, Business 69 TND, Multi-shop 119 TND per month.
- Mobile-first stock counting and product lookup are the most valued workflows.
- Spreadsheet import is decisive for onboarding.

## MVP scope

Modules A–H as defined in the master brief: authentication & organizations,
products & variants, inventory ledger, sales & payments, purchasing &
suppliers, customers, cash & expenses (operational, **not** an accounting
ledger), reports (gross margin is **estimated** and is not net profit).

## Priority mobile workflows

1. Search a product · 2. Check stock · 3. Receive stock · 4. Count stock ·
5. Record a sale · 6. Review daily sales.

## Explicit non-goals for the MVP

- Offline sales (not claimed until sync, conflict resolution and offline data security exist).
- Fiscal invoices, VAT declarations, e-invoicing or any legal-compliance claim
  (requires verified Tunisian rules and qualified local review first).
- Native Android app (responsive web + PWA instead).
- Payment-provider integration (until eligibility, pricing, webhooks and terms are verified).
- Hard-coded tax rates.

## Localization

French UI first; TND with millime precision; organization timezone (default
`Africa/Tunis`); Tunisian phone numbers stored as free text; Arabic/RTL prepared
but not supported until fully translated and tested.

## Roles

- **Propriétaire (owner)**: everything, including settings, members, (later) subscription.
- **Gérant (manager)**: day-to-day operations, invite cashiers, view audit log.
- **Caissier (cashier)**: (later) sales and stock lookup; no settings, no audit.

## Milestone 1 user-visible features

Sign up (with email confirmation), log in/out, forgot/reset password, create an
organization (with default shop), switch between organizations, edit
organization name/timezone (owner), list members, change roles / remove
members (owner), invite by email (owner/manager; invitee accepts after signing
in with the same confirmed email), edit own profile. The dashboard shows no
business figures until real data exists.
