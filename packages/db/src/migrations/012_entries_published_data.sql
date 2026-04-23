DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM plank_content_types LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'published_data'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN published_data JSONB', tbl);
    END IF;
  END LOOP;
END;
$$;
