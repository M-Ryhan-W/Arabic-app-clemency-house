-- ============================================================
-- Community Feature Migration
-- ============================================================

-- 1. PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Own update profiles" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Own insert profiles" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(split_part(NEW.email, '@', 1), 'Learner'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill existing users
INSERT INTO profiles (id, display_name)
SELECT id, COALESCE(split_part(email, '@', 1), 'Learner')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- AI Bot: Create auth user first, then profile
-- (The AI bot needs to exist in auth.users due to foreign key constraints)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ai-tutor@system.local',
  '',
  now(),
  'authenticated',
  'authenticated',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, display_name, avatar_url)
VALUES ('00000000-0000-0000-0000-000000000001', 'AI Tutor', '🤖')
ON CONFLICT (id) DO NOTHING;

-- 2. DAILY QUESTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_en TEXT NOT NULL,
  question_ar TEXT,
  active_date DATE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read daily_questions" ON daily_questions
  FOR SELECT USING (true);

-- Seed 30 days of daily questions starting from today
INSERT INTO daily_questions (question_en, question_ar, active_date) VALUES
('What did you do today?', 'ماذا فعلت اليوم؟', '2026-04-03'),
('Describe your favorite food.', 'صِف طعامك المفضل.', '2026-04-04'),
('What is your dream job and why?', 'ما هي وظيفة أحلامك ولماذا؟', '2026-04-05'),
('Tell me about your family.', 'أخبرني عن عائلتك.', '2026-04-06'),
('What do you like about your city?', 'ماذا تحب في مدينتك؟', '2026-04-07'),
('Describe your morning routine.', 'صِف روتينك الصباحي.', '2026-04-08'),
('What is your favorite hobby?', 'ما هي هوايتك المفضلة؟', '2026-04-09'),
('Tell me about a trip you took.', 'أخبرني عن رحلة قمت بها.', '2026-04-10'),
('What would you do with a million dollars?', 'ماذا ستفعل بمليون دولار؟', '2026-04-11'),
('Describe your best friend.', 'صِف أفضل صديق لك.', '2026-04-12'),
('What is your favorite season and why?', 'ما هو فصلك المفضل ولماذا؟', '2026-04-13'),
('Tell me about a book you read recently.', 'أخبرني عن كتاب قرأته مؤخرًا.', '2026-04-14'),
('What do you do on weekends?', 'ماذا تفعل في عطلة نهاية الأسبوع؟', '2026-04-15'),
('Describe your ideal vacation.', 'صِف عطلتك المثالية.', '2026-04-16'),
('What languages do you speak?', 'ما هي اللغات التي تتحدثها؟', '2026-04-17'),
('Tell me about your school or work.', 'أخبرني عن مدرستك أو عملك.', '2026-04-18'),
('What is your favorite movie?', 'ما هو فيلمك المفضل؟', '2026-04-19'),
('Describe the weather today.', 'صِف الطقس اليوم.', '2026-04-20'),
('What did you eat for breakfast?', 'ماذا أكلت على الفطور؟', '2026-04-21'),
('Tell me about a challenge you overcame.', 'أخبرني عن تحدٍ تغلبت عليه.', '2026-04-22'),
('What is your favorite place to visit?', 'ما هو مكانك المفضل للزيارة؟', '2026-04-23'),
('Describe your neighborhood.', 'صِف حيّك.', '2026-04-24'),
('What do you want to learn this year?', 'ماذا تريد أن تتعلم هذا العام؟', '2026-04-25'),
('Tell me about a happy memory.', 'أخبرني عن ذكرى سعيدة.', '2026-04-26'),
('What is your favorite sport?', 'ما هي رياضتك المفضلة؟', '2026-04-27'),
('Describe your favorite teacher.', 'صِف معلمك المفضل.', '2026-04-28'),
('What would you change about the world?', 'ماذا ستغير في العالم؟', '2026-04-29'),
('Tell me about your pets.', 'أخبرني عن حيواناتك الأليفة.', '2026-04-30'),
('What is your favorite song?', 'ما هي أغنيتك المفضلة؟', '2026-05-01'),
('Describe what you see from your window.', 'صِف ما تراه من نافذتك.', '2026-05-02')
ON CONFLICT (active_date) DO NOTHING;

-- 3. COMMUNITY POSTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('read_aloud', 'translate', 'daily_question')),
  speaking_lesson_item_id UUID,
  daily_question_id UUID REFERENCES daily_questions(id),
  prompt_text TEXT NOT NULL,
  answer_text TEXT,
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  perfect_count INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX idx_community_posts_activity ON community_posts(activity_type, created_at DESC);
CREATE INDEX idx_community_posts_user ON community_posts(user_id, created_at DESC);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read recent posts" ON community_posts
  FOR SELECT USING (created_at > now() - INTERVAL '72 hours');

CREATE POLICY "Own insert posts" ON community_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Own delete posts" ON community_posts
  FOR DELETE USING (auth.uid() = user_id);

-- 4. COMMUNITY CORRECTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS community_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correction_text TEXT NOT NULL,
  is_ai BOOLEAN NOT NULL DEFAULT false,
  upvotes INT NOT NULL DEFAULT 0,
  downvotes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_corrections_post ON community_corrections(post_id, created_at ASC);

ALTER TABLE community_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read all corrections" ON community_corrections
  FOR SELECT USING (true);

CREATE POLICY "Own insert corrections" ON community_corrections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Own update corrections" ON community_corrections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Own delete corrections" ON community_corrections
  FOR DELETE USING (auth.uid() = user_id);

-- 5. COMMUNITY REACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  correction_id UUID REFERENCES community_corrections(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('perfect', 'upvote', 'downvote')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (post_id IS NOT NULL AND correction_id IS NULL) OR
    (post_id IS NULL AND correction_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_reactions_post_unique ON community_reactions(user_id, post_id, reaction_type) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX idx_reactions_correction_unique ON community_reactions(user_id, correction_id, reaction_type) WHERE correction_id IS NOT NULL;

ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read all reactions" ON community_reactions
  FOR SELECT USING (true);

CREATE POLICY "Own insert reactions" ON community_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Own delete reactions" ON community_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- 6. COMMUNITY REPORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES community_posts(id) ON DELETE SET NULL,
  correction_id UUID REFERENCES community_corrections(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own insert reports" ON community_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- 7. TRIGGER: Update perfect_count on community_posts
-- ============================================================
CREATE OR REPLACE FUNCTION recalc_perfect_count()
RETURNS TRIGGER AS $$
DECLARE
  target_post_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_post_id := OLD.post_id;
  ELSE
    target_post_id := NEW.post_id;
  END IF;

  IF target_post_id IS NOT NULL THEN
    UPDATE community_posts
    SET perfect_count = (
      SELECT COUNT(*) FROM community_reactions
      WHERE post_id = target_post_id AND reaction_type = 'perfect'
    )
    WHERE id = target_post_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_reaction_change
  AFTER INSERT OR DELETE ON community_reactions
  FOR EACH ROW EXECUTE FUNCTION recalc_perfect_count();

-- 8. TRIGGER: Update upvotes/downvotes on community_corrections
-- ============================================================
CREATE OR REPLACE FUNCTION recalc_correction_votes()
RETURNS TRIGGER AS $$
DECLARE
  target_correction_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_correction_id := OLD.correction_id;
  ELSE
    target_correction_id := NEW.correction_id;
  END IF;

  IF target_correction_id IS NOT NULL THEN
    UPDATE community_corrections
    SET
      upvotes = (SELECT COUNT(*) FROM community_reactions WHERE correction_id = target_correction_id AND reaction_type = 'upvote'),
      downvotes = (SELECT COUNT(*) FROM community_reactions WHERE correction_id = target_correction_id AND reaction_type = 'downvote')
    WHERE id = target_correction_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_correction_reaction_change
  AFTER INSERT OR DELETE ON community_reactions
  FOR EACH ROW EXECUTE FUNCTION recalc_correction_votes();

-- 9. RPC: get_daily_exercises
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_exercises(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
  seed INT;
  read_aloud_items JSON;
  translate_items JSON;
  daily_q JSON;
BEGIN
  seed := EXTRACT(DOY FROM p_date)::INT + EXTRACT(YEAR FROM p_date)::INT * 366;

  -- 3 read_aloud items from repeat/read modes
  SELECT json_agg(t) INTO read_aloud_items FROM (
    SELECT sli.id, sli.arabic_text, sli.english_text
    FROM speaking_lesson_items sli
    JOIN speaking_lessons sl ON sli.speaking_lesson_id = sl.id
    JOIN speaking_modes sm ON sl.mode_id = sm.id
    WHERE sm.name ILIKE '%read%' OR sm.name ILIKE '%repeat%'
    ORDER BY md5(sli.id::text || seed::text)
    LIMIT 3
  ) t;

  -- 3 translate items from translate modes
  SELECT json_agg(t) INTO translate_items FROM (
    SELECT sli.id, sli.arabic_text, sli.english_text
    FROM speaking_lesson_items sli
    JOIN speaking_lessons sl ON sli.speaking_lesson_id = sl.id
    JOIN speaking_modes sm ON sl.mode_id = sm.id
    WHERE sm.name ILIKE '%translat%'
    ORDER BY md5(sli.id::text || seed::text)
    LIMIT 3
  ) t;

  -- Today's daily question
  SELECT json_build_object('id', id, 'question_en', question_en, 'question_ar', question_ar)
  INTO daily_q
  FROM daily_questions
  WHERE active_date = p_date;

  RETURN json_build_object(
    'read_aloud', COALESCE(read_aloud_items, '[]'::json),
    'translate', COALESCE(translate_items, '[]'::json),
    'daily_question', daily_q
  );
END;
$$ LANGUAGE plpgsql STABLE;
