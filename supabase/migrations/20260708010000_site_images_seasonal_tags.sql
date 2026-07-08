ALTER TABLE public.site_images
  ADD COLUMN IF NOT EXISTS season_tag TEXT,
  ADD COLUMN IF NOT EXISTS month_tag INT;

ALTER TABLE public.site_images
  ADD CONSTRAINT site_images_season_tag_check
    CHECK (season_tag IS NULL OR season_tag IN ('spring', 'summer', 'fall', 'winter')),
  ADD CONSTRAINT site_images_month_tag_check
    CHECK (month_tag IS NULL OR (month_tag >= 1 AND month_tag <= 12));
