-- =====================================================================
-- 011_journey_planner.sql
-- Allow 'plan_journey' and 'narrate_journey' in public.llm_cache task check
-- =====================================================================

alter table public.llm_cache drop constraint if exists llm_cache_task_check;
alter table public.llm_cache add constraint llm_cache_task_check
  check (task in ('ocr', 'extract', 'parse_query', 'embed', 'plan_journey', 'narrate_journey'));
