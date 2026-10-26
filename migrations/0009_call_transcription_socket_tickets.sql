CREATE TABLE IF NOT EXISTS call_transcription_socket_tickets (
  ticket TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_call_transcription_socket_tickets_expiry
  ON call_transcription_socket_tickets(expires_at);
