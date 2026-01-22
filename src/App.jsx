import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import { Leapfrog } from 'ldrs/react';
import 'ldrs/react/Leapfrog.css';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { MdArrowBackIosNew } from "react-icons/md";
import { motion, AnimatePresence } from 'motion/react';
// Web MediaRecorder API used instead of Capacitor plugins (outputs WEBM_OPUS for Google STT)
import "./App.css";

// Initialize status bar for edge-to-edge design
const initStatusBar = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      // Set status bar to light style (dark icons on light background)
      await StatusBar.setStyle({ style: Style.Light });
      // Set background color to match app theme
      await StatusBar.setBackgroundColor({ color: '#f7f2e8' });
    } catch (e) {
      console.log('StatusBar not available');
    }
  }
};

// Call on app start
initStatusBar();

// Synthesized click sound using Web Audio API (instant, no loading delay)
const playClickSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Bubbly pop sound - quick frequency sweep
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.05);
    oscillator.type = 'sine';

    // Quick fade out for a soft "pop"
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); // Quieter
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.06);
  } catch (e) {
    // Audio not available
  }
};

// Utility function for haptic feedback + click sound
const triggerHaptic = async () => {
  playClickSound();
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {
    // Haptics not available (e.g., on web)
  }
};

// Utility function for heavy haptic feedback (quiz finish screens)
const triggerHeavyHaptic = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch (e) {
    // Haptics not available (e.g., on web)
  }
};

// Convert number to Arabic numerals (٠١٢٣٤٥)
const toArabicNum = (n) => {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(n).split('').map(d => arabicDigits[+d] || d).join('');
};

// Normalize Arabic text (remove tashkeel, normalize alef/ya/ta-marbuta)
const normalizeArabic = (s = "") =>
  s
    .replace(/[ًٌٍَُِّْ]/g, "") // remove tashkeel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

// Compute word overlap similarity score (0-1)
const scoreSimilarity = (a, b) => {
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  const common = [...A].filter(x => B.has(x)).length;
  return common / Math.max(A.size, B.size);
};

// ============ SPLASH SCREEN COMPONENT ============
function SplashScreen({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="splash-screen"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Ripple effects */}
      <motion.div
        className="splash-ripple"
        initial={{ scale: 0, opacity: 0.8 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />
      <motion.div
        className="splash-ripple"
        initial={{ scale: 0, opacity: 0.8 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 2, delay: 0.3, ease: "easeOut" }}
      />
      <motion.div
        className="splash-ripple"
        initial={{ scale: 0, opacity: 0.8 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 2, delay: 0.6, ease: "easeOut" }}
      />

      <div className="splash-content">
        {/* Logo with explosion effect */}
        <motion.div
          className="splash-logo-container"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            duration: 1
          }}
        >
          <img
            src="/clemency-icon.png"
            alt="IHYA Institute Logo"
            className="splash-logo"
          />
        </motion.div>

        <motion.div
          className="splash-text"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <h1 className="splash-title">Welcome</h1>
          <p className="splash-subtitle">Your Arabic journey awaits</p>
        </motion.div>

        <motion.div
          className="splash-dots"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        >
          <div className="splash-dot" style={{ animationDelay: '0ms' }}></div>
          <div className="splash-dot" style={{ animationDelay: '150ms' }}></div>
          <div className="splash-dot" style={{ animationDelay: '300ms' }}></div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function App() {
  // ============ SPLASH SCREEN STATE ============
  const [showSplash, setShowSplash] = useState(true);

  const [stages, setStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(true);

  const [allLessons, setAllLessons] = useState([]); // all lessons (for progress)
  const [lessons, setLessons] = useState([]); // lessons for selected stage
  const [selectedStage, setSelectedStage] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [activeLesson, setActiveLesson] = useState(null);
  const activeLessonRef = useRef(null);

  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // ✅ NEW: BLOCKS STATE
  const [lessonBlocks, setLessonBlocks] = useState([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  // ✅ NEW: SCROLL/REVEAL STATE
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [dialogueFinished, setDialogueFinished] = useState(false);
  const blockRefs = useRef({});
  const convoScrollRef = useRef(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [showJumpToCurrent, setShowJumpToCurrent] = useState(false);

  // QUIZ STATE
  const [quizActive, setQuizActive] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hearts, setHearts] = useState(5);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [answerResult, setAnswerResult] = useState(null); // "correct" | "wrong" | null
  const [quizFinished, setQuizFinished] = useState(false);

  // Trigger heavy haptic when quiz finishes (success or failure)
  useEffect(() => {
    if (quizFinished) {
      triggerHeavyHaptic();
    }
  }, [quizFinished]);

  // LESSON FLOW STATE
  const [lessonPhase, setLessonPhase] = useState("lesson");
  // "lesson" -> "intro_grammar" -> "grammar" -> "intro_vocab" -> "vocab" -> "speaking" -> "intro_drills" -> "explain" -> "relisten" -> "pre_quiz"

  // VOCAB / EXPLANATION / GRAMMAR STATE
  const [vocabItems, setVocabItems] = useState([]);
  const [vocabIndex, setVocabIndex] = useState(0);
  const [explanations, setExplanations] = useState([]);
  const [explanationIndex, setExplanationIndex] = useState(0);
  const [grammarNotes, setGrammarNotes] = useState([]);
  const [grammarIndex, setGrammarIndex] = useState(0);
  const [speakingExercises, setSpeakingExercises] = useState([]);

  // SPEECH RECOGNITION STATE
  const [spokenText, setSpokenText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");

  // VOICE RECORDING STATE
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [speechFeedback, setSpeechFeedback] = useState(null); // "Good ✅" | "Almost 👍" | "Try again 🔁"
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false); // Show loading while checking speech
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // AUDIO STATE
  const audioRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCompleted, setAudioCompleted] = useState(false);

  // PARAGRAPH PLAYBACK STATE
  const [playingParagraphId, setPlayingParagraphId] = useState(null);
  const [playingParagraphEnd, setPlayingParagraphEnd] = useState(null);
  const [clickedParagraphs, setClickedParagraphs] = useState(new Set());
  const [hideInstruction, setHideInstruction] = useState(false);
  const [isSlowSpeed, setIsSlowSpeed] = useState(false);

  // AUTH STATE
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [authError, setAuthError] = useState("");

  // LESSON PROGRESS STATE
  const [lessonProgress, setLessonProgress] = useState([]); // [{lesson_id, hearts_left}, ...]
  const [showExitModal, setShowExitModal] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  // PROFILE MENU STATE
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showQuitQuizConfirm, setShowQuitQuizConfirm] = useState(false);
  const lastBackPressRef = useRef(0); // For double-tap to exit

  // TRANSITION OVERLAY STATE
  const [transitioning, setTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState("forward"); // "forward" | "back"
  const transitionTimerRef = useRef(null);

  // LESSON CONTENT CACHE (for preloading)
  const lessonContentCache = useRef(new Map()); // Map<lessonId, { questions, vocab, explanations, grammarNotes, speakingExercises, blocks }>

  // ✅ SPEAKING PRACTICE MODE STATE
  const [practiceMode, setPracticeMode] = useState(null); // null = selection, 'book' | 'speaking'
  const [speakingModes, setSpeakingModes] = useState([]);
  const [loadingSpeakingModes, setLoadingSpeakingModes] = useState(false);
  const [selectedSpeakingMode, setSelectedSpeakingMode] = useState(null);
  const [speakingLessons, setSpeakingLessons] = useState([]);
  const [loadingSpeakingLessons, setLoadingSpeakingLessons] = useState(false);
  const [activeSpeakingLesson, setActiveSpeakingLesson] = useState(null);
  const [speakingLessonItems, setSpeakingLessonItems] = useState([]);
  const [currentSpeakingItemIndex, setCurrentSpeakingItemIndex] = useState(0);
  const [currentSpeakingModeType, setCurrentSpeakingModeType] = useState(null); // 'speaking_repeat' | 'speaking_translate'
  const [speakingItemCorrect, setSpeakingItemCorrect] = useState(false);
  const [speakingLessonComplete, setSpeakingLessonComplete] = useState(false);
  const [speakingLessonProgress, setSpeakingLessonProgress] = useState([]); // [{speaking_lesson_id}, ...]

  // ---------- TRANSITION HELPER ----------

  function beginTransition(minMs = 250) {
    setTransitioning(true);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

    let doneCalled = false;

    return () => {
      if (doneCalled) return;
      doneCalled = true;

      transitionTimerRef.current = setTimeout(() => {
        setTransitioning(false);
      }, minMs);
    };
  }

  // ---------- HELPERS FOR PROGRESS ----------

  function isLessonCompleted(lessonId) {
    return lessonProgress.some(
      (p) => p.lesson_id === lessonId && p.hearts_left > 0
    );
  }

  function getStageProgress(stageId) {
    const stageLessons = allLessons.filter((l) => l.stage_id === stageId);
    const total = stageLessons.length;
    if (total === 0) {
      return { completed: 0, total: 0, percent: 0 };
    }
    const completed = stageLessons.filter((l) => isLessonCompleted(l.id)).length;
    const percent = Math.round((completed / total) * 100);
    return { completed, total, percent };
  }

  function isSpeakingLessonCompleted(lessonId) {
    return speakingLessonProgress.some(
      (p) => p.speaking_lesson_id === lessonId
    );
  }

  async function saveSpeakingLessonProgress(lessonId) {
    if (!user) return;

    // Update local state immediately
    setSpeakingLessonProgress((prev) => {
      const exists = prev.some(p => p.speaking_lesson_id === lessonId);
      if (exists) return prev;
      return [...prev, { speaking_lesson_id: lessonId }];
    });

    // Save to Supabase
    const { error } = await supabase
      .from("speaking_lesson_progress")
      .upsert({
        user_id: user.id,
        speaking_lesson_id: lessonId,
        completed_at: new Date().toISOString()
      }, { onConflict: ['user_id', 'speaking_lesson_id'] });

    if (error) {
      console.error("Error saving speaking lesson progress:", error);
    }
  }

  function shuffleArray(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
  }

  // ---------- SOUND EFFECTS ----------

  function playCorrectSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.log("Sound not supported");
    }
  }

  function playWrongSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(200, ctx.currentTime);
      oscillator.frequency.setValueAtTime(150, ctx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.log("Sound not supported");
    }
  }

  function playCelebrationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
        oscillator.start(ctx.currentTime + i * 0.15);
        oscillator.stop(ctx.currentTime + i * 0.15 + 0.3);
      });
    } catch (e) {
      console.log("Sound not supported");
    }
  }

  // Speaking practice correct jingle - pleasant chime
  function playSpeakingCorrectSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Two-note rising chime (G5 -> C6)
      const notes = [783.99, 1046.50];
      notes.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        const startTime = ctx.currentTime + i * 0.12;
        oscillator.frequency.setValueAtTime(freq, startTime);
        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.25);
      });
    } catch (e) {
      console.log("Sound not supported");
    }
  }

  // Speaking practice incorrect jingle - soft descending tone
  function playSpeakingIncorrectSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(330, ctx.currentTime); // E4
      oscillator.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.2); // A3
      gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.log("Sound not supported");
    }
  }

  // ---------- AUTH LOGIC ----------

  useEffect(() => {
    async function getUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    }
    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Keep ref in sync with activeLesson state
  useEffect(() => {
    activeLessonRef.current = activeLesson;
  }, [activeLesson]);

  // Native Android hardware back button handling via Capacitor
  // Register ONCE to avoid stale closures - use ref to get current value
  useEffect(() => {
    const backListener = CapacitorApp.addListener('backButton', (event) => {
      // 🔴 IMPORTANT: stop default behaviour (closing app)
      event.preventDefault?.();

      // Use ref to get current value (avoids stale closure)
      if (activeLessonRef.current) {
        // Inside a lesson → show exit lesson modal
        setShowExitModal(true);
      } else {
        // On homepage → double-tap to exit
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          // Second tap within 2 seconds → exit app
          CapacitorApp.exitApp();
        } else {
          // First tap → record time (user can tap again to exit)
          lastBackPressRef.current = now;
        }
      }
    });

    return () => {
      backListener.remove();
    };
  }, []); // Register only ONCE

  async function handleSignUp(e) {
    e.preventDefault();
    setAuthError("");

    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      console.error(error);
      setAuthError(error.message);
    } else {
      setAuthError("Check your email to confirm your account.");
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setAuthError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      console.error(error);
      setAuthError(error.message);
    } else {
      setAuthError("");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setLessonProgress([]);
  }



  // ✅ SYNC REVEALED COUNT from timestamps
  useEffect(() => {
    if (!activeLesson || activeLesson.lesson_format !== "blocks") return;
    if (!lessonBlocks?.length) return;

    const dialogue = lessonBlocks
      .filter((b) => b.block_type === "dialogue")
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    if (dialogue.length === 0) return;

    const offset = activeLesson.dialogue_time_offset_seconds || 0;
    const effectiveTime = currentAudioTime + offset;

    // How many should be visible at this time?
    const shouldShow = dialogue.filter(
      (b) => (b.start_time_seconds ?? 0) <= effectiveTime
    ).length;

    // Never go backwards (prevents flicker if timeupdate jitters)
    setRevealedCount((prev) => Math.max(prev, shouldShow));
  }, [currentAudioTime, lessonBlocks, activeLesson]);

  // ✅ NEW: requestAnimationFrame polling for smooth progress
  useEffect(() => {
    if (!audioRef.current) return;
    if (!activeLesson || activeLesson.lesson_format !== "blocks") return;

    let rafId;

    const tick = () => {
      if (audioRef.current) {
        const t = audioRef.current.currentTime;
        setCurrentAudioTime(t);

        // Optional: also update audioProgress bar for smoothness
        if (audioRef.current.duration > 0) {
          setAudioProgress(
            (audioRef.current.currentTime / audioRef.current.duration) * 100
          );
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    if (audioPlaying) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [audioPlaying, activeLesson]);

  // Global click sounds removed - only keeping correct/wrong/celebration sounds

  // ---------- PRELOAD LESSON CONTENT (Background) ----------

  async function preloadLessonContent(lessonId, lessonFormat) {
    // Skip if already cached
    if (lessonContentCache.current.has(lessonId)) return;

    try {
      // Fetch all content in parallel for speed
      const [questionsRes, vocabRes, explRes, notesRes, speakingRes, blocksRes] = await Promise.all([
        supabase.from("questions").select("id, question_type, prompt_text, order").eq("lesson_id", lessonId).order("order", { ascending: true }),
        supabase.from("lesson_vocab").select("*").eq("lesson_id", lessonId).order("order", { ascending: true }),
        supabase.from("lesson_explanations").select("*").eq("lesson_id", lessonId).order("order", { ascending: true }),
        supabase.from("lesson_notes").select("*").eq("lesson_id", lessonId).order("order_index", { ascending: true }),
        supabase.from("lesson_speaking_exercises").select("*").eq("lesson_id", lessonId).order("order_index", { ascending: true }),
        lessonFormat === "blocks"
          ? supabase.from("lesson_blocks").select(`id, lesson_id, block_type, order_index, text_ar, text_en, speaker_id, audio_url, start_time_seconds, end_time_seconds, speakers (id, display_name_ar, avatar_url, bubble_side)`).eq("lesson_id", lessonId).order("order_index", { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);

      // Fetch question options for MCQs
      const questions = questionsRes.data || [];
      const questionsWithOptions = [];
      for (const q of questions) {
        if (q.question_type === "mcq") {
          const { data: options } = await supabase.from("question_options").select("*").eq("question_id", q.id);
          questionsWithOptions.push({ ...q, options: shuffleArray(options || []) });
        } else {
          questionsWithOptions.push({ ...q, options: [] });
        }
      }

      // Store in cache
      lessonContentCache.current.set(lessonId, {
        questions: questionsWithOptions,
        vocab: vocabRes.data || [],
        explanations: explRes.data || [],
        grammarNotes: notesRes.data || [],
        speakingExercises: speakingRes.data || [],
        blocks: blocksRes.data || []
      });

      console.log("Preloaded lesson content:", lessonId);
    } catch (err) {
      console.error("Error preloading lesson:", lessonId, err);
    }
  }

  // Preload multiple lessons in background
  async function preloadLessonsForStage(stageId, lessonsData) {
    const stageLessons = lessonsData.filter(l => l.stage_id === stageId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    // Preload all lessons for this stage (limit to first 5 to avoid overloading)
    const toPreload = stageLessons.slice(0, 5);
    for (const lesson of toPreload) {
      await preloadLessonContent(lesson.id, lesson.lesson_format);
    }
  }

  // ---------- LOAD STAGES + ALL LESSONS ----------

  useEffect(() => {
    async function loadInitialData() {
      setLoadingStages(true);

      const { data: stagesData, error: stagesError } = await supabase
        .from("stages")
        .select("*")
        .order("order", { ascending: true });

      if (stagesError) {
        console.error("Error loading stages:", stagesError);
      } else {
        setStages(stagesData || []);
      }

      // ✅ your table is lessons
      const { data: lessonsData, error: lessonsError } = await supabase
        .from("lessons")
        .select("*");

      if (lessonsError) {
        console.error("Error loading all lessons:", lessonsError);
        setAllLessons([]);
      } else {
        setAllLessons(lessonsData || []);

        // Background preload first stage lessons for instant loading
        if (stagesData && stagesData.length > 0 && lessonsData) {
          const firstStageId = stagesData[0].id;
          console.log("Starting background preload for first stage:", firstStageId);
          // Don't await - run in background
          preloadLessonsForStage(firstStageId, lessonsData);
        }
      }

      setLoadingStages(false);
    }

    loadInitialData();
  }, []);

  // ---------- LOAD LESSONS FOR A STAGE ----------

  function resetAudio() {
    setAudioPlaying(false);
    setAudioCompleted(false);
    setAudioProgress(0);
  }

  function resetLessonFlow() {
    setLessonPhase("lesson");
    setVocabItems([]);
    setVocabIndex(0);
    setExplanations([]);
    setGrammarNotes([]);
    setGrammarIndex(0);
    // ✅ reset blocks too
    setLessonBlocks([]);
    setLoadingBlocks(false);
    setCurrentAudioTime(0);
    setRevealedCount(0);
    setDialogueFinished(false);
    blockRefs.current = {};
  }

  function loadLessons(stageId) {
    // Toggle: if clicking the same stage, close it
    if (selectedStage === stageId) {
      setSelectedStage(null);
      setLessons([]);
      return;
    }

    setSelectedStage(stageId);
    setLoadingLessons(true);

    const stageLessons = allLessons
      .filter((l) => l.stage_id === stageId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    setLessons(stageLessons);
    setLoadingLessons(false);
    setActiveLesson(null);
    resetQuiz();
    resetAudio();
    resetLessonFlow();

    // Background preload this stage's lessons
    preloadLessonsForStage(stageId, allLessons);
  }

  // ---------- SPEAKING PRACTICE DATA FETCHING ----------

  async function loadSpeakingModes() {
    setLoadingSpeakingModes(true);
    console.log("Loading speaking modes...");
    const { data, error } = await supabase
      .from("speaking_modes")
      .select("*");

    console.log("Speaking modes response:", { data, error });

    if (error) {
      console.error("Error loading speaking modes:", error);
      setSpeakingModes([]);
    } else {
      setSpeakingModes(data || []);
    }
    setLoadingSpeakingModes(false);
  }

  async function loadSpeakingLessons(modeId) {
    // Toggle: if clicking the same mode, close it
    if (selectedSpeakingMode === modeId) {
      setSelectedSpeakingMode(null);
      setSpeakingLessons([]);
      return;
    }

    setSelectedSpeakingMode(modeId);
    setLoadingSpeakingLessons(true);

    console.log("Loading speaking lessons for mode:", modeId);

    const { data, error } = await supabase
      .from("speaking_lessons")
      .select("*")
      .eq("mode_id", modeId)
      .order("order", { ascending: true });

    console.log("Speaking lessons response:", { data, error });

    if (error) {
      console.error("Error loading speaking lessons:", error);
      setSpeakingLessons([]);
    } else {
      setSpeakingLessons(data || []);
    }
    setLoadingSpeakingLessons(false);
  }

  async function openSpeakingLesson(lesson) {
    triggerHaptic();

    const endTransition = beginTransition(350);
    setTransitionDirection("forward");

    // Get the mode type for this lesson (e.g., 'speaking_repeat' or 'speaking_translate')
    // Use loose equality (==) to handle string/number type mismatches
    const currentMode = speakingModes.find(m => String(m.id) === String(lesson.mode_id));
    console.log("Finding mode - lesson.mode_id:", lesson.mode_id, "Available modes:", speakingModes.map(m => ({ id: m.id, name: m.name })));

    // Detect mode type: check explicit field OR infer from mode name
    let modeType = currentMode?.lesson_type || currentMode?.mode_type || currentMode?.type;

    // If no explicit type field, infer from the mode's name
    if (!modeType && currentMode?.name) {
      const modeName = currentMode.name.toLowerCase();
      console.log("Mode name (lowercase):", modeName, "Contains 'translate':", modeName.includes('translate'));
      if (modeName.includes('translate')) {
        modeType = 'speaking_translate';
      } else {
        modeType = 'speaking_repeat';
      }
    }

    // Default fallback
    if (!modeType) modeType = 'speaking_repeat';

    console.log("Speaking mode detected:", currentMode, "Mode type:", modeType);
    setCurrentSpeakingModeType(modeType);

    setActiveSpeakingLesson(lesson);
    setCurrentSpeakingItemIndex(0);
    setSpeakingItemCorrect(false);
    setSpeakingLessonComplete(false);
    setSpeechFeedback(null);
    setSpokenText("");
    setSpeechError("");

    // Fetch speaking lesson items (FK is speaking_lesson_id)
    console.log("Loading speaking lesson items for lesson:", lesson.id);
    const { data, error } = await supabase
      .from("speaking_lesson_items")
      .select("*")
      .eq("speaking_lesson_id", lesson.id)
      .order("order", { ascending: true });

    console.log("Speaking lesson items response:", { data, error });

    if (error) {
      console.error("Error loading speaking lesson items:", error);
      setSpeakingLessonItems([]);
    } else {
      setSpeakingLessonItems(data || []);
    }

    endTransition();
    window.scrollTo(0, 0);
  }

  function resetSpeakingFlow() {
    setActiveSpeakingLesson(null);
    setSpeakingLessonItems([]);
    setCurrentSpeakingItemIndex(0);
    setSpeakingItemCorrect(false);
    setSpeakingLessonComplete(false);
    setSpeechFeedback(null);
    setSpokenText("");
    setSpeechError("");
    setCurrentSpeakingModeType(null);
  }

  function backToSpeakingLessons() {
    const endTransition = beginTransition(250);
    setTransitionDirection("back");
    resetSpeakingFlow();
    endTransition();
  }

  // ---------- LOAD PROGRESS WHEN USER CHANGES ----------

  useEffect(() => {
    async function fetchProgress() {
      if (!user) {
        setLessonProgress([]);
        setSpeakingLessonProgress([]);
        return;
      }

      // Load book lesson progress
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("lesson_id, hearts_left");

      if (error) {
        console.error("Error loading lesson progress:", error);
        setLessonProgress([]);
      } else {
        setLessonProgress(data || []);
      }

      // Load speaking lesson progress
      const { data: speakingData, error: speakingError } = await supabase
        .from("speaking_lesson_progress")
        .select("speaking_lesson_id");

      if (speakingError) {
        console.error("Error loading speaking lesson progress:", speakingError);
        setSpeakingLessonProgress([]);
      } else {
        setSpeakingLessonProgress(speakingData || []);
      }
    }

    fetchProgress();
  }, [user]);

  // Reset quiz state
  function resetQuiz() {
    setQuizActive(false);
    setCurrentQuestionIndex(0);
    setHearts(5);
    setSelectedOptionId(null);
    setAnswerResult(null);
    setQuizFinished(false);
    setHasAnswered(false);
  }

  // Browser Speech Recognition helper
  const startBrowserSpeech = () => {
    setSpeechError("");

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError("Speech recognition not supported on this device/browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ar-SA"; // Arabic
    recognition.interimResults = true;
    recognition.continuous = false;

    setSpokenText("");
    setIsListening(true);

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setSpokenText(transcript.trim());
    };

    recognition.onerror = (event) => {
      setSpeechError(event.error || "Speech recognition error");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Voice Recording using Web MediaRecorder API (outputs WEBM_OPUS for Google STT)
  const startRecording = async () => {
    try {
      setSpeechError("");
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });

        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result;
          // Strip the data URL prefix (e.g., "data:audio/webm;codecs=opus;base64,")
          const base64Audio = base64String.split(',')[1];
          setRecordedAudio(base64Audio);
          console.log('Audio recorded (WEBM_OPUS base64), length:', base64Audio.length);

          // For Speaking Practice mode, pass the current item's arabic_text
          const currentSpeakingItem = speakingLessonItems[currentSpeakingItemIndex];
          const expectedText = currentSpeakingItem?.arabic_text || null;
          // Pass isSpeakingPractice flag when in speaking lesson mode
          const isSpeakingPractice = !!currentSpeakingItem;
          sendAudioToBackend(base64Audio, expectedText, isSpeakingPractice);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log('Recording started (WEBM_OPUS)');
    } catch (err) {
      console.error("Start recording error:", err);
      setSpeechError("Failed to start recording: " + (err.message || err));
    }
  };

  const stopRecording = async () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        console.log('Recording stopped');
      }
    } catch (e) {
      console.error('Failed to stop recording:', e);
      setSpeechError('Failed to stop recording: ' + (e.message || e));
      setIsRecording(false);
    }
  };

  // Send recorded audio to Supabase Edge Function
  // expectedTextOverride: optional text to compare against (for Speaking Practice mode)
  // isSpeakingPractice: if true, play jingle sounds for feedback
  const sendAudioToBackend = async (audioBase64, expectedTextOverride = null, isSpeakingPractice = false) => {
    if (!audioBase64) return;

    setSpeechFeedback(null); // Reset feedback
    setIsCheckingAnswer(true); // Show loading state

    try {
      // Use override if provided, otherwise fall back to speakingExercises
      const expectedText = expectedTextOverride ?? speakingExercises[0]?.prompt_ar ?? "";

      const { data, error } = await supabase.functions.invoke(
        "speech-check",
        {
          body: {
            audioBase64: audioBase64,
            expectedText: expectedText
          }
        }
      );

      if (error) {
        console.error("Speech check error:", error);
        setSpeechError("Failed to send audio: " + error.message);
        setIsCheckingAnswer(false);
      } else {
        // Parse response if it's a string (Supabase sometimes returns stringified JSON)
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        console.log("Speech check response:", JSON.stringify(parsed, null, 2));

        // Compute feedback based on transcript
        const transcript = parsed?.transcript || "";

        console.log("Transcript from backend:", transcript);
        console.log("Expected text:", expectedText);


        const spoken = normalizeArabic(transcript);
        const expected = normalizeArabic(expectedText);

        const score = scoreSimilarity(spoken, expected);
        console.log("Similarity score:", score, "spoken:", spoken, "expected:", expected);

        let feedback;
        // If no expected text, show success for any transcription
        if (!expected) {
          feedback = transcript ? "Good ✅" : "Try again 🔁";
        } else if (score >= 0.55) feedback = "Good ✅";
        else if (score >= 0.3) feedback = "Almost 👍";
        else feedback = "Try again 🔁";

        setSpeechFeedback(feedback);
        setSpokenText(transcript); // Show what was transcribed
        setIsCheckingAnswer(false);

        // Play jingle sounds for speaking practice
        if (isSpeakingPractice) {
          if (feedback === "Good ✅") {
            playSpeakingCorrectSound();
          } else {
            playSpeakingIncorrectSound();
          }
        }

        // Update speakingItemCorrect for Speaking Practice mode
        if (feedback === "Good ✅") {
          setSpeakingItemCorrect(true);
        }
      }
    } catch (e) {
      console.error("Speech check exception:", e);
      setSpeechError("Failed to send audio: " + (e.message || e));
      setIsCheckingAnswer(false);
    }
  };


  // ---------- OPEN LESSON: QUESTIONS + VOCAB + EXPLANATIONS + BLOCKS ----------

  async function openLesson(lesson) {
    triggerHaptic();

    // Play lesson enter sound
    try {
      const enterSound = new Audio('/whoosh-velocity-383019.mp3');
      enterSound.volume = 0.3;
      enterSound.play();
    } catch (e) { /* sound not available */ }

    const endTransition = beginTransition(350);
    setTransitionDirection("forward");

    setActiveLesson(lesson);
    setLessonPhase("lesson");
    resetQuiz();
    resetAudio();

    setQuestions([]);
    setVocabItems([]);
    setExplanations([]);
    setGrammarNotes([]);
    setSpeakingExercises([]);
    setVocabIndex(0);
    setGrammarIndex(0);
    setExplanationIndex(0);

    // ✅ reset blocks each open
    setLessonBlocks([]);
    setLoadingBlocks(false);
    setCurrentAudioTime(0);
    setRevealedCount(0);
    setDialogueFinished(false);
    blockRefs.current = {};
    setClickedParagraphs(new Set());
    setHideInstruction(false);

    // Scroll to top when opening a lesson
    window.scrollTo(0, 0);

    setLoadingQuestions(true);

    try {
      // Check if lesson content is already cached
      const cached = lessonContentCache.current.get(lesson.id);

      if (cached) {
        console.log("Using cached content for lesson:", lesson.id);
        // Use cached content (instant!)
        setQuestions(cached.questions);
        setVocabItems(cached.vocab);
        setExplanations(cached.explanations);
        setGrammarNotes(cached.grammarNotes);
        setSpeakingExercises(cached.speakingExercises);

        if (lesson.lesson_format === "blocks") {
          setLessonBlocks(cached.blocks);
        }
      } else {
        console.log("Fetching content for lesson:", lesson.id);
        // Not cached - fetch from database
        // Load questions
        const { data: qData, error: qError } = await supabase
          .from("questions")
          .select("id, question_type, prompt_text, order")
          .eq("lesson_id", lesson.id)
          .order("order", { ascending: true });

        if (qError) throw qError;

        const questionsWithOptions = [];

        for (const q of qData || []) {
          if (q.question_type === "mcq") {
            const { data: options, error: optError } = await supabase
              .from("question_options")
              .select("*")
              .eq("question_id", q.id);

            if (optError) {
              console.error("Error loading options:", optError);
              questionsWithOptions.push({ ...q, options: [] });
            } else {
              questionsWithOptions.push({
                ...q,
                options: shuffleArray(options || []),
              });
            }
          } else {
            questionsWithOptions.push({ ...q, options: [] });
          }
        }

        setQuestions(questionsWithOptions);

        // Load vocab
        const { data: vocab, error: vocabErr } = await supabase
          .from("lesson_vocab")
          .select("*")
          .eq("lesson_id", lesson.id)
          .order("order", { ascending: true });

        if (vocabErr) {
          console.error("Error loading vocab:", vocabErr);
          setVocabItems([]);
        } else {
          setVocabItems(vocab || []);
        }

        // Load explanation sentences
        const { data: expl, error: explErr } = await supabase
          .from("lesson_explanations")
          .select("*")
          .eq("lesson_id", lesson.id)
          .order("order", { ascending: true });

        if (explErr) {
          console.error("Error loading explanations:", explErr);
          setExplanations([]);
        } else {
          setExplanations(expl || []);
        }

        // Load grammar notes (Grammar Spotlight)
        const { data: notes, error: notesErr } = await supabase
          .from("lesson_notes")
          .select("*")
          .eq("lesson_id", lesson.id)
          .order("order_index", { ascending: true });

        if (!notesErr) {
          setGrammarNotes(notes || []);
        } else {
          console.error("Error loading grammar notes:", notesErr);
          setGrammarNotes([]);
        }

        // Load speaking exercises
        const { data: speakingData, error: speakingError } = await supabase
          .from('lesson_speaking_exercises')
          .select('*')
          .eq('lesson_id', lesson.id)
          .order('order_index', { ascending: true });

        if (!speakingError) {
          setSpeakingExercises(speakingData || []);
          console.log('Speaking exercises:', speakingData);
        } else {
          console.error("Error loading speaking exercises:", speakingError);
          setSpeakingExercises([]);
        }

        // ✅ Load blocks (One query join!)
        if (lesson.lesson_format === "blocks") {
          setLoadingBlocks(true);
          // Instant placeholder to avoid blank screen
          setLessonBlocks([{ id: "loading", block_type: "loading" }]);

          const { data: blocks, error: blocksErr } = await supabase
            .from("lesson_blocks")
            .select(`
              id,
              lesson_id,
              block_type,
              order_index,
              text_ar,
              text_en,
              speaker_id,
              audio_url,
              start_time_seconds,
              end_time_seconds,
              speakers (
                id,
                display_name_ar,
                avatar_url,
                bubble_side
              )
            `)
            .eq("lesson_id", lesson.id)
            .order("order_index", { ascending: true });

          if (blocksErr) {
            console.error("Error loading lesson blocks:", blocksErr);
            setLessonBlocks([]);
          } else {
            setLessonBlocks(blocks || []);
          }

          setLoadingBlocks(false);
        }
      }
    } catch (err) {
      console.error("Error opening lesson:", err);
      setQuestions([]);
      setVocabItems([]);
      setExplanations([]);
      setLessonBlocks([]);
    } finally {
      setLoadingQuestions(false);
      endTransition(); // ✅ end overlay once data work is done
    }
  }

  function backToLessons() {
    const endTransition = beginTransition(200);
    setTransitionDirection("back");

    setActiveLesson(null);
    resetQuiz();
    resetAudio();
    resetLessonFlow();
    setQuestions([]);

    endTransition();
  }

  // ---------- SAVE LESSON PROGRESS ----------

  async function saveLessonProgress(heartsLeft) {
    if (!user || !activeLesson) return;

    const { error } = await supabase.from("lesson_progress").upsert(
      {
        user_id: user.id,
        lesson_id: activeLesson.id,
        hearts_left: heartsLeft,
        completed_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,lesson_id",
      }
    );

    if (error) {
      console.error("Error saving progress:", error);
    } else {
      setLessonProgress((prev) => {
        const existingIndex = prev.findIndex(
          (p) => p.lesson_id === activeLesson.id
        );
        const newEntry = { lesson_id: activeLesson.id, hearts_left: heartsLeft };

        if (existingIndex === -1) return [...prev, newEntry];
        const copy = [...prev];
        copy[existingIndex] = newEntry;
        return copy;
      });
    }
  }

  // ---------- AUDIO CONTROL ----------

  function handleStartLessonAudio() {
    if (!activeLesson?.audio_url || !audioRef.current) return;

    // Reset dialogue UI immediately
    if (activeLesson.lesson_format === "blocks") {
      setDialogueFinished(false);
      setRevealedCount(1); // show first line instantly
      setAutoFollow(true);
      setShowJumpToCurrent(false);
    }

    // Instant playback - no delays
    audioRef.current.currentTime = 0;
    audioRef.current.play()
      .then(() => {
        setAudioPlaying(true);
        setAudioCompleted(false);
      })
      .catch((err) => {
        console.error("Audio play failed:", err);
      });
  }

  // Paragraph tap-to-play handler
  function handleParagraphClick(block) {
    if (!activeLesson?.audio_url || !audioRef.current) return;
    if (block.start_time_seconds == null) return;

    // If clicking the same block that's currently playing, toggle speed
    if (playingParagraphId === block.id && audioPlaying) {
      const newSpeed = isSlowSpeed ? 1.0 : 0.85;
      audioRef.current.playbackRate = newSpeed;
      setIsSlowSpeed(!isSlowSpeed);
      return;
    }

    const startTime = block.start_time_seconds || 0;
    const endTime = block.end_time_seconds || audioRef.current.duration;

    setPlayingParagraphId(block.id);
    setPlayingParagraphEnd(endTime);
    setIsSlowSpeed(false); // Reset to normal speed for new playback

    audioRef.current.playbackRate = 1.0; // Reset speed
    audioRef.current.currentTime = startTime;
    audioRef.current.play()
      .then(() => {
        setAudioPlaying(true);
      })
      .catch((err) => {
        console.error("Paragraph audio play failed:", err);
      });
  }

  // ---------- QUIZ CONTROL ----------

  function startQuiz() {
    if (questions.length === 0) return;
    setQuizActive(true);
    setQuizFinished(false);
    setCurrentQuestionIndex(0);
    setHearts(5);
    setSelectedOptionId(null);
    setAnswerResult(null);
    setHasAnswered(false);
  }

  function handleOptionClick(option) {
    if (!quizActive) return;
    if (quizFinished) return;
    if (hasAnswered) return;

    setSelectedOptionId(option.id);
    setAnswerResult(null);
  }

  function handleConfirmAnswer() {
    if (!quizActive) return;
    if (quizFinished) return;
    if (selectedOptionId === null) return;

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion || !currentQuestion.options) return;

    const chosen = currentQuestion.options.find(
      (opt) => opt.id === selectedOptionId
    );
    if (!chosen) return;

    if (chosen.is_correct) {
      setAnswerResult("correct");
      playCorrectSound();
    } else {
      setAnswerResult("wrong");
      playWrongSound();
      setHearts((prev) => {
        const newHearts = prev - 1;
        if (newHearts <= 0) setQuizFinished(true);
        return newHearts;
      });
    }

    setHasAnswered(true);
  }

  async function goToNextQuestion() {
    const lastQuestion = currentQuestionIndex === questions.length - 1;

    if (lastQuestion || hearts <= 0) {
      setQuizFinished(true);
      if (lastQuestion && hearts > 0) {
        await saveLessonProgress(hearts);
        playCelebrationSound();
      }
      return;
    }

    setCurrentQuestionIndex((i) => i + 1);
    setSelectedOptionId(null);
    setAnswerResult(null);
    setHasAnswered(false);
  }

  function HeartsBar() {
    // Single heart that degrades as lives are lost (5 lives total)
    // hearts: 5 = full, 4 = small crack, 3 = cracked, 2 = breaking, 1 = almost broken, 0 = broken
    const getHeartState = () => {
      if (hearts >= 5) return { emoji: "❤️", className: "heart-full" };
      if (hearts === 4) return { emoji: "💔", className: "heart-cracked-1" };
      if (hearts === 3) return { emoji: "💔", className: "heart-cracked-2" };
      if (hearts === 2) return { emoji: "💔", className: "heart-cracked-3" };
      if (hearts === 1) return { emoji: "💔", className: "heart-cracked-4" };
      return { emoji: "🖤", className: "heart-broken" };
    };

    const heartState = getHeartState();

    return (
      <div className="heart-indicator">
        <span className={`heart-single ${heartState.className}`}>
          {heartState.emoji}
        </span>
        <span className="heart-count">{toArabicNum(hearts)}</span>
      </div>
    );
  }

  function ProfileMenu() {
    return (
      <div className="profile-menu-container">
        <button
          className="profile-icon-btn"
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          aria-label="Profile menu"
        >
          <span className="profile-icon">👤</span>
        </button>

        {showProfileMenu && (
          <>
            <div
              className="profile-menu-backdrop"
              onClick={() => setShowProfileMenu(false)}
            />
            <div className="profile-menu-dropdown">
              <button
                className="profile-menu-item"
                onClick={() => {
                  setShowProfileMenu(false);
                  setShowSignOutConfirm(true);
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}

        {showSignOutConfirm && (
          <div className="modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Sign out?</h3>
              <p style={{ color: "var(--text-light)", marginBottom: "1.5rem" }}>
                Are you sure you want to sign out?
              </p>
              <div className="modal-actions">
                <button
                  className="btn-outline"
                  onClick={() => setShowSignOutConfirm(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setShowSignOutConfirm(false);
                    handleSignOut();
                  }}
                  style={{ flex: 1, background: "var(--red)", boxShadow: "0 4px 0 var(--red-dark)" }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- SPLASH SCREEN ----------

  if (showSplash) {
    return (
      <AnimatePresence mode="wait">
        <SplashScreen key="splash" onComplete={() => setShowSplash(false)} />
      </AnimatePresence>
    );
  }

  // ---------- LOGIN LANDING SCREEN ----------

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-overlay" />
        <div className="auth-content">
          <div className="auth-left">
            <div className="auth-logo animate-slide-up">
              <img
                src="/clemency-icon.png"
                alt="Ihya Institute Logo"
                style={{ width: "120px", height: "auto" }}
              />
            </div>
            <h1 className="text-display animate-slide-up delay-100">
              Welcome to the Iyha Arabic App!
            </h1>

            {/* Auth Card - Moved here between title and description */}
            <div className="auth-card-inline animate-slide-up delay-150">
              <h2>{authMode === "signin" ? "Welcome back" : "Create account"}</h2>
              <p className="auth-subtitle">
                {authMode === "signin"
                  ? "Sign in to continue your Arabic journey."
                  : "Sign up to start learning Arabic."}
              </p>

              <form
                onSubmit={authMode === "signin" ? handleSignIn : handleSignUp}
                className="auth-form"
              >
                <label className="auth-label">
                  Email
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                    className="auth-input"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="auth-label">
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    className="auth-input"
                    placeholder="••••••••"
                  />
                </label>

                {authError && <div className="auth-error">{authError}</div>}

                <button type="submit" className="auth-primary-btn">
                  {authMode === "signin" ? "Sign in" : "Sign up"}
                </button>
              </form>

              <button
                type="button"
                className="auth-secondary-link"
                onClick={() =>
                  setAuthMode(authMode === "signin" ? "signup" : "signin")
                }
              >
                {authMode === "signin"
                  ? "Need an account? Create one"
                  : "Already have an account? Sign in"}
              </button>
            </div>

            <p
              className="animate-slide-up delay-200"
              style={{
                fontSize: "1.2rem",
                lineHeight: "1.6",
                maxWidth: "500px",
                marginTop: "1.5rem",
              }}
            >
              Designed by students for students, to aid your journey towards
              mastering Arabic.
            </p>
            <div className="auth-badge-row animate-slide-up delay-300">
              <span className="auth-badge">Using العربية للناشئين books</span>
              <span className="auth-badge">
                Dialogue based to aid listening skills
              </span>
              <span className="auth-badge">Progress saved with quizzes</span>
            </div>
          </div>


        </div>
      </div>
    );
  }

  // ---------- PRACTICE SELECTION SCREEN ----------

  if (user && practiceMode === null && !activeLesson && !activeSpeakingLesson) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-content">
            <div className="app-logo">
              <img src="/clemency-icon.png" alt="Ihya Institute Logo" style={{ height: "50px" }} />
            </div>
            <div className="app-header-right">
              <ProfileMenu />
            </div>
          </div>
        </header>

        <main className="app-main">
          <div className="page-layout">
            <section className="page-card" style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0, textAlign: "center" }}>
              <h1 className="page-title" style={{ marginBottom: "1.5rem", fontSize: "1.3rem", color: "var(--text-light)", fontWeight: 600 }}>Choose Your Practice</h1>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "400px", margin: "0 auto" }}>
                <button
                  className="practice-mode-card"
                  onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setPracticeMode("book"); }}
                >
                  <div className="practice-mode-icon">📚</div>
                  <div className="practice-mode-info">
                    <div className="practice-mode-title">Book Lessons</div>
                    <div className="practice-mode-desc">Learn with dialogues, vocab & quizzes</div>
                  </div>
                </button>

                <button
                  className="practice-mode-card"
                  onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setPracticeMode("speaking"); loadSpeakingModes(); }}
                >
                  <div className="practice-mode-icon">🎤</div>
                  <div className="practice-mode-info">
                    <div className="practice-mode-title">Speaking Practice</div>
                    <div className="practice-mode-desc">Practice pronunciation & speaking</div>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </main>

        {/* Global Transition Overlay */}
        {transitioning && (
          <div className="transition-overlay">
            <div className="transition-card">
              <Leapfrog size="40" speed="2.5" color="#8b5cf6" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- SPEAKING LESSON RUNNER SCREEN ----------

  if (activeSpeakingLesson && speakingLessonItems.length > 0) {
    const currentItem = speakingLessonItems[currentSpeakingItemIndex];
    const isLastItem = currentSpeakingItemIndex === speakingLessonItems.length - 1;
    const progressPercent = ((currentSpeakingItemIndex) / speakingLessonItems.length) * 100;

    // Speaking Lesson Complete Screen
    if (speakingLessonComplete) {
      return (
        <div className="celebration-fullpage">
          <audio autoPlay>
            <source src="/Quiz pass123.mp3" type="audio/mpeg" />
          </audio>

          <div className="celebration-lottie">
            <DotLottieReact
              src="/animations/done.lottie"
              loop
              autoplay
              style={{ width: '260px', height: '260px' }}
            />
          </div>

          <h1 className="celebration-title-grand">Speaking Complete!</h1>
          <p className="celebration-subtitle-grand">
            Great job practicing your pronunciation
          </p>

          <div className="celebration-stats">
            <div className="stat-item">
              <span className="stat-value">{toArabicNum(speakingLessonItems.length)}</span>
              <span className="stat-label">Phrases Practiced</span>
            </div>
          </div>

          <button className="btn-celebration" onClick={() => { triggerHaptic(); backToSpeakingLessons(); }}>
            Continue →
          </button>
        </div>
      );
    }

    return (
      <div className={`app-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
        <main className="app-main quiz-screen" style={{ marginTop: 0 }}>
          <div className="quiz-content">
            <div className="quiz-header-row">
              <span
                style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                onClick={() => backToSpeakingLessons()}
              >
                <MdArrowBackIosNew />
              </span>
              <div className="lesson-title-badge">{activeSpeakingLesson.title || "Speaking Practice"}</div>
            </div>

            <div className="quiz-progress-bar">
              <div
                className="quiz-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Speaking Item Card */}
            <div className="quiz-question-container swipe-in">
              {/* Mode-based prompt: Translate mode shows English, Repeat mode shows Arabic */}
              {currentSpeakingModeType === 'speaking_translate' ? (
                <>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                    Translate to Arabic:
                  </p>
                  <h2 className="quiz-question" style={{ fontSize: '1.6rem', lineHeight: 1.6 }}>
                    {currentItem.english_text}
                  </h2>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                    Speak this phrase:
                  </p>
                  <h2 className="quiz-question" dir="rtl" style={{ fontSize: '1.8rem', lineHeight: 1.8 }}>
                    {currentItem.arabic_text}
                  </h2>
                </>
              )}

              {/* Recording Button with Lottie */}
              <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {isCheckingAnswer ? (
                  <>
                    {/* Sleek checking answer loading state */}
                    <div className="checking-answer-container">
                      <div className="checking-answer-pulse"></div>
                      <div className="checking-answer-icon">🎧</div>
                    </div>
                    <p className="checking-answer-text">
                      Checking your answer<span className="checking-dots"></span>
                    </p>
                  </>
                ) : isRecording ? (
                  <>
                    <div
                      onClick={() => stopRecording()}
                      style={{ cursor: 'pointer' }}
                    >
                      <DotLottieReact
                        src="/animations/Audio wave micro interaction.json"
                        loop
                        autoplay
                        style={{ width: '120px', height: '120px' }}
                      />
                    </div>
                    <p style={{ marginTop: '0.5rem', color: 'var(--red)', fontWeight: 600, fontSize: '0.9rem' }}>
                      Tap to stop
                    </p>
                  </>
                ) : (
                  <button
                    className="btn-record"
                    onClick={() => {
                      setSpeechFeedback(null);
                      setSpeakingItemCorrect(false);
                      startRecording();
                    }}
                  >
                    🎤 Record
                  </button>
                )}
              </div>

              {speechError && (
                <p style={{ color: 'red', marginTop: '1rem', textAlign: 'center' }}>
                  {speechError}
                </p>
              )}

              {/* Feedback */}
              {speechFeedback && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '16px 24px',
                  borderRadius: 12,
                  textAlign: 'center',
                  background: speechFeedback.includes('Good') ? 'rgba(34, 197, 94, 0.15)'
                    : speechFeedback.includes('Almost') ? 'rgba(251, 191, 36, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                  border: `2px solid ${speechFeedback.includes('Good') ? '#22c55e'
                    : speechFeedback.includes('Almost') ? '#fbbf24'
                      : '#ef4444'
                    }`
                }}>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: speechFeedback.includes('Good') ? '#22c55e'
                      : speechFeedback.includes('Almost') ? '#fbbf24'
                        : '#ef4444'
                  }}>
                    {speechFeedback}
                  </div>

                  {/* Mode 2 (translate): Show "You said" and "Expected" format */}
                  {currentSpeakingModeType === 'speaking_translate' ? (
                    <div style={{ marginTop: 16, textAlign: 'left' }}>
                      {spokenText && (
                        <div style={{
                          marginBottom: 12,
                          padding: '10px 14px',
                          borderRadius: 10,
                          background: 'rgba(0,0,0,0.03)'
                        }}>
                          <span style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-light)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            display: 'block',
                            marginBottom: '4px'
                          }}>
                            You said:
                          </span>
                          <div dir="rtl" style={{
                            fontSize: '1.2rem',
                            color: 'var(--text-primary)',
                            lineHeight: 1.5
                          }}>
                            {spokenText}
                          </div>
                        </div>
                      )}
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(139, 92, 246, 0.08)',
                        border: '1px solid rgba(139, 92, 246, 0.2)'
                      }}>
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-light)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          display: 'block',
                          marginBottom: '4px'
                        }}>
                          Expected:
                        </span>
                        <div dir="rtl" style={{
                          fontSize: '1.2rem',
                          fontWeight: 600,
                          color: 'var(--purple)',
                          lineHeight: 1.5
                        }}>
                          {currentItem.arabic_text}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Mode 1 (repeat): Original "You said" format */
                    spokenText && (
                      <div dir="rtl" style={{
                        marginTop: 12,
                        fontSize: '1.1rem',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic'
                      }}>
                        You said: "{spokenText}"
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Continue Button - only after correct */}
              <div className="quiz-actions" style={{ marginTop: '2rem' }}>
                <button
                  className="btn-primary"
                  disabled={!speakingItemCorrect}
                  style={{ opacity: speakingItemCorrect ? 1 : 0.5 }}
                  onClick={() => {
                    triggerHaptic();
                    if (isLastItem) {
                      setSpeakingLessonComplete(true);
                      playCelebrationSound();
                      // Save speaking lesson progress
                      saveSpeakingLessonProgress(activeSpeakingLesson.id);
                    } else {
                      setCurrentSpeakingItemIndex(i => i + 1);
                      setSpeakingItemCorrect(false);
                      setSpeechFeedback(null);
                      setSpokenText("");
                    }
                  }}
                >
                  {isLastItem ? "Finish" : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------- SPEAKING LESSON LOADING SCREEN ----------
  // Show loading when a speaking lesson is selected but items haven't loaded yet
  if (activeSpeakingLesson && speakingLessonItems.length === 0) {
    return (
      <div className="app-shell">
        <main className="app-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center' }}>
            <Leapfrog size="50" speed="2.5" color="#8b5cf6" />
            <p style={{ marginTop: '1rem', color: 'var(--text-light)' }}>Loading lesson...</p>
          </div>
        </main>
      </div>
    );
  }

  // ---------- SPEAKING MODES & LESSONS SCREEN ----------

  if (practiceMode === "speaking" && !activeSpeakingLesson) {
    return (
      <div className={`app-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
        <main className="app-main" style={{ marginTop: 0, paddingTop: '1rem' }}>
          <div className="page-layout">
            <section className="page-card" style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <button
                  className="btn-back-text"
                  onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); setSelectedSpeakingMode(null); setSpeakingLessons([]); }}
                >
                  <MdArrowBackIosNew />
                </button>
                <h1 className="page-title" style={{ fontSize: "1.5rem", fontFamily: "'Amiri', serif", direction: "rtl", margin: 0 }}>
                  🎤 تمارين النطق
                </h1>
              </div>


              {loadingSpeakingModes ? (
                <p className="muted">Loading…</p>
              ) : speakingModes.length === 0 ? (
                <p className="muted">No speaking modes found.</p>
              ) : (
                <div className="stage-list">
                  {speakingModes.map((mode) => {
                    const isSelected = selectedSpeakingMode === mode.id;

                    return (
                      <div key={mode.id} style={{ marginBottom: "1rem" }}>
                        <button
                          onClick={() => { triggerHaptic(); loadSpeakingLessons(mode.id); }}
                          className="stage-card"
                          style={{
                            width: "100%",
                            marginBottom: 0,
                            borderColor: isSelected ? "var(--blue)" : "var(--gray-200)",
                            background: "var(--white)",
                          }}
                        >
                          <div className="stage-card-top">
                            <div>
                              <div className="stage-name">{mode.name || "Mode"}</div>
                              <div className="stage-description">{mode.description}</div>
                            </div>
                          </div>
                        </button>

                        {isSelected && (
                          <div className="lesson-container-inline">
                            {loadingSpeakingLessons ? (
                              <p className="muted" style={{ textAlign: "center" }}>
                                Loading lessons…
                              </p>
                            ) : speakingLessons.length === 0 ? (
                              <p className="muted" style={{ textAlign: "center" }}>
                                No lessons found.
                              </p>
                            ) : (
                              <ul className="lesson-list">
                                {speakingLessons.map((lesson) => {
                                  const completed = isSpeakingLessonCompleted(lesson.id);
                                  return (
                                    <li key={lesson.id}>
                                      <button
                                        onClick={() => openSpeakingLesson(lesson)}
                                        className="lesson-row"
                                      >
                                        <div className={`lesson-progress-donut ${completed ? "completed" : ""}`} />
                                        <div className="lesson-row-content">
                                          <div className="lesson-row-title">{lesson.title}</div>
                                          <div className="lesson-row-desc">{lesson.prompt_text}</div>
                                        </div>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </main>

        {/* Global Transition Overlay */}
        {transitioning && (
          <div className="transition-overlay">
            <div className="transition-card">
              <Leapfrog size="40" speed="2.5" color="#8b5cf6" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- QUIZ SCREEN ----------

  if (activeLesson && quizActive) {
    const currentQuestion = questions[currentQuestionIndex];

    // FULL PAGE CELEBRATION - Early return when quiz passed
    if (quizFinished && hearts > 0) {
      return (
        <div className="celebration-fullpage">
          {/* Quiz Pass Sound */}
          <audio autoPlay>
            <source src="/Quiz pass123.mp3" type="audio/mpeg" />
          </audio>

          <div className="celebration-lottie">
            <DotLottieReact
              src="/animations/done.lottie"
              loop
              autoplay
              style={{ width: '260px', height: '260px' }}
            />
          </div>

          <h1 className="celebration-title-grand">Well Done!</h1>
          <p className="celebration-subtitle-grand">
            You've mastered this lesson
          </p>

          <div className="celebration-stats">
            <div className="stat-item">
              <span className="stat-value">{toArabicNum(hearts)}</span>
              <span className="stat-label">Hearts Left</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">١٠٠%</span>
              <span className="stat-label">Complete</span>
            </div>
          </div>

          <button className="btn-celebration" onClick={() => { triggerHaptic(); backToLessons(); }}>
            Continue Learning →
          </button>
        </div>
      );
    }

    return (
      <div className={`app-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
        <main className="app-main quiz-screen" style={{ marginTop: 0 }}>
          <div className="quiz-content">
            <div className="quiz-header-row">
              <span
                style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                onClick={() => setShowQuitQuizConfirm(true)}
              >
                ✕
              </span>
              <HeartsBar />
            </div>

            {/* Quit Quiz Confirmation Modal */}
            {showQuitQuizConfirm && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h3 className="modal-title">Leave Quiz?</h3>
                  <p className="text-muted">Are you sure you want to return to the home page? All progress will be lost.</p>
                  <div className="modal-actions">
                    <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowQuitQuizConfirm(false)}>
                      Stay
                    </button>
                    <button
                      className="btn-primary"
                      style={{ flex: 1, backgroundColor: "var(--red)", boxShadow: "0 4px 0 var(--red-dark)" }}
                      onClick={() => {
                        setShowQuitQuizConfirm(false);
                        backToLessons();
                      }}
                    >
                      Leave
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="quiz-progress-bar">
              <div
                className="quiz-progress-fill"
                style={{
                  width: `${(currentQuestionIndex / Math.max(questions.length, 1)) * 100}%`,
                }}
              />
            </div>

            {/* QUIZ QUESTIONS */}
            {!quizFinished && currentQuestion && (
              <div key={currentQuestion.id} className="quiz-question-container swipe-in">
                <h2 className="quiz-question">{currentQuestion.prompt_text}</h2>

                <div className={`quiz-options ${currentQuestion.options.length === 3 ? 'quiz-options-three' : ''}`}>
                  {currentQuestion.options.map((opt) => {
                    const isSelected = selectedOptionId === opt.id;
                    const isCorrect = opt.is_correct;

                    let stateClass = "";

                    if (!hasAnswered) {
                      if (isSelected) stateClass = "option-pending";
                    } else {
                      if (isSelected && isCorrect) stateClass = "option-correct";
                      else if (isSelected && !isCorrect)
                        stateClass = "option-wrong";
                      else if (isCorrect) stateClass = "option-reveal-correct";
                    }

                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleOptionClick(opt)}
                        className={`option-button ${stateClass}`}
                        style={{ direction: "rtl" }}
                        disabled={quizFinished}
                      >
                        {opt.text}
                      </button>
                    );
                  })}
                </div>

                <div className="quiz-feedback">
                  {answerResult === "correct" && "✅ Correct!"}
                  {answerResult === "wrong" && "❌ Not quite."}
                </div>

                {selectedOptionId !== null && !quizFinished && (
                  <div className="quiz-actions">
                    {!hasAnswered && (
                      <button className="btn-primary" onClick={handleConfirmAnswer}>
                        Confirm
                      </button>
                    )}

                    {hasAnswered && (
                      <button className="btn-primary" onClick={goToNextQuestion}>
                        {currentQuestionIndex === questions.length - 1
                          ? "Finish"
                          : "Next"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* FAILURE SCREEN - Full page sad design */}
            {quizFinished && hearts <= 0 && (
              <div className="failure-fullpage swipe-in">
                {/* Broken Heart SVG Icon */}
                <div className="failure-icon-container">
                  <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="60" cy="60" r="55" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                    <path d="M60 90C60 90 30 70 30 50C30 40 38 32 48 32C54 32 58 36 60 40C62 36 66 32 72 32C82 32 90 40 90 50C90 70 60 90 60 90Z" fill="#475569" />
                    <path d="M55 45L65 55L55 65L60 75L65 65L60 55L70 45" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>

                <h1 className="failure-title">Out of Hearts</h1>
                <p className="failure-subtitle">
                  Don't give up! Review the lesson and try again.
                </p>

                <div className="failure-buttons">
                  <button
                    className="btn-failure-retry"
                    onClick={() => { triggerHaptic(); startQuiz(); }}
                  >
                    Try Again
                  </button>
                  <button
                    className="btn-failure-home"
                    onClick={() => { triggerHaptic(); backToLessons(); }}
                  >
                    Return Home
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ---------- LESSON SCREEN (3+ PHASES) ----------

  if (activeLesson && !quizActive) {
    const completed = isLessonCompleted(activeLesson.id);

    return (
      <div className={`app-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
        <main className="app-main" style={{ marginTop: 0 }}>
          {lessonPhase === "lesson" && (
            <div className="lesson-content">
              {activeLesson.audio_url && (
                <audio
                  ref={audioRef}
                  src={activeLesson.audio_url}
                  onTimeUpdate={(e) => {
                    // Handle paragraph playback - pause at end_time_seconds
                    if (playingParagraphId && playingParagraphEnd != null) {
                      if (e.target.currentTime >= playingParagraphEnd) {
                        e.target.pause();
                        setAudioPlaying(false);
                        setPlayingParagraphId(null);
                        setPlayingParagraphEnd(null);
                        return;
                      }
                    }
                    // redundant now with RAF polling, but kept for non-blocks if needed
                    if (
                      activeLesson.lesson_format !== "blocks" &&
                      e.target.duration > 0
                    ) {
                      setAudioProgress(
                        (e.target.currentTime / e.target.duration) * 100
                      );
                    }
                  }}
                  onEnded={() => {
                    setDialogueFinished(true);
                    setAudioPlaying(false);
                    setAudioCompleted(true);
                    setPlayingParagraphId(null);
                    setPlayingParagraphEnd(null);
                  }}
                  style={{ display: "none" }}
                />
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                {audioPlaying ? <div className="recording-dot" title="Audio playing" /> : <div />}
                <div className="header-bubbly-title">{activeLesson.title}</div>
              </div>

              <p className="lesson-description">{activeLesson.description}</p>

              {activeLesson.audio_url && (
                (() => {
                  // Check if this lesson has paragraph or dialogue blocks
                  const hasParagraphs = lessonBlocks.some(b => b.block_type === "paragraph");
                  const hasDialogue = lessonBlocks.some(b => b.block_type === "dialogue");

                  // Hide master audio button for paragraph-based lessons (they use tap-to-play)
                  if (hasParagraphs) return null;

                  // Hide audio button for legacy lessons (non-blocks format) - only show for dialogue lessons
                  if (activeLesson.lesson_format !== "blocks" || !hasDialogue) return null;

                  return (
                    <div
                      style={{
                        marginBottom: "1rem",
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      {!audioPlaying && (
                        <button
                          className="btn-primary"
                          onClick={handleStartLessonAudio}
                          style={{ maxWidth: "300px" }}
                        >
                          {audioCompleted ? "Replay audio" : "Start lesson audio"}
                        </button>
                      )}
                    </div>
                  );
                })()
              )}

              <section className="section">
                {activeLesson.lesson_format === "blocks" ? (
                  loadingBlocks ? (
                    <p className="muted">Loading dialogue…</p>
                  ) : (
                    (() => {
                      const paragraphBlocks = lessonBlocks
                        .filter((b) => b.block_type === "paragraph")
                        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

                      const dialogueBlocks = lessonBlocks
                        .filter((b) => b.block_type === "dialogue")
                        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

                      const hasParagraphs = paragraphBlocks.length > 0;

                      // PARAGRAPH MODE: Interactive story reader
                      if (hasParagraphs) {
                        const lastParagraphId = paragraphBlocks[paragraphBlocks.length - 1]?.id;
                        const hasClickedLast = clickedParagraphs.has(lastParagraphId);

                        return (
                          <div className="paragraph-reader">
                            {/* Instruction Box - fades after first click */}
                            {!hideInstruction && (
                              <div className="instruction-box">
                                <div>Tap any paragraph to hear it read aloud</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.25rem' }}>Tap again to slow down or speed up!</div>
                              </div>
                            )}

                            {/* Render paragraph blocks */}
                            <div className="paragraph-list">
                              {paragraphBlocks.map((b) => {
                                const isPlaying = playingParagraphId === b.id;
                                const wasClicked = clickedParagraphs.has(b.id);
                                const isThisBlockSlow = isPlaying && isSlowSpeed;
                                return (
                                  <div
                                    key={b.id}
                                    className={`paragraph-bubble ${isPlaying ? "paragraph-active" : ""} ${wasClicked ? "paragraph-clicked" : ""}`}
                                    onClick={() => {
                                      // Hide instruction on first click
                                      if (!hideInstruction) {
                                        setHideInstruction(true);
                                      }
                                      // Track this paragraph as clicked
                                      setClickedParagraphs(prev => new Set([...prev, b.id]));
                                      handleParagraphClick(b);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        if (!hideInstruction) {
                                          setHideInstruction(true);
                                        }
                                        setClickedParagraphs(prev => new Set([...prev, b.id]));
                                        handleParagraphClick(b);
                                      }
                                    }}
                                  >
                                    {/* Audio indicator on the left */}
                                    <div className="paragraph-audio-indicator">
                                      {isPlaying ? (
                                        <span className="audio-playing-icon">
                                          {isThisBlockSlow ? "🐢" : "🔊"}
                                        </span>
                                      ) : (
                                        <span className="audio-play-icon">▶</span>
                                      )}
                                    </div>
                                    <div className="paragraph-content">
                                      <div className="paragraph-text" dir="rtl">
                                        {b.text_ar}
                                      </div>
                                      {b.text_en && (
                                        <div className="paragraph-translation">
                                          {b.text_en}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Proceed button - enabled after last paragraph clicked */}
                            <div style={{ marginTop: "1.5rem" }}>
                              <button
                                className={`btn-primary ${!hasClickedLast ? "btn-disabled" : ""}`}
                                onClick={() => { triggerHaptic(); setLessonPhase(grammarNotes.length > 0 ? "intro_grammar" : "intro_vocab"); }}
                                disabled={!hasClickedLast}
                              >
                                Proceed →
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // DIALOGUE MODE: Chat bubbles with avatars
                      const visibleDialogue = dialogueBlocks.slice(0, revealedCount);
                      const visibleLines = (audioPlaying && !dialogueFinished)
                        ? visibleDialogue.slice(-1)
                        : visibleDialogue;

                      return (
                        <div
                          ref={convoScrollRef}
                          className={`convo-area ${!dialogueFinished && audioPlaying ? "playback-mode" : "list-mode"}`}
                        >
                          {visibleLines.map((b) => {
                            const speaker = b.speakers;
                            const sideClass =
                              speaker?.bubble_side === "right"
                                ? "bubble-right"
                                : "bubble-left";

                            return (
                              <div
                                key={b.id}
                                className={`bubble-row ${sideClass}`}
                              >
                                <div className="avatar">
                                  {speaker?.avatar_url ? (
                                    <img
                                      src={speaker.avatar_url}
                                      alt={speaker?.display_name_ar || "Speaker"}
                                      className="avatar-img"
                                    />
                                  ) : (
                                    <span className="avatar-fallback">
                                      {speaker?.display_name_ar?.[0] || "؟"}
                                    </span>
                                  )}
                                </div>

                                <div className="bubble">
                                  <div className="bubble-text" dir="rtl">
                                    {b.text_ar}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  )
                ) : (
                  <div className="arabic-box">
                    {activeLesson.transcript_ar || "لا يوجد نص عربي بعد"}
                  </div>
                )}
              </section>



              {
                activeLesson.notes && (
                  <section className="section">
                    <h3 className="section-subtitle">Notes</h3>
                    <p className="notes-text">{activeLesson.notes}</p>
                  </section>
                )
              }

              <div style={{ marginTop: "0.5rem", paddingBottom: "2rem", minHeight: "60px" }}>
                {(() => {
                  // Check if this is a paragraph-based lesson (they have their own proceed button)
                  const hasParagraphs = lessonBlocks.some(b => b.block_type === "paragraph");

                  // Don't show this bottom proceed button for paragraph lessons
                  if (hasParagraphs) return null;

                  if (!activeLesson.audio_url || audioCompleted) {
                    return (
                      <button
                        className="btn-primary"
                        onClick={() => { triggerHaptic(); setLessonPhase(grammarNotes.length > 0 ? "intro_grammar" : "intro_vocab"); }}
                      >
                        Proceed →
                      </button>
                    );
                  }

                  // Show audio progress bar if audio is playing
                  if (activeLesson.audio_url && !audioCompleted) {
                    return (
                      <div className="audio-progress-fixed">
                        <div
                          className="audio-progress-fill-fixed"
                          style={{ width: `${audioProgress}%` }}
                        />
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            </div >
          )
          }

          {/* PHASE: TRANSITION TO GRAMMAR */}
          {lessonPhase === "intro_grammar" && (
            <div className="no-scroll-container transition-screen swipe-in" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: '70vw', maxWidth: '280px', aspectRatio: '1', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', marginBottom: '1.5rem' }}>
                <img src="/images/explanation-icon.jpg" alt="Story" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>Story Explanation</h1>
              <p className="page-subtitle">Let's have a look at the story content in more detail!</p>
              <footer className="sticky-footer">
                <button className="btn-primary" onClick={() => { triggerHaptic(); setLessonPhase("grammar"); }}>
                  Continue
                </button>
              </footer>
            </div>
          )}

          {/* PHASE: GRAMMAR SPOTLIGHT CAROUSEL (No Scrolling) */}
          {lessonPhase === "grammar" && grammarNotes.length > 0 && (
            <div className="vocab-fullscreen no-scroll-container swipe-in">
              <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                <span
                  style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                  onClick={() => setLessonPhase("lesson")}
                >
                  <MdArrowBackIosNew />
                </span>
                <h2 className="grammar-title-text" style={{ margin: 0, fontSize: '1.25rem' }}>{grammarNotes[grammarIndex].title}</h2>
              </header>

              <div key={grammarIndex} className="carousel-content-area swipe-in">
                <div className="explanation-bubble" style={{ fontSize: '1.1rem', padding: '1.25rem', lineHeight: '1.7' }}>
                  {grammarNotes[grammarIndex].content_en}
                </div>

                <div className="arabic-box spotlight-arabic" style={{ borderLeft: '5px solid var(--blue)', padding: '1.5rem' }}>
                  {grammarNotes[grammarIndex].content_ar}
                </div>
              </div>

              <footer className="sticky-footer">
                <div style={{ display: 'flex', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                  <button
                    className="btn-nav-arrow"
                    onClick={() => grammarIndex > 0 && setGrammarIndex(i => i - 1)}
                    disabled={grammarIndex === 0}
                    style={{ opacity: grammarIndex === 0 ? 0.3 : 1 }}
                  >
                    <MdArrowBackIosNew />
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      triggerHaptic();
                      if (grammarIndex === grammarNotes.length - 1) {
                        setLessonPhase("intro_vocab");
                      } else {
                        setGrammarIndex(i => i + 1);
                      }
                    }}
                  >
                    CONTINUE
                  </button>
                  <button
                    className="btn-nav-arrow"
                    onClick={() => grammarIndex < grammarNotes.length - 1 && setGrammarIndex(i => i + 1)}
                    disabled={grammarIndex === grammarNotes.length - 1}
                    style={{ opacity: grammarIndex === grammarNotes.length - 1 ? 0.3 : 1 }}
                  >
                    →
                  </button>
                </div>
              </footer>
            </div>
          )}

          {/* PHASE: TRANSITION TO VOCAB */}
          {lessonPhase === "intro_vocab" && (
            <div className="no-scroll-container transition-screen swipe-in" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: '70vw', maxWidth: '280px', aspectRatio: '1', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', marginBottom: '1.5rem' }}>
                <img src="/images/vocab-book.jpg" alt="Vocabulary" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>New Words</h1>
              <p className="page-subtitle">Let's take a look at the new words we have learnt!</p>
              <footer className="sticky-footer">
                <button className="btn-primary" onClick={() => { triggerHaptic(); setLessonPhase("vocab"); }}>
                  Continue
                </button>
              </footer>
            </div>
          )}

          {/* PHASE 2: VOCAB CAROUSEL */}
          {lessonPhase === "vocab" && (
            <div className="vocab-fullscreen no-scroll-container swipe-in">
              {/* Header with back arrow and lesson title */}
              <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                <span
                  style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                  onClick={() => setLessonPhase("lesson")}
                >
                  <MdArrowBackIosNew />
                </span>
                <div className="lesson-title-badge">{activeLesson.title}</div>
              </header>

              {vocabItems.length === 0 ? (
                <div className="center-content">
                  <p className="muted">No vocabulary added yet for this lesson.</p>
                  <button
                    className="btn-primary"
                    onClick={() => setLessonPhase("intro_drills")}
                  >
                    Continue
                  </button>
                </div>
              ) : (
                (() => {
                  const item = vocabItems[vocabIndex];
                  return (
                    <div key={vocabIndex} className="carousel-content-area swipe-in">
                      <div className="vocab-label" style={{ textAlign: "right", marginBottom: '0.25rem' }}>
                        :عربي
                      </div>
                      <div className="vocab-card" style={{ direction: "rtl" }}>
                        <div className="vocab-text-main">
                          {item.arabic}
                          {item.note && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.9rem",
                                marginTop: "0.5rem",
                                color: "var(--text-light)",
                              }}
                            >
                              [{item.note}]
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="vocab-label" style={{ marginBottom: '0.25rem' }}>English:</div>
                      <div className="vocab-card">
                        <div className="vocab-text-main">{item.english}</div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Footer with left/right arrows and continue button */}
              {vocabItems.length > 0 && (
                <footer className="sticky-footer">
                  <div style={{ display: 'flex', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                    <button
                      className="btn-nav-arrow"
                      onClick={() => vocabIndex > 0 && setVocabIndex(i => i - 1)}
                      disabled={vocabIndex === 0}
                      style={{ opacity: vocabIndex === 0 ? 0.3 : 1 }}
                    >
                      <MdArrowBackIosNew />
                    </button>
                    <button
                      className="btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        triggerHaptic();
                        if (vocabIndex === vocabItems.length - 1) {
                          // After vocab, go to speaking if exercises exist, otherwise intro_drills
                          if (speakingExercises.length > 0) {
                            setLessonPhase("speaking");
                          } else {
                            setLessonPhase("intro_drills");
                          }
                        } else {
                          setVocabIndex(i => i + 1);
                        }
                      }}
                    >
                      CONTINUE
                    </button>
                    <button
                      className="btn-nav-arrow"
                      onClick={() => vocabIndex < vocabItems.length - 1 && setVocabIndex(i => i + 1)}
                      disabled={vocabIndex === vocabItems.length - 1}
                      style={{ opacity: vocabIndex === vocabItems.length - 1 ? 0.3 : 1 }}
                    >
                      →
                    </button>
                  </div>
                </footer>
              )}
            </div>
          )
          }

          {/* PHASE: SPEAKING PRACTICE */}
          {lessonPhase === "speaking" && (
            <div className="speaking-practice no-scroll-container swipe-in" style={{ padding: '2rem', textAlign: 'center' }}>
              <h2 style={{ marginBottom: '2rem' }}>Speaking Practice</h2>

              <p dir="rtl" style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem', lineHeight: 1.8 }}>
                {speakingExercises[0]?.prompt_ar}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '140px', justifyContent: 'center' }}>
                {isCheckingAnswer ? (
                  <>
                    <div className="checking-answer-container">
                      <div className="checking-answer-pulse"></div>
                      <div className="checking-answer-icon">🎧</div>
                    </div>
                    <p className="checking-answer-text">
                      Checking your answer<span className="checking-dots"></span>
                    </p>
                  </>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={isRecording ? stopRecording : startRecording}
                    style={{ maxWidth: 320 }}
                    disabled={isCheckingAnswer}
                  >
                    {isRecording ? "⏹ Stop recording" : "🎤 Start recording"}
                  </button>
                )}
              </div>

              {speechError && (
                <p style={{ color: 'red', marginTop: 12 }}>
                  {speechError}
                </p>
              )}

              {/* Show feedback after recording */}
              {speechFeedback && (
                <div style={{
                  marginTop: 20,
                  padding: '16px 24px',
                  borderRadius: 12,
                  background: speechFeedback.includes('Good') ? 'rgba(34, 197, 94, 0.15)'
                    : speechFeedback.includes('Almost') ? 'rgba(251, 191, 36, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                  border: `2px solid ${speechFeedback.includes('Good') ? '#22c55e'
                    : speechFeedback.includes('Almost') ? '#fbbf24'
                      : '#ef4444'
                    }`
                }}>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: speechFeedback.includes('Good') ? '#22c55e'
                      : speechFeedback.includes('Almost') ? '#fbbf24'
                        : '#ef4444'
                  }}>
                    {speechFeedback}
                  </div>
                  {spokenText && (
                    <div dir="rtl" style={{
                      marginTop: 12,
                      fontSize: '1.1rem',
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic'
                    }}>
                      You said: "{spokenText}"
                    </div>
                  )}
                </div>
              )}

              {isRecording && (
                <div style={{ marginTop: 16, color: 'var(--text-secondary)' }}>
                  🔴 Recording...
                </div>
              )}

              <button
                className="btn-outline"
                style={{ marginTop: 20 }}
                onClick={() => { triggerHaptic(); setLessonPhase('intro_drills'); }}
              >
                Continue
              </button>
            </div>
          )}

          {/* PHASE: TRANSITION TO DRILLS */}
          {lessonPhase === "intro_drills" && (
            <div className="no-scroll-container transition-screen swipe-in" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: '70vw', maxWidth: '280px', aspectRatio: '1', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', marginBottom: '1.5rem' }}>
                <img src="/images/sentence-practice.png" alt="Sentence Practice" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>Sentence Practice</h1>
              <p className="page-subtitle">Let's look at some ways of using these words in sentences!</p>
              <footer className="sticky-footer">
                <button className="btn-primary" onClick={() => { triggerHaptic(); setLessonPhase("explain"); }}>
                  Continue
                </button>
              </footer>
            </div>
          )}

          {/* PHASE 3: USAGE DRILLS (Carousel Mode) */}
          {lessonPhase === "explain" && explanations.length > 0 && (
            <div className="no-scroll-container">
              {/* Header with back arrow and lesson title */}
              <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                <span
                  style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                  onClick={() => setLessonPhase("lesson")}
                >
                  <MdArrowBackIosNew />
                </span>
                <div className="lesson-title-badge">{activeLesson.title}</div>
              </header>

              <div className="carousel-content-area">
                <div className="vocab-label" style={{ textAlign: "right", marginBottom: '0.25rem' }}>:عربي</div>
                <div className="arabic-box spotlight-arabic" dir="rtl" style={{ fontSize: '2rem' }}>
                  {explanations[explanationIndex].arabic_sentence}
                </div>

                <div className="vocab-label" style={{ marginBottom: '0.25rem' }}>English:</div>
                <div className="explanation-bubble" style={{ borderLeft: '5px solid var(--green)', background: '#f0fff4' }}>
                  {explanations[explanationIndex].english_sentence}
                </div>
              </div>

              <footer className="sticky-footer">
                <div style={{ display: 'flex', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                  <button
                    className="btn-nav-arrow"
                    onClick={() => explanationIndex > 0 && setExplanationIndex(i => i - 1)}
                    disabled={explanationIndex === 0}
                    style={{ opacity: explanationIndex === 0 ? 0.3 : 1 }}
                  >
                    <MdArrowBackIosNew />
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      triggerHaptic();
                      if (explanationIndex === explanations.length - 1) {
                        setLessonPhase("relisten");
                        setAudioCompleted(false);
                        setAudioProgress(0);
                      } else {
                        setExplanationIndex(i => i + 1);
                      }
                    }}
                  >
                    CONTINUE
                  </button>
                  <button
                    className="btn-nav-arrow"
                    onClick={() => explanationIndex < explanations.length - 1 && setExplanationIndex(i => i + 1)}
                    disabled={explanationIndex === explanations.length - 1}
                    style={{ opacity: explanationIndex === explanations.length - 1 ? 0.3 : 1 }}
                  >
                    →
                  </button>
                </div>
              </footer>
            </div>
          )}

          {/* PHASE 4: RELISTEN */}
          {
            lessonPhase === "relisten" && (
              <div className="relisten-screen swipe-in">
                {/* Icon */}
                <div className="relisten-icon-container">
                  <img src="/clemency-icon.png" alt="Ihya Institute" className="relisten-icon" />
                </div>

                <h1 className="relisten-title">
                  Let's have another listen
                </h1>
                <p className="relisten-subtitle">
                  Listen again one more time without the text!
                </p>

                {activeLesson.audio_url && (
                  <>
                    <audio
                      ref={audioRef}
                      src={activeLesson.audio_url}
                      onTimeUpdate={(e) => {
                        if (activeLesson.lesson_format !== "blocks" && e.target.duration > 0) {
                          setAudioProgress(
                            (e.target.currentTime / e.target.duration) * 100
                          );
                        }
                      }}
                      onEnded={() => {
                        setDialogueFinished(true);
                        setAudioPlaying(false);
                        setAudioCompleted(true);
                      }}
                      style={{ display: "none" }}
                    />

                    <div className="relisten-play-container">
                      <button
                        className="btn-play-large"
                        onClick={handleStartLessonAudio}
                        disabled={audioPlaying}
                      >
                        {audioPlaying ? "🔊" : "▶️"}
                      </button>
                    </div>

                    {activeLesson.audio_url && !audioCompleted && (
                      <div className="audio-progress-fixed" style={{ marginBottom: '1rem' }}>
                        <div
                          className="audio-progress-fill-fixed"
                          style={{ width: `${audioProgress}%` }}
                        />
                      </div>
                    )}
                  </>
                )}

                {audioCompleted && (
                  <button
                    className="btn-primary"
                    style={{ animation: "slideDown 0.3s ease-out", marginBottom: "1rem" }}
                    onClick={() => { triggerHaptic(); setLessonPhase("pre_quiz"); }}
                  >
                    Continue to Quiz →
                  </button>
                )}

                <div style={{ flex: 1 }} />

                <button
                  className="btn-skip-bubble"
                  onClick={() => { triggerHaptic(); setLessonPhase("pre_quiz"); }}
                >
                  Skip to Quiz
                </button>
              </div>
            )
          }

          {/* PHASE 5: PRE-QUIZ */}
          {
            lessonPhase === "pre_quiz" && (
              <div className="no-scroll-container transition-screen swipe-in" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: '70vw', maxWidth: '280px', marginBottom: '1.5rem' }}>
                  <img src="/clemency-icon.png" alt="Ihya Institute" style={{ width: '100%', height: 'auto' }} />
                </div>
                <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>مُستَعِد؟</h1>
                <p className="page-subtitle">Take the quiz to complete this lesson!</p>
                <footer className="sticky-footer">
                  <button
                    className="btn-primary"
                    style={{ fontSize: "1.2rem", padding: "1rem 2rem" }}
                    onClick={() => { triggerHaptic(); startQuiz(); }}
                    disabled={questions.length === 0}
                  >
                    {questions.length === 0 ? "No questions loaded" : "ابدأ"}
                  </button>
                </footer>
              </div>
            )
          }

          {/* EXIT CONFIRMATION MODAL */}
          {
            showExitModal && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <div className="modal-title">Return to the home screen?</div>
                  <p className="text-muted">
                    (Choose YES to leave or NO to resume the lesson)
                  </p>
                  <div className="modal-actions">
                    <button
                      className="btn-outline"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setShowExitModal(false);
                        if (audioRef.current && !audioCompleted) {
                          audioRef.current.play().then(() => {
                            setAudioPlaying(true);
                          }).catch(e => console.error("Resume failed", e));
                        }
                      }}
                    >
                      NO
                    </button>
                    <button
                      className="btn-primary"
                      style={{
                        flex: 1,
                        backgroundColor: "var(--red)",
                        boxShadow: "0 4px 0 var(--red-dark)",
                      }}
                      onClick={() => {
                        setShowExitModal(false);
                        backToLessons();
                      }}
                    >
                      YES
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          {/* Global Transition Overlay */}
          {transitioning && (
            <div className="transition-overlay">
              <div className="transition-card">
                <Leapfrog size="40" speed="2.5" color="#8b5cf6" />
              </div>
            </div>
          )}
        </main >
      </div >
    );
  }

  // ---------- MAIN SCREEN: STAGES + LESSONS ----------

  return (
    <div className={`app-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
      <main className="app-main" style={{ marginTop: 0, paddingTop: '1rem' }}>
        <div className="page-layout">
          <section
            className="page-card"
            style={{
              background: "transparent",
              border: "none",
              boxShadow: "none",
              padding: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <button
                className="btn-back-text"
                onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); }}
              >
                <MdArrowBackIosNew />
              </button>
              <h1 className="page-title" style={{ fontSize: "1.5rem", fontFamily: "'Amiri', serif", direction: "rtl", margin: 0 }}>
                📚 المراحل
              </h1>
            </div>

            {loadingStages ? (
              <p className="muted">Loading…</p>
            ) : stages.length === 0 ? (
              <p className="muted">No stages found.</p>
            ) : (
              <div className="stage-list">
                {stages.map((stage) => {
                  const { completed, total, percent } = getStageProgress(stage.id);
                  const isSelected = selectedStage === stage.id;

                  return (
                    <div key={stage.id} style={{ marginBottom: "1rem" }}>
                      <button
                        onClick={() => { triggerHaptic(); loadLessons(stage.id); }}
                        className="stage-card"
                        style={{
                          width: "100%",
                          marginBottom: 0,
                          borderColor: isSelected ? "var(--blue)" : "var(--gray-200)",
                          background: "var(--white)",
                        }}
                      >
                        <div className="stage-card-top">
                          <div>
                            <div className="stage-name">{stage.name || "Stage"}</div>
                            <div className="stage-description">{stage.description}</div>
                          </div>
                          {total > 0 && (
                            <span className="stage-progress-text">
                              {completed}/{total} lessons • {percent}%
                            </span>
                          )}
                        </div>
                        {total > 0 && (
                          <div className="stage-progress-bar">
                            <div className="stage-progress-fill" style={{ width: `${percent}%` }} />
                          </div>
                        )}
                      </button>

                      {isSelected && (
                        <div className="lesson-container-inline">
                          {loadingLessons ? (
                            <p className="muted" style={{ textAlign: "center" }}>
                              Loading lessons…
                            </p>
                          ) : lessons.length === 0 ? (
                            <p className="muted" style={{ textAlign: "center" }}>
                              No lessons found.
                            </p>
                          ) : (
                            <ul className="lesson-list">
                              {lessons.map((lesson) => {
                                const completed = isLessonCompleted(lesson.id);
                                return (
                                  <li key={lesson.id}>
                                    <button
                                      onClick={() => openLesson(lesson)}
                                      className="lesson-row"
                                    >
                                      <div className={`lesson-progress-donut ${completed ? "completed" : ""}`} />
                                      <div className="lesson-row-content">
                                        <div className="lesson-row-title">{lesson.title}</div>
                                        <div className="lesson-row-desc">{lesson.description}</div>
                                      </div>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Global Transition Overlay */}
      {transitioning && (
        <div className="transition-overlay">
          <div className="transition-card">
            <Leapfrog size="40" speed="2.5" color="#8b5cf6" />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
