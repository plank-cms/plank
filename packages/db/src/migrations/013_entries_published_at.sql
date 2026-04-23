DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM plank_content_types LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'published_at'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN published_at TIMESTAMP', tbl);
    END IF;
  END LOOP;
END;
$$;
