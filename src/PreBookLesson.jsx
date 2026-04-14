import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import './PreBookLesson.css';

/* ═══════════ HAPTICS ═══════════ */
const haptic = async () => {
  try { if (Capacitor.isNativePlatform()) await Haptics.impact({ style: ImpactStyle.Light }); } catch (e) { }
};
const hapticHeavy = async () => {
  try { if (Capacitor.isNativePlatform()) await Haptics.impact({ style: ImpactStyle.Heavy }); } catch (e) { }
};

/* ═══════════ SOUNDS ═══════════ */
let _ctx = null;
const getCtx = () => {
  if (!_ctx || _ctx.state === 'closed') _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

const playCorrectSound = () => {
  try {
    const c = getCtx();
    const o1 = c.createOscillator(); const g1 = c.createGain();
    o1.connect(g1); g1.connect(c.destination);
    o1.frequency.value = 523; o1.type = 'sine';
    g1.gain.setValueAtTime(0.08, c.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    o1.start(c.currentTime); o1.stop(c.currentTime + 0.15);
    const o2 = c.createOscillator(); const g2 = c.createGain();
    o2.connect(g2); g2.connect(c.destination);
    o2.frequency.value = 659; o2.type = 'sine';
    g2.gain.setValueAtTime(0.08, c.currentTime + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    o2.start(c.currentTime + 0.08); o2.stop(c.currentTime + 0.2);
  } catch (e) { }
};

const playWrongSound = () => {
  try {
    const c = getCtx();
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.setValueAtTime(250, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(150, c.currentTime + 0.1);
    o.type = 'sine';
    g.gain.setValueAtTime(0.07, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    o.start(); o.stop(c.currentTime + 0.12);
  } catch (e) { }
};

const playComboSound = () => {
  try {
    const c = getCtx();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.value = freq; o.type = 'sine';
      const t = c.currentTime + i * 0.07;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.start(t); o.stop(t + 0.15);
    });
  } catch (e) { }
};

const playLetterSound = () => {
  try {
    const c = getCtx();
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.setValueAtTime(600, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.05);
    o.type = 'sine';
    g.gain.setValueAtTime(0.05, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
    o.start(c.currentTime); o.stop(c.currentTime + 0.06);
  } catch (e) { }
};

/* ═══════════ ARABIC HELPERS ═══════════ */
const DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670]/;

function splitArabic(word) {
  const clusters = [];
  for (const char of word) {
    if (DIACRITICS_RE.test(char) && clusters.length > 0) {
      clusters[clusters.length - 1] += char;
    } else if (char !== ' ') {
      clusters.push(char);
    }
  }
  return clusters;
}

function baseLen(word) {
  return word.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u0640 ]/g, '').length;
}

function shuffle(arr) {
  const s = [...arr];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  if (arr.length >= 3 && s.every((v, i) => v === arr[i])) return shuffle(arr);
  return s;
}

/* ═══════════ STEP GENERATOR ═══════════ */
function makeOptions(word, allWords, field, count = 3) {
  const correct = { text: word[field], isCorrect: true };
  const available = allWords.filter(w => w[field] !== word[field]);
  const distractors = shuffle(available)
    .slice(0, Math.min(count, available.length))
    .map(w => ({ text: w[field], isCorrect: false }));
  return shuffle([correct, ...distractors]);
}

function generateSteps(words) {
  const steps = [];

  words.forEach((word, i) => {
    // 1. Flashcard
    steps.push({ type: 'flashcard', word });

    // 2. Sentence 1
    if (word.sentence_1_ar) {
      steps.push({ type: 'sentence', word, sentenceAr: word.sentence_1_ar, sentenceEn: word.sentence_1_en });
    }

    // 3. Build word (or match if too short / multi-word)
    const isMulti = word.word_ar.includes(' ');
    if (!isMulti && baseLen(word.word_ar) >= 2) {
      const letters = splitArabic(word.word_ar);
      steps.push({
        type: 'build', word, letters,
        shuffled: shuffle(letters.map((ch, idx) => ({ ch, idx })))
      });
    } else {
      steps.push({ type: 'match', word, options: makeOptions(word, words, 'word_en') });
    }

    // 4. Sentence 2
    if (word.sentence_2_ar) {
      steps.push({ type: 'sentence', word, sentenceAr: word.sentence_2_ar, sentenceEn: word.sentence_2_en });
    }

    // 5. Review previous word (match)
    if (i >= 1) {
      steps.push({ type: 'match', word: words[i - 1], options: makeOptions(words[i - 1], words, 'word_en') });
    }

    // 6. Review 2 words back (recall)
    if (i >= 2 && i % 2 === 0) {
      steps.push({ type: 'recall', word: words[i - 2], options: makeOptions(words[i - 2], words, 'word_ar') });
    }
  });

  // Final review round - all words shuffled
  const shuffledWords = shuffle([...words]);
  shuffledWords.forEach((word, i) => {
    if (i % 2 === 0) {
      steps.push({ type: 'recall', word, options: makeOptions(word, words, 'word_ar') });
    } else {
      steps.push({ type: 'match', word, options: makeOptions(word, words, 'word_en') });
    }
  });

  return steps;
}

/* ═══════════ COMPONENT ═══════════ */
export default function PreBookLesson({ items, loading = false, error = '', onComplete, onExit }) {
  const steps = useMemo(() => items && items.length > 0 ? generateSteps(items) : [], [items]);

  const [stepIdx, setStepIdx] = useState(0);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalExercises, setTotalExercises] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [xpPopup, setXpPopup] = useState(null);

  // Per-step state
  const [revealed, setRevealed] = useState(false);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [placed, setPlaced] = useState([]);
  const [usedSet, setUsedSet] = useState(new Set());
  const [shakeIdx, setShakeIdx] = useState(-1);
  const [buildDone, setBuildDone] = useState(false);
  const [showQuit, setShowQuit] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speakArabic = useCallback(async (text) => {
    if (!text || isSpeaking) return;
    setIsSpeaking(true);
    const lang = 'ar-SA';
    const rate = 0.85;

    if (Capacitor.isNativePlatform()) {
      try {
        try { await TextToSpeech.stop(); } catch (_) {}
        await TextToSpeech.speak({ text, lang, rate, volume: 1.0 });
        setIsSpeaking(false);
        return;
      } catch (e) {
        try {
          await TextToSpeech.speak({ text, lang: 'ar', rate, volume: 1.0 });
          setIsSpeaking(false);
          return;
        } catch (_) {}
      }
    }

    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        await new Promise(r => setTimeout(r, 50));
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang;
        utter.rate = rate;
        utter.volume = 1.0;
        const voices = window.speechSynthesis.getVoices() || [];
        const match = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith('ar'));
        if (match) utter.voice = match;
        utter.onend = () => setIsSpeaking(false);
        utter.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utter);
      } catch (e) { setIsSpeaking(false); }
    } else {
      setIsSpeaking(false);
    }
  }, [isSpeaking]);

  const step = steps[stepIdx];
  const progress = steps.length > 0 ? (stepIdx / steps.length) * 100 : 0;

  // Reset per-step state on step change
  useEffect(() => {
    setRevealed(false);
    setSelectedOpt(null);
    setAnswered(false);
    setPlaced([]);
    setUsedSet(new Set());
    setShakeIdx(-1);
    setBuildDone(false);
    setIsSpeaking(false);
    try {
      if (Capacitor.isNativePlatform()) TextToSpeech.stop();
      else window.speechSynthesis?.cancel();
    } catch (_) {}
    window.scrollTo(0, 0);
  }, [stepIdx]);

  function addXp(base) {
    const mult = streak >= 5 ? 3 : streak >= 3 ? 2 : 1;
    const earned = base * mult;
    setXp(x => x + earned);
    setXpPopup({ amount: earned, mult, key: Date.now() });
    if (mult > 1) playComboSound();
    setTimeout(() => setXpPopup(null), 1200);
  }

  function handleCorrect() {
    const newStreak = streak + 1;
    setStreak(newStreak);
    setMaxStreak(m => Math.max(m, newStreak));
    setTotalCorrect(c => c + 1);
    setTotalExercises(e => e + 1);
    addXp(10);
    playCorrectSound();
    haptic();
  }

  function handleWrong() {
    setStreak(0);
    setTotalExercises(e => e + 1);
    playWrongSound();
    hapticHeavy();
  }

  function advance() {
    if (stepIdx < steps.length - 1) {
      setStepIdx(s => s + 1);
    } else {
      setCompleted(true);
      playComboSound();
    }
  }

  function autoAdvance(ms = 1200) {
    setTimeout(advance, ms);
  }

  // ── MCQ handler ──
  function handleOption(opt) {
    if (answered) return;
    setSelectedOpt(opt);
    setAnswered(true);
    haptic();
    if (opt.isCorrect) {
      handleCorrect();
      autoAdvance(1000);
    } else {
      handleWrong();
      autoAdvance(2000);
    }
  }

  // ── Build handler ──
  function handleLetterTap(shuffIdx) {
    if (usedSet.has(shuffIdx) || buildDone) return;
    const expectedChar = step.letters[placed.length];
    const tappedChar = step.shuffled[shuffIdx].ch;
    haptic();

    if (tappedChar === expectedChar) {
      const newPlaced = [...placed, tappedChar];
      const newUsed = new Set([...usedSet, shuffIdx]);
      setPlaced(newPlaced);
      setUsedSet(newUsed);
      playLetterSound();

      if (newPlaced.length === step.letters.length) {
        setBuildDone(true);
        handleCorrect();
        autoAdvance(1200);
      }
    } else {
      setShakeIdx(shuffIdx);
      playWrongSound();
      setTimeout(() => setShakeIdx(-1), 400);
    }
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="prebook-shell">
        <div className="prebook-loading">Loading lesson...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="prebook-shell">
        <div className="prebook-loading">
          <p>{error}</p>
          <button className="prebook-complete-btn" onClick={() => { haptic(); onExit(); }} style={{ marginTop: 16 }}>
            Back to lessons
          </button>
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="prebook-shell">
        <div className="prebook-loading">
          <p>Lesson content unavailable.</p>
          <button className="prebook-complete-btn" onClick={() => { haptic(); onExit(); }} style={{ marginTop: 16 }}>
            Back to lessons
          </button>
        </div>
      </div>
    );
  }

  // ── Completion screen ──
  if (completed) {
    const accuracy = totalExercises > 0 ? totalCorrect / totalExercises : 1;
    const stars = accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1;

    return (
      <div className="prebook-shell prebook-complete-shell">
        <div className="prebook-complete-content">
          <div className="prebook-complete-lottie">
            <DotLottieReact src="/animations/done.lottie" loop autoplay style={{ width: 200, height: 200 }} />
          </div>

          <h1 className="prebook-complete-title">Lesson Complete!</h1>

          <div className="prebook-stars-row">
            {[1, 2, 3].map(i => (
              <motion.div
                key={i}
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3 + i * 0.15, type: 'spring', stiffness: 300 }}
              >
                <Icon
                  icon={i <= stars ? "solar:star-bold" : "solar:star-line-duotone"}
                  className={`prebook-star ${i <= stars ? 'earned' : 'empty'}`}
                />
              </motion.div>
            ))}
          </div>

          <div className="prebook-stats-grid">
            <div className="prebook-stat-card">
              <Icon icon="solar:star-bold" className="prebook-stat-icon xp" />
              <span className="prebook-stat-value">{xp}</span>
              <span className="prebook-stat-label">XP Earned</span>
            </div>
            <div className="prebook-stat-card">
              <span className="prebook-stat-icon fire">🔥</span>
              <span className="prebook-stat-value">{maxStreak}</span>
              <span className="prebook-stat-label">Best Streak</span>
            </div>
            <div className="prebook-stat-card">
              <Icon icon="solar:target-bold" className="prebook-stat-icon acc" />
              <span className="prebook-stat-value">{Math.round(accuracy * 100)}%</span>
              <span className="prebook-stat-label">Accuracy</span>
            </div>
          </div>

          <button className="prebook-complete-btn" onClick={() => { haptic(); onComplete({ xp, maxStreak, accuracy }); }}>
            Continue
            <Icon icon="solar:arrow-right-linear" className="text-lg" />
          </button>
        </div>
      </div>
    );
  }

  if (!step) return null;

  // ── Main UI ──
  return (
    <div className="prebook-shell">
      {/* ── Header ── */}
      <header className="prebook-header">
        <button className="prebook-back" onClick={() => { haptic(); setShowQuit(true); }}>
          <Icon icon="solar:close-circle-bold" className="text-2xl" />
        </button>

        <div className="prebook-progress-track">
          <motion.div
            className="prebook-progress-fill"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="prebook-header-stats">
          <div className="prebook-xp-badge">
            <Icon icon="solar:star-bold" className="prebook-xp-icon" />
            <span>{xp}</span>
          </div>

          <AnimatePresence>
            {streak >= 2 && (
              <motion.div
                className={`prebook-streak-badge ${streak >= 5 ? 'fire' : streak >= 3 ? 'hot' : ''}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                key="streak"
              >
                <span className="prebook-fire-emoji">🔥</span>
                <span>{streak}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── XP Float ── */}
      <AnimatePresence>
        {xpPopup && (
          <motion.div
            key={xpPopup.key}
            className={`prebook-xp-float ${xpPopup.mult > 1 ? 'combo' : ''}`}
            initial={{ opacity: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: 1, y: -30, scale: 1 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ duration: 0.8 }}
          >
            +{xpPopup.amount} XP
            {xpPopup.mult > 1 && <span className="prebook-xp-mult"> x{xpPopup.mult}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quit Confirmation ── */}
      {showQuit && (
        <div className="prebook-modal-overlay">
          <div className="prebook-modal">
            <h3 className="prebook-modal-title">Leave Lesson?</h3>
            <p className="prebook-modal-text">Your progress will be lost.</p>
            <div className="prebook-modal-actions">
              <button className="prebook-modal-btn stay" onClick={() => { haptic(); setShowQuit(false); }}>
                Stay
              </button>
              <button className="prebook-modal-btn leave" onClick={() => { haptic(); setShowQuit(false); onExit(); }}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step Content ── */}
      <main className="prebook-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIdx}
            className="prebook-step"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.2 }}
          >

            {/* ════════ FLASHCARD ════════ */}
            {step.type === 'flashcard' && (
              <div className="prebook-flashcard-wrap">
                <div className="prebook-step-label">NEW WORD</div>
                <div
                  className={`prebook-flashcard ${revealed ? 'revealed' : ''}`}
                  onClick={() => { if (!revealed) { haptic(); setRevealed(true); } }}
                >
                  <div className="prebook-flashcard-ar" dir="rtl">{step.word.word_ar}</div>
                  {step.word.word_transliteration && (
                    <div className="prebook-flashcard-translit">{step.word.word_transliteration}</div>
                  )}
                  <AnimatePresence>
                    {revealed && (
                      <motion.div
                        className="prebook-flashcard-en"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {step.word.word_en}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!revealed && <div className="prebook-tap-hint">Tap to reveal</div>}
                </div>
                {revealed && (
                  <motion.div
                    className="prebook-action-row"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <button
                      className={`prebook-audio-btn ${isSpeaking ? 'playing' : ''}`}
                      onClick={() => { haptic(); speakArabic(step.word.word_ar); }}
                    >
                      <Icon icon="solar:volume-loud-bold" />
                    </button>
                    <button className="prebook-continue-btn" onClick={() => { haptic(); advance(); }}>
                      Continue
                      <Icon icon="solar:arrow-right-linear" />
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {/* ════════ SENTENCE ════════ */}
            {step.type === 'sentence' && (
              <div className="prebook-sentence-wrap">
                <div className="prebook-step-label">IN CONTEXT</div>
                <div className="prebook-sentence-card">
                  <p className="prebook-sentence-ar" dir="rtl">{step.sentenceAr}</p>
                  <div className="prebook-sentence-divider" />
                  <p className="prebook-sentence-en">{step.sentenceEn}</p>
                </div>
                <div className="prebook-sentence-word-badge">
                  <span className="prebook-sentence-word-ar" dir="rtl">{step.word.word_ar}</span>
                  <span className="prebook-sentence-word-eq">=</span>
                  <span className="prebook-sentence-word-en">{step.word.word_en}</span>
                </div>
                <div className="prebook-action-row">
                  <button
                    className={`prebook-audio-btn ${isSpeaking ? 'playing' : ''}`}
                    onClick={() => { haptic(); speakArabic(step.sentenceAr); }}
                  >
                    <Icon icon="solar:volume-loud-bold" />
                  </button>
                  <button className="prebook-continue-btn" onClick={() => { haptic(); advance(); }}>
                    Continue
                    <Icon icon="solar:arrow-right-linear" />
                  </button>
                </div>
              </div>
            )}

            {/* ════════ BUILD WORD ════════ */}
            {step.type === 'build' && (
              <div className="prebook-build-wrap">
                <div className="prebook-step-label">SPELL THE WORD</div>
                <div className="prebook-build-meaning">&ldquo;{step.word.word_en}&rdquo;</div>

                <div className="prebook-build-slots" dir="rtl">
                  {step.letters.map((_, i) => (
                    <div key={i} className={`prebook-slot ${i < placed.length ? 'filled' : 'empty'}`}>
                      <span>{i < placed.length ? placed[i] : ''}</span>
                    </div>
                  ))}
                </div>

                <div className="prebook-letter-pool">
                  {step.shuffled.map((item, i) => (
                    <motion.button
                      key={i}
                      className={`prebook-letter-btn ${usedSet.has(i) ? 'used' : ''}`}
                      onClick={() => handleLetterTap(i)}
                      disabled={usedSet.has(i)}
                      animate={shakeIdx === i ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                      transition={shakeIdx === i ? { duration: 0.3 } : {}}
                    >
                      {item.ch}
                    </motion.button>
                  ))}
                </div>

                {buildDone && (
                  <motion.div
                    className="prebook-build-check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <Icon icon="solar:check-circle-bold" />
                  </motion.div>
                )}
              </div>
            )}

            {/* ════════ MATCH (Arabic → English) ════════ */}
            {step.type === 'match' && (
              <div className="prebook-match-wrap">
                <div className="prebook-step-label">WHAT DOES THIS MEAN?</div>
                <div className="prebook-match-prompt" dir="rtl">{step.word.word_ar}</div>

                <div className="prebook-options">
                  {step.options.map((opt, i) => {
                    let cls = '';
                    if (answered) {
                      if (opt.isCorrect) cls = 'correct';
                      else if (selectedOpt === opt) cls = 'wrong';
                    }
                    return (
                      <motion.button
                        key={i}
                        className={`prebook-option ${cls}`}
                        onClick={() => handleOption(opt)}
                        disabled={answered}
                        animate={answered && selectedOpt === opt && !opt.isCorrect ? { x: [0, -6, 6, -6, 6, 0] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="prebook-option-letter">{String.fromCharCode(65 + i)}</span>
                        <span className="prebook-option-text">{opt.text}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ════════ RECALL (English → Arabic) ════════ */}
            {step.type === 'recall' && (
              <div className="prebook-recall-wrap">
                <div className="prebook-step-label">HOW DO YOU SAY THIS?</div>
                <div className="prebook-recall-prompt">{step.word.word_en}</div>

                <div className="prebook-options">
                  {step.options.map((opt, i) => {
                    let cls = '';
                    if (answered) {
                      if (opt.isCorrect) cls = 'correct';
                      else if (selectedOpt === opt) cls = 'wrong';
                    }
                    return (
                      <motion.button
                        key={i}
                        className={`prebook-option ${cls}`}
                        onClick={() => handleOption(opt)}
                        disabled={answered}
                        dir="rtl"
                        animate={answered && selectedOpt === opt && !opt.isCorrect ? { x: [0, -6, 6, -6, 6, 0] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="prebook-option-letter">{String.fromCharCode(65 + i)}</span>
                        <span className="prebook-option-text">{opt.text}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
