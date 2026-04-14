-- ============================================================
-- PRE-BOOK 1: FOUNDATIONS — Lessons 19–24 (48 words)
-- Run AFTER 202604130006_prebook_lessons_13_18.sql succeeds
-- ============================================================

DO $$
DECLARE
  v_stage BIGINT;
  v_l19 BIGINT; v_l20 BIGINT; v_l21 BIGINT;
  v_l22 BIGINT; v_l23 BIGINT; v_l24 BIGINT;
BEGIN

  -- Find the Foundations stage
  SELECT id INTO v_stage FROM stages WHERE name = 'Foundations' ORDER BY id LIMIT 1;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'Foundations stage not found — run the first migration first';
  END IF;

  -- ── Lesson 19 ──
  SELECT id INTO v_l19 FROM lessons WHERE stage_id = v_stage AND title = 'Study & Sight' ORDER BY id LIMIT 1;
  IF v_l19 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Study & Sight', 'Studying, centuries, looking, seeing, eyes and ears', 'prebook', 19)
    RETURNING id INTO v_l19;
  ELSE
    UPDATE lessons SET description = 'Studying, centuries, looking, seeing, eyes and ears', lesson_format = 'prebook', "order" = 19 WHERE id = v_l19;
  END IF;

  -- ── Lesson 20 ──
  SELECT id INTO v_l20 FROM lessons WHERE stage_id = v_stage AND title = 'Listening & Senses' ORDER BY id LIMIT 1;
  IF v_l20 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Listening & Senses', 'Listening, taking, hands, when, where, time and senses', 'prebook', 20)
    RETURNING id INTO v_l20;
  ELSE
    UPDATE lessons SET description = 'Listening, taking, hands, when, where, time and senses', lesson_format = 'prebook', "order" = 20 WHERE id = v_l20;
  END IF;

  -- ── Lesson 21 ──
  SELECT id INTO v_l21 FROM lessons WHERE stage_id = v_stage AND title = 'Touch & Taste' ORDER BY id LIMIT 1;
  IF v_l21 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Touch & Taste', 'Nose, touching, wiping, tasting, tongue and thinking', 'prebook', 21)
    RETURNING id INTO v_l21;
  ELSE
    UPDATE lessons SET description = 'Nose, touching, wiping, tasting, tongue and thinking', lesson_format = 'prebook', "order" = 21 WHERE id = v_l21;
  END IF;

  -- ── Lesson 22 ──
  SELECT id INTO v_l22 FROM lessons WHERE stage_id = v_stage AND title = 'Thoughts & Movement' ORDER BY id LIMIT 1;
  IF v_l22 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Thoughts & Movement', 'Certainty, doubt, illusion, transport, walking and running', 'prebook', 22)
    RETURNING id INTO v_l22;
  ELSE
    UPDATE lessons SET description = 'Certainty, doubt, illusion, transport, walking and running', lesson_format = 'prebook', "order" = 22 WHERE id = v_l22;
  END IF;

  -- ── Lesson 23 ──
  SELECT id INTO v_l23 FROM lessons WHERE stage_id = v_stage AND title = 'Vehicles & Travel' ORDER BY id LIMIT 1;
  IF v_l23 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Vehicles & Travel', 'Station, train, bus, plane, car, airport and passengers', 'prebook', 23)
    RETURNING id INTO v_l23;
  ELSE
    UPDATE lessons SET description = 'Station, train, bus, plane, car, airport and passengers', lesson_format = 'prebook', "order" = 23 WHERE id = v_l23;
  END IF;

  -- ── Lesson 24 ──
  SELECT id INTO v_l24 FROM lessons WHERE stage_id = v_stage AND title = 'Driving & Abilities' ORDER BY id LIMIT 1;
  IF v_l24 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Driving & Abilities', 'Driver, leader, truck, ability, knowing and coming', 'prebook', 24)
    RETURNING id INTO v_l24;
  ELSE
    UPDATE lessons SET description = 'Driver, leader, truck, ability, knowing and coming', lesson_format = 'prebook', "order" = 24 WHERE id = v_l24;
  END IF;

  -- Clear old items for re-runnability
  DELETE FROM prebook_items WHERE lesson_id IN (v_l19, v_l20, v_l21, v_l22, v_l23, v_l24);

  -- ══════════════════════════════════════════
  -- LESSON 19: Study & Sight (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l19, 1, 'يَدْرُسُ', 'he studies',
    'هَذَا الْوَلَدُ يَدْرُسُ الْقُرْآنَ.', 'This boy studies the Qur''an.',
    'أَنْتِ تَدْرُسِينَ الْآنَ دَرْسًا سَهْلًا.', 'You are studying an easy lesson now.',
    'هَلْ يَدْرُسُ قَرِيبًا مِنَ المَطْعَمِ؟', 'Does he study near the restaurant?'),
  (v_l19, 2, 'قَرْن / قُرُون', 'century / centuries',
    'هَذِهِ الْبُيُوتُ مِنْ قُرُونٍ قَدِيمَةٍ.', 'These houses are from ancient centuries.',
    'نَدْخُلُ فِي قَرْنٍ جَدِيدٍ وَالمَسَاجِدُ كَثِيرَةٌ.', 'We are entering a new century, and the mosques are many.',
    'هَلْ يَقْرَأُ عَنْ قَرْنٍ جَدِيدٍ؟', 'Does he read about a new century?'),
  (v_l19, 3, 'يَنْظُرُ', 'he looks',
    'هِيَ تَنْظُرُ إِلَى الْحَقِيبَةِ الْجَدِيدَةِ.', 'She is looking at the new bag.',
    'أَنْظُرُ إِلَى حَدِيقَةِ حَامِدٍ الصَّغِيرَةِ مِنْ نَافِذَتِي.', 'I look at Hamid''s small garden from my window.',
    'أَ يُنْظَرُ إِلَيْهِ عِنْدَ البَابِ؟', 'Is he being looked at near the door?'),
  (v_l19, 4, 'مَنْظَر', 'view / scene',
    'المَنْظَرُ أَفْضَلُ فِي اللَّيْلِ مِنَ الصَّبَاحِ.', 'The view is better at night than in the morning.',
    '—', '—',
    'هَلْ يَتَكَلَّمُ عَنْ مَنْظَرِ الحَدِيقَةِ؟', 'Is he talking about the view of the garden?'),
  (v_l19, 5, 'يَرَى', 'he sees',
    'أَنْتِ تَرَيْنَ الْحَقِيبَةَ تَحْتَ الْمَكْتَبِ.', 'You see the bag under the desk.',
    'أَرَى الْأَيَّامَ وَالأَسَابِيعَ تَذْهَبُ.', 'I see the days and weeks passing.',
    'هَلْ يَرَى النَّافِذَةَ مِنَ الْغُرْفَةِ؟', 'Does he see the window from the room?'),
  (v_l19, 6, 'عَيْن / أَعْيُن', 'eye / eyes',
    'نَظَرْتُ إِلَيْهِ بِعَيْنِي الْيُمْنَى.', 'I looked at him with my right eye.',
    'أَغْلَقْتُ عَيْنِي قَبْلَ النَّوْمِ.', 'I closed my eye before sleeping.',
    'أَ هُوَ يُغْلِقُ العَيْنَ؟', 'Is he closing the eye?'),
  (v_l19, 7, 'يَسْمَعُ', 'he hears',
    'لَا أَسْمَعُ شَيْئًا الآنَ.', 'I do not hear anything now.',
    'يَسْمَعُ كَلَامَ المُدَرِّسِ جَيِّدًا.', 'He hears the teacher''s speech well.',
    'أَ هُوَ يَسْمَعُ الصَّوْتَ عِنْدَ البَابِ؟', 'Does he hear the sound near the door?'),
  (v_l19, 8, 'أُذُن / آذَان', 'ear / ears',
    'الجُدْرَانُ عِنْدَهَا أُذُنٌ.', 'The walls have an ear.',
    'آذَانِي كَبِيرَةٌ جِدًّا.', 'My ears are very big.',
    'لِمَاذَا تَأْكُلُ قَرِيبًا مِنْ أُذُنِي؟', 'Why are you eating close to my ear?');

  -- ══════════════════════════════════════════
  -- LESSON 20: Listening & Senses (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l20, 1, 'يَسْتَمِعُ', 'he listens',
    'هَذَا الوَلَدُ يَسْتَمِعُ إِلَى قِصَّةٍ جَدِيدَةٍ.', 'This boy is listening to a new story.',
    'نَحْنُ نَسْتَمِعُ إِلَى تِلَاوَةِ الْقُرْآنِ فِي الْمَسْجِدِ.', 'We listen to the recitation of the Qur''an in the mosque.',
    'هَلْ الرَّجُلُ يَسْتَمِعُ مِنَ البَابِ؟', 'Is the man listening from the door?'),
  (v_l20, 2, 'يَأْخُذُ', 'he takes',
    'تَأْخُذُ قَلَمًا مِنَ المُدَرِّسَةِ.', 'She takes a pen from the teacher.',
    'نَأْخُذُ الْكُتُبَ لِلدَّرْسِ فِي الْمَسَاءِ.', 'We take the books for the lesson in the evening.',
    'هَلْ يَأْخُذُ الْكُرْسِيَّ إِلَى الحَدِيقَةِ؟', 'Does he take the chair to the garden?'),
  (v_l20, 3, 'يَد / أَيْدٍ', 'hand / hands',
    'يَأْخُذُ الْمَدِينَةَ بِأَيْدِيهِ.', 'He takes the city with his hands.',
    'تَفْتَحُ الاِمْرَأَةُ الكِتَابَ وَفِي يَدِهَا قَلَمٌ مُمْتَازٌ.', 'The woman opens the book, and in her hand is an excellent pen.',
    'هَلْ يَدُكَ كَبِيرَةٌ أَمْ صَغِيرَةٌ؟', 'Is your hand big or small?'),
  (v_l20, 4, 'عِنْدَمَا', 'when',
    'عِنْدَمَا تَكْتُبُ الاسْمَ فِي الْكِتَابِ الْجَدِيدِ.', 'When you write the name in the new book.',
    'أَرَى كَثِيرًا عِنْدَمَا أَقُومُ عَلَى الحَائِطِ الطَّوِيلِ.', 'I see a lot when I stand on the tall wall.',
    'لِمَاذَا لَا تَتَكَلَّمُ بِالعَرَبِيَّةِ عِنْدَمَا تَكُونُ خَارِجَ الفَصْلِ؟', 'Why do you not speak Arabic when you are outside the classroom?'),
  (v_l20, 5, 'حَيْثُ', 'where',
    'الْمُدَرِّسَةُ تَجْلِسُ عَلَى الْكُرْسِيِّ حَيْثُ الْمَكْتَبُ.', 'The teacher sits on the chair where the desk is.',
    'حَقِيبَتُهَا عِنْدَ المَدْخَلِ حَيْثُ الاِمْرَأَةُ تَجْلِسُ.', 'Her bag is by the entrance where the woman sits.',
    'أَنَا أَتَكَلَّمُ حَيْثُ أُرِيدُ، هَلْ تَسْتَمِعِينَ إِلَيَّ؟', 'I speak where I want. Are you listening to me?'),
  (v_l20, 6, 'وَقْت / أَوْقَات', 'time / times',
    'هُنَاكَ وَقْتٌ طَوِيلٌ قَبْلَ أَنْ تَذْهَبَ إِلَى المَدْرَسَةِ.', 'There is a long time before you go to school.',
    'يَدْخُلُ حَامِدٌ المَسْجِدَ عَلَى الوَقْتِ.', 'Hamid enters the mosque on time.',
    'مَاذَا تَقْرَأُ بَعْدَ وَقْتِ الْفَجْرِ؟', 'What do you read after the time of Fajr?'),
  (v_l20, 7, 'الحَوَاسُّ الخَمْس', 'the five senses',
    '—', '—',
    'يَقْرَأُ زَيْدٌ كَثِيرًا عَنْ الحَوَاسِّ الخَمْسِ.', 'Zayd reads a lot about the five senses.',
    'مَا الحَوَاسُّ الخَمْسُ؟', 'What are the five senses?'),
  (v_l20, 8, 'يَشُمُّ', 'he smells',
    'يَشُمُّ الرَّجُلُ مَا فِي الْبَيْتِ.', 'The man smells what is in the house.',
    'أَشُمُّ طَعَامًا كَثِيرًا مِنْ مَدْخَلِ بَيْتِكَ.', 'I smell a lot of food from the entrance of your house.',
    'بِمَاذَا سَتَشُمُّ الطَّعَامَ الَّذِي عَلَى المَائِدَةِ الطَّوِيلَةِ غَدًا؟', 'With what will you smell the food that is on the long table tomorrow?');

  -- ══════════════════════════════════════════
  -- LESSON 21: Touch & Taste (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l21, 1, 'أَنْف', 'nose',
    'يَشُمُّ بِأَنْفِهِ الطَّعَامَ الْجَيِّدَ.', 'He smells the good food with his nose.',
    'كِتَابُكَ هُنَاكَ تَحْتَ أَنْفِكَ.', 'Your book is there right under your nose.',
    'بِمَاذَا تَشُمُّ، هَلْ هُوَ أَنْفٌ كَبِيرٌ أَمْ صَغِيرٌ؟', 'With what do you smell? Is it a big nose or a small one?'),
  (v_l21, 2, 'يَمَسُّ', 'he touches',
    'يَمَسُّ الْحَائِطَ الْقَدِيمَ.', 'He touches the old wall.',
    'يَمَسُّ أَحْمَدُ الكِتَابَ القَدِيمَ بِيَمِينِهِ.', 'Ahmad touches the old book with his right hand.',
    'مَتَى تَمَسُّ النَّافِذَةَ الوَاسِعَةَ فِي غُرْفَتِهَا؟', 'When do you touch the wide window in her room?'),
  (v_l21, 3, 'يَد / أَيْدِي', 'hand / hands',
    'يَأْخُذُ الرَّجُلُ الْقَلَمَ الْجَدِيدَ بِيَدِهِ الْكَبِيرَةِ الآنَ.', 'The man takes the new pen with his big hand now.',
    'تَأْكُلُ عَائِشَةُ طَعَامَهَا بِيَدِهَا فِي غُرْفَتِهَا.', 'Aishah eats her food with her hand in her room.',
    'بِمَاذَا تَمَسِّينَ حَقِيبَتَكِ؟', 'With what do you touch your bag?'),
  (v_l21, 4, 'يَمْسَحُ', 'he wipes',
    'يَمْسَحُ النَّافِذَةَ لِيَرَى الْمَنْظَرَ.', 'He wipes the window so that he can see the view.',
    'تَمْسَحِينَ عَيْنَكِ قَبْلَ أَنْ تَقُومِي فِي الصَّبَاحِ.', 'You wipe your eye before you get up in the morning.',
    'مَتَى سَتَمْسَحِينَ أَرْضَ الْمَطْعَمِ؟', 'When will you wipe the floor of the restaurant?'),
  (v_l21, 5, 'يَذُوقُ', 'he tastes',
    'يُرِيدُ أَنْ يَذُوقَ مَا هُوَ جَدِيدٌ.', 'He wants to taste what is new.',
    'أُرِيدُ أَنْ أَذُوقَ الأَطْعِمَةَ الكَثِيرَةَ فِي مَطْعَمِكَ اليَوْمَ.', 'I want to taste the many foods in your restaurant today.',
    'لِمَاذَا تَذُوقِينَ طَعَامِي الَّذِي قَرِيبٌ مِنِّي الآنَ؟', 'Why are you tasting my food that is near me now?'),
  (v_l21, 6, 'لِسَان', 'tongue',
    'الْمُدَرِّسَةُ تَتَكَلَّمُ عَنِ اللِّسَانِ فِي دَرْسِ التَّجْوِيدِ.', 'The teacher talks about the tongue in the tajwid lesson.',
    'يَتَكَلَّمُ بِلِسَانِهِ قَلِيلًا دَاخِلَ المَسْجِدِ.', 'He speaks only a little with his tongue inside the mosque.',
    'مَاذَا سَأَذُوقُ بِلِسَانِي الشَّهْرَ القَادِمَ لِلْغَدَاءِ؟', 'What will I taste with my tongue next month for lunch?'),
  (v_l21, 7, 'يُفَكِّرُ', 'he thinks',
    'الْمُدَرِّسَةُ تُفَكِّرُ كَيْفَ تَكْتُبُ هَذِهِ الكَلِمَةَ بِالعَرَبِيَّةِ.', 'The teacher thinks about how to write this word in Arabic.',
    'تُفَكِّرُ المُدَرِّسَةُ أَنَّ بَيْتَهَا الجَدِيدَ بَعِيدٌ جِدًّا.', 'The teacher thinks that her new house is very far.',
    'لِمَاذَا أَظُنُّ أَنَّكَ تَأْكُلُ الكَثِيرَ مِنْ طَعَامِي؟', 'Why do I think that you eat a lot of my food?'),
  (v_l21, 8, 'يَقِين', 'certainty',
    'عِنْدَهُ يَقِينٌ أَنَّ الْبَيْتَ هُنَا.', 'He is certain that the house is here.',
    'يَقُولُ بِاليَقِينِ أَنَّ الوَاجِبَ لِلْغَدِ.', 'He says with certainty that the homework is for tomorrow.',
    'مَا هُوَ اليَقِينُ الْيَوْمَ؟', 'What is the certainty today?');

  -- ══════════════════════════════════════════
  -- LESSON 22: Thoughts & Movement (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l22, 1, 'ظَنّ', 'assumption / likely thought',
    'عِنْدَهَا ظَنٌّ أَنَّ الدُّرُوسَ هُنَا.', 'She thinks that the lessons are here.',
    'رَبِّي عِنْدَ ظَنِّي بِهِ.', 'My Lord is according to my expectation of Him.',
    'هَلْ عِنْدَكَ الظَّنُّ كُلَّ يَوْمٍ؟', 'Do you have assumption every day?'),
  (v_l22, 2, 'شَكّ', 'doubt',
    'أَنَا لِي شَكٌّ فِي هَذَا.', 'I have doubt about this.',
    'لَا شَكَّ أَنَّكَ إِمَامٌ كَبِيرٌ وَمُمْتَازٌ فِي هَذِهِ المَدِينَةِ.', 'There is no doubt that you are a great and excellent imam in this city.',
    'لِمَاذَا هُنَاكَ كَثِيرٌ مِنَ الشَّكِّ فِي فَصْلِي؟', 'Why is there so much doubt in my class?'),
  (v_l22, 3, 'وَهْم', 'illusion / weak assumption',
    'أَنَا لِي وَهْمٌ فِي هَذَا.', 'I have an illusion about this.',
    'أَرَى فِي عَيْنَيْكَ وَهْنًا عِنْدَمَا تُفَكِّرُ عَنِ الوَاجِبِ.', 'I see weakness in your eyes when you think about the homework.',
    'مَا هُوَ الْوَهْمُ، هَلْ هُوَ بَعِيدٌ عَنِ الْيَقِينِ؟', 'What is illusion? Is it far from certainty?'),
  (v_l22, 4, 'وَسَائِلُ النَّقْل', 'means of transport',
    'فِي هَذِهِ الأَيَّامِ هُنَاكَ وَسَائِلُ النَّقْلِ كَثِيرَةٌ.', 'These days there are many means of transport.',
    'فِي المَدِينَةِ القَدِيمَةِ قَلِيلٌ مِنْ وَسَائِلِ النَّقْلِ لِأَنَّهَا ضَيِّقَةٌ.', 'In the old city there are few means of transport because it is narrow.',
    'مَا هِيَ وَسَائِلُ النَّقْلِ الَّتِي أُفَكِّرُ فِيهَا؟', 'What are the means of transport that I am thinking about?'),
  (v_l22, 5, 'يَمْشِي', 'he walks',
    'يَمْشِي الرَّجُلُ الكَبِيرُ إِلَى الْبَيْتِ الآنَ.', 'The old man is walking home now.',
    'يَمْشِي الرِّجَالُ حَوْلَ المَدِينَةِ مَعَ الإِمَامِ.', 'The men walk around the city with the imam.',
    'مَعَ مَنْ تَمْشِينَ مِنَ المَدْرَسَةِ الَّتِي بَعِيدَةٌ عَنْ هُنَا؟', 'With whom do you walk from the school that is far from here?'),
  (v_l22, 6, 'يَجْرِي', 'he runs',
    'أُرِيدُ أَنْ أَجْرِيَ مَعَ أُسْتَاذِي فِي الحَدِيقَةِ بَعْدَ صَلَاةِ الظُّهْرِ.', 'I want to run with my teacher in the park after Zuhr prayer.',
    'عِنْدَمَا تَشُمُّ طَعَامًا قَدِيمًا تَجْرِي بَعِيدًا جِدًّا عَنْهُ.', 'When you smell old food, you run very far away from it.',
    'هَلْ تَجْرِينَ فِي مَنْزِلِكِ؟ عِنْدَمَا أَنَا فِي مَنْزِلِي، لَا أَجْرِي فِيهِ.', 'Do you run in your house? When I am in my house, I do not run in it.'),
  (v_l22, 7, 'دَرَّاجَة', 'bicycle / bike',
    'أَذْهَبُ إِلَى المَطْعَمِ الجَدِيدِ لِلْغَدَاءِ بِالدَّرَّاجَةِ.', 'I go to the new restaurant for lunch by bike.',
    'يُرِيدُ زَيْدٌ أَنْ يَنْظُرَ إِلَى دَرَّاجَةِ أَحْمَدَ الجَدِيدَةِ.', 'Zayd wants to look at Ahmad''s new bike.',
    'أُسْبُوعُ القَادِمِ، مَتَى سَتَأْخُذُ دَرَّاجَتِي مِنِّي؟', 'Next week, when will you take my bike from me?'),
  (v_l22, 8, 'يَرْكَبُ', 'he rides',
    'يَرْكَبُ الإِمَامُ الدَّرَّاجَةَ إِلَى المَسْجِدِ صَبَاحًا.', 'The imam rides the bike to the mosque in the morning.',
    'تَرْكَبِينَ دَرَّاجَتَكِ جَيِّدًا جِدًّا هَذِهِ الأَيَّامَ.', 'You ride your bike very well these days.',
    'اللَّيْلَةَ، سَتَرْكَبِينَ دَرَّاجَتَكِ الجَدِيدَةَ؟', 'Tonight, will you ride your new bike?');

  -- ══════════════════════════════════════════
  -- LESSON 23: Vehicles & Travel (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l23, 1, 'مَحَطَّة', 'station',
    'المَحَطَّةُ فِي وَسَطِ المَدِينَةِ.', 'The station is in the centre of the city.',
    'تَمْشِي الاِمْرَأَةُ خَارِجَ مَدْخَلِ المَحَطَّةِ مَعَ حَقِيبَةٍ خَفِيفَةٍ.', 'The woman walks outside the station entrance with a light bag.',
    'مِنْ أَيْنَ سَتَدْخُلُ المَحَطَّةَ الَّتِي عَلَى يَمِينِكَ؟', 'From where will you enter the station that is on your right?'),
  (v_l23, 2, 'قِطَار', 'train',
    'أَرْكَبُ القِطَارَ مِنْ مَكَّةَ إِلَى مَدِينَةٍ بَعْدَ صَلَاةِ المَغْرِبِ.', 'I take the train from Makkah to a city after Maghrib prayer.',
    'تَأْخُذُ فَاطِمَةُ القِطَارَ قَرِيبًا مِنْ مَدْرَسَتِي القَدِيمَةِ.', 'Fatimah takes the train near my old school.',
    'كَيْفَ سَتَخْرُجِينَ مِنْ بَابِ القِطَارِ الَّذِي عَلَى يَسَارِكِ؟', 'How will you get out from the train door that is on your left?'),
  (v_l23, 3, 'حَافِلَة', 'bus',
    'يَذْهَبُ الرَّجُلُ إِلَى المَدِينَةِ بِحَافِلَةٍ كَبِيرَةٍ.', 'The man goes to the city by a big bus.',
    'تَذْهَبُ عَائِشَةُ إِلَى المَطْعَمِ بِالحَافِلَةِ بَعْدَ سَاعَةٍ.', 'Aishah goes to the restaurant by bus after an hour.',
    'لِمَاذَا سَيَأْخُذُ الحَافِلَةَ وَلَيْسَ القِطَارَ غَدًا؟', 'Why will he take the bus and not the train tomorrow?'),
  (v_l23, 4, 'طَائِرَة', 'airplane / plane',
    'يَنْظُرُ الْوَلَدُ إِلَى الطَّائِرَةِ فِي السَّمَاءِ.', 'The boy looks at the plane in the sky.',
    'يَسْتَمِعُ زَيْدٌ إِلَى الطَّائِرَاتِ الكَبِيرَةِ مِنَ الشُّبَّاكِ.', 'Zayd listens to the big planes from the window.',
    'مَاذَا تَرَيْنَ عِنْدَمَا أَنْتِ فِي الطَّائِرَةِ؟', 'What do you see when you are in the plane?'),
  (v_l23, 5, 'سَيَّارَة', 'car',
    'تَذْهَبُ المُدَرِّسَةُ بِسَيَّارَتِهَا إِلَى المَدْرَسَةِ صَبَاحًا.', 'The teacher goes to school in her car in the morning.',
    'تَعَالْ هُنَا وَلَا تَمْشِ أَمَامَ السَّيَّارَاتِ.', 'Come here and do not walk in front of the cars.',
    'أَيْنَ مَدْخَلُ سَيَّارَتِهِ؟', 'Where is the entrance to his car?'),
  (v_l23, 6, 'مَطَار', 'airport',
    'يُرِيدُ الرَّجُلُ أَنْ يَذْهَبَ إِلَى المَطَارِ لِلطَّائِرَاتِ الجَدِيدَةِ.', 'The man wants to go to the airport for the new planes.',
    'أُرِيدُ أَنْ أَذْهَبَ إِلَى المَطَارِ سَاعَتَيْنِ قَبْلَ أَنْ نَأْخُذَ الطَّائِرَةَ.', 'I want to go to the airport two hours before we take the plane.',
    'مَا فِي المَطَارِ؟ وَهَلْ هُنَاكَ حَافِلَاتٌ فِيهِ؟', 'What is in the airport? And are there buses in it?'),
  (v_l23, 7, 'رَاكِب / رُكَّاب', 'passenger / passengers',
    'يَخْرُجُ الرُّكَّابُ الكَثِيرُونَ مِنَ المَحَطَّةِ لِصَلَاةِ الجُمُعَةِ.', 'Many passengers leave the station for Friday prayer.',
    'يَأْكُلُ الرُّكَّابُ الغَدَاءَ عَلَى الحَافِلَةِ قَبْلَ أَنْ تَدْخُلَ المَحَطَّةَ.', 'The passengers eat lunch on the bus before it enters the station.',
    'إِلَى أَيْنَ يُرِيدُ الرُّكَّابُ الْيَوْمَ؟', 'Where do the passengers want to go today?'),
  (v_l23, 8, 'يَقُودُ', 'he drives',
    'أُرِيدُ أَنْ أَقُودَ هَذِهِ السَّيَّارَةَ غَدًا ظُهْرًا.', 'I want to drive this car tomorrow at noon.',
    'الإِمَامُ يَقُودُ حَافِلَةً طَوِيلَةً إِلَى المَسْجِدِ صَبَاحًا.', 'The imam drives a long bus to the mosque in the morning.',
    'إِلَى أَيْنَ سَتَقُودُ سَيَّارَتِي الأُسْبُوعَ القَادِمَ؟', 'Where will you drive my car next week?');

  -- ══════════════════════════════════════════
  -- LESSON 24: Driving & Abilities (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l24, 1, 'سَائِق', 'driver',
    'يَرَى الرَّجُلُ السَّائِقَ هُنَا.', 'The man sees the driver here.',
    'السَّائِقُ الَّذِي يَسُوقُ سَيَّارَتَهُ خَارِجَ المَسْجِدِ جَيِّدٌ جِدًّا.', 'The driver who drives his car outside the mosque is very good.',
    'هَلِ السَّائِقُ يَجْلِسُ أَمَامَ السَّيَّارَةِ الآنَ؟', 'Is the driver sitting at the front of the car now?'),
  (v_l24, 2, 'قَائِد', 'leader',
    'يَرَى الرَّجُلُ القَائِدَ أَمَامَ الْبَيْتِ.', 'The man sees the leader in front of the house.',
    'يَجْلِسُ أَحْمَدُ وَرَاءَ القَائِدِ فِي الحَافِلَةِ وَيَتَكَلَّمُ مَعَهُ.', 'Ahmad sits behind the leader in the bus and speaks with him.',
    'مَنْ قَائِدُكَ؟ وَأَيْنَ هُوَ؟', 'Who is your leader? And where is he?'),
  (v_l24, 3, 'شَاحِنَة', 'truck / lorry',
    'تَذْهَبُ الشَّاحِنَةُ القَدِيمَةُ إِلَى المَدِينَةِ بَعِيدَةً.', 'The old truck goes far to the city.',
    'زَيْدٌ يَرَاكَ تَقُودُ شَاحِنَتَكَ الكَبِيرَةَ حَوْلَ البُيُوتِ فِي المَسَاءِ.', 'Zayd sees you driving your big truck around the houses in the evening.',
    'مَعَ مَنْ سَتَقُودُ شَاحِنَتِي؟', 'With whom will you drive my truck?'),
  (v_l24, 4, 'يَسْتَطِيعُ', 'he can / is able to',
    'لَا أَسْتَطِيعُ أَنْ آخُذَ هَذِهِ الحَقِيبَةَ الثَّقِيلَةَ إِلَى بَيْتِكَ.', 'I cannot take this heavy bag to your house.',
    'لَا تَسْتَطِيعُ أَنْ تَسْتَمِعَ لِي وَأَنْتَ تَجْلِسُ هُنَاكَ.', 'You cannot listen to me while you are sitting there.',
    'هَلْ أَسْتَطِيعُ أَنْ آكُلَ طَعَامِي فِي سَيَّارَتِكَ؟', 'Can I eat my food in your car?'),
  (v_l24, 5, 'يَعْرِفُ', 'he knows',
    'نَعَمْ، أَنَا أَعْرِفُ أَيْنَ المَطْعَمُ القَرِيبُ.', 'Yes, I know where the nearby restaurant is.',
    'لَا أَعْرِفُ مَاذَا يَقُولُ المُدَرِّسُ لِأَنَّنِي أُفَكِّرُ عَنْ طَعَامٍ.', 'I do not know what the teacher is saying because I am thinking about food.',
    'كَيْفَ تَعْرِفُ ذَلِكَ؟', 'How do you know that?'),
  (v_l24, 6, 'يَأْتِي', 'he comes',
    'يَأْتِي الرَّجُلُ الكَبِيرُ إِلَى الْبَيْتِ لَيْلًا.', 'The old man comes to the house at night.',
    'المُدَرِّسُ يَأْتِي إِلَى الدَّرْسِ بِالطَّعَامِ هَذَا الأُسْبُوعَ.', 'The teacher comes to the lesson with food this week.',
    'لِمَاذَا لَا يَأْتِي القِطَارُ غَدًا مَسَاءً؟', 'Why does the train not come tomorrow evening?'),
  (v_l24, 7, 'يَجِيءُ', 'he comes',
    'يَجِيءُ القِطَارُ القَدِيمُ إِلَى المَحَطَّةِ بَعْدَ سَاعَةٍ.', 'The old train comes to the station after an hour.',
    'عَائِشَةُ تَجِيءُ إِلَيْكِ مَعَ الكُتُبِ الجَدِيدَةِ غَدًا.', 'Aishah comes to you with the new books tomorrow.',
    'مَتَى سَتَجِيءُ الحَافِلَةُ الْيَوْمَ؟', 'When will the bus come today?'),
  (v_l24, 8, 'بُرْتُقَال', 'orange',
    'يَأْخُذُ الْوَلَدُ الْبُرْتُقَالَ بِيَدِهِ الصَّغِيرَةِ.', 'The boy takes the orange with his small hand.',
    'يَأْخُذُ الرَّجُلُ البُرْتُقَالَ مِنْ حَدِيقَتِهِ لِفُطُورٍ خَفِيفٍ فِي الصَّبَاحِ.', 'The man takes the orange from his garden for a light breakfast in the morning.',
    'لِمَاذَا تَأْخُذُ بُرْتُقَالَتِي الَّتِي فِي يَدِي الْيُسْرَى؟', 'Why are you taking my orange which is in my left hand?');

END $$;
