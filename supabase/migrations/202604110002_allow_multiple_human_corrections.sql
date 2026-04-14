ALTER TABLE community_corrections
DROP CONSTRAINT IF EXISTS community_corrections_post_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_corrections_one_ai_per_post
ON community_corrections (post_id)
WHERE is_ai = true;
