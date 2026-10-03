-- Read-only checks and safe reporting; use execute_sql on the verified project.
select mode,evaluation_until from public.rss_quality_control;
select day,calls as reserved_attempts,calls * 65536 * 0.042 / 1000000 as jev_reserved_usd_upper_bound from public.rss_quality_budget order by day desc;
select (created_at at time zone 'UTC')::date as day,mode,stage,code,detail,field,
 count(*) as events,sum(input_tokens) as reported_input_tokens,sum(output_tokens) as reported_output_tokens,
 sum(input_tokens)*0.042/1000000 as reported_jev_input_usd
from public.rss_quality_events group by 1,2,3,4,5,6 order by 1 desc,2,3,4;
-- Missing usage is unknown, never zero. Cost here is Jev only, prices require recheck.
select status,count(*) from public.rss_article_quality group by status;
select id,cursor,next_run,jsonb_array_length(entries) as usable,
 (select count(*) from jsonb_array_elements(entries) e where e->'quality'->>'status'='approved') as approved,
 (select count(*) from jsonb_array_elements(entries) e where e->'quality'->>'eligibility'='candidate') as candidates
from public.rss_quality_feeds order by id;
select status,count(*) from public.rss_quality_eval group by status;
-- Export result rows for tools/compare-rss-quality.mjs; add source/url from cohort.json offline.
select id,result from public.rss_quality_eval where status='done' order by id;
