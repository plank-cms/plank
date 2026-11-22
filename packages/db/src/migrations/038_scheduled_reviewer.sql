DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM plank_content_types LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS _scheduled_reviewer_id TEXT REFERENCES plank_users(id) ON DELETE SET NULL',
        tbl
      );
    END IF;
  END LOOP;
END;
$$;
