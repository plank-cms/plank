CREATE TABLE IF NOT EXISTS plank_password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES plank_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at    TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plank_password_reset_tokens_user_id
  ON plank_password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_plank_password_reset_tokens_expires_at
  ON plank_password_reset_tokens(expires_at);
