-- Picture describe vocabulary for lessons 31-38.

DO $$
DECLARE
  v_l31 BIGINT;
  v_l32 BIGINT;
  v_l33 BIGINT;
  v_l34 BIGINT;
  v_l35 BIGINT;
  v_l36 BIGINT;
  v_l37 BIGINT;
  v_l38 BIGINT;
BEGIN
  SELECT id INTO v_l31 FROM picture_describe_lessons WHERE order_index = 31 ORDER BY id LIMIT 1;
  SELECT id INTO v_l32 FROM picture_describe_lessons WHERE order_index = 32 ORDER BY id LIMIT 1;
  SELECT id INTO v_l33 FROM picture_describe_lessons WHERE order_index = 33 ORDER BY id LIMIT 1;
  SELECT id INTO v_l34 FROM picture_describe_lessons WHERE order_index = 34 ORDER BY id LIMIT 1;
  SELECT id INTO v_l35 FROM picture_describe_lessons WHERE order_index = 35 ORDER BY id LIMIT 1;
  SELECT id INTO v_l36 FROM picture_describe_lessons WHERE order_index = 36 ORDER BY id LIMIT 1;
  SELECT id INTO v_l37 FROM picture_describe_lessons WHERE order_index = 37 ORDER BY id LIMIT 1;
  SELECT id INTO v_l38 FROM picture_describe_lessons WHERE order_index = 38 ORDER BY id LIMIT 1;

  IF v_l31 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 31 not found';
  END IF;
  IF v_l32 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 32 not found';
  END IF;
  IF v_l33 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 33 not found';
  END IF;
  IF v_l34 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 34 not found';
  END IF;
  IF v_l35 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 35 not found';
  END IF;
  IF v_l36 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 36 not found';
  END IF;
  IF v_l37 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 37 not found';
  END IF;
  IF v_l38 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 38 not found';
  END IF;

  DELETE FROM picture_describe_vocab
  WHERE lesson_id IN (v_l31, v_l32, v_l33, v_l34, v_l35, v_l36, v_l37, v_l38);

  -- Lesson 31: child at the dentist
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l31, 1, 'طَبِيب أَسْنَان', 'dentist'),
  (v_l31, 2, 'طِفْلَة', 'girl'),
  (v_l31, 3, 'فَم', 'mouth'),
  (v_l31, 4, 'أَسْنَان', 'teeth'),
  (v_l31, 5, 'قُفَّازَات', 'gloves'),
  (v_l31, 6, 'مِرْآة', 'mirror'),
  (v_l31, 7, 'كُرْسِيّ', 'chair'),
  (v_l31, 8, 'عِيَادَة', 'clinic');

  -- Lesson 32: elderly man exercising in a gym
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l32, 1, 'رَجُل كَبِير', 'elderly man'),
  (v_l32, 2, 'نَادٍ رِيَاضِيّ', 'gym'),
  (v_l32, 3, 'تَمْرِين', 'exercise'),
  (v_l32, 4, 'أَثْقَال', 'weights'),
  (v_l32, 5, 'جِهَاز', 'machine'),
  (v_l32, 6, 'قُوَّة', 'strength'),
  (v_l32, 7, 'جُلُوس', 'sitting'),
  (v_l32, 8, 'صِحَّة', 'health');

  -- Lesson 33: rescue during a flood
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l33, 1, 'فَيْضَان', 'flood'),
  (v_l33, 2, 'مَطَر', 'rain'),
  (v_l33, 3, 'مَاء', 'water'),
  (v_l33, 4, 'إِنْقَاذ', 'rescue'),
  (v_l33, 5, 'عُمَّال', 'workers'),
  (v_l33, 6, 'خُوذَة', 'helmet'),
  (v_l33, 7, 'سَيَّارَة', 'car'),
  (v_l33, 8, 'شَارِع', 'street');

  -- Lesson 34: stressed man working at a laptop
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l34, 1, 'رَجُل', 'man'),
  (v_l34, 2, 'حَاسُوب', 'computer'),
  (v_l34, 3, 'مَكْتَب', 'desk'),
  (v_l34, 4, 'عَمَل', 'work'),
  (v_l34, 5, 'تَعَب', 'tiredness'),
  (v_l34, 6, 'نَظَّارَة', 'glasses'),
  (v_l34, 7, 'مِصْبَاح', 'lamp'),
  (v_l34, 8, 'دَفْتَر', 'notebook');

  -- Lesson 35: cutting trees in a damaged forest
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l35, 1, 'غَابَة', 'forest'),
  (v_l35, 2, 'شَجَرَة', 'tree'),
  (v_l35, 3, 'حَطَّاب', 'woodcutter'),
  (v_l35, 4, 'مِنْشَار', 'saw'),
  (v_l35, 5, 'جِذْع', 'trunk'),
  (v_l35, 6, 'خُوذَة', 'helmet'),
  (v_l35, 7, 'رَمَاد', 'ash'),
  (v_l35, 8, 'أَرْض', 'ground');

  -- Lesson 36: repairing a bicycle
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l36, 1, 'دَرَّاجَة', 'bicycle'),
  (v_l36, 2, 'مُصْلِح', 'repairman'),
  (v_l36, 3, 'عَجَلَة', 'wheel'),
  (v_l36, 4, 'أَدَوَات', 'tools'),
  (v_l36, 5, 'وِرْشَة', 'workshop'),
  (v_l36, 6, 'سِلْسِلَة', 'chain'),
  (v_l36, 7, 'إِصْلَاح', 'repair'),
  (v_l36, 8, 'مِفْتَاح', 'wrench');

  -- Lesson 37: painting the outside of a house
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l37, 1, 'بَيْت', 'house'),
  (v_l37, 2, 'دِهَان', 'paint'),
  (v_l37, 3, 'فُرْشَاة', 'brush'),
  (v_l37, 4, 'حَائِط', 'wall'),
  (v_l37, 5, 'نَافِذَة', 'window'),
  (v_l37, 6, 'سُلَّم', 'ladder'),
  (v_l37, 7, 'رَجُل', 'man'),
  (v_l37, 8, 'امْرَأَة', 'woman');

  -- Lesson 38: graduation celebration
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l38, 1, 'تَخَرُّج', 'graduation'),
  (v_l38, 2, 'طُلَّاب', 'students'),
  (v_l38, 3, 'قُبَّعَات', 'caps'),
  (v_l38, 4, 'فَرَح', 'joy'),
  (v_l38, 5, 'جَامِعَة', 'university'),
  (v_l38, 6, 'احْتِفَال', 'celebration'),
  (v_l38, 7, 'أَيْدِي', 'hands'),
  (v_l38, 8, 'جَمَاعَة', 'group');
END $$;
