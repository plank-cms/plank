CREATE TABLE IF NOT EXISTS plank_mcp_oauth_clients (
  client_id          TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  client_secret_hash TEXT NOT NULL,
  redirect_uri       TEXT NOT NULL
);

ALTER TABLE plank_mcp_oauth_grants
  ADD CONSTRAINT plank_mcp_oauth_grants_client_fk
  FOREIGN KEY (client_id) REFERENCES plank_mcp_oauth_clients(client_id) ON DELETE CASCADE NOT VALID;

CREATE INDEX IF NOT EXISTS idx_plank_mcp_oauth_grants_client_id
  ON plank_mcp_oauth_grants(client_id);
