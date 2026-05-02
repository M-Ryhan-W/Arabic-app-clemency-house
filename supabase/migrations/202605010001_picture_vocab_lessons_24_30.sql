-- Picture describe vocabulary for lessons 24-30.

DO $$
DECLARE
  v_l24 BIGINT;
  v_l25 BIGINT;
  v_l26 BIGINT;
  v_l27 BIGINT;
  v_l28 BIGINT;
  v_l29 BIGINT;
  v_l30 BIGINT;
BEGIN
  SELECT id INTO v_l24 FROM picture_describe_lessons WHERE order_index = 24 ORDER BY id LIMIT 1;
  SELECT id INTO v_l25 FROM picture_describe_lessons WHERE order_index = 25 ORDER BY id LIMIT 1;
  SELECT id INTO v_l26 FROM picture_describe_lessons WHERE order_index = 26 ORDER BY id LIMIT 1;
  SELECT id INTO v_l27 FROM picture_describe_lessons WHERE order_index = 27 ORDER BY id LIMIT 1;
  SELECT id INTO v_l28 FROM picture_describe_lessons WHERE order_index = 28 ORDER BY id LIMIT 1;
  SELECT id INTO v_l29 FROM picture_describe_lessons WHERE order_index = 29 ORDER BY id LIMIT 1;
  SELECT id INTO v_l30 FROM picture_describe_lessons WHERE order_index = 30 ORDER BY id LIMIT 1;

  IF v_l24 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 24 not found';
  END IF;
  IF v_l25 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 25 not found';
  END IF;
  IF v_l26 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 26 not found';
  END IF;
  IF v_l27 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 27 not found';
  END IF;
  IF v_l28 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 28 not found';
  END IF;
  IF v_l29 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 29 not found';
  END IF;
  IF v_l30 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 30 not found';
  END IF;

  DELETE FROM picture_describe_vocab
  WHERE lesson_id IN (v_l24, v_l25, v_l26, v_l27, v_l28, v_l29, v_l30);

  -- Lesson 24: cruise ships at a port
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l24, 1, 'سَفِينَة', 'ship'),
  (v_l24, 2, 'مِينَاء', 'port'),
  (v_l24, 3, 'رُكَّاب', 'passengers'),
  (v_l24, 4, 'بَحْر', 'sea'),
  (v_l24, 5, 'جِسْر', 'bridge'),
  (v_l24, 6, 'سِيَاح', 'tourists'),
  (v_l24, 7, 'سَمَاء', 'sky'),
  (v_l24, 8, 'رِحْلَة', 'trip');

  -- Lesson 25: rocket launch
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l25, 1, 'صَارُوخ', 'rocket'),
  (v_l25, 2, 'فَضَاء', 'space'),
  (v_l25, 3, 'إِطْلَاق', 'launch'),
  (v_l25, 4, 'نَار', 'fire'),
  (v_l25, 5, 'دُخَان', 'smoke'),
  (v_l25, 6, 'سَمَاء', 'sky'),
  (v_l25, 7, 'طُيُور', 'birds'),
  (v_l25, 8, 'قَاعِدَة', 'base');

  -- Lesson 26: rubbish and pollution near a factory
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l26, 1, 'نُفَايَات', 'rubbish'),
  (v_l26, 2, 'تَلَوُّث', 'pollution'),
  (v_l26, 3, 'مَصْنَع', 'factory'),
  (v_l26, 4, 'دُخَان', 'smoke'),
  (v_l26, 5, 'بِلَاسْتِيك', 'plastic'),
  (v_l26, 6, 'أَرْض', 'ground'),
  (v_l26, 7, 'أَكْيَاس', 'bags'),
  (v_l26, 8, 'بِيئَة', 'environment');

  -- Lesson 27: mosque by the water
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l27, 1, 'مَسْجِد', 'mosque'),
  (v_l27, 2, 'قُبَّة', 'dome'),
  (v_l27, 3, 'مَآذِن', 'minarets'),
  (v_l27, 4, 'بَحْر', 'sea'),
  (v_l27, 5, 'مَدِينَة', 'city'),
  (v_l27, 6, 'سَمَاء', 'sky'),
  (v_l27, 7, 'جَمِيل', 'beautiful'),
  (v_l27, 8, 'صَلَاة', 'prayer');

  -- Lesson 28: technology exhibition with a robot
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l28, 1, 'مَعْرِض', 'exhibition'),
  (v_l28, 2, 'رُوبُوت', 'robot'),
  (v_l28, 3, 'تِقْنِيَة', 'technology'),
  (v_l28, 4, 'نَاس', 'people'),
  (v_l28, 5, 'حَاسُوب', 'computer'),
  (v_l28, 6, 'شَاشَة', 'screen'),
  (v_l28, 7, 'حَقِيبَة', 'bag'),
  (v_l28, 8, 'ذَكَاء اِصْطِنَاعِيّ', 'artificial intelligence');

  -- Lesson 29: farmer watering crops
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l29, 1, 'مُزَارِع', 'farmer'),
  (v_l29, 2, 'مَزْرَعَة', 'farm'),
  (v_l29, 3, 'نَبَاتَات', 'plants'),
  (v_l29, 4, 'ذُرَة', 'corn'),
  (v_l29, 5, 'مَاء', 'water'),
  (v_l29, 6, 'خُرْطُوم', 'hose'),
  (v_l29, 7, 'حَقْل', 'field'),
  (v_l29, 8, 'زِرَاعَة', 'farming');

  -- Lesson 30: Great Wall of China at night
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l30, 1, 'سُور', 'wall'),
  (v_l30, 2, 'جِبَال', 'mountains'),
  (v_l30, 3, 'أَضْوَاء', 'lights'),
  (v_l30, 4, 'لَيْل', 'night'),
  (v_l30, 5, 'طَرِيق', 'path'),
  (v_l30, 6, 'بُرْج', 'tower'),
  (v_l30, 7, 'الصِّين', 'China'),
  (v_l30, 8, 'مَنْظَر', 'view');
END $$;
