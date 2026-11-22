ALTER TABLE plank_api_tokens
  DROP CONSTRAINT plank_api_tokens_created_by_fkey,
  ADD CONSTRAINT plank_api_tokens_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES plank_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_plank_api_tokens_created_by
  ON plank_api_tokens(created_by);

ALTER TABLE plank_mcp_oauth_clients
  ADD COLUMN owner_id TEXT REFERENCES plank_users(id) ON DELETE CASCADE,
  ADD CONSTRAINT plank_mcp_oauth_clients_owner_required CHECK (owner_id IS NOT NULL) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_plank_mcp_oauth_clients_owner_id
  ON plank_mcp_oauth_clients(owner_id);
