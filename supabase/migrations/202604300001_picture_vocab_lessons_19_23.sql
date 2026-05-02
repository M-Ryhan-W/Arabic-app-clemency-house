-- Picture describe vocabulary for lessons 19-23.

DO $$
DECLARE
  v_l19 BIGINT;
  v_l20 BIGINT;
  v_l21 BIGINT;
  v_l22 BIGINT;
  v_l23 BIGINT;
BEGIN
  SELECT id INTO v_l19 FROM picture_describe_lessons WHERE order_index = 19 ORDER BY id LIMIT 1;
  SELECT id INTO v_l20 FROM picture_describe_lessons WHERE order_index = 20 ORDER BY id LIMIT 1;
  SELECT id INTO v_l21 FROM picture_describe_lessons WHERE order_index = 21 ORDER BY id LIMIT 1;
  SELECT id INTO v_l22 FROM picture_describe_lessons WHERE order_index = 22 ORDER BY id LIMIT 1;
  SELECT id INTO v_l23 FROM picture_describe_lessons WHERE order_index = 23 ORDER BY id LIMIT 1;

  IF v_l19 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 19 not found';
  END IF;
  IF v_l20 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 20 not found';
  END IF;
  IF v_l21 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 21 not found';
  END IF;
  IF v_l22 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 22 not found';
  END IF;
  IF v_l23 IS NULL THEN
    RAISE EXCEPTION 'Picture describe lesson 23 not found';
  END IF;

  DELETE FROM picture_describe_vocab
  WHERE lesson_id IN (v_l19, v_l20, v_l21, v_l22, v_l23);

  -- Lesson 19: busy street market
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l19, 1, 'سُوق', 'market'),
  (v_l19, 2, 'نَاس', 'people'),
  (v_l19, 3, 'خُضْرَوَات', 'vegetables'),
  (v_l19, 4, 'فَوَاكِه', 'fruit'),
  (v_l19, 5, 'بَائِع', 'seller'),
  (v_l19, 6, 'مِظَلَّة', 'umbrella'),
  (v_l19, 7, 'طِفْل', 'child'),
  (v_l19, 8, 'شَارِع', 'street');

  -- Lesson 20: helping an elderly person cross the road
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l20, 1, 'رَجُل', 'man'),
  (v_l20, 2, 'امْرَأَة', 'woman'),
  (v_l20, 3, 'عَجُوز', 'elderly'),
  (v_l20, 4, 'مُتَطَوِّع', 'volunteer'),
  (v_l20, 5, 'طَرِيق', 'road'),
  (v_l20, 6, 'عَصًا', 'walking stick'),
  (v_l20, 7, 'كِيس', 'bag'),
  (v_l20, 8, 'كِمَامَة', 'mask');

  -- Lesson 21: meal at a restaurant
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l21, 1, 'طَعَام', 'food'),
  (v_l21, 2, 'مَائِدَة', 'table'),
  (v_l21, 3, 'أَصْحَاب', 'friends'),
  (v_l21, 4, 'صَحْن', 'plate'),
  (v_l21, 5, 'خُبْز', 'bread'),
  (v_l21, 6, 'سَلَطَة', 'salad'),
  (v_l21, 7, 'عَصِير', 'juice'),
  (v_l21, 8, 'مَطْعَم', 'restaurant');

  -- Lesson 22: city skyline
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l22, 1, 'مَدِينَة', 'city'),
  (v_l22, 2, 'مَبَانٍ', 'buildings'),
  (v_l22, 3, 'بُرْج', 'tower'),
  (v_l22, 4, 'سَمَاء', 'sky'),
  (v_l22, 5, 'سُحُب', 'clouds'),
  (v_l22, 6, 'نَهْر', 'river'),
  (v_l22, 7, 'غُرُوب', 'sunset'),
  (v_l22, 8, 'نَافِذَة', 'window');

  -- Lesson 23: farm with geese
  INSERT INTO picture_describe_vocab (lesson_id, order_index, arabic, english) VALUES
  (v_l23, 1, 'مَزْرَعَة', 'farm'),
  (v_l23, 2, 'إِوَزّ', 'geese'),
  (v_l23, 3, 'حَظِيرَة', 'barn'),
  (v_l23, 4, 'سِيَاج', 'fence'),
  (v_l23, 5, 'عُشْب', 'grass'),
  (v_l23, 6, 'سَقْف', 'roof'),
  (v_l23, 7, 'دَلْو', 'bucket'),
  (v_l23, 8, 'حَيَوَانَات', 'animals');
END $$;
