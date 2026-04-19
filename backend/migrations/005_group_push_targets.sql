ALTER TABLE groups
  ADD COLUMN push_target_type TEXT NOT NULL DEFAULT 'all'
    CHECK (push_target_type IN ('all', 'role', 'user')),
  ADD COLUMN push_target_role TEXT,
  ADD COLUMN push_target_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
