ALTER TABLE icons
  ADD COLUMN image_style TEXT NOT NULL DEFAULT 'framed'
    CHECK (image_style IN ('framed', 'plain')),
  ADD COLUMN image_radius TEXT NOT NULL DEFAULT 'rounded'
    CHECK (image_radius IN ('rounded', 'square'));

ALTER TABLE folder_items
  ADD COLUMN image_style TEXT NOT NULL DEFAULT 'framed'
    CHECK (image_style IN ('framed', 'plain')),
  ADD COLUMN image_radius TEXT NOT NULL DEFAULT 'rounded'
    CHECK (image_radius IN ('rounded', 'square'));
