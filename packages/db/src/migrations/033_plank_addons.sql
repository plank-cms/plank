CREATE TABLE IF NOT EXISTS plank_addons (
  id                 VARCHAR(128) PRIMARY KEY,
  package_name       VARCHAR(255) NOT NULL UNIQUE,
  name               VARCHAR(255) NOT NULL,
  version            VARCHAR(64),
  plank_range        VARCHAR(128),
  description        TEXT,
  installed          BOOLEAN NOT NULL DEFAULT FALSE,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  compatible         BOOLEAN NOT NULL DEFAULT FALSE,
  has_admin_ui       BOOLEAN NOT NULL DEFAULT FALSE,
  settings_namespace VARCHAR(128),
  slots_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plank_addons_installed_idx
  ON plank_addons (installed);

CREATE INDEX IF NOT EXISTS plank_addons_enabled_idx
  ON plank_addons (enabled);
