# SoukPilot — Performance ledger

Every optimisation attempt, kept or reverted, so a dead idea is not tried
twice. Measured on the synthetic `sp_perf` database (local Supabase Postgres
17: 10 000 articles, 16 667 variants, 50 000 sales, 100 001 sale lines,
4 000 customers, 100 001 stock movements), as the owner with RLS on, median
of 5 runs after a warm-up. Rule: a change that does not beat run-to-run
variance is reverted.

| Date | Idea | Baseline → result | Verdict | Why |
| --- | --- | --- | --- | --- |
| 2026-10-18 | P2: SELECT policies compare `organization_id` with the caller's organizations computed once (`member_org_ids()`), instead of a membership function per row | count of 50k sales 246 → 6 ms; sales list 365 → 54 ms; movements page 517 → 30 ms | kept | The per-row function (≈5 µs) dominated every list and count |
| 2026-10-18 | P1: `report_sales_by_day` aggregates each day once instead of seven correlated subqueries per day | 365 days 13 507 → 92 ms | kept | Cost grew with days × sales |
| 2026-10-18 | P3a: `search_products` with one LATERAL aggregate per article instead of three variant subqueries | "creme" 198 → 198 ms; empty search 25 → 48 ms | reverted | Not the bottleneck |
| 2026-10-18 | P3b: `private.search_key` without its SET clause (inlinable) | "creme" 211 → 213 ms (±5 %) | reverted | Within noise: the per-row call was not the bottleneck |
| 2026-10-18 | P3c: UNION of name match and SKU/barcode match so the trigram index can be used | match step 40 → 56 ms | reverted | With 10 % of articles matching, a sequential scan is cheaper than the index |
| 2026-10-18 | P3: remove the SET clause from the six SECURITY INVOKER search functions so the planner inlines them with the caller's constants | "creme" 212 → 63 ms; variants "robe" 267 → 70 ms; customers "leila" 63 → 11 ms; sales page 200 109 → 41 ms | kept | A SET clause prevents inlining; generic plans could not fold `q = ''` nor the pattern |
