CREATE OR REPLACE FUNCTION get_daily_exercises(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
  seed INT;
  read_aloud_items JSON;
  translate_items JSON;
  daily_q JSON;
BEGIN
  seed := EXTRACT(DOY FROM p_date)::INT + EXTRACT(YEAR FROM p_date)::INT * 366;

  SELECT json_agg(t) INTO read_aloud_items FROM (
    SELECT sli.id, sli.arabic_text, sli.english_text
    FROM speaking_lesson_items sli
    JOIN speaking_lessons sl ON sli.speaking_lesson_id = sl.id
    JOIN speaking_modes sm ON sl.mode_id = sm.id
    WHERE sm.name ILIKE '%read%' OR sm.name ILIKE '%repeat%'
    ORDER BY md5(sli.id::text || seed::text)
    LIMIT 3
  ) t;

  SELECT json_agg(t) INTO translate_items FROM (
    SELECT sli.id, sli.arabic_text, sli.english_text
    FROM speaking_lesson_items sli
    JOIN speaking_lessons sl ON sli.speaking_lesson_id = sl.id
    JOIN speaking_modes sm ON sl.mode_id = sm.id
    WHERE sm.name ILIKE '%translat%'
    ORDER BY md5(sli.id::text || seed::text)
    LIMIT 3
  ) t;

  SELECT json_build_object('id', id, 'question_en', question_en, 'question_ar', question_ar)
  INTO daily_q
  FROM daily_questions
  WHERE active_date <= p_date
  ORDER BY active_date DESC
  LIMIT 1;

  RETURN json_build_object(
    'read_aloud', COALESCE(read_aloud_items, '[]'::json),
    'translate', COALESCE(translate_items, '[]'::json),
    'daily_question', daily_q
  );
END;
$$ LANGUAGE plpgsql STABLE;
