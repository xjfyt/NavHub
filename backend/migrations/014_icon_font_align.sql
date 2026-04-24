ALTER TABLE icons
  ADD COLUMN font_size TEXT NOT NULL DEFAULT 'md',
  ADD COLUMN text_align TEXT NOT NULL DEFAULT 'center';

ALTER TABLE icons
  ADD CONSTRAINT icons_font_size_check CHECK (font_size IN ('sm', 'md', 'lg')),
  ADD CONSTRAINT icons_text_align_check CHECK (text_align IN ('left', 'center', 'right'));
