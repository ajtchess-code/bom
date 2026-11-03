-- Preserve explicitly configured guilds/treaties and alliances; remove bloc grouping.
-- Guilds that merely appeared automatically in the old chart are not opted in.
UPDATE wosb_diplomacy d SET data=(d.data-'blocs')||jsonb_build_object(
 'trackedGuilds',COALESCE(d.data->'trackedGuilds',(SELECT COALESCE(jsonb_agg(DISTINCT ref),'[]'::jsonb) FROM (
 SELECT m->>'guildTag' AS ref FROM jsonb_array_elements(COALESCE(d.data->'memberships','[]'::jsonb)) m
 UNION ALL SELECT substring(r->>'from' FROM 7) FROM jsonb_array_elements(COALESCE(d.data->'relations','[]'::jsonb)) r WHERE r->>'from' LIKE 'guild:%'
 UNION ALL SELECT substring(r->>'to' FROM 7) FROM jsonb_array_elements(COALESCE(d.data->'relations','[]'::jsonb)) r WHERE r->>'to' LIKE 'guild:%'
 ) explicit_refs WHERE ref IS NOT NULL)),
 'alliances',(SELECT COALESCE(jsonb_agg(a-'blocId'),'[]'::jsonb) FROM jsonb_array_elements(COALESCE(d.data->'alliances','[]'::jsonb)) a)),
 revision=revision+1,updated_at=now()
WHERE d.data ? 'blocs' OR NOT d.data ? 'trackedGuilds' OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(d.data->'alliances','[]'::jsonb)) a WHERE a ? 'blocId');
ALTER TABLE wosb_diplomacy ALTER COLUMN data SET DEFAULT '{"trackedGuilds":[],"alliances":[],"memberships":[],"relations":[]}'::jsonb;
