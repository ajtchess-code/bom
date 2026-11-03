CREATE TABLE IF NOT EXISTS clash_village_imports(
 guild_id text NOT NULL,account_id text NOT NULL,owner_id text NOT NULL,exported_at timestamptz NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),source_hash text NOT NULL,normalized jsonb NOT NULL,
 PRIMARY KEY(guild_id,account_id)
);
CREATE TABLE IF NOT EXISTS clash_tool_documents(
 id uuid PRIMARY KEY,guild_id text NOT NULL,owner_id text NOT NULL,kind text NOT NULL,title text NOT NULL,
 body text NOT NULL DEFAULT '',visibility text NOT NULL DEFAULT 'CLAN' CHECK(visibility IN('PRIVATE','CLAN','OFFICERS')),
 payload jsonb NOT NULL DEFAULT '{}',revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clash_tool_documents_scope ON clash_tool_documents(guild_id,kind,updated_at DESC);
CREATE TABLE IF NOT EXISTS clash_tool_comments(
 id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES clash_tool_documents(id) ON DELETE CASCADE,
 user_id text NOT NULL,seconds integer,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS clash_tool_ratings(
 document_id uuid NOT NULL REFERENCES clash_tool_documents(id) ON DELETE CASCADE,user_id text NOT NULL,
 score integer NOT NULL CHECK(score BETWEEN 1 AND 5),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,user_id)
);
CREATE TABLE IF NOT EXISTS clash_tool_enrollments(
 document_id uuid NOT NULL REFERENCES clash_tool_documents(id) ON DELETE CASCADE,user_id text NOT NULL,
 account_id text NOT NULL,role text NOT NULL DEFAULT 'PARTICIPANT',progress integer NOT NULL DEFAULT 0 CHECK(progress>=0),
 note text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,user_id,account_id)
);
