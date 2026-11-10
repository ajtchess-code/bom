-- Screenshot builds replace the old fitting editor; old ship_builds remain archived data.
CREATE TABLE IF NOT EXISTS build_library_folders (
 id uuid PRIMARY KEY, guild_id text NOT NULL, owner_id text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('PERSONAL','GUILD')), name text NOT NULL,
 parent_id uuid REFERENCES build_library_folders(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS build_library_folder_access ON build_library_folders(guild_id,scope,owner_id);
CREATE TABLE IF NOT EXISTS build_library_entries (
 id uuid PRIMARY KEY, guild_id text NOT NULL, owner_id text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('PERSONAL','GUILD')),
 folder_id uuid REFERENCES build_library_folders(id) ON DELETE RESTRICT,
 ship_key text NOT NULL, ship_name text NOT NULL, rate integer NOT NULL,
 title text NOT NULL, description text NOT NULL DEFAULT '',
 screenshot bytea NOT NULL, revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS build_library_entry_access ON build_library_entries(guild_id,scope,owner_id);
