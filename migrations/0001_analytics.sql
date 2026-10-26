-- Daily counters: one row per (day, site, metric). Metrics look like
-- "pageview", "visitor", "bot", "preview:whatsapp", "country:IN", "event:demo".
CREATE TABLE IF NOT EXISTS daily (
  day TEXT NOT NULL,
  site TEXT NOT NULL,
  metric TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, site, metric)
);

-- Salted daily hashes used only to count unique visitors. The salt makes them
-- irreversible and the day makes them unlinkable across days; pruned after 35 days.
CREATE TABLE IF NOT EXISTS visitors (
  day TEXT NOT NULL,
  site TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (day, site, id)
);
