CREATE TABLE IF NOT EXISTS plank_folders (
  id         TEXT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  parent_id  TEXT REFERENCES plank_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE plank_media ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES plank_folders(id) ON DELETE SET NULL;
