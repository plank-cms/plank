DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM plank_content_types LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'localized'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN localized JSONB NOT NULL DEFAULT ''{}''::jsonb', tbl);
    END IF;

    -- Create a per-table GIN index for localized to improve JSONB queries
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING GIN (localized)', 'idx_' || tbl || '_localized_gin', tbl);
  END LOOP;
END;
$$;
