-- ============================================================
-- PRE-BOOK 1: FOUNDATIONS — Lessons 13–18 (49 words)
-- Run AFTER 202604130005_prebook_lessons_9_12.sql succeeds
-- ============================================================

DO $$
DECLARE
  v_stage BIGINT;
  v_l13 BIGINT; v_l14 BIGINT; v_l15 BIGINT;
  v_l16 BIGINT; v_l17 BIGINT; v_l18 BIGINT;
BEGIN

  -- Find the Foundations stage
  SELECT id INTO v_stage FROM stages WHERE name = 'Foundations' ORDER BY id LIMIT 1;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'Foundations stage not found — run the first migration first';
  END IF;

  -- ── Lesson 13 ──
  SELECT id INTO v_l13 FROM lessons WHERE stage_id = v_stage AND title = 'Days & Time' ORDER BY id LIMIT 1;
  IF v_l13 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Days & Time', 'Day, week, month, year, night, before and after', 'prebook', 13)
    RETURNING id INTO v_l13;
  ELSE
    UPDATE lessons SET description = 'Day, week, month, year, night, before and after', lesson_format = 'prebook', "order" = 13 WHERE id = v_l13;
  END IF;

  -- ── Lesson 14 ──
  SELECT id INTO v_l14 FROM lessons WHERE stage_id = v_stage AND title = 'Places & Amounts' ORDER BY id LIMIT 1;
  IF v_l14 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Places & Amounts', 'City, restaurant, food, garden, much and little', 'prebook', 14)
    RETURNING id INTO v_l14;
  ELSE
    UPDATE lessons SET description = 'City, restaurant, food, garden, much and little', lesson_format = 'prebook', "order" = 14 WHERE id = v_l14;
  END IF;

  -- ── Lesson 15 ──
  SELECT id INTO v_l15 FROM lessons WHERE stage_id = v_stage AND title = 'Opposites' ORDER BY id LIMIT 1;
  IF v_l15 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Opposites', 'Tall/short, heavy/light, wide/narrow, door and window', 'prebook', 15)
    RETURNING id INTO v_l15;
  ELSE
    UPDATE lessons SET description = 'Tall/short, heavy/light, wide/narrow, door and window', lesson_format = 'prebook', "order" = 15 WHERE id = v_l15;
  END IF;

  -- ── Lesson 16 ──
  SELECT id INTO v_l16 FROM lessons WHERE stage_id = v_stage AND title = 'House & Structure' ORDER BY id LIMIT 1;
  IF v_l16 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'House & Structure', 'Roof, floor, room, wall, entering and exiting', 'prebook', 16)
    RETURNING id INTO v_l16;
  ELSE
    UPDATE lessons SET description = 'Roof, floor, room, wall, entering and exiting', lesson_format = 'prebook', "order" = 16 WHERE id = v_l16;
  END IF;

  -- ── Lesson 17 ──
  SELECT id INTO v_l17 FROM lessons WHERE stage_id = v_stage AND title = 'Meals & Times of Day' ORDER BY id LIMIT 1;
  IF v_l17 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Meals & Times of Day', 'Breakfast, lunch, dinner, morning, noon and evening', 'prebook', 17)
    RETURNING id INTO v_l17;
  ELSE
    UPDATE lessons SET description = 'Breakfast, lunch, dinner, morning, noon and evening', lesson_format = 'prebook', "order" = 17 WHERE id = v_l17;
  END IF;

  -- ── Lesson 18 ──
  SELECT id INTO v_l18 FROM lessons WHERE stage_id = v_stage AND title = 'Directions & Time Units' ORDER BY id LIMIT 1;
  IF v_l18 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Directions & Time Units', 'Entrance, exit, inside, outside, seconds, minutes and hours', 'prebook', 18)
    RETURNING id INTO v_l18;
  ELSE
    UPDATE lessons SET description = 'Entrance, exit, inside, outside, seconds, minutes and hours', lesson_format = 'prebook', "order" = 18 WHERE id = v_l18;
  END IF;

  -- Clear old items for re-runnability
  DELETE FROM prebook_items WHERE lesson_id IN (v_l13, v_l14, v_l15, v_l16, v_l17, v_l18);

  -- ══════════════════════════════════════════
  -- LESSON 13: Days & Time (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l13, 1, 'يَوْم / أَيَّام', 'day / days',
    'هِيَ تَكْتُبُ دَرْسَهَا فِي يَومٍ.', 'She writes her lesson in one day.',
    'يَوْمٌ مِنَ الأَيَّامِ، أَحْمَدُ إِمَامُ هَذَا المَسْجِدِ.', 'One day, Ahmad will be the imam of this mosque.',
    'مَنْ الرَّجُلُ الَّذِي يَذْهَبُ إِلَى الْمَكْتَبِ فِي يَوْمٍ؟', 'Who is the man who goes to the office in a day?'),
  (v_l13, 2, 'أُسْبُوع / أَسَابِيع', 'week / weeks',
    'هَذَا الأُسْبُوعَ تَذْهَبُ المُدَرِّسَةُ إِلَى وَسَطِ المَدِيْنَةِ.', 'This week the teacher goes to the city centre.',
    'عِنْدَ هَذَا المَسْجِدِ إِمَامٌ جَدِيدٌ هَذَا الأُسْبُوعَ.', 'This week there is a new imam at this mosque.',
    'هَلْ تَكْتُبُ الْوَاجِبَيْنِ الصَّعْبَيْنِ هَذَا الأُسْبُوعَ؟', 'Are you writing the two difficult homework tasks this week?'),
  (v_l13, 3, 'شَهْر / أَشْهُر', 'month / months',
    'هِيَ لَا تَذْهَبُ إِلَى دَرْسِهَا بَعْدَ شَهْرٍ.', 'She does not go to her lesson after a month.',
    'عِنْدَ حَامِدٍ بَيْتٌ جَدِيدٌ هَذَا الشَّهْرَ.', 'Hamid has a new house this month.',
    'مَنْ هُوَ الْمُعَلِّمُ الْجَدِيدُ لِهَذَا الشَّهْرِ؟', 'Who is the new teacher for this month?'),
  (v_l13, 4, 'سَنَة / سَنَوَات', 'year / years',
    'السَّنَةُ الجَدِيدَةُ قَرِيبَةٌ مِنَّا.', 'The new year is near us.',
    'هَذِهِ السَّنَةُ فِي المَدْرَسَةِ سَهْلَةٌ.', 'This year at school is easy.',
    'هَلِ الْوَاجِبُ هَذِهِ السَّنَةَ سَهْلٌ أَمْ صَعْبٌ؟', 'Is the homework this year easy or difficult?'),
  (v_l13, 5, 'عَام', 'year',
    'يَقُومُ زَيْدٌ هُنَاكَ لِعَامَيْنِ وَالآنَ يُرِيدُ أَنْ يَذْهَبَ.', 'Zayd stays there for two years, and now he wants to leave.',
    'أَنَا أُرِيدُ مُدَرِّسًا جَيِّدًا لِهَذَا العَامِ.', 'I want a good teacher for this year.',
    'مَنْ الْمُدَرِّسُ هَذَا العَامَ؟', 'Who is the teacher this year?'),
  (v_l13, 6, 'لَيْلَة / لَيَالٍ', 'night / nights',
    'تُرِيدِينَ أَنْ تَأْكُلِي مَعَهَا هَذِهِ اللَّيْلَةَ.', 'You want to eat with her tonight.',
    'اللَّيْلَةُ قَرِيبَةٌ وَأُرِيدُ أَنْ أَذْهَبَ إِلَى بَيْتِي.', 'The night is near, and I want to go to my house.',
    'مَعَ مَنْ تَدْرُسُ فِي اللَّيْلِ؟', 'With whom do you study at night?'),
  (v_l13, 7, 'بَعْدَ', 'after',
    'عِنْدِي دَرْسٌ جَدِيدٌ بَعْدَ هَذَا.', 'I have a new lesson after this.',
    'أَنْتِ تَذْهَبِينَ هُنَاكَ بَعْدَ شَهْرَيْنِ.', 'You go there after two months.',
    'أَيُّ دَرْسٍ لَكَ بَعْدَ هَذَا؟', 'Which lesson do you have after this?'),
  (v_l13, 8, 'قَبْلَ', 'before',
    'هُوَ يَكْتُبُ الوَاجِبَ قَبْلَ دَرْسِهِ غَدًا.', 'He writes the homework before his lesson tomorrow.',
    'يَذْهَبُ حَامِدٌ إِلَى الْمَسْجِدِ القَدِيمِ قَبْلَ أَنْ يَأْكُلَ مَعَ زَيْدٍ.', 'Hamid goes to the old mosque before he eats with Zayd.',
    'مَاذَا تَأْكُلُ قَبْلَ اللَّيْلِ؟', 'What do you eat before the night?');

  -- ══════════════════════════════════════════
  -- LESSON 14: Places & Amounts (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l14, 1, 'حَوْلَ', 'around',
    'يَقُومُ الرِّجَالُ حَوْلَ المَسْجِدِ الآنَ.', 'The men are standing around the mosque now.',
    'تَجْلِسُ النِّسَاءُ حَوْلَ المَكْتَبِ وَعَائِشَةُ تَقْرَأُ.', 'The women are sitting around the desk, and Aishah is reading.',
    'كَمْ كُرْسِيًّا حَوْلَ المَكْتَبِ؟', 'How many chairs are around the desk?'),
  (v_l14, 2, 'مَدِينَة / مُدُن', 'city / cities',
    'هَذِهِ المَدِينَةُ مُمْتَازَةٌ وَأُرِيدُ بَيْتًا هُنَا.', 'This city is excellent, and I want a house here.',
    'بَيْتُ عَائِشَةَ بَعِيدٌ عَنِ المُدُنِ الكَبِيرَةِ.', 'Aishah''s house is far from the big cities.',
    'إِلَى أَيِّ مَدِينَةٍ تُرِيدُ أَنْ تَذْهَبَ؟', 'Which city do you want to go to?'),
  (v_l14, 3, 'مَطْعَم / مَطَاعِم', 'restaurant / restaurants',
    'تَعَالْ مَعِي إِلَى المَدِينَةِ لِلْمَطَاعِمِ الجَيِّدَةِ.', 'Come with me to the city for the good restaurants.',
    'هُنَاكَ مَطْعَمٌ جَدِيدٌ عَلَى يَسَارِ المَسْجِدِ.', 'There is a new restaurant on the left of the mosque.',
    'هَلِ المَطْعَمُ الجَيِّدُ أَمَامَ المَكْتَبِ الجَدِيدِ أَمْ خَلْفَهُ؟', 'Is the good restaurant in front of the new office or behind it?'),
  (v_l14, 4, 'طَعَام / أَطْعِمَة', 'food / foods',
    'طَعَامُكِ جَيِّدٌ جِدًّا الأَمْسَ، تَعَالَيْ إِلَى بَيْتِي غَدًا.', 'Your food was very good yesterday; come to my house tomorrow.',
    'يَأْكُلُ الإِمَامُ أَطْعِمَةً صَغِيرَةً قَبْلَ أَنْ يَذْهَبَ إِلَى مَسْجِدِهِ.', 'The imam eats small foods before he goes to his mosque.',
    'لِمَاذَا هَذَا الطَّعَامُ لَيْسَ جَيِّدًا؟', 'Why is this food not good?'),
  (v_l14, 5, 'لَيْسَ', 'is not / not',
    'لَيْسَتْ فَاطِمَةُ فِي بَيْتِهَا الجَدِيدِ هَذَا الأُسْبُوعَ.', 'Fatimah is not in her new house this week.',
    'لَسْتُ مِنْ مَدِينَةِ لَنْدَن.', 'I am not from the city of London.',
    'لِمَاذَا هَذَا الطَّعَامُ لَيْسَ جَيِّدًا؟', 'Why is this food not good?'),
  (v_l14, 6, 'حَدِيقَة / حَدَائِق', 'garden / park / gardens / parks',
    'زَيْدٌ يَجْلِسُ فِي الحَدِيقَةِ خَلْفَ المَسْجِدِ.', 'Zayd is sitting in the garden behind the mosque.',
    'هُنَاكَ حَدَائِقُ كَثِيرَةٌ فِي مَدِينَتِكَ.', 'There are many parks in your city.',
    'أَيُّ حَدِيقَةٍ قَرِيبَةٌ مِنَ المَدْرَسَةِ؟', 'Which park is near the school?'),
  (v_l14, 7, 'كَثِير', 'much / many',
    'عَلَيْكِ أَنْ تَقْرَئِي كَثِيرًا قَبْلَ دَرْسِكِ.', 'You should read a lot before your lesson.',
    'عِنْدِي وَاجِبَاتٌ كَثِيرَةٌ مِنْ مُدَرِّسِي.', 'I have a lot of homework from my teacher.',
    'هَلْ كَثِيرٌ مِنَ الرِّجَالِ فِي المَسْجِدِ هَذَا الأُسْبُوعَ؟', 'Are there many men in the mosque this week?'),
  (v_l14, 8, 'قَلِيل', 'little / few',
    'عِنْدَكَ أَقْلَامٌ قَلِيلَةٌ فِي حَقِيبَتِكَ الصَّغِيرَةِ.', 'You have a few pens in your small bag.',
    'يَكْتُبُ حَامِدٌ قَلِيلًا مِنْ وَاجِبِهِ فِي الصَّبَاحِ وَقَلِيلًا فِي المَسَاءِ.', 'Hamid writes a little of his homework in the morning and a little in the evening.',
    'لِمَاذَا أَنْتَ تَدْرُسُ قَلِيلًا، الاِمْتِحَانُ صَعْبٌ؟', 'Why do you study only a little? Is the exam difficult?');

  -- ══════════════════════════════════════════
  -- LESSON 15: Opposites (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l15, 1, 'طَوِيل', 'long / tall',
    'أَيَّامِي عِنْدَ المَدْرَسَةِ طَوِيلَةٌ وَأُرِيدُ أَنْ أَجْلِسَ فِي البَيْتِ.', 'My days at school are long, and I want to sit at home.',
    'أَنْتِ امْرَأَةٌ طَوِيلَةٌ وَتُرِيدِينَ كُرْسِيًّا طَوِيلًا.', 'You are a tall woman, and you want a tall chair.',
    'هَلْ زَيْدٌ طَوِيلٌ جِدًّا وَفَاطِمَةُ لَيْسَتْ طَوِيلَةً؟', 'Is Zayd very tall and Fatimah not tall?'),
  (v_l15, 2, 'قَصِير', 'short',
    'الاِمْرَأَةُ القَصِيرَةُ تَقُومُ مَعَ النِّسَاءِ هُنَاكَ.', 'The short woman is standing there with the women.',
    'الدُّرُوسُ مَعَ الإِمَامِ قَصِيرَةٌ هَذِهِ الأَيَّامَ.', 'The lessons with the imam are short these days.',
    'مَنْ هَذَا الرَّجُلُ القَصِيرُ جِدًّا؟', 'Who is this very short man?'),
  (v_l15, 3, 'ثَقِيل', 'heavy',
    'الكُرْسِيُّ الثَّقِيلُ أَمَامَهُ.', 'The heavy chair is in front of him.',
    'الكُتُبُ الكَبِيرَةُ فِي حَقِيبَتِكَ ثَقِيلَةٌ.', 'The big books in your bag are heavy.',
    'هَلِ الْحَقِيبَةُ ثَقِيلَةٌ عَلَيْكَ؟', 'Is the bag heavy for you?'),
  (v_l15, 4, 'خَفِيف', 'light',
    'أَنْتِ تَأْكُلِينَ طَعَامًا خَفِيفًا خَلْفَ مَكْتَبِكِ الْيَوْمَ.', 'You are eating light food behind your desk today.',
    'هَذِهِ أَطْعِمَةٌ خَفِيفَةٌ وَجَيِّدَةٌ لِزَيْدٍ.', 'These are light foods and good for Zayd.',
    'هَلِ الكَرَاسِيُّ الَّتِي فِي المَطْعَمِ خَفِيفَةٌ؟', 'Are the chairs in the restaurant light?'),
  (v_l15, 5, 'وَاسِع', 'wide / spacious',
    'تُرِيدُ عَائِشَةُ بَيْتًا جَيِّدًا فِي هَذِهِ المَدِينَةِ الوَاسِعَةِ.', 'Aishah wants a good house in this spacious city.',
    'مُحَمَّدٌ إِمَامُ مَسْجِدٍ وَاسِعٍ فِي وَسَطِ مَدِينَتِهِ.', 'Muhammad is the imam of a spacious mosque in the centre of his city.',
    'لِمَاذَا المَسْجِدُ وَاسِعٌ جِدًّا؟', 'Why is the mosque so spacious?'),
  (v_l15, 6, 'ضَيِّق', 'narrow / tight',
    'هَذَا المَدْخَلُ ضَيِّقٌ لِدُخُولِ السَّيَّارَةِ.', 'This entrance is too narrow for the car to enter.',
    'هُوَ يَدْخُلُ مِنْ بَابٍ ضَيِّقٍ.', 'He enters through a narrow door.',
    'هَلْ هَذَا الْبَيْتُ ضَيِّقٌ؟', 'Is this house narrow?'),
  (v_l15, 7, 'بَاب / أَبْوَاب', 'door / doors',
    'أَنَا خَلْفَ البَابِ الكَبِيرِ الثَّقِيلِ مَعَ حَامِدٍ.', 'I am behind the big heavy door with Hamid.',
    'تَقُومِينَ بَيْنَ البَابَيْنِ الطَّوِيلَيْنِ قَبْلَ الدَّرْسِ الْيَوْمَ.', 'You stand between the two tall doors before the lesson today.',
    'مَنْ هُوَ عِنْدَ بَابِ الْبَيْتِ؟', 'Who is at the door of the house?'),
  (v_l15, 8, 'نَافِذَة / شُبَّاك', 'window',
    'هُنَاكَ شُبَّاكٌ جَدِيدٌ قَرِيبٌ مِنَ البَابِ فِي الوَسَطِ.', 'There is a new window near the door in the middle.',
    'هِيَ تَقْرَأُ كِتَابَهَا عِنْدَ نَافِذَةٍ وَاسِعَةٍ.', 'She reads her book by a wide window.',
    'مَنْ يَقْرَأُ كِتَابًا عِنْدَ نَافِذَةٍ وَاسِعَةٍ؟', 'Who is reading a book by a wide window?');

  -- ══════════════════════════════════════════
  -- LESSON 16: House & Structure (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l16, 1, 'سَقْف', 'roof / ceiling',
    'عِنْدَ المَدْرَسَةِ سَقْفٌ جَدِيدٌ هَذَا الأُسْبُوعَ.', 'There is a new roof at the school this week.',
    'تَعَالْ هُنَا وَاجْلِسْ مَعِي عَلَى السَّقْفِ.', 'Come here and sit with me on the roof.',
    'مَنْ يُرِيدُ أَنْ يَجْلِسَ وَيَقْرَأَ عَلَى السَّقْفِ؟', 'Who wants to sit and read on the roof?'),
  (v_l16, 2, 'أَرْض', 'ground / earth / floor',
    'يَقُولُ لَكَ رَبُّكَ أَنَّ أَرْضَهُ وَاسِعَةٌ.', 'Your Lord tells you that His earth is vast.',
    'طَعَامٌ مِنْ تَحْتِ الأَرْضِ مُمْتَازٌ وَعِنْدِي كَثِيرٌ فِي حَدِيقَتِي.', 'Food from under the ground is excellent, and I have a lot of it in my garden.',
    'هَلْ قَلَمُكَ وَحَقِيبَتُكَ عَلَى الأَرْضِ تَحْتَ الكُرْسِيِّ؟', 'Are your pen and your bag on the ground under the chair?'),
  (v_l16, 3, 'غُرْفَة / غُرَف', 'room / rooms',
    'غُرْفَتُكَ القَدِيمَةُ صَغِيرَةٌ وَضَيِّقَةٌ وَلَا أُرِيدُهَا.', 'Your old room is small and narrow, and I do not want it.',
    'تَكْتُبُ فَاطِمَةُ وَاجِبَهَا فِي غُرْفَتِهَا الصَّغِيرَةِ.', 'Fatimah writes her homework in her small room.',
    'لِمَاذَا تَكْتُبُ فَاطِمَةُ وَاجِبَهَا فِي غُرْفَتِهَا؟', 'Why does Fatimah write her homework in her room?'),
  (v_l16, 4, 'حَائِط / جِدَار', 'wall',
    'تَقُومُ فَاطِمَةُ عَلَى حَائِطِ المَدِينَةِ القَدِيمَةِ.', 'Fatimah stands on the wall of the old city.',
    'هِيَ تَقُولُ أَنَّ عِنْدَكِ جِدَارًا قَصِيرًا حَوْلَ حَدِيقَتِكِ.', 'She says that you have a short wall around your garden.',
    'مَا الَّذِي فِي حَائِطِ الْمَسْجِدِ؟', 'What is on the mosque wall?'),
  (v_l16, 5, 'أَوْ / أَمْ', 'or',
    'لَا تَذْهَبِي إِلَى المَطْعَمِ أَوِ الحَدِيقَةِ بَعْدَ دَرْسِكِ.', 'Do not go to the restaurant or the park after your lesson.',
    'يَقْرَأُ تَحْتَ الشَّجَرَةِ فِي الحَدِيقَةِ، أَوْ يَقْرَأُ فِي غُرْفَتِهِ.', 'He reads under the tree in the park, or he reads in his room.',
    'هَلْ جِدَارُ الغُرْفَةِ صَغِيرٌ أَمْ حَائِطُهَا كَبِيرٌ؟', 'Is the room''s wall small, or is its wall big?'),
  (v_l16, 6, 'يَدْخُلُ', 'he enters',
    'يَدْخُلُ الْكِتَابُ فِي حَقِيبَةِ الطَّالِبِ.', 'The book fits into the student''s bag.',
    'يَدْخُلُ الْمُدَرِّسُ غُرْفَةَ الدَّرْسِ.', 'The teacher enters the lesson room.',
    'مِنْ أَيِّ بَابٍ نَدْخُلُ المَدْرَسَةَ؟', 'From which door do we enter the school?'),
  (v_l16, 7, 'يَخْرُجُ', 'he exits / goes out',
    'هِيَ تَخْرُجُ مِنْ هُنَاكَ.', 'She goes out from there.',
    'يَخْرُجُ مِنْ هَذِهِ الْغُرْفَةِ.', 'He goes out from this room.',
    'كَيْفَ نَخْرُجُ مِنْ هَذَا البَابِ الضَّيِّقِ؟', 'How do we get out through this narrow door?'),
  (v_l16, 8, 'يَفْتَحُ', 'he opens',
    'يَفْتَحُ الْكِتَابَ الْجَدِيدَ.', 'He opens the new book.',
    'هُوَ يَفْتَحُ بَابَ الْبَيْتِ.', 'He opens the door of the house.',
    'أَيُّ رَجُلٍ يَفْتَحُ النَّافِذَةَ؟', 'Which man opens the window?');

  -- ══════════════════════════════════════════
  -- LESSON 17: Meals & Times of Day (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l17, 1, 'يُغْلِقُ', 'he closes',
    'يُغْلِقُ الْكِتَابَ بَعْدَ الدَّرْسِ.', 'He closes the book after the lesson.',
    'هُوَ يُغْلِقُ بَابَ الْبَيْتِ.', 'He closes the door of the house.',
    'لِمَاذَا لَا تُغْلِقُ زَيْنَبُ الشُّبَّاكَ؟', 'Why does Zaynab not close the window?'),
  (v_l17, 2, 'وَجْبَة / وَجَبَات', 'meal / meals',
    'يَأْكُلُ وَجْبَةَ الْيَوْمِ هُنَا.', 'He eats today''s meal here.',
    'يَأْكُلُ وَجَبَاتٍ كَثِيرَةً فِي الْيَوْمِ.', 'He eats many meals in the day.',
    'كَمْ وَجْبَةً تَأْكُلُ فِي يَوْمٍ فِي شَهْرِ رَمَضَانَ؟', 'How many meals do you eat in a day in Ramadan?'),
  (v_l17, 3, 'فُطُور', 'breakfast',
    'أَنَا آكُلُ فُطُورًا قَلِيلًا.', 'I eat a small breakfast.',
    'هُوَ يَأْكُلُ فُطُورًا جَيِّدًا.', 'He eats a good breakfast.',
    'مَتَى تَأْكُلُ فُطُورَكَ كُلَّ يَوْمٍ؟', 'When do you eat your breakfast every day?'),
  (v_l17, 4, 'غَدَاء', 'lunch',
    'أَنَا آكُلُ الْغَدَاءَ فِي الْمَطْعَمِ.', 'I eat lunch in the restaurant.',
    'أَنْتَ تُرِيدُ غَدَاءَكَ فِي الْمَطْعَمِ خَلْفَ بَيْتِكَ.', 'You want your lunch in the restaurant behind your house.',
    'هَلْ تَأْكُلُ غَدَاءً خَفِيفًا فِي الْمَطْعَمِ الْيَوْمَ؟', 'Are you eating a light lunch in the restaurant today?'),
  (v_l17, 5, 'عَشَاء', 'dinner',
    'هَذَا طَعَامُ الْعَشَاءِ جَيِّدٌ جِدًّا.', 'This dinner food is very good.',
    'هِيَ تُحِبُّ عَشَاءَ الْيَوْمِ.', 'She likes today''s dinner.',
    'هَلْ تَأْكُلُ عَشَاءَكَ فِي الْبَيْتِ الْيَوْمَ؟', 'Are you eating your dinner at home today?'),
  (v_l17, 6, 'صَبَاحًا', 'in the morning',
    'يَفْتَحُ الْوَلَدُ بَابَ الْبَيْتِ صَبَاحًا.', 'The boy opens the door of the house in the morning.',
    'يَشْرَبُ الرَّجُلُ الْقَهْوَةَ صَبَاحًا.', 'The man drinks coffee in the morning.',
    'مَتَى يَأْكُلُ الرَّجُلُ طَعَامَهُ؟ صَبَاحًا أَمْ ظُهْرًا؟', 'When does the man eat his food? In the morning or at noon?'),
  (v_l17, 7, 'ظُهْرًا', 'at noon / in the afternoon',
    'تَقْرَأُ الْمُدَرِّسَةُ الْكِتَابَ ظُهْرًا.', 'The teacher reads the book at noon.',
    'يَجْلِسُ عَلَى الْكُرْسِيِّ فِي الْمَكْتَبِ ظُهْرًا.', 'He sits on the chair in the office at noon.',
    'مَتَى يَأْكُلُ الرَّجُلُ طَعَامَهُ؟ هَلْ يَأْكُلُهُ ظُهْرًا؟', 'When does the man eat his food? Does he eat it at noon?'),
  (v_l17, 8, 'مَسَاءً', 'in the evening',
    'أَنَا أَقْرَأُ كِتَابًا فِي غُرْفَتِي مَسَاءً.', 'I read a book in my room in the evening.',
    'هِيَ تَذْهَبُ إِلَى الْحَدِيقَةِ مَعَ صَدِيقَتِهَا مَسَاءً.', 'She goes to the park with her friend in the evening.',
    'مَا فِي وَجْبَتِكَ الَّتِي تَأْكُلُهَا فِي الْمَسَاءِ؟', 'What is in your meal that you eat in the evening?');

  -- ══════════════════════════════════════════
  -- LESSON 18: Directions & Time Units (9 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l18, 1, 'مَدْخَل / مَدَاخِل', 'entrance / entrances',
    'لَيْسَ هُنَاكَ مَدْخَلٌ آخَرُ.', 'There is no other entrance.',
    'هَذِهِ مَدَاخِلُ الْبُيُوتِ.', 'These are the entrances of the houses.',
    'أَيْنَ مَدْخَلُ الْمَسْجِدِ عَلَى الْيَمِينِ؟', 'Where is the mosque entrance on the right?'),
  (v_l18, 2, 'مَخْرَج / مَخَارِج', 'exit / exits',
    'الْمَخْرَجُ قَرِيبٌ مِنْ هُنَا.', 'The exit is near here.',
    'هَذَا مَخْرَجٌ جَدِيدٌ لِلْمَطْعَمِ.', 'This is a new exit for the restaurant.',
    'مِنْ أَيِّ مَخْرَجٍ نَخْرُجُ؟', 'From which exit do we leave?'),
  (v_l18, 3, 'يَتَكَلَّمُ', 'he speaks / talks',
    'نَعَمْ، هُوَ يَتَكَلَّمُ بِاللُّغَةِ الْعَرَبِيَّةِ جَيِّدًا.', 'Yes, he speaks Arabic well.',
    'أَنْتِ تَتَكَلَّمِينَ مَعَ اِمْرَأَةٍ فِي الْحَدِيقَةِ.', 'You are speaking with a woman in the park.',
    'كَيْفَ تَتَكَلَّمُ اللُّغَةَ الْعَرَبِيَّةَ جَيِّدًا جِدًّا؟', 'How do you speak Arabic very well?'),
  (v_l18, 4, 'دَاخِل', 'inside',
    'يَخْرُجُ الرَّجُلُ مِنْ دَاخِلِ الْبَيْتِ.', 'The man comes out from inside the house.',
    'الأَقْلَامُ دَاخِلَ الْحَقَائِبِ.', 'The pens are inside the bags.',
    'كَمْ كِتَابًا دَاخِلَ الْحَقِيبَةِ تَقْرَأُهُ فِي الأُسْبُوعِ؟', 'How many books inside the bag do you read in the week?'),
  (v_l18, 5, 'خَارِج', 'outside',
    'هَذَا الرَّجُلُ يَأْكُلُ خَارِجَ الْبَيْتِ.', 'This man eats outside the house.',
    'أَنْتَ تَذْهَبُ إِلَى خَارِجِ الْمَدِينَةِ.', 'You go outside the city.',
    'لِمَاذَا تَذْهَبُ خَارِجَ الْمَدِينَةِ فِي اللَّيْلِ؟', 'Why do you go outside the city at night?'),
  (v_l18, 6, 'نَحْنُ', 'we',
    'نَحْنُ نَكْتُبُ دُرُوسًا جَدِيدَةً فِي الْمَكْتَبِ.', 'We write new lessons in the office.',
    'نَحْنُ نُرِيدُ أَنْ نَكُونَ أَئِمَّةً فِي الْمُسْتَقْبَلِ.', 'We want to become imams in the future.',
    'مَاذَا نَأْكُلُ لِلسُّحُورِ الْيَوْمَ؟', 'What shall we eat for suhoor today?'),
  (v_l18, 7, 'ثَانِيَة / ثَوَانٍ', 'second / seconds',
    'هِيَ تَشْرَبُ الْمَاءَ فِي ثَوَانٍ قَلِيلَةٍ.', 'She drinks the water in a few seconds.',
    'يَأْكُلُ طَعَامَهُ فِي ثَوَانٍ.', 'He eats his food in seconds.',
    'كَيْفَ يَأْكُلُ زَيْدٌ طَعَامَهُ فِي ثَوَانٍ؟', 'How does Zayd eat his food in seconds?'),
  (v_l18, 8, 'دَقِيقَة / دَقَائِق', 'minute / minutes',
    'هَذِهِ الْمُدَرِّسَةُ تَتَحَدَّثُ لِدَقَائِقَ.', 'This teacher speaks for minutes.',
    'أَنَا أُرِيدُ أَنْ أَنَامَ لِدَقَائِقَ.', 'I want to sleep for a few minutes.',
    'مَنْ يُرِيدُ أَنْ يَخْرُجَ بَعْدَ دَقَائِقَ قَلِيلَةٍ؟', 'Who wants to go out after a few minutes?'),
  (v_l18, 9, 'سَاعَة / سَاعَات', 'hour / hours',
    'تَعَالَ إِلَى الْمَسْجِدِ بَعْدَ سَاعَةٍ.', 'Come to the mosque after an hour.',
    'هِيَ تَجْلِسُ عَلَى الْكُرْسِيِّ فِي الْمَكْتَبِ لِسَاعَاتٍ.', 'She sits on the chair in the office for hours.',
    'هَلْ يَفْتَحُ الْمَطْعَمُ بَعْدَ سَاعَةٍ؟', 'Does the restaurant open after an hour?');

END $$;
