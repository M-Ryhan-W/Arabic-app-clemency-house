-- ============================================================
-- PRE-BOOK 1: FOUNDATIONS
-- Table + Stage + 8 Lessons + 66 Words seed data
-- ============================================================

-- 1. Create prebook_items table
CREATE TABLE IF NOT EXISTS prebook_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  word_ar TEXT NOT NULL,
  word_en TEXT NOT NULL,
  word_transliteration TEXT DEFAULT '',
  sentence_1_ar TEXT DEFAULT '',
  sentence_1_en TEXT DEFAULT '',
  sentence_2_ar TEXT DEFAULT '',
  sentence_2_en TEXT DEFAULT '',
  question_ar TEXT DEFAULT '',
  question_en TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prebook_items_lesson ON prebook_items(lesson_id, order_index);

-- Enable RLS
ALTER TABLE prebook_items ENABLE ROW LEVEL SECURITY;

-- Everyone can read prebook items (public content)
DROP POLICY IF EXISTS "prebook_items_select" ON prebook_items;
CREATE POLICY "prebook_items_select" ON prebook_items FOR SELECT USING (true);

-- 2. Seed stage, lessons, and word data
DO $$
DECLARE
  v_stage BIGINT;
  v_l1 BIGINT; v_l2 BIGINT; v_l3 BIGINT; v_l4 BIGINT;
  v_l5 BIGINT; v_l6 BIGINT; v_l7 BIGINT; v_l8 BIGINT;
BEGIN
  SELECT id
  INTO v_stage
  FROM stages
  WHERE name = 'Foundations'
  ORDER BY id
  LIMIT 1;

  IF v_stage IS NULL THEN
    UPDATE stages SET "order" = "order" + 1 WHERE "order" IS NOT NULL;

    INSERT INTO stages (name, description, "order")
    VALUES ('Foundations', 'Master essential Arabic words and build your first sentences', 0)
    RETURNING id INTO v_stage;
  ELSE
    UPDATE stages
    SET description = 'Master essential Arabic words and build your first sentences'
    WHERE id = v_stage;
  END IF;

  SELECT id INTO v_l1 FROM lessons WHERE stage_id = v_stage AND title = 'Grammar Terms & Pronouns' ORDER BY id LIMIT 1;
  IF v_l1 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Grammar Terms & Pronouns', 'Learn basic grammar words and he/she/you', 'prebook', 1)
    RETURNING id INTO v_l1;
  ELSE
    UPDATE lessons SET description = 'Learn basic grammar words and he/she/you', lesson_format = 'prebook', "order" = 1 WHERE id = v_l1;
  END IF;

  SELECT id INTO v_l2 FROM lessons WHERE stage_id = v_stage AND title = 'I, You & Questions' ORDER BY id LIMIT 1;
  IF v_l2 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'I, You & Questions', 'First person, conjunctions, and yes/no', 'prebook', 2)
    RETURNING id INTO v_l2;
  ELSE
    UPDATE lessons SET description = 'First person, conjunctions, and yes/no', lesson_format = 'prebook', "order" = 2 WHERE id = v_l2;
  END IF;

  SELECT id INTO v_l3 FROM lessons WHERE stage_id = v_stage AND title = 'This & Places' ORDER BY id LIMIT 1;
  IF v_l3 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'This & Places', 'Demonstratives, the house, the mosque', 'prebook', 3)
    RETURNING id INTO v_l3;
  ELSE
    UPDATE lessons SET description = 'Demonstratives, the house, the mosque', lesson_format = 'prebook', "order" = 3 WHERE id = v_l3;
  END IF;

  SELECT id INTO v_l4 FROM lessons WHERE stage_id = v_stage AND title = 'Objects & Directions' ORDER BY id LIMIT 1;
  IF v_l4 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Objects & Directions', 'Book, pen, and where things are', 'prebook', 4)
    RETURNING id INTO v_l4;
  ELSE
    UPDATE lessons SET description = 'Book, pen, and where things are', lesson_format = 'prebook', "order" = 4 WHERE id = v_l4;
  END IF;

  SELECT id INTO v_l5 FROM lessons WHERE stage_id = v_stage AND title = 'Possessives & Reading' ORDER BY id LIMIT 1;
  IF v_l5 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Possessives & Reading', 'My, your, his/her and reading verbs', 'prebook', 5)
    RETURNING id INTO v_l5;
  ELSE
    UPDATE lessons SET description = 'My, your, his/her and reading verbs', lesson_format = 'prebook', "order" = 5 WHERE id = v_l5;
  END IF;

  SELECT id INTO v_l6 FROM lessons WHERE stage_id = v_stage AND title = 'Writing & Reasons' ORDER BY id LIMIT 1;
  IF v_l6 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Writing & Reasons', 'Writing, bags, and asking why', 'prebook', 6)
    RETURNING id INTO v_l6;
  ELSE
    UPDATE lessons SET description = 'Writing, bags, and asking why', lesson_format = 'prebook', "order" = 6 WHERE id = v_l6;
  END IF;

  SELECT id INTO v_l7 FROM lessons WHERE stage_id = v_stage AND title = 'Question Words & Positions' ORDER BY id LIMIT 1;
  IF v_l7 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Question Words & Positions', 'Which, whose, above, below, and more', 'prebook', 7)
    RETURNING id INTO v_l7;
  ELSE
    UPDATE lessons SET description = 'Which, whose, above, below, and more', lesson_format = 'prebook', "order" = 7 WHERE id = v_l7;
  END IF;

  SELECT id INTO v_l8 FROM lessons WHERE stage_id = v_stage AND title = 'Adjectives & Prepositions' ORDER BY id LIMIT 1;
  IF v_l8 IS NULL THEN
    INSERT INTO lessons (stage_id, title, description, lesson_format, "order")
    VALUES (v_stage, 'Adjectives & Prepositions', 'New, old, big, small, and with', 'prebook', 8)
    RETURNING id INTO v_l8;
  ELSE
    UPDATE lessons SET description = 'New, old, big, small, and with', lesson_format = 'prebook', "order" = 8 WHERE id = v_l8;
  END IF;

  DELETE FROM prebook_items
  WHERE lesson_id IN (v_l1, v_l2, v_l3, v_l4, v_l5, v_l6, v_l7, v_l8);

  -- ══════════════════════════════════════════
  -- LESSON 1: Grammar Terms & Pronouns (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l1, 1, 'ضَمِير', 'pronoun',
    'هُوَ ضَمِيرٌ مُنْفَصِلٌ.', 'He is a separate pronoun.',
    'الهَاءُ ضَمِيرٌ مُتَّصِلٌ.', 'The letter hā'' is an attached pronoun.',
    'هَلْ تَعْرِفُ هَذَا الضَّمِيرَ؟', 'Do you know this pronoun?'),
  (v_l1, 2, 'اِسْم', 'noun / name',
    'مُحَمَّدٌ اِسْمٌ جَمِيلٌ.', 'Muhammad is a beautiful name.',
    'هَذَا اِسْمٌ مَعْرُوفٌ.', 'This is a well-known noun/name.',
    'مَا اسْمُكَ؟', 'What is your name?'),
  (v_l1, 3, 'فِعْل', 'verb',
    'يَذْهَبُ فِعْلٌ.', '"Yadhhabu" is a verb.',
    'يَكْتُبُ فِعْلٌ سَهْلٌ.', '"Yaktubu" is an easy verb.',
    'هَلْ تَعْرِفُ هَذَا الفِعْلَ؟', 'Do you know this verb?'),
  (v_l1, 4, 'حَرْف', 'particle / letter',
    'الواوُ حَرْفٌ.', 'Wāw is a letter/particle.',
    'فِي حَرْفُ جَرٍّ.', '"Fī" is a preposition.',
    'هَلْ هَذَا حَرْفٌ أَمِ اسْمٌ؟', 'Is this a particle or a noun?'),
  (v_l1, 5, 'هُوَ', 'he',
    'هُوَ حَامِدٌ.', 'He is Hamid.',
    'هُوَ الإِمَامُ.', 'He is the imam.',
    'هَلْ هُوَ أَحْمَدُ؟', 'Is he Ahmad?'),
  (v_l1, 6, 'هِيَ', 'she',
    'هِيَ فَاطِمَةُ.', 'She is Fatimah.',
    'هِيَ زَيْنَبُ.', 'She is Zaynab.',
    'هَلْ هِيَ مَرْيَمُ؟', 'Is she Maryam?'),
  (v_l1, 7, 'أَنْتَ', 'you (masculine)',
    'أَنْتَ حَامِدٌ.', 'You are Hamid.',
    'أَنْتَ مُحَمَّدٌ.', 'You are Muhammad.',
    'هَلْ أَنْتَ خَالِدٌ؟', 'Are you Khalid?'),
  (v_l1, 8, 'أَنْتِ', 'you (feminine)',
    'أَنْتِ زَيْنَبُ.', 'You are Zaynab.',
    'أَنْتِ فَاطِمَةُ.', 'You are Fatimah.',
    'هَلْ أَنْتِ مَرْيَمُ؟', 'Are you Maryam?');

  -- ══════════════════════════════════════════
  -- LESSON 2: I, You & Questions (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l2, 1, 'أَنَا', 'I',
    'أَنَا زَيْدٌ.', 'I am Zayd.',
    'أَنَا عَائِشَةُ.', 'I am Aishah.',
    'هَلْ أَنَا كَاشِفٌ؟', 'Am I Kashif?'),
  (v_l2, 2, 'وَ', 'and',
    'أَنَا وَأَنْتَ.', 'I and you.',
    'أَنَا وَحَامِدٌ.', 'I and Hamid.',
    'هَلْ هُوَ زَيْدٌ وَهَلْ هِيَ فَاطِمَةُ؟', 'Is he Zayd, and is she Fatimah?'),
  (v_l2, 3, 'مَنْ', 'who',
    'مَنْ هُوَ وَهِيَ؟', 'Who is he and who is she?',
    'مَنْ أَنْتَ؟', 'Who are you?',
    'مَنْ هُوَ؟', 'Who is he?'),
  (v_l2, 4, 'هَلْ', 'is/are?',
    'هَلْ هِيَ فَاطِمَةُ؟', 'Is she Fatimah?',
    'هَلْ أَنْتَ إِمَامٌ؟', 'Are you an imam?',
    'هَلْ هَذَا الْمَسْجِدُ؟', 'Is this the mosque?'),
  (v_l2, 5, 'إِمَام', 'imam',
    'هُوَ إِمَامٌ.', 'He is an imam.',
    'إِمَامُ الْمَسْجِدِ هُنَا.', 'The imam of the mosque is here.',
    'هَلْ أَنْتَ إِمَامٌ؟', 'Are you an imam?'),
  (v_l2, 6, 'نَعَمْ', 'yes',
    'نَعَمْ، هِيَ فَاطِمَةُ.', 'Yes, she is Fatimah.',
    'نَعَمْ، أَنْتَ أَحْمَدُ.', 'Yes, you are Ahmad.',
    'نَعَمْ، هَلْ أَنْتَ مُسْتَعِدٌّ؟', 'Yes — are you ready?'),
  (v_l2, 7, 'لَا', 'no / not',
    'لَا إِلَهَ إِلَّا اللهُ.', 'There is no god but Allah.',
    'لَا، أَنَا أَحْمَدُ.', 'No, I am Ahmad.',
    'لَا، هَلْ هُوَ مُحَمَّدٌ؟', 'No — is he Muhammad?'),
  (v_l2, 8, 'هَذَا', 'this (masculine)',
    'هٰذَا مُحَمَّدٌ.', 'This is Muhammad.',
    'هٰذَا قَلَمٌ.', 'This is a pen.',
    'مَا هَذَا؟', 'What is this?');

  -- ══════════════════════════════════════════
  -- LESSON 3: This & Places (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l3, 1, 'هَذِهِ', 'this (feminine)',
    'هَذِهِ عَائِشَةُ.', 'This is Aishah.',
    'هَذِهِ الْمُدَرِّسَةُ.', 'This is the female teacher.',
    'هَلْ هَذِهِ الْمُدَرِّسَةُ؟', 'Is this the female teacher?'),
  (v_l3, 2, 'مَا', 'what',
    'مَا هَذَا؟', 'What is this?',
    'مَا اسْمُ الْمَسْجِدِ؟', 'What is the name of the mosque?',
    'مَا اسْمُ الْمُدَرِّسَةِ؟', 'What is the name of the female teacher?'),
  (v_l3, 3, 'بَيْت', 'house / home',
    'هٰذَا هُوَ الْبَيْتُ.', 'This is the house.',
    'بَيْتُ أَحْمَدَ كَبِيرٌ.', 'Ahmad''s house is big.',
    'هَلْ تَسْكُنُ فِي بَيْتٍ كَبِيرٍ؟', 'Do you live in a big house?'),
  (v_l3, 4, 'مَسْجِد', 'mosque',
    'هَذِهِ مَسَاجِدُ.', 'These are mosques.',
    'زَيْدٌ إِمَامُ مَسْجِدٍ.', 'Zayd is the imam of a mosque.',
    'مَا اسْمُ الْمَسْجِدِ؟', 'What is the name of the mosque?'),
  (v_l3, 5, 'مُدَرِّسَة', 'female teacher',
    'هَذِهِ هِيَ الْمُدَرِّسَةُ.', 'This is the female teacher.',
    'هِيَ مُدَرِّسَةٌ جَيِّدَةٌ.', 'She is a good teacher.',
    'هَلْ هَذِهِ الْمُدَرِّسَةُ؟', 'Is this the female teacher?'),
  (v_l3, 6, 'الْ', 'the',
    'الْكِتَابُ فِي الْبَيْتِ.', 'The book is in the house.',
    'الْمُدَرِّسَةُ فِي الْمَسْجِدِ.', 'The female teacher is in the mosque.',
    'هَلْ تَفْهَمُ مَعْنَى "الْ"؟', 'Do you understand the meaning of "al-"?'),
  (v_l3, 7, 'فِي', 'in',
    'أَنَا فِي الْبَيْتِ.', 'I am in the house.',
    'هِيَ فِي الْمَسْجِدِ.', 'She is in the mosque.',
    'مَنْ فِي الْبَيْتِ؟', 'Who is in the house?'),
  (v_l3, 8, 'عِنْدَ', 'at / with',
    'هُوَ عِنْدَ الْبَيْتِ.', 'He is at the house.',
    'عِنْدَ زَيْدٍ قَلَمٌ.', 'Zayd has a pen.',
    'مَنْ عِنْدَ الْبَيْتِ؟', 'Who is at the house?');

  -- ══════════════════════════════════════════
  -- LESSON 4: Objects & Directions (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l4, 1, 'كِتَاب', 'book',
    'هٰذَا كِتَابٌ.', 'This is a book.',
    'الْكِتَابُ أَمَامَ الْمَسْجِدِ.', 'The book is in front of the mosque.',
    'هَلْ هَذَا كِتَابُ فَاطِمَةَ؟', 'Is this Fatimah''s book?'),
  (v_l4, 2, 'قَلَم', 'pen',
    'هٰذَا قَلَمٌ وَهٰذَا كِتَابٌ.', 'This is a pen and this is a book.',
    'هُوَ قَلَمُ الْمُدَرِّسَةِ.', 'It is the female teacher''s pen.',
    'هَلْ هُوَ قَلَمُ مُدَرِّسَةٍ؟', 'Is it a teacher''s pen?'),
  (v_l4, 3, 'يَذْهَبُ', 'he goes',
    'حَامِدٌ يَذْهَبُ إِلَى الْمَسْجِدِ.', 'Hamid goes to the mosque.',
    'عَائِشَةُ تَذْهَبُ إِلَى دَرْسِهَا.', 'Aishah goes to her lesson.',
    'هَلْ هِيَ تَذْهَبُ إِلَى الْمَسْجِدِ؟', 'Does she go to the mosque?'),
  (v_l4, 4, 'إِلَى', 'to',
    'أَذْهَبُ إِلَى الْمَسْجِدِ.', 'I go to the mosque.',
    'عَائِشَةُ تَذْهَبُ إِلَى دَرْسِهَا.', 'Aishah goes to her lesson.',
    'إِلَى أَيْنَ تَذْهَبِينَ؟', 'Where are you going to?'),
  (v_l4, 5, 'أَيْنَ', 'where',
    'أَيْنَ كِتَابُهُ؟', 'Where is his book?',
    'أَيْنَ قَلَمِي؟', 'Where is my pen?',
    'أَيْنَ تَذْهَبُ؟', 'Where are you going?'),
  (v_l4, 6, 'هُ', 'his / him',
    'هَذَا قَلَمُهُ.', 'This is his pen.',
    'هَذَا كِتَابُهُ.', 'This is his book.',
    'أَيْنَ كِتَابُهُ؟', 'Where is his book?'),
  (v_l4, 7, 'هَا', 'her',
    'هَذَا قَلَمُهَا.', 'This is her pen.',
    'أَنَا فِي بَيْتِهَا.', 'I am in her house.',
    'مَنْ يَذْهَبُ إِلَى بَيْتِهَا؟', 'Who goes to her house?'),
  (v_l4, 8, 'كَ', 'your (masculine)',
    'هُوَ بَيْتُكَ.', 'It is your house.',
    'هَذَا قَلَمُكَ.', 'This is your pen.',
    'هَلْ هَذَا قَلَمُكَ فِي الْمَسْجِدِ؟', 'Is this your pen in the mosque?');

  -- ══════════════════════════════════════════
  -- LESSON 5: Possessives & Reading (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l5, 1, 'كِ', 'your (feminine)',
    'هَذَا بَيْتُكِ يَا فَاطِمَةُ.', 'This is your house, Fatimah.',
    'هِيَ عِنْدَ بَيْتِكِ.', 'She is at your house.',
    'هَلْ هِيَ تَذْهَبُ إِلَى بَيْتِكِ؟', 'Does she go to your house?'),
  (v_l5, 2, 'ي', 'my',
    'بَيْتِي كَبِيرٌ.', 'My house is big.',
    'هَذَا قَلَمِي.', 'This is my pen.',
    'أَيْنَ كُتُبِي؟ هَلْ عِنْدَكَ يَا مُدَرِّسَةُ؟', 'Where are my books? Do you have them, teacher?'),
  (v_l5, 3, 'دَرْس', 'lesson',
    'أَذْهَبُ إِلَى دَرْسٍ.', 'I am going to a lesson.',
    'هُوَ فِي هَذَا الدَّرْسِ.', 'He is in this lesson.',
    'هَلْ تَذْهَبُ إِلَى الْمَسْجِدِ وَتَدْرُسُ مَعَ زَيْدٍ؟', 'Do you go to the mosque and study with Zayd?'),
  (v_l5, 4, 'يَقْرَأُ', 'he reads',
    'أَنَا أَقْرَأُ فِي الْمَسْجِدِ.', 'I read in the mosque.',
    'أَحْمَدُ يَقْرَأُ كِتَابَهُ.', 'Ahmad reads his book.',
    'هَلْ يَقْرَأُ وَيَدْرُسُ فِي الْبَيْتِ؟', 'Does he read and study in the house?'),
  (v_l5, 5, 'مَاذَا', 'what',
    'مَاذَا تَقْرَأُ؟', 'What are you reading?',
    'مَاذَا تَكْتُبُ؟', 'What are you writing?',
    'مَاذَا يَدْرُسُ فِي الْمَسْجِدِ؟', 'What does he study in the mosque?'),
  (v_l5, 6, 'كَيْفَ', 'how',
    'كَيْفَ أَنْتَ؟', 'How are you?',
    'كَيْفَ الدَّرْسُ؟', 'How is the lesson?',
    'كَيْفَ تَذْهَبُ إِلَى الْمَسْجِدِ؟', 'How do you go to the mosque?'),
  (v_l5, 7, 'يُرِيدُ', 'he wants',
    'أَنَا لَا أُرِيدُ هَذَا.', 'I do not want this.',
    'حَامِدٌ يُرِيدُ كِتَابَهُ.', 'Hamid wants his book.',
    'مَاذَا تُرِيدُ أَنْ تَقْرَأَ؟', 'What do you want to read?'),
  (v_l5, 8, 'أَنْ', 'to / that',
    'تُرِيدُ أَنْ تَكْتُبَ الْكِتَابَ.', 'You want to write the book.',
    'أُرِيدُ أَنْ أَقْرَأَ.', 'I want to read.',
    'أَيْنَ تُرِيدُ أَنْ تَذْهَبَ؟', 'Where do you want to go?');

  -- ══════════════════════════════════════════
  -- LESSON 6: Writing & Reasons (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l6, 1, 'يَكْتُبُ', 'he writes',
    'يَكْتُبُ الدَّرْسَ.', 'He writes the lesson.',
    'الإِمَامُ يَكْتُبُ فِي الْكِتَابِ.', 'The imam writes in the book.',
    'مَنْ يَكْتُبُ فِي هَذَا الْكِتَابِ؟', 'Who writes in this book?'),
  (v_l6, 2, 'حَقِيبَة', 'bag',
    'حَقِيبَتِي عِنْدَكَ.', 'My bag is with you.',
    'يَذْهَبُ إِلَى الْمَدْرَسَةِ وَعِنْدَهُ حَقِيبَةٌ.', 'He goes to school and he has a bag.',
    'مَا فِي الْحَقِيبَةِ عِنْدَ الْمُدَرِّسَةِ؟', 'What is in the bag with the female teacher?'),
  (v_l6, 3, 'لِ', 'for / to',
    'هَذَا الْكِتَابُ لَهُ.', 'This book is for him.',
    'أَقْرَأُ الْقُرْآنَ لَكَ.', 'I read the Qur''an for you / to you.',
    'هَلْ تَذْهَبُ إِلَى الْمَدْرَسَةِ لِلدَّرْسِ؟', 'Do you go to the school for the lesson?'),
  (v_l6, 4, 'لِمَاذَا', 'why',
    'لِمَاذَا تَكْتُبُ فِي كِتَابِي؟', 'Why are you writing in my book?',
    'لِمَاذَا تَذْهَبُ إِلَى الْمَسْجِدِ؟', 'Why do you go to the mosque?',
    'لِمَاذَا تَقُولُ لِي هَذَا؟', 'Why do you say this to me?'),
  (v_l6, 5, 'مِنْ', 'from',
    'هَذَا مِنِّي.', 'This is from me.',
    'الْكِتَابُ مِنَ الْمَسْجِدِ.', 'The book is from the mosque.',
    'مِنْ أَيْنَ أَنْتَ؟', 'Where are you from?'),
  (v_l6, 6, 'يَقُولُ', 'he says',
    'حَامِدٌ يَقُولُ لِي.', 'Hamid says to me.',
    'فَاطِمَةُ تَقُولُ لَكَ.', 'Fatimah says to you.',
    'لِمَاذَا تَقُولُ لِي هَذَا؟', 'Why do you say this to me?'),
  (v_l6, 7, 'أَنَّ', 'that',
    'يَقُولُ أَنَّهُ عَلِيٌّ.', 'He says that he is Ali.',
    'هِيَ تَقُولُ أَنَّ فَاطِمَةَ مُدَرِّسَةٌ.', 'She says that Fatimah is a teacher.',
    'هَلْ هِيَ تَقُولُ أَنَّ الْكِتَابَ فِي حَقِيبَتِهَا؟', 'Does she say that the book is in her bag?'),
  (v_l6, 8, 'وَاجِب', 'homework',
    'أَنَا أَكْتُبُ وَاجِبِي.', 'I am writing my homework.',
    'الإِمَامُ يَكْتُبُ الْوَاجِبَ فِي الْمَدْرَسَةِ.', 'The imam writes the homework in the school.',
    'كَيْفَ أَكْتُبُ هَذَا الْوَاجِبَ؟', 'How do I write this homework?');

  -- ══════════════════════════════════════════
  -- LESSON 7: Question Words & Positions (8 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l7, 1, 'أَيُّ', 'which',
    'أَيُّ كِتَابٍ تَقْرَأُ؟', 'Which book are you reading?',
    'أَيُّ مَسْجِدٍ تُحِبُّ؟', 'Which mosque do you like?',
    'أَيُّ كِتَابٍ تُرِيدُ؟', 'Which book do you want?'),
  (v_l7, 2, 'لِمَنْ', 'for whom / whose',
    'لِمَنْ هَذَا الْكِتَابُ؟', 'Whose book is this?',
    'لِمَنْ هَذِهِ الْحَقِيبَةُ؟', 'Whose bag is this?',
    'لِمَنْ هَذَا الْقَلَمُ؟', 'Whose pen is this?'),
  (v_l7, 3, 'كَمْ', 'how many / how much',
    'كَمْ كِتَابًا فِي حَقِيبَتِكَ؟', 'How many books are in your bag?',
    'كَمْ قَلَمًا عِنْدَكَ؟', 'How many pens do you have?',
    'كَمْ كِتَابًا تَقْرَأُ فِي الأُسْبُوعِ؟', 'How many books do you read in the week?'),
  (v_l7, 4, 'فَوْقَ', 'above / on top of',
    'الإِمَامُ يَقْرَأُ فَوْقَ الْمَسْجِدِ.', 'The imam reads above the mosque.',
    'الْكِتَابُ فَوْقَ الْمَكْتَبِ.', 'The book is on top of the desk.',
    'هَلْ كِتَابُكَ فَوْقَ كِتَابِي؟', 'Is your book above my book?'),
  (v_l7, 5, 'تَحْتَ', 'under',
    'كِتَابِي تَحْتَ كِتَابِكَ.', 'My book is under your book.',
    'الْقَلَمُ تَحْتَ الْحَقِيبَةِ.', 'The pen is under the bag.',
    'كَمْ كِتَابًا تَحْتَ هَذِهِ الْحَقِيبَةِ؟', 'How many books are under this bag?'),
  (v_l7, 6, 'أَمَامَ', 'in front of',
    'خَالِدٌ يَكْتُبُ وَاجِبَهُ أَمَامَ الْمَدْرَسَةِ.', 'Khalid writes his homework in front of the school.',
    'زَيْدٌ يَقْرَأُ أَمَامَ الإِمَامِ.', 'Zayd reads in front of the imam.',
    'لِمَاذَا أَنْتَ أَمَامَ الْمُدَرِّسِ؟', 'Why are you in front of the teacher?'),
  (v_l7, 7, 'خَلْفَ', 'behind',
    'فَاطِمَةُ فِي الْخَلْفِ.', 'Fatimah is at the back.',
    'هُوَ خَلْفَ الْمَسْجِدِ.', 'He is behind the mosque.',
    'هَلْ حَقِيبَتِي خَلْفَكِ؟', 'Is my bag behind you?'),
  (v_l7, 8, 'عَلَى', 'on / upon',
    'لَا تَكْتُبْ عَلَى كِتَابِي.', 'Do not write on my book.',
    'هَذَا الدَّرْسُ وَاجِبٌ عَلَيْكَ.', 'This lesson is obligatory on you / required of you.',
    'لِمَاذَا تَكْتُبُ فَاطِمَةُ عَلَى وَاجِبِي؟', 'Why is Fatimah writing on my homework?');

  -- ══════════════════════════════════════════
  -- LESSON 8: Adjectives & Prepositions (10 words)
  -- ══════════════════════════════════════════
  INSERT INTO prebook_items (lesson_id, order_index, word_ar, word_en, sentence_1_ar, sentence_1_en, sentence_2_ar, sentence_2_en, question_ar, question_en) VALUES
  (v_l8, 1, 'جَدِيد', 'new',
    'هَذَا بَيْتِي الْجَدِيدُ.', 'This is my new house.',
    'فَاطِمَةُ مُدَرِّسَةٌ جَدِيدَةٌ.', 'Fatimah is a new teacher.',
    'لِمَنْ هَذِهِ الْحَقِيبَةُ الْجَدِيدَةُ أَمَامَكَ؟', 'Whose new bag is this in front of you?'),
  (v_l8, 2, 'قَدِيم', 'old',
    'هَذَا الْمَسْجِدُ قَدِيمٌ.', 'This mosque is old.',
    'أَنْتَ تَقْرَأُ مِنْ كِتَابٍ قَدِيمٍ.', 'You are reading from an old book.',
    'لِمَنْ هَذِهِ الْحَقِيبَةُ الْقَدِيمَةُ عِنْدَكَ؟', 'Whose old bag is this that you have?'),
  (v_l8, 3, 'كَبِير', 'big',
    'زَيْدٌ إِمَامٌ كَبِيرٌ.', 'Zayd is a great/big imam.',
    'هَذِهِ حَقِيبَتِي الْكَبِيرَةُ.', 'This is my big bag.',
    'مَنْ يُرِيدُ أَنْ يَذْهَبَ إِلَى الْبَيْتِ الْكَبِيرِ؟', 'Who wants to go to the big house?'),
  (v_l8, 4, 'صَغِير', 'small',
    'هَذَا الْكِتَابُ صَغِيرٌ.', 'This book is small.',
    'أَنْتَ صَغِيرٌ وَهُوَ كَبِيرٌ.', 'You are small and he is big.',
    'لِمَاذَا تُرِيدُ أَنْ تَذْهَبَ إِلَى الْمَسْجِدِ الصَّغِيرِ؟', 'Why do you want to go to the small mosque?'),
  (v_l8, 5, 'وَسَط', 'middle / centre',
    'مُحَمَّدٌ فِي وَسَطِ الْمَسْجِدِ.', 'Muhammad is in the middle of the mosque.',
    'أَنْتَ تَقْرَأُ مِنْ وَسَطِ الْكِتَابِ.', 'You are reading from the middle of the book.',
    'لِمَاذَا لَا تَكْتُبُ فِي وَسَطِ الْكِتَابِ؟', 'Why do you not write in the middle of the book?'),
  (v_l8, 6, 'بَيْنَ', 'between',
    'أَنَا بَيْنَ الْمَسْجِدِ وَبَيْتِكَ.', 'I am between the mosque and your house.',
    'هَذَا بَيْنِي وَبَيْنَكَ.', 'This is between me and you.',
    'مَا هُوَ بَيْنَ الْبَيْتِ وَالْمَدْرَسَةِ؟', 'What is between the house and the school?'),
  (v_l8, 7, 'بِ', 'with / by',
    'هِيَ تَكْتُبُ بِقَلَمٍ كَبِيرٍ.', 'She writes with a big pen.',
    'كَتَبْتُ الْوَاجِبَ بِقَلَمٍ جَدِيدٍ.', 'I wrote the homework with a new pen.',
    'كَيْفَ أَنْتِ تَكْتُبِينَ بِقَلَمٍ صَغِيرٍ؟', 'How do you write with a small pen?'),
  (v_l8, 8, 'بِمَاذَا', 'with what',
    'بِمَاذَا تَكْتُبُ؟', 'With what do you write?',
    'بِمَاذَا تَأْكُلُ؟', 'With what do you eat?',
    'بِمَاذَا تَكْتُبُ فِي الدَّرْسِ؟', 'With what do you write in the lesson?'),
  (v_l8, 9, 'مَعَ مَنْ', 'with whom',
    'أَذْهَبُ إِلَى الْمَسْجِدِ مَعَ زَيْدٍ.', 'I go to the mosque with Zayd.',
    'آكُلُ الْغَدَاءَ مَعَ أُسْرَتِي.', 'I eat lunch with my family.',
    'مَعَ مَنْ تَذْهَبُ إِلَى الْمَدْرَسَةِ؟', 'With whom do you go to school?'),
  (v_l8, 10, 'بِأَيِّ', 'with which',
    'أَكْتُبُ بِأَيِّ قَلَمٍ أُرِيدُ.', 'I write with whichever pen I want.',
    'تَذْهَبُ بِأَيِّ حَافِلَةٍ إِلَى الْمَدِينَةِ؟', 'Which bus do you take to the city?',
    'بِأَيِّ قَلَمٍ تَكْتُبُ؟', 'With which pen do you write?');

END $$;
