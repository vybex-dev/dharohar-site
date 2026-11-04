-- =====================================================================
-- 013_multilingual_search.sql
-- Cross-lingual search support: Hindi/Gujarati/Devanagari
--
-- 1. Add name_local_tsv (simple config, for non-English names) on sites
-- 2. Add text_original_tsv (simple config) on doc_chunks
-- 3. search_sites_multilingual(): variant of search_sites() that searches
--    the original-script columns with a 'simple' text config and an optional
--    secondary embedding for the original-language query text.
--
-- =====================================================================

-- 1. sites.name_local_tsv — simple tsvector (no English stemming) over name_local
alter table public.sites
  add column if not exists name_local_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(name_local, ''))) stored;

create index if not exists sites_name_local_tsv_gin
  on public.sites using gin (name_local_tsv);

-- 2. doc_chunks.text_original_tsv — simple tsvector over text_original
alter table public.doc_chunks
  add column if not exists text_original_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(text_original, ''))) stored;

create index if not exists doc_chunks_text_original_tsv_gin
  on public.doc_chunks using gin (text_original_tsv);

-- 3. search_sites_multilingual
-- Identical structure to search_sites() (sql/008_search_v2.sql) but:
--   a. Uses query_embedding (original-script) for ANN (same column)
--   b. Uses 'simple' tsquery on name_local (sites) + text_original (doc_chunks)
--      for keyword signal — this matches Devanagari / Gujarati tokens without
--      English stemming stripping the characters.
--   c. Returns the same columns so the API can merge results easily.

drop function if exists public.search_sites_multilingual(vector, text, geography, int, jsonb, int, text[], text[], text[], real);

create or replace function public.search_sites_multilingual(
  query_embedding      vector(768)             default null,
  query_text_original  text                    default null,
  center               geography(point, 4326)  default null,
  radius_m             int                     default null,
  filters              jsonb                   default '{}'::jsonb,
  match_count          int                     default 20,
  filter_types         text[]                  default null,
  filter_crafts        text[]                  default null,
  filter_eras          text[]                  default null,
  min_similarity       real                    default 0.45
)
returns table (
  site_id          uuid,
  slug             text,
  name             text,
  type             text,
  era              text,
  era_bucket       text,
  state            text,
  district         text,
  crafts           text[],
  lat              double precision,
  lng              double precision,
  snippet          text,
  distance_m       double precision,
  semantic_sim     real,
  score            real,
  matched_signals  text[]
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select least(greatest(coalesce(match_count, 20), 1), 100) as match_count
  ),
  semantic_candidate_limit as (
    select greatest((select match_count from params) * 10, 50) as n
  ),

  filtered_sites as (
    select s.*
    from public.sites s
    where s.status = 'published'
      and ((filters ->>'type') is null or s.category = (filters ->>'type'))
      and ((filters ->>'era')  is null or s.period ilike '%' || (filters ->>'era') || '%')
      and (filter_types is null or cardinality(filter_types) = 0
           or s.category = any(filter_types))
      and (filter_eras is null or cardinality(filter_eras) = 0
           or public.era_bucket(s.period) = any(filter_eras))
      and (filter_crafts is null or cardinality(filter_crafts) = 0
           or exists (select 1 from unnest(s.crafts) cr where lower(cr) = any(filter_crafts)))
      and (center is null or radius_m is null or s.location is null
           or ST_DWithin(s.location, center, radius_m::double precision))
  ),

  -- Signal 1: ANN on doc_chunks (same embedding column, using original-script query vector)
  semantic_chunks as (
    select c.site_id, c.text_en, 1 - (c.embedding <=> query_embedding) as sim
    from public.doc_chunks c
    where query_embedding is not null
      and c.embedding is not null
      and c.embedding_model is distinct from 'placeholder'
    order by c.embedding <=> query_embedding
    limit (select n from semantic_candidate_limit)
  ),
  semantic as (
    select
      sc.site_id,
      max(sc.sim) as sim,
      (array_agg(sc.text_en order by sc.sim desc))[1] as best_text
    from semantic_chunks sc
    join filtered_sites s on s.id = sc.site_id
    where sc.sim >= coalesce(min_similarity, 0.45)
    group by sc.site_id
  ),
  semantic_ranked as (
    select site_id, sim, best_text, row_number() over (order by sim desc) as rnk
    from semantic
  ),

  -- Signal 2: keyword on ORIGINAL SCRIPT using 'simple' config
  -- Sources: sites.name_local_tsv OR doc_chunks.text_original_tsv
  kw_tsq as (
    select websearch_to_tsquery('simple', query_text_original) as q
    where query_text_original is not null and btrim(query_text_original) <> ''
  ),
  -- 2a: site name_local match (direct site hit)
  kw_site as (
    select s.id as site_id, ts_rank_cd(s.name_local_tsv, kw_tsq.q) as rank
    from filtered_sites s, kw_tsq
    where s.name_local_tsv @@ kw_tsq.q
  ),
  -- 2b: chunk text_original match
  kw_chunk as (
    select c.site_id, max(ts_rank_cd(c.text_original_tsv, kw_tsq.q)) as rank
    from public.doc_chunks c
    join filtered_sites s on s.id = c.site_id, kw_tsq
    where c.text_original_tsv @@ kw_tsq.q
    group by c.site_id
  ),
  keyword_combined as (
    select site_id, max(rank) as kw_rank
    from (
      select site_id, rank from kw_site
      union all
      select site_id, rank from kw_chunk
    ) all_kw
    group by site_id
  ),
  keyword_ranked as (
    select site_id, kw_rank, row_number() over (order by kw_rank desc) as rnk
    from keyword_combined
  ),

  -- Signal 3: geographic proximity
  geo as (
    select s.id as site_id, ST_Distance(s.location, center) as dist_m
    from filtered_sites s
    where center is not null and s.location is not null
  ),
  geo_ranked as (
    select site_id, dist_m, row_number() over (order by dist_m asc) as rnk
    from geo
  ),

  candidates as (
    select site_id from semantic_ranked
    union
    select site_id from keyword_ranked
    union
    select site_id from geo_ranked
  ),

  fused as (
    select
      c.site_id,
      sr.rnk  as semantic_rnk,
      sr.sim  as semantic_sim,
      kr.rnk  as keyword_rnk,
      gr.rnk  as geo_rnk,
      coalesce(1.0 / (60 + sr.rnk), 0)
        + coalesce(1.0 / (60 + kr.rnk), 0)
        + coalesce(1.0 / (60 + gr.rnk), 0) as rrf_score,
      -- For snippet: prefer best semantic chunk text (no original-script snippet in UI yet)
      coalesce(left(sr.best_text, 240), '') as snippet_src,
      gr.dist_m
    from candidates c
    left join semantic_ranked sr on sr.site_id = c.site_id
    left join keyword_ranked  kr on kr.site_id = c.site_id
    left join geo_ranked      gr on gr.site_id = c.site_id
  )

  select
    f.site_id,
    s.slug,
    s.name_en                                            as name,
    s.category                                           as type,
    s.period                                             as era,
    public.era_bucket(s.period)                          as era_bucket,
    s.state,
    s.district,
    s.crafts,
    st_y(s.location::geometry)                           as lat,
    st_x(s.location::geometry)                           as lng,
    coalesce(f.snippet_src, left(s.summary_en, 240), '') as snippet,
    f.dist_m                                             as distance_m,
    f.semantic_sim::real                                 as semantic_sim,
    f.rrf_score::real                                    as score,
    array_remove(array[
      case when f.semantic_rnk is not null then 'semantic' end,
      case when f.keyword_rnk  is not null then 'keyword'  end,
      case when f.geo_rnk      is not null then 'geo'      end
    ], null)                                             as matched_signals
  from fused f
  join public.sites s on s.id = f.site_id
  order by f.rrf_score desc, s.name_en asc
  limit (select match_count from params);
$$;

revoke all on function public.search_sites_multilingual(vector, text, geography, int, jsonb, int, text[], text[], text[], real)
  from public;
grant execute on function public.search_sites_multilingual(vector, text, geography, int, jsonb, int, text[], text[], text[], real)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
