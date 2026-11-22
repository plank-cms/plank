CREATE TABLE IF NOT EXISTS plank_mcp_oauth_grants (
  code_hash       TEXT PRIMARY KEY,
  code_challenge  TEXT,
  client_id       TEXT NOT NULL,
  redirect_uri    TEXT NOT NULL,
  resource        TEXT NOT NULL,
  user_id         TEXT NOT NULL REFERENCES plank_users(id) ON DELETE CASCADE,
  session_version INTEGER NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  access_hash     TEXT UNIQUE,
  access_expires  TIMESTAMPTZ,
  refresh_hash    TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_plank_mcp_oauth_grants_expires_at
  ON plank_mcp_oauth_grants(expires_at);
