ALTER TABLE system_messages
ADD COLUMN expires_at TIMESTAMPTZ;

CREATE INDEX system_messages_expires_idx ON system_messages(expires_at) WHERE expires_at IS NOT NULL;
