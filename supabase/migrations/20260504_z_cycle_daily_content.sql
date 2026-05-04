CREATE OR REPLACE FUNCTION get_daily_exercises(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
  days_since BIGINT;
  read_aloud_items JSON;
  translate_items JSON;
  daily_q JSON;
BEGIN
  days_since := p_date - DATE '2026-04-03';

  WITH eligible AS (
    SELECT
      sli.id,
      sli.arabic_text,
      sli.english_text,
      row_number() OVER (ORDER BY sl.id, sli.order_index NULLS LAST, sli.id) - 1 AS idx,
      count(*) OVER () AS total
    FROM speaking_lesson_items sli
    JOIN speaking_lessons sl ON sli.speaking_lesson_id = sl.id
    JOIN speaking_modes sm ON sl.mode_id = sm.id
    WHERE sm.name ILIKE '%read%' OR sm.name ILIKE '%repeat%'
  ),
  cycled AS (
    SELECT
      id,
      arabic_text,
      english_text,
      ((idx - ((((days_since * 3) % total) + total) % total) + total) % total) AS cycle_position
    FROM eligible
  )
  SELECT json_agg(
    json_build_object('id', id, 'arabic_text', arabic_text, 'english_text', english_text)
    ORDER BY cycle_position
  )
  INTO read_aloud_items
  FROM cycled
  WHERE cycle_position < 3;

  WITH eligible AS (
    SELECT
      sli.id,
      sli.arabic_text,
      sli.english_text,
      row_number() OVER (ORDER BY sl.id, sli.order_index NULLS LAST, sli.id) - 1 AS idx,
      count(*) OVER () AS total
    FROM speaking_lesson_items sli
    JOIN speaking_lessons sl ON sli.speaking_lesson_id = sl.id
    JOIN speaking_modes sm ON sl.mode_id = sm.id
    WHERE sm.name ILIKE '%translat%'
  ),
  cycled AS (
    SELECT
      id,
      arabic_text,
      english_text,
      ((idx - ((((days_since * 3) % total) + total) % total) + total) % total) AS cycle_position
    FROM eligible
  )
  SELECT json_agg(
    json_build_object('id', id, 'arabic_text', arabic_text, 'english_text', english_text)
    ORDER BY cycle_position
  )
  INTO translate_items
  FROM cycled
  WHERE cycle_position < 3;

  WITH eligible AS (
    SELECT
      id,
      question_en,
      question_ar,
      active_date,
      row_number() OVER (ORDER BY active_date, id) - 1 AS idx,
      count(*) OVER () AS total
    FROM daily_questions
    WHERE active_date <= p_date
  ),
  cycled AS (
    SELECT
      id,
      question_en,
      question_ar,
      active_date,
      ((idx - (((days_since % total) + total) % total) + total) % total) AS cycle_position
    FROM eligible
  )
  SELECT json_build_object(
    'id', id,
    'question_en', question_en,
    'question_ar', question_ar,
    'active_date', active_date
  )
  INTO daily_q
  FROM cycled
  WHERE cycle_position = 0
  LIMIT 1;

  RETURN json_build_object(
    'read_aloud', COALESCE(read_aloud_items, '[]'::json),
    'translate', COALESCE(translate_items, '[]'::json),
    'daily_question', daily_q
  );
END;
$$ LANGUAGE plpgsql STABLE;
