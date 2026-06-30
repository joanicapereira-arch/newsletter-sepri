ALTER TABLE public.newsletters ALTER COLUMN detection_id DROP NOT NULL;
ALTER TABLE public.newsletters ADD COLUMN IF NOT EXISTS detection_ids UUID[] NOT NULL DEFAULT '{}';