-- 023 seeded a "Simple Icons" row pointing at https://simpleicons.org with
-- scraper_type = 'simpleicons', but no scraper is registered for that key so
-- the row can never actually fetch anything. Remove it on fresh DBs while
-- protecting any user-edited row: only drop if it still looks like the
-- pristine 023 seed (never fetched, totals = 0, scraper_type untouched).

DELETE FROM icon_asset_sources
WHERE name = 'Simple Icons'
  AND scraper_type = 'simpleicons'
  AND site_url = 'https://simpleicons.org'
  AND total_fetched = 0
  AND last_fetched_at IS NULL;
