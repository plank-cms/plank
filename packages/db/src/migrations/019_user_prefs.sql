CREATE TABLE IF NOT EXISTS plank_user_prefs (
  user_id    TEXT NOT NULL REFERENCES plank_users(id) ON DELETE CASCADE,
  key        VARCHAR(255) NOT NULL,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
