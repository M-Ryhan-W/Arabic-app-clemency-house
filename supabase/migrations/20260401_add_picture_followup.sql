-- Add follow-up question columns to picture_describe_lessons
ALTER TABLE picture_describe_lessons
  ADD COLUMN IF NOT EXISTS follow_up_question TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_translation TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_starters TEXT[];
