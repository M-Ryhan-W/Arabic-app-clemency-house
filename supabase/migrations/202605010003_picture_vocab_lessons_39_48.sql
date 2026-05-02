-- Picture describe vocabulary for lessons 39-48.

DO $$
DECLARE
  v_l39 BIGINT;
  v_l40 BIGINT;
  v_l41 BIGINT;
  v_l42 BIGINT;
  v_l43 BIGINT;
  v_l44 BIGINT;
  v_l45 BIGINT;
  v_l46 BIGINT;
  v_l47 BIGINT;
  v_l48 BIGINT;
BEGIN
  SELECT id INTO v_l39 FROM picture_describe_lessons WHERE order_index = 39 ORDER BY id LIMIT 1;
  SELECT id INTO v_l40 FROM picture_describe_lessons WHERE order_index = 40 ORDER BY id LIMIT 1;
  SELECT id INTO v_l41 FROM picture_describe_lessons WHERE order_index = 41 ORDER BY id LIMIT 1;
  SELECT id INTO v_l42 FROM picture_describe_lessons WHERE order_index = 42 ORDER BY id LIMIT 1;
  SELECT id INTO v_l43 FROM picture_describe_lessons WHERE order_index = 43 ORDER BY id LIMIT 1;
  SELECT id INTO v_l44 FROM picture_describe_lessons WHERE order_index = 44 ORDER BY id LIMIT 1;
  SELECT id INTO v_l45 FROM picture_describe_lessons WHERE order_index = 45 ORDER BY id LIMIT 1;
  SELECT id INTO v_l46 FROM picture_describe_lessons WHERE order_index = 46 ORDER BY id LIMIT 1;
  SELECT id INTO v_l47 FROM picture_describe_lessons WHERE order_index = 47 ORDER BY id LIMIT 1;
  SELECT id INTO v_l48 FROM picture_describe_lessons WHERE order_index = 48 ORDER BY id LIMIT 1;

  IF v_l39 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 39 not found';
  END IF;
  IF v_l40 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 40 not found';
  END IF;
  IF v_l41 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 41 not found';
  END IF;
  IF v_l42 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 42 not found';
  END IF;
  IF v_l43 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 43 not found';
  END IF;
  IF v_l44 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 44 not found';
  END IF;
  IF v_l45 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 45 not found';
  END IF;
  IF v_l46 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 46 not found';
  END IF;
  IF v_l47 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 47 not found';
  END IF;
  IF v_l48 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 48 not found';
  END IF;

  DELETE FROM picture_describe_vocab
  WHERE lesson_id IN (v_l39, v_l40, v_l41, v_l42, v_l43, v_l44, v_l45, v_l46, v_l47, v_l48);

  -- Lesson 39: science class
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l39, 1, 'طُلَّاب', 'students'),
  (v_l39, 2, 'مُخْتَبَر', 'laboratory'),
  (v_l39, 3, 'عُلُوم', 'science'),
  (v_l39, 4, 'نَظَّارَات', 'goggles'),
  (v_l39, 5, 'أَنَابِيب', 'test tubes'),
  (v_l39, 6, 'تَجْرِبَة', 'experiment'),
  (v_l39, 7, 'مُعَلِّم', 'teacher'),
  (v_l39, 8, 'طَاوِلَة', 'table');

  -- Lesson 40: tourist reading a map
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l40, 1, 'سَائِح', 'tourist'),
  (v_l40, 2, 'خَرِيطَة', 'map'),
  (v_l40, 3, 'مَدِينَة', 'city'),
  (v_l40, 4, 'جِسْر', 'bridge'),
  (v_l40, 5, 'شَارِع', 'street'),
  (v_l40, 6, 'سَفَر', 'travel'),
  (v_l40, 7, 'حَقِيبَة', 'bag'),
  (v_l40, 8, 'طَرِيق', 'route');

  -- Lesson 41: cat cafe
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l41, 1, 'قِطَط', 'cats'),
  (v_l41, 2, 'مَقْهَى', 'cafe'),
  (v_l41, 3, 'زَبَائِن', 'customers'),
  (v_l41, 4, 'طَاوِلَة', 'table'),
  (v_l41, 5, 'كُرْسِيّ', 'chair'),
  (v_l41, 6, 'نَوْم', 'sleep'),
  (v_l41, 7, 'طَعَام', 'food'),
  (v_l41, 8, 'رَفّ', 'shelf');

  -- Lesson 42: online meeting
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l42, 1, 'اجْتِمَاع', 'meeting'),
  (v_l42, 2, 'حَاسُوب', 'computer'),
  (v_l42, 3, 'مُكَالَمَة', 'call'),
  (v_l42, 4, 'شَاشَة', 'screen'),
  (v_l42, 5, 'رَجُل', 'man'),
  (v_l42, 6, 'امْرَأَة', 'woman'),
  (v_l42, 7, 'بَيْت', 'house'),
  (v_l42, 8, 'عَمَل', 'work');

  -- Lesson 43: recycling centre
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l43, 1, 'إِعَادَة تَدْوِير', 'recycling'),
  (v_l43, 2, 'تَبَرُّعَات', 'donations'),
  (v_l43, 3, 'مَلَابِس', 'clothes'),
  (v_l43, 4, 'بِلَاسْتِيك', 'plastic'),
  (v_l43, 5, 'كَرْتُون', 'cardboard'),
  (v_l43, 6, 'صَنَادِيق', 'bins'),
  (v_l43, 7, 'عُمَّال', 'workers'),
  (v_l43, 8, 'مَوَارِد', 'resources');

  -- Lesson 44: busy roller coaster queue
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l44, 1, 'مَلَاهِي', 'theme park'),
  (v_l44, 2, 'قِطَار أَلْعَاب', 'roller coaster'),
  (v_l44, 3, 'طَابُور', 'queue'),
  (v_l44, 4, 'نَاس', 'people'),
  (v_l44, 5, 'حَاجِز', 'barrier'),
  (v_l44, 6, 'انْتِظَار', 'waiting'),
  (v_l44, 7, 'سَمَاء', 'sky'),
  (v_l44, 8, 'عَجَلَة', 'wheel');

  -- Lesson 45: catching a bus
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l45, 1, 'حَافِلَة', 'bus'),
  (v_l45, 2, 'رَجُل', 'man'),
  (v_l45, 3, 'مَحَطَّة', 'station'),
  (v_l45, 4, 'شَارِع', 'street'),
  (v_l45, 5, 'جَرْي', 'running'),
  (v_l45, 6, 'بَاب', 'door'),
  (v_l45, 7, 'رَصِيف', 'pavement'),
  (v_l45, 8, 'عَمَل', 'work');

  -- Lesson 46: crowded shopping centre stairs
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l46, 1, 'سُلَّم', 'stairs'),
  (v_l46, 2, 'حَشْد', 'crowd'),
  (v_l46, 3, 'مَرْكَز تِجَارِيّ', 'shopping centre'),
  (v_l46, 4, 'مَتَاجِر', 'shops'),
  (v_l46, 5, 'نَاس', 'people'),
  (v_l46, 6, 'مَمَرّ', 'walkway'),
  (v_l46, 7, 'حَقَائِب', 'bags'),
  (v_l46, 8, 'طَابِق', 'floor');

  -- Lesson 47: storm and lightning over hills
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l47, 1, 'عَاصِفَة', 'storm'),
  (v_l47, 2, 'بَرْق', 'lightning'),
  (v_l47, 3, 'سُحُب', 'clouds'),
  (v_l47, 4, 'ضَبَاب', 'fog'),
  (v_l47, 5, 'جِبَال', 'mountains'),
  (v_l47, 6, 'طَرِيق', 'path'),
  (v_l47, 7, 'لَيْل', 'night'),
  (v_l47, 8, 'رِيَاح', 'wind');

  -- Lesson 48: zoo visit
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l48, 1, 'حَدِيقَة حَيَوَانَات', 'zoo'),
  (v_l48, 2, 'أَسَد', 'lion'),
  (v_l48, 3, 'قَفَص', 'cage'),
  (v_l48, 4, 'زُوَّار', 'visitors'),
  (v_l48, 5, 'حَارِس', 'keeper'),
  (v_l48, 6, 'أَطْفَال', 'children'),
  (v_l48, 7, 'أَشْجَار', 'trees'),
  (v_l48, 8, 'مَمَرّ', 'path');
END $$;
