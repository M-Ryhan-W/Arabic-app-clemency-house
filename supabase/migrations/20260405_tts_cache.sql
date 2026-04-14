-- TTS Audio Cache
-- Stores generated TTS audio (base64) so subsequent users
-- get the cached version instead of hitting Google TTS again.
-- Entries expire after 24 hours.

CREATE TABLE IF NOT EXISTS tts_cache (
  text_hash TEXT PRIMARY KEY,
  arabic_text TEXT NOT NULL,
  audio_base64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup of expired entries
CREATE INDEX idx_tts_cache_created ON tts_cache(created_at);

-- No RLS needed — only accessed by service role from edge functions
ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;

-- Cleanup function: delete entries older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_tts_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM tts_cache WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
