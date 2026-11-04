-- =====================================================================
-- 012_ask_archive.sql
-- 1. Chunk-level hybrid RRF search (semantic + keyword) for "Ask the archive"
-- 2. Allow 'answer' in public.llm_cache task check constraint
-- =====================================================================

alter table public.llm_cache drop constraint if exists llm_cache_task_check;
alter table public.llm_cache add constraint llm_cache_task_check
  check (task in ('ocr', 'extract', 'parse_query', 'embed', 'plan_journey', 'narrate_journey', 'answer'));

drop function if exists public.search_chunks(vector, text, int);

create or replace function public.search_chunks(
  query_embedding vector(768) default null,
  query_text      text        default null,
  match_count     int         default 8
)
returns table (
  chunk_id        uuid,
  site_id         uuid,
  site_name       text,
  site_slug       text,
  asset_id        uuid,
  asset_kind      text,
  chunk_index     int,
  text_en         text,
  text_original   text,
  language        text,
  semantic_sim    real,
  kw_rank         real,
  rrf_score       real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select least(greatest(coalesce(match_count, 8), 1), 20) as match_count
  ),
  semantic_candidate_limit as (
    select greatest((select match_count from params) * 6, 30) as n
  ),

  -- Published sites only
  published_sites as (
    select id, name_en, slug, district, state
    from public.sites
    where status = 'published'
  ),

  -- Signal 1: semantic ANN search on doc_chunks (ignoring placeholder embeddings)
  semantic_chunks as (
    select
      c.id as chunk_id,
      c.site_id,
      c.asset_id,
      c.chunk_index,
      c.text_en,
      c.text_original,
      c.language,
      (1 - (c.embedding <=> query_embedding))::real as sim
    from public.doc_chunks c
    join published_sites s on s.id = c.site_id
    where query_embedding is not null
      and c.embedding is not null
      and c.embedding_model is distinct from 'placeholder'
    order by c.embedding <=> query_embedding
    limit (select n from semantic_candidate_limit)
  ),
  semantic_ranked as (
    select
      chunk_id,
      sim,
      row_number() over (order by sim desc) as rnk
    from semantic_chunks
  ),

  -- Signal 2: keyword search via GIN on doc_chunks.tsv and site metadata
  query_prep as (
    select
      websearch_to_tsquery('english', query_text) as strict_tsq,
      case
        when query_text is null or btrim(query_text) = '' then null
        when plainto_tsquery('english', query_text)::text = '' then null
        else to_tsquery('english', replace(plainto_tsquery('english', query_text)::text, '&', '|'))
      end as loose_tsq,
      btrim(query_text) as raw_q
    where query_text is not null and btrim(query_text) <> ''
  ),
  keyword_chunks as (
    select
      c.id as chunk_id,
      (
        coalesce(ts_rank_cd(c.tsv, qp.strict_tsq) * 2.0, 0.0)
        + coalesce(ts_rank_cd(c.tsv, qp.loose_tsq), 0.0)
        + case
            when s.name_en ilike '%' || qp.raw_q || '%' then 2.0
            when qp.raw_q ilike '%' || s.name_en || '%' then 1.5
            when s.district is not null and qp.raw_q ilike '%' || s.district || '%' then 1.0
            else 0.0
          end
      )::real as rank
    from public.doc_chunks c
    join published_sites s on s.id = c.site_id
    cross join query_prep qp
    where (qp.strict_tsq is not null and c.tsv @@ qp.strict_tsq)
       or (qp.loose_tsq is not null and c.tsv @@ qp.loose_tsq)
       or (s.name_en ilike '%' || qp.raw_q || '%')
       or (length(qp.raw_q) >= 4 and qp.raw_q ilike '%' || s.name_en || '%')
       or (s.district is not null and length(s.district) >= 3 and qp.raw_q ilike '%' || s.district || '%')
    order by rank desc
    limit 50
  ),
  keyword_ranked as (
    select
      chunk_id,
      rank,
      row_number() over (order by rank desc) as rnk
    from keyword_chunks
  ),

  all_candidates as (
    select chunk_id from semantic_ranked
    union
    select chunk_id from keyword_ranked
  ),

  fused as (
    select
      ac.chunk_id,
      sr.sim as semantic_sim,
      kr.rank as kw_rank,
      (coalesce(1.0 / (60 + sr.rnk), 0.0) + coalesce(1.0 / (60 + kr.rnk), 0.0))::real as rrf_score
    from all_candidates ac
    left join semantic_ranked sr on sr.chunk_id = ac.chunk_id
    left join keyword_ranked kr on kr.chunk_id = ac.chunk_id
  )
  select
    c.id as chunk_id,
    c.site_id,
    s.name_en as site_name,
    s.slug as site_slug,
    c.asset_id,
    a.kind as asset_kind,
    c.chunk_index,
    c.text_en,
    c.text_original,
    c.language,
    f.semantic_sim,
    f.kw_rank,
    f.rrf_score
  from fused f
  join public.doc_chunks c on c.id = f.chunk_id
  join public.sites s on s.id = c.site_id
  left join public.assets a on a.id = c.asset_id
  order by f.rrf_score desc
  limit (select match_count from params);
$$;

revoke all on function public.search_chunks(vector, text, int) from public;
grant execute on function public.search_chunks(vector, text, int) to anon, authenticated, service_role;
