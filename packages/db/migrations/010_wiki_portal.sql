-- Wiki v3 portal: curated/manual articles and revision history.
CREATE TABLE IF NOT EXISTS wiki_articles (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'guides',
  summary text,
  content text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PUBLISHED',
  article_type text NOT NULL DEFAULT 'MANUAL',
  sort_order integer NOT NULL DEFAULT 0,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE(guild_id,slug)
);
CREATE INDEX IF NOT EXISTS wiki_articles_category_idx ON wiki_articles(guild_id,category,status,sort_order,title);

CREATE TABLE IF NOT EXISTS wiki_article_revisions (
  id uuid PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  summary text,
  content text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  edited_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS wiki_article_revisions_article_idx ON wiki_article_revisions(article_id,created_at DESC);
