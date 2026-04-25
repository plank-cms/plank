CREATE TABLE IF NOT EXISTS plank_webhooks (
  id         TEXT         NOT NULL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  url        TEXT         NOT NULL,
  events     TEXT[]       NOT NULL DEFAULT '{}',
  enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);
