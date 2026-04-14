-- ============================================================
-- PRE-BOOK 1: FOUNDATIONS — Lessons 9–12 (32 words)
-- Run AFTER 202604130004_prebook_foundations.sql succeeds
-- ============================================================

DO $$
DECLARE
  v_stage BIGINT;
  v_l9 BIGINT; v_l10 BIGINT; v_l11 BIGINT; v_l12 BIGINT;
BEGIN

  -- Find the Foundations stage
  SELECT id INTO v_stage FROM stages WHERE name = 'Foundations' ORDER BY id LIMIT 1;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'Foundations stage not found — run the first migration first';
  END IF;

  -- ── Lesson 9 ──
  SELECT id INTO v_l9 FROM lessons WHERE stage_id = v_stage AND title = 'Quality & Location' ORDER BY id LIMIT 1;
  IF v_l9 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Quality & Location', 'Good, excellent, near, far, here and there', 'prebook', 9)
    RETURNING id INTO v_l9;
  ELSE
    UPDATE lessons SET description = 'Good, excellent, near, far, here and there', lesson_format = 'prebook', "order" = 9 WHERE id = v_l9;
  END IF;

  -- ── Lesson 10 ──
  SELECT id INTO v_l10 FROM lessons WHERE stage_id = v_stage AND title = 'People & Greetings' ORDER BY id LIMIT 1;
  IF v_l10 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'People & Greetings', 'Man, woman, greetings, and relative pronouns', 'prebook', 10)
    RETURNING id INTO v_l10;
  ELSE
    UPDATE lessons SET description = 'Man, woman, greetings, and relative pronouns', lesson_format = 'prebook', "order" = 10 WHERE id = v_l10;
  END IF;

  -- ── Lesson 11 ──
  SELECT id INTO v_l11 FROM lessons WHERE stage_id = v_stage AND title = 'Furniture & Positions' ORDER BY id LIMIT 1;
  IF v_l11 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Furniture & Positions', 'Desk, chair, sitting, right and left', 'prebook', 11)
    RETURNING id INTO v_l11;
  ELSE
    UPDATE lessons SET description = 'Desk, chair, sitting, right and left', lesson_format = 'prebook', "order" = 11 WHERE id = v_l11;
  END IF;

  -- ── Lesson 12 ──
  SELECT id INTO v_l12 FROM lessons WHERE stage_id = v_stage AND title = 'Actions & Time' ORDER BY id LIMIT 1;
  IF v_l12 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Actions & Time', 'Standing, the Lord, now, yesterday, today, tomorrow', 'prebook', 12)
    RETURNING id INTO v_l12;
  ELSE
    UPDATE lessons SET description = 'Standing, the Lord, now, yesterday, today, tomorrow', lesson_format = 'prebook', "order" = 12 WHERE id = v_l12;
  END IF;

  -- Clear old items for re-runnability
  DELETE FROM prebook_items WHERE lesson_id IN (v_l9, v_l10, v_l11, v_l12);

  -- ══════════════════════════════════════════
  -- LESSON 9: Quality & Location (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l9, 1, 'جَيِّد', 'good',
    'هِيَ مُدَرِّسَةٌ جَيِّدَةٌ.', 'She is a good teacher.',
    'هَذَا الْكِتَابُ جَيِّدٌ لِلدَّرْسِ.', 'This book is good for the lesson.',
    'هَلْ هَذَا الْقَلَمُ جَيِّدٌ؟', 'Is this pen good?'),
  (v_l9, 2, 'جِدًّا', 'very',
    'هَذَا الْكِتَابُ جَدِيدٌ جِدًّا.', 'This book is very new.',
    'بَيْتُكِ صَغِيرٌ جِدًّا.', 'Your house is very small.',
    'هَلِ الْمَسْجِدُ بَعِيدٌ جِدًّا؟', 'Is the mosque very far?'),
  (v_l9, 3, 'مُمْتَاز', 'excellent',
    'أَحْمَدُ إِمَامٌ مُمْتَازٌ.', 'Ahmad is an excellent imam.',
    'هَذَا الطَّعَامُ مُمْتَازٌ.', 'This food is excellent.',
    'هَلْ دَرْسُكَ مُمْتَازٌ الْيَوْمَ؟', 'Is your lesson excellent today?'),
  (v_l9, 4, 'يَأْكُلُ', 'he eats',
    'أَنَا آكُلُ فِي بَيْتِي.', 'I eat in my house.',
    'زَيْدٌ يَأْكُلُ عِنْدَ الْمَسْجِدِ.', 'Zayd eats near the mosque.',
    'مَاذَا يَأْكُلُ؟', 'What does he eat?'),
  (v_l9, 5, 'قَرِيب', 'near / close',
    'حَقِيبَتُكَ الْكَبِيرَةُ قَرِيبَةٌ مِنَ الْمَدْرَسَةِ.', 'Your big bag is near the school.',
    'الْمَسْجِدُ قَرِيبٌ مِنْ بَيْتِي.', 'The mosque is near my house.',
    'هَلِ الْمَسْجِدُ الْقَدِيمُ قَرِيبٌ مِنْ هُنَا؟', 'Is the old mosque near here?'),
  (v_l9, 6, 'بَعِيد', 'far',
    'حَامِدٌ بَعِيدٌ عَنْ بَيْتِكَ.', 'Hamid is far from your house.',
    'الْمَدْرَسَةُ بَعِيدَةٌ عَنْ بَيْتِنَا.', 'The school is far from our house.',
    'هَلْ بَيْتُكَ بَعِيدٌ عَنِ الْمَدْرَسَةِ؟', 'Is your house far from the school?'),
  (v_l9, 7, 'هُنَا', 'here',
    'أَنَا هُنَا فِي الْمَسْجِدِ.', 'I am here in the mosque.',
    'حَقِيبَتُكَ هُنَا عَلَى الْكُرْسِيِّ.', 'Your bag is here on the chair.',
    'هَلِ الْمَسْجِدُ الْكَبِيرُ هُنَا؟', 'Is the big mosque here?'),
  (v_l9, 8, 'هُنَاكَ', 'there',
    'هُنَاكَ قَلَمٌ صَغِيرٌ تَحْتَكَ.', 'There is a small pen under you.',
    'هُنَاكَ كِتَابٌ جَدِيدٌ فِي حَقِيبَتِي.', 'There is a new book in my bag.',
    'لِمَاذَا أَنْتَ هُنَا وَعَادِلٌ هُنَاكَ؟', 'Why are you here while Adil is there?');

  -- ══════════════════════════════════════════
  -- LESSON 10: People & Greetings (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l10, 1, 'تَعَالَ', 'come',
    'تَعَالَ إِلَى الْمَسْجِدِ.', 'Come to the mosque.',
    'تَعَالَيْ يَا فَاطِمَةُ.', 'Come, Fatimah.',
    'لِمَنْ تَقُولُ: تَعَالَ هُنَا؟', 'To whom do you say, "Come here"?'),
  (v_l10, 2, 'اِمْرَأَة', 'woman / women',
    'عَائِشَةُ اِمْرَأَةٌ جَيِّدَةٌ جِدًّا.', 'Aishah is a very good woman.',
    'تَذْهَبُ النِّسَاءُ إِلَى الدَّرْسِ خَلْفَ الْمَسْجِدِ.', 'The women go to the lesson behind the mosque.',
    'أَيُّ اِمْرَأَةٍ قَرِيبَةٌ مِنَ الْمَنْزِلِ؟', 'Which woman is near the house?'),
  (v_l10, 3, 'رَجُل', 'man',
    'هُوَ رَجُلٌ صَغِيرٌ وَأَنْتَ رَجُلٌ كَبِيرٌ.', 'He is a small young man and you are a big man.',
    'إِمَامُ هَذَا الْمَسْجِدِ رَجُلٌ مُمْتَازٌ.', 'The imam of this mosque is an excellent man.',
    'أَيُّ رَجُلٍ يَكْتُبُ خَلْفَ الإِمَامِ؟', 'Which man is writing behind the imam?'),
  (v_l10, 4, 'صَبَاحُ الْخَيْرِ', 'good morning',
    'صَبَاحُ الْخَيْرِ يَا أَحْمَدُ.', 'Good morning, Ahmad.',
    'أَقُولُ لِأُسْتَاذِي: صَبَاحُ الْخَيْرِ.', 'I say to my teacher: Good morning.',
    'هَلْ تَقُولُ صَبَاحَ الْخَيْرِ فِي الصَّبَاحِ؟', 'Do you say "good morning" in the morning?'),
  (v_l10, 5, 'مَسَاءُ الْخَيْرِ', 'good evening',
    'حَامِدٌ يَقُولُ لَكَ: مَسَاءُ الْخَيْرِ.', 'Hamid says to you: Good evening.',
    'أَقُولُ مَسَاءَ الْخَيْرِ عِنْدَمَا أَرَى صَدِيقِي لَيْلًا.', 'I say good evening when I see my friend at night.',
    'هَلْ تَقُولُ مَسَاءَ الْخَيْرِ فِي الْمَسَاءِ؟', 'Do you say "good evening" in the evening?'),
  (v_l10, 6, 'الَّذِي', 'who / which / that (masculine)',
    'هُوَ الرَّجُلُ الَّذِي يَدْرُسُ فِي الْمَسَاءِ.', 'He is the man who studies in the evening.',
    'حَمْزَةُ فِي الْمَسْجِدِ الَّذِي خَلْفَ الْبُيُوتِ.', 'Hamzah is in the mosque that is behind the houses.',
    'مَنْ الرَّجُلُ الَّذِي يَقْرَأُ الْقُرْآنَ فِي الْمَسْجِدِ؟', 'Who is the man who reads the Qur''an in the mosque?'),
  (v_l10, 7, 'الَّتِي', 'who / which / that (feminine)',
    'هَذِهِ هِيَ الْمُدَرِّسَةُ الَّتِي تَقْرَأُ جَيِّدًا.', 'This is the teacher who reads well.',
    'تَذْهَبُ إِلَى الْمَسَاجِدِ الَّتِي لَيْسَتْ بَعِيدَةً.', 'She goes to the mosques that are not far.',
    'أَيْنَ الْمَدْرَسَةُ الَّتِي قَرِيبَةٌ مِنَ الْمَسْجِدِ؟', 'Where is the school that is near the mosque?'),
  (v_l10, 8, 'سَهْل', 'easy',
    'هَذَا الْوَاجِبُ سَهْلٌ جِدًّا.', 'This homework is very easy.',
    'الدَّرْسُ فِي الْمَسْجِدِ سَهْلٌ.', 'The lesson in the mosque is easy.',
    'هَلِ الْوَاجِبُ مِنَ الدَّرْسِ سَهْلٌ؟', 'Is the homework from the lesson easy?');

  -- ══════════════════════════════════════════
  -- LESSON 11: Furniture & Positions (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l11, 1, 'صَعْب', 'difficult',
    'دَرْسُهُ الْجَدِيدُ صَعْبٌ لَهُ.', 'His new lesson is difficult for him.',
    'هَذَا الْكِتَابُ صَعْبٌ لِي.', 'This book is difficult for me.',
    'لِمَاذَا لَا تَكْتُبُ الْوَاجِبَ الصَّعْبَ؟', 'Why do you not write the difficult homework?'),
  (v_l11, 2, 'مَكْتَب', 'desk / office',
    'حَمْزَةُ يَقْرَأُ كِتَابَهُ الْجَدِيدَ فِي الْمَكْتَبِ.', 'Hamzah reads his new book in the office/at the desk.',
    'عِنْدَهُ كِتَابٌ مُمْتَازٌ مِنَ الْمَكْتَبِ الْقَدِيمِ.', 'He has an excellent book from the old office.',
    'مَعَ مَنْ تَذْهَبُ إِلَى الْمَكْتَبِ الْجَدِيدِ؟', 'With whom do you go to the new office?'),
  (v_l11, 3, 'كُرْسِيّ', 'chair',
    'الْكَرَاسِيُّ الَّتِي فِي بَيْتِكَ مُمْتَازَةٌ.', 'The chairs that are in your house are excellent.',
    'أَنَا لَا أُرِيدُ هٰذَا الْكُرْسِيَّ الْقَدِيمَ.', 'I do not want this old chair.',
    'هَلْ تُرِيدُ هَذِهِ الْكَرَاسِيَّ لِبَيْتِكِ؟', 'Do you want these chairs for your house?'),
  (v_l11, 4, 'مَ', 'place-marker prefix',
    'هَذَا مَسْجِدِي وَأَذْهَبُ إِلَيْهِ.', 'This is my mosque, and I go to it.',
    'الْمَسْجِدُ الْكَبِيرُ أَمَامَ الْمَكْتَبِ الْقَدِيمِ.', 'The big mosque is in front of the old office.',
    'أَيُّ مَكْتَبٍ خَلْفَ الْمَسْجِدِ الْقَدِيمِ؟', 'Which office is behind the old mosque?'),
  (v_l11, 5, 'يَجْلِسُ', 'he sits',
    'هُوَ يَجْلِسُ عَلَى الْكُرْسِيِّ خَلْفَ الْمَكْتَبِ.', 'He sits on the chair behind the desk.',
    'هُوَ يَجْلِسُ فِي الْمَسْجِدِ قَبْلَ الدَّرْسِ.', 'He sits in the mosque before the lesson.',
    'لِمَاذَا لَا تَجْلِسُ فَاطِمَةُ عَلَى الْكُرْسِيِّ الصَّغِيرِ فِي الْمَكْتَبَةِ؟', 'Why does Fatimah not sit on the small chair in the library?'),
  (v_l11, 6, 'انِ', 'two / dual ending',
    'هَذَانِ الْكِتَابَانِ جَيِّدَانِ جِدًّا.', 'These two books are very good.',
    'يَكْتُبُ الرَّجُلَانِ فِي الدَّرْسِ.', 'The two men write in the lesson.',
    'مَنْ يَجْلِسُ بَيْنَ الْكُرْسِيَّيْنِ؟', 'Who is sitting between the two chairs?'),
  (v_l11, 7, 'يَمِين', 'right',
    'هُوَ يَكْتُبُ فِي كِتَابِهِ بِيَمِينِهِ.', 'He writes in his book with his right hand.',
    'أَنَا أُرِيدُ أَنْ أَجْلِسَ عَلَى يَمِينِكَ فِي الدَّرْسِ.', 'I want to sit on your right in the lesson.',
    'لِمَاذَا تَجْلِسُ فَاطِمَةُ عَلَى يَمِينِكَ؟', 'Why does Fatimah sit on your right?'),
  (v_l11, 8, 'يَسَار', 'left',
    'بَيْتِي عَلَى يَسَارِ الْمَسْجِدِ.', 'My house is on the left of the mosque.',
    'حَامِدٌ يَكْتُبُ مِنَ الْيَمِينِ إِلَى الشِّمَالِ فِي كِتَابِهِ.', 'Hamid writes from right to left in his book.',
    'هَلِ الْمَسْجِدُ الْجَدِيدُ عَلَى الْيَمِينِ أَمْ عَلَى الْيَسَارِ؟', 'Is the new mosque on the right or on the left?');

  -- ══════════════════════════════════════════
  -- LESSON 12: Actions & Time (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l12, 1, 'وَرَاء', 'behind',
    'هُنَاكَ مَسْجِدٌ كَبِيرٌ جِدًّا وَرَاءَ بَيْتِي.', 'There is a very big mosque behind my house.',
    'حَامِدٌ يَقْرَأُ كِتَابَهُ وَرَاءَ الإِمَامِ.', 'Hamid reads his book behind the imam.',
    'أَيُّ مَسْجِدٍ وَرَاءَ الْمَدْرَسَةِ؟', 'Which mosque is behind the school?'),
  (v_l12, 2, 'يَقُومُ', 'he stands',
    'حَامِدٌ يَقُومُ أَمَامَ الْمَكْتَبِ الْقَدِيمِ.', 'Hamid stands in front of the old desk.',
    'أَحْمَدُ يَقُومُ وَرَاءَ الْمَسْجِدِ هُنَاكَ.', 'Ahmad is standing behind the mosque there.',
    'أَيُّ رَجُلٍ يَقُومُ خَلْفَكَ؟', 'Which man is standing behind you?'),
  (v_l12, 3, 'رَبّ', 'Lord',
    'أَنَا أَذْهَبُ إِلَى رَبِّي.', 'I go to my Lord.',
    'الْمَسْجِدُ بَيْتُ الرَّبِّ.', 'The mosque is the house of the Lord.',
    'مَنْ رَبُّكَ؟', 'Who is your Lord?'),
  (v_l12, 4, 'الآنَ', 'now',
    'أَنَا أَكْتُبُ الدَّرْسَ بِقَلَمِي الْقَدِيمِ الآنَ.', 'I am writing the lesson with my old pen now.',
    'الإِمَامُ يَذْهَبُ إِلَى الْمَسْجِدِ الْبَعِيدِ الآنَ.', 'The imam is going to the far mosque now.',
    'لِمَاذَا لَا تُرِيدُ أَنْ تَأْكُلَ الآنَ؟', 'Why do you not want to eat now?'),
  (v_l12, 5, 'أَمْس', 'yesterday',
    'جَلَسَ مُحَمَّدٌ فَوْقَ الْبُيُوتِ الْقَدِيمَةِ أَمْسِ.', 'Muhammad sat above the old houses yesterday.',
    'كَانَ الدَّرْسُ مَعَ الإِمَامِ أَمْسِ صَعْبًا.', 'The lesson with the imam yesterday was difficult.',
    'كَيْفَ ذَهَبْتَ إِلَى الْمَدْرَسَةِ أَمْسِ؟', 'How did you go to school yesterday?'),
  (v_l12, 6, 'الْيَوْمَ', 'today',
    'يُرِيدُ الْمُدَرِّسُ الْوَاجِبَ مِنْكَ الْيَوْمَ.', 'The teacher wants the homework from you today.',
    'الْيَوْمَ الدَّرْسُ مَعَ الإِمَامِ فِي الْمَسْجِدِ.', 'Today the lesson is with the imam in the mosque.',
    'مَنْ يَجْلِسُ عِنْدَكَ فِي الْمَكْتَبَةِ الْيَوْمَ؟', 'Who is sitting with you in the library today?'),
  (v_l12, 7, 'اللَّيْلَة', 'tonight',
    'أَنَا أُرِيدُ أَنْ أَقْرَأَ كِتَابَهُ اللَّيْلَةَ.', 'I want to read his book tonight.',
    'أَنَا فِي الْبَيْتِ قَرِيبٌ مِنَ الْمَدْرَسَةِ هَذِهِ اللَّيْلَةَ.', 'I am in the house near the school tonight.',
    'هَلْ تُرِيدُ أَنْ تَدْرُسَ اللَّيْلَةَ فِي الْمَكْتَبِ؟', 'Do you want to study tonight in the office?'),
  (v_l12, 8, 'غَدًا', 'tomorrow',
    'أَنَا أَذْهَبُ إِلَى الْمَكْتَبِ الْكَبِيرِ غَدًا.', 'I am going to the big office tomorrow.',
    'الْمُدَرِّسَةُ تُرِيدُ الْوَاجِبَ مِنْكَ غَدًا.', 'The teacher wants the homework from you tomorrow.',
    'مَعَ مَنْ تَذْهَبُ إِلَى الْمَدْرَسَةِ غَدًا؟', 'With whom are you going to school tomorrow?');

END $$;
