ALTER TABLE plank_users
  ADD COLUMN IF NOT EXISTS public_author_slug VARCHAR(255);

DO $$
DECLARE
  usr RECORD;
  base_slug TEXT;
  next_slug TEXT;
  suffix_num INTEGER;
BEGIN
  FOR usr IN
    SELECT id, email, first_name, last_name
    FROM plank_users
    WHERE public_author_slug IS NULL OR btrim(public_author_slug) = ''
    ORDER BY created_at, id
  LOOP
    base_slug := lower(
      trim(
        both '-'
        FROM regexp_replace(
          regexp_replace(
            regexp_replace(
              coalesce(
                nullif(trim(concat_ws(' ', usr.first_name, usr.last_name)), ''),
                nullif(split_part(usr.email, '@', 1), ''),
                'author'
              ),
              '[áàäâãåÁÀÄÂÃÅ]',
              'a',
              'g'
            ),
            '[éèëêÉÈËÊ]',
            'e',
            'g'
          ),
          '\s+',
          '-',
          'g'
        )
      )
    );

    base_slug := regexp_replace(base_slug, '[íìïîÍÌÏÎ]', 'i', 'g');
    base_slug := regexp_replace(base_slug, '[óòöôõÓÒÖÔÕ]', 'o', 'g');
    base_slug := regexp_replace(base_slug, '[úùüûÚÙÜÛ]', 'u', 'g');
    base_slug := regexp_replace(base_slug, '[ñÑ]', 'n', 'g');
    base_slug := regexp_replace(base_slug, '[çÇ]', 'c', 'g');
    base_slug := regexp_replace(base_slug, '[^a-z0-9-]', '', 'g');
    base_slug := trim(both '-' FROM base_slug);

    IF base_slug IS NULL OR base_slug = '' THEN
      base_slug := 'author';
    END IF;

    next_slug := base_slug;
    suffix_num := 2;

    WHILE EXISTS (
      SELECT 1
      FROM plank_users
      WHERE public_author_slug = next_slug
        AND id <> usr.id
    ) LOOP
      next_slug := base_slug || '-' || suffix_num;
      suffix_num := suffix_num + 1;
    END LOOP;

    UPDATE plank_users
    SET public_author_slug = next_slug
    WHERE id = usr.id;
  END LOOP;
END;
$$;

ALTER TABLE plank_users
  ALTER COLUMN public_author_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plank_users_public_author_slug
  ON plank_users(public_author_slug);
