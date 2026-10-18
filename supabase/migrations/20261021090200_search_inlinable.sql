-- SoukPilot — Phase C (audit finding P3): let the planner inline the
-- read-only search functions.
--
-- A SET clause on an SQL function (here `search_path = ''`) prevents Postgres
-- from inlining it into the calling query, so it was planned with generic
-- parameters instead of the caller's constants: text search over 10 000
-- articles took 212 ms, 64 ms once inlined (same rows, measured on the
-- synthetic sp_perf database).
--
-- Why removing the SET is safe for THESE functions:
--   * they are SECURITY INVOKER: they run with the caller's privileges and
--     RLS, so a manipulated search_path could only affect the caller;
--   * every table and helper they use is schema-qualified (public., private.,
--     extensions.), and pg_catalog is always searched first for built-ins;
--   * SECURITY DEFINER functions keep `set search_path = ''` (asserted by
--     tests/db/search.test.ts).
-- Supabase's linter reports these six as "function_search_path_mutable";
-- that is expected and documented in docs/DATABASE_SCHEMA.md.
-- Function bodies are unchanged.

alter function public.search_products(uuid, text, uuid, boolean, integer, integer, text) reset search_path;
alter function public.search_variants(uuid, text, uuid, integer) reset search_path;
alter function public.stock_overview(uuid, uuid, text, boolean, integer, integer, text) reset search_path;
alter function public.search_customers(uuid, text, boolean, text, integer, integer) reset search_path;
alter function public.search_sales(uuid, text, date, date, uuid, boolean, text, text, integer, integer) reset search_path;
alter function public.global_search(uuid, text, integer) reset search_path;
