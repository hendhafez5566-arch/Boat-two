ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='social_posts' AND column_name='format') THEN
    ALTER TABLE social_posts ADD COLUMN format text NOT NULL DEFAULT 'multimedia' CHECK(format IN('multimedia','cta','carousel'));
    UPDATE social_posts SET format=CASE WHEN kind='cta' THEN 'cta' WHEN kind='carousel' THEN 'carousel' ELSE 'multimedia' END;
  END IF;
END $$;
