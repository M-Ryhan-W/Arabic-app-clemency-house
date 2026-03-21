import { useEffect, useState, useRef, useMemo } from "react";
import ScenarioChat from "./ScenarioChat";
import { supabase } from "./supabaseClient";
import { Leapfrog } from 'ldrs/react';
import 'ldrs/react/Leapfrog.css';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { MdArrowBackIosNew } from "react-icons/md";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from 'motion/react';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
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

// ===== SOUND SYSTEM — Layered Feedback =====

// Shared AudioContext — reuse to avoid Android throttling
let _sharedAudioCtx = null;
const getAudioCtx = () => {
  if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
    _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_sharedAudioCtx.state === 'suspended') _sharedAudioCtx.resume();
  return _sharedAudioCtx;
};

// Debounce to prevent double-fire
let _lastClickTime = 0;

// Tap sound (existing bubbly pop — kept)
const playClickSound = () => {
  const now = Date.now();
  if (now - _lastClickTime < 80) return; // debounce 80ms
  _lastClickTime = now;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.06);
  } catch (e) { }
};

// Selection sound (slightly higher pitch for quiz picks)
const playSelectSound = () => {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start(); osc.stop(ctx.currentTime + 0.05);
  } catch (e) { }
};

// Success chime (rising C5 → E5 two-tone)
const playSuccessSound = () => {
  try {
    const ctx = getAudioCtx();
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(ctx.destination);
    o1.frequency.value = 523; o1.type = 'sine';
    g1.gain.setValueAtTime(0.08, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.15);
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(ctx.destination);
    o2.frequency.value = 659; o2.type = 'sine';
    g2.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o2.start(ctx.currentTime + 0.08); o2.stop(ctx.currentTime + 0.2);
  } catch (e) { }
};

// Error tone (descending low)
const playErrorSound = () => {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(250, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(); osc.stop(ctx.currentTime + 0.12);
  } catch (e) { }
};

// Reward arpeggio (C5-E5-G5-C6 ascending sparkle)
const playRewardSound = () => {
  try {
    const ctx = getAudioCtx();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      const t = ctx.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    });
  } catch (e) { }
};

const MAX_AUDIO_BASE64_LENGTH = 5 * 1024 * 1024; // ~3.75MB raw audio, reasonable max for speech

// ===== HAPTIC + SOUND HELPERS =====

// Light tap (buttons, navigation)
const triggerHaptic = async () => {
  playClickSound();
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch (e) { }
};

// Medium feedback (quiz selection)
const triggerSelectFeedback = async () => {
  playSelectSound();
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch (e) { }
};

// Success feedback (correct answer)
const triggerSuccessFeedback = async () => {
  playSuccessSound();
  try { await Haptics.notification({ type: 'SUCCESS' }); } catch (e) { }
};

// Error feedback (wrong answer)
const triggerErrorFeedback = async () => {
  playErrorSound();
  try { await Haptics.notification({ type: 'ERROR' }); } catch (e) { }
};

// Heavy haptic (quiz finish, lesson complete)
const triggerHeavyHaptic = async () => {
  playRewardSound();
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    setTimeout(async () => {
      try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch (e) { }
    }, 100);
  } catch (e) { }
};

// ✅ TEXT-TO-SPEECH HELPER
let ttsVoices = [];

// Pre-load voices (they load asynchronously on many platforms)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  const loadVoices = () => { ttsVoices = window.speechSynthesis.getVoices(); };
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

const speakText = (text, lang = 'ar-SA') => {
  if (!text) return;
  const synth = window.speechSynthesis;
  if (!synth) return;

  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.volume = 1.0;

  // Arabic: slower rate + slightly lower pitch for more natural sound
  utterance.rate = 0.75;
  utterance.pitch = 1.0;

  // Pick the best Arabic voice — strongly prefer FEMALE voices
  const voices = synth.getVoices();
  const langPrefix = lang.split('-')[0];
  const langVoices = voices.filter(v => v.lang.startsWith(langPrefix));
  // Female name hints (common female Arabic TTS voice names)
  const femaleHints = ['female', 'laila', 'maryam', 'fatima', 'amira', 'zineb', 'samira', 'zeina', 'noura', 'hoda'];
  const maleHints = ['male', 'maged', 'tarik', 'mansour', 'ahmed'];
  // Filter out male voices first
  const nonMale = langVoices.filter(v => !maleHints.some(h => v.name.toLowerCase().includes(h)));
  // Find explicitly female
  const femaleVoice = langVoices.find(v => femaleHints.some(h => v.name.toLowerCase().includes(h)));
  // Google female preferred
  const googleFemale = nonMale.find(v => v.name.toLowerCase().includes('google'));
  utterance.voice = femaleVoice || googleFemale || nonMale[0] || langVoices[0] || null;

  synth.speak(utterance);
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
          <p className="splash-subtitle">أهلاً لنبدأ</p>
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

// Polyfill for navigator.mediaDevices (needed for non-HTTPS / non-localhost)
if (typeof navigator !== 'undefined') {
  if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
  }
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function (constraints) {
      const legacyGetUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
      if (!legacyGetUserMedia) {
        return Promise.reject(new Error('Microphone access requires HTTPS or localhost. Please access via https:// or http://localhost'));
      }
      return new Promise((resolve, reject) => {
        legacyGetUserMedia.call(navigator, constraints, resolve, reject);
      });
    };
  }
}



function App() {
  // ============ SPLASH SCREEN STATE ============
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState("home"); // "home" | "courses" | "speaking" | "profile"
  const [expandedStageId, setExpandedStageId] = useState(null); // which stage card is expanded

  const [stages, setStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(true);

  const [allLessons, setAllLessons] = useState([]); // all lessons (for progress)
  const [lessons, setLessons] = useState([]); // lessons for selected stage
  const [selectedStage, setSelectedStage] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [activeLesson, setActiveLesson] = useState(null);

  // NEW: Dedicated Streaks Page state
  const [showStreaksPage, setShowStreaksPage] = useState(false);

  // ✅ DAILY GOAL STATE
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(20);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [dailySecondsSpent, setDailySecondsSpent] = useState(0);
  const [activeDatesHistory, setActiveDatesHistory] = useState([]);

  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // ✅ NEW: BLOCKS STATE
  const [lessonBlocks, setLessonBlocks] = useState([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  // ✅ NEW: SCROLL/REVEAL STATE
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [dialogueFinished, setDialogueFinished] = useState(false);
  const [showDialogueReview, setShowDialogueReview] = useState(false); // Shows all dialogue after 2s delay
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
  const scenarioTtsCache = useRef({});
  const aiHelperCache = useRef(new Map()); // Map<blockId, { translation?: string, vocab?: string }>

  // AUTH STATE
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [authError, setAuthError] = useState("");

  // Sync Daily Stats from Supabase on Login
  useEffect(() => {
    if (!user) return;
    const fetchDailyStats = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.from('user_daily_stats')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      if (data) {
        setDailyGoalMinutes(data.daily_goal_minutes);
        setDailySecondsSpent(data.total_minutes_spent * 60);
        setScenarioCompleted(data.scenario_completed);
      } else if (error?.code === 'PGRST116') {
        // Not found, create it
        await supabase.from('user_daily_stats').insert({ user_id: user.id, date: today, daily_goal_minutes: 20 });
        setDailyGoalMinutes(20);
        setDailySecondsSpent(0);
        setScenarioCompleted(false);
      }

      // Fetch all historical dates for the Streaks page
      const { data: historyData } = await supabase.from('user_daily_stats').select('date').eq('user_id', user.id);
      if (historyData) {
        setActiveDatesHistory(historyData.map(d => d.date));
      } else {
        setActiveDatesHistory([today]);
      }
    };
    fetchDailyStats();
  }, [user]);

  // ✅ TRACK TIME SPENT ON APP — ticks every 15 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      setDailySecondsSpent(prev => {
        const updated = prev + 15;
        // Sync to cloud every 60s
        if (updated % 60 === 0) {
          const mins = Math.floor(updated / 60);
          const today = new Date().toISOString().slice(0, 10);
          supabase.from('user_daily_stats').update({ total_minutes_spent: mins })
            .eq('user_id', user.id).eq('date', today)
            .then(({ error }) => { if (error) console.error(error) });
        }
        return updated;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // LESSON PROGRESS STATE
  const [lessonProgress, setLessonProgress] = useState([]); // [{lesson_id, hearts_left}, ...]
  const [showExitModal, setShowExitModal] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  // PROFILE MENU STATE
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showQuitQuizConfirm, setShowQuitQuizConfirm] = useState(false);

  // EXIT BOTTOM SHEET STATE
  const [showExitSheet, setShowExitSheet] = useState(false);

  // UNIFIED STATE REFS FOR ANDROID BACK HANDLER
  const stateRefs = useRef({
    activeLesson: null,
    currentWotd: null,
    practiceMode: null,
    selectedStage: null,
    showStreaksPage: false,
    activePictureLesson: null,
    user: null
  });

  // TRANSITION OVERLAY STATE
  const [transitioning, setTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState("forward"); // "forward" | "back"
  const transitionTimerRef = useRef(null);

  // LESSON CONTENT CACHE (for preloading)
  const lessonContentCache = useRef(new Map()); // Map<lessonId, { questions, vocab, explanations, grammarNotes, speakingExercises, blocks }>

  // ✅ SPEAKING PRACTICE MODE STATE
  const [practiceMode, setPracticeMode] = useState(null); // null = selection, 'book' | 'speaking'
  const [speakingModes, setSpeakingModes] = useState([]);
  const [expandedSpeakingCard, setExpandedSpeakingCard] = useState(null); // 'repeat' | 'translate' | null
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

  // ✅ WORD OF THE DAY STATE
  const [wotdPhase, setWotdPhase] = useState("intro"); // "intro" | "word" | "examples" | "complete"
  const [currentWotd, setCurrentWotd] = useState(null);
  const [wotdExamples, setWotdExamples] = useState([]);
  const [wotdExampleIndex, setWotdExampleIndex] = useState(0);
  const [loadingWotd, setLoadingWotd] = useState(false);

  useEffect(() => {
    if (wotdPhase === "complete") {
      playCelebrationSound();
      triggerHeavyHaptic();
    }
  }, [wotdPhase]);

  // ✅ PICTURE DESCRIBE STATE
  const [pictureDescribeLessons, setPictureDescribeLessons] = useState([]);
  const [loadingPictureLessons, setLoadingPictureLessons] = useState(false);
  const [activePictureLesson, setActivePictureLesson] = useState(null);
  const [pictureVocab, setPictureVocab] = useState([]);
  const [pictureVocabIndex, setPictureVocabIndex] = useState(0);
  const [picturePhase, setPicturePhase] = useState("lessons");
  // Phases: "lessons" | "vocab" | "picture" | "recording" | "success" | "retry" | "solution"
  const [pictureTranscript, setPictureTranscript] = useState("");
  const [pictureMatchPercent, setPictureMatchPercent] = useState(0);
  const [pictureMatchedWords, setPictureMatchedWords] = useState([]);
  const [pictureMissedWords, setPictureMissedWords] = useState([]);
  const [showPictureHint, setShowPictureHint] = useState(false);
  const [pictureRecording, setPictureRecording] = useState(false);
  const [pictureCheckingAnswer, setPictureCheckingAnswer] = useState(false);
  const [pictureRecordingTime, setPictureRecordingTime] = useState(0);
  const pictureTimerRef = useRef(null);
  const PICTURE_MAX_RECORD_SECONDS = 120;

  // AI Feedback state
  const [aiFeedback, setAiFeedback] = useState(null);
  const [loadingAiFeedback, setLoadingAiFeedback] = useState(false);
  const [pictureFeedbackSteps, setPictureFeedbackSteps] = useState([]);
  const [pictureFeedbackIndex, setPictureFeedbackIndex] = useState(0);
  const [pictureScore, setPictureScore] = useState(null);
  const [pictureVocabStats, setPictureVocabStats] = useState(null); // { vocabUsed, vocabTotal }
  const [challengeRecording, setChallengeRecording] = useState(false);
  const [challengeCompleted, setChallengeCompleted] = useState({}); // { [stepIndex]: true }
  const [challengeResult, setChallengeResult] = useState({}); // { [stepIndex]: { good: bool, feedback: string } }
  const [challengeChecking, setChallengeChecking] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0); // for animated loading messages
  const analysisTimerRef = useRef(null);
  const pictureAudioRef = useRef(null);
  const challengeRecorderRef = useRef(null);
  const challengeStreamRef = useRef(null);

  // ✅ SCENARIO CHAT STATE
  const [scenarioData, setScenarioData] = useState(null); // { id, emoji, title, titleAr }
  const [scenarioPhase, setScenarioPhase] = useState(false); // null | "difficulty" | "chat" | "summary"
  const [scenarioCompleted, setScenarioCompleted] = useState(false); // completed today

  // ✅ DYNAMIC STREAKS & STATS CALCULATION
  const { currentStreak, longestStreak, totalDays, activeDaysSet } = useMemo(() => {
    const activeSet = new Set(activeDatesHistory);
    lessonProgress.forEach(lp => {
      if (lp.completed_at) {
        activeSet.add(new Date(lp.completed_at).toISOString().split('T')[0]);
      }
    });
    speakingLessonProgress.forEach(sp => {
      if (sp.completed_at) {
        activeSet.add(new Date(sp.completed_at).toISOString().split('T')[0]);
      }
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let current = 0;
    const startOffset = activeSet.has(todayStr) ? 0 : (activeSet.has(yesterdayStr) ? 1 : 0);
    for (let i = startOffset; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (activeSet.has(dateStr)) {
        current++;
      } else {
        break;
      }
    }

    const sortedDays = [...activeSet].sort();
    let longest = 0;
    let runLength = 0;
    for (let i = 0; i < sortedDays.length; i++) {
      if (i === 0) {
        runLength = 1;
      } else {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diffMs = curr - prev;
        if (diffMs <= 86400000 * 1.5) {
          runLength++;
        } else {
          runLength = 1;
        }
      }
      longest = Math.max(longest, runLength);
    }

    return {
      currentStreak: current,
      longestStreak: longest,
      totalDays: activeSet.size,
      activeDaysSet: activeSet,
    };
  }, [activeDatesHistory, lessonProgress, speakingLessonProgress]);

  

  // AI HELPER STATE (FAB + slide-up sheet)
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [aiSheetBlock, setAiSheetBlock] = useState(null); // the block being explored
  const [aiSheetView, setAiSheetView] = useState("menu"); // "menu" | "translate" | "vocab" | "loading"
  const [aiVocabResult, setAiVocabResult] = useState("");
  const [aiTranslationResult, setAiTranslationResult] = useState("");
  const aiSheetRef = useRef(null);
  const aiOverlayRef = useRef(null);
  const aiDragRef = useRef({ startY: 0, currentY: 0, dragging: false });

  // ---------- TTS (Web Speech API) ----------

  const speakAiAudio = async (text, onComplete) => {
    if (!text) return;
    try {
      // Check cache first
      if (scenarioTtsCache.current[text]) {
        if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
        const audio = new Audio(`data:audio/mp3;base64,${scenarioTtsCache.current[text]}`);
        scenarioAudioRef.current = audio;
        if (onComplete) audio.onended = onComplete;
        audio.play().catch(e => console.error("Cached audio play failed:", e));
        return;
      }

      const { data, error } = await supabase.functions.invoke("scenario-chat", {
        body: { action: "generate-tts", text }
      });
      if (error) throw error;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed.audioBase64) {
        scenarioTtsCache.current[text] = parsed.audioBase64;
        if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
        const audio = new Audio(`data:audio/mp3;base64,${parsed.audioBase64}`);
        scenarioAudioRef.current = audio;
        if (onComplete) {
          audio.onended = onComplete;
        }
        audio.play().catch(e => {
          console.error("Audio playback failed:", e);
        });
      } else {
        throw new Error("No audio returned");
      }
    } catch (e) {
      console.error("High-quality TTS failed:", e);
    }
  };

  const speakArabic = async (text) => {
    if (!text) return;
    if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
    try {
      await TextToSpeech.speak({
        text,
        lang: 'ar',
        rate: 0.85,
        volume: 1.0,
      });
    } catch (e) {
      // Fallback to Web Speech API
      try {
        window.speechSynthesis?.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'ar';
        utter.rate = 0.85;
        const voices = window.speechSynthesis?.getVoices() || [];
        const arVoice = voices.find(v => v.lang.startsWith('ar'));
        if (arVoice) utter.voice = arVoice;
        window.speechSynthesis?.speak(utter);
      } catch (e2) { /* TTS not available */ }
    }
  };

  const speakEnglish = async (text) => {
    if (!text) return;
    try {
      await TextToSpeech.speak({
        text,
        lang: 'en-US',
        rate: 0.95,
        volume: 1.0,
      });
    } catch (e) {
      // Fallback to Web Speech API
      try {
        window.speechSynthesis?.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.rate = 0.95;
        const voices = window.speechSynthesis?.getVoices() || [];
        const enVoice = voices.find(v => v.lang.startsWith('en'));
        if (enVoice) utter.voice = enVoice;
        window.speechSynthesis?.speak(utter);
      } catch (e2) { /* TTS not available */ }
    }
  };

  // ---------- AI HELPER (FAB + Sheet) ----------

  const openAiSheet = (block) => {
    triggerHaptic();
    setAiSheetBlock(block);
    setAiSheetView("menu");
    setAiVocabResult("");
    setAiSheetOpen(true);
  };

  const closeAiSheet = () => {
    triggerHaptic();
    setAiSheetOpen(false);
    setAiSheetBlock(null);
    setAiSheetView("menu");
    setAiVocabResult("");
    setAiTranslationResult("");
  };

  const showTranslation = async () => {
    if (!aiSheetBlock) return;
    triggerHaptic();

    // Check cache first
    const cached = aiHelperCache.current.get(aiSheetBlock.id);
    if (cached?.translation) {
      setAiTranslationResult(cached.translation);
      setAiSheetView("translate");
      return;
    }

    // If text_en exists, still cache it for consistency
    if (aiSheetBlock.text_en) {
      const current = aiHelperCache.current.get(aiSheetBlock.id) || {};
      aiHelperCache.current.set(aiSheetBlock.id, { ...current, translation: aiSheetBlock.text_en });
      setAiTranslationResult(aiSheetBlock.text_en);
      setAiSheetView("translate");
      return;
    }

    setAiSheetView("loading");
    try {
      const question = `Translate the following Arabic text to English. Give ONLY the translation, nothing else. No commentary, no greetings.\n\nArabic: ${aiSheetBlock.text_ar}`;
      const { data } = await supabase.functions.invoke("lesson-ai-helper", {
        body: {
          question,
          lessonTitle: activeLesson?.title || "",
          lessonBlocks: [{ text_ar: aiSheetBlock.text_ar, block_type: aiSheetBlock.block_type }],
          vocabList: [],
          grammarNotes: []
        }
      });
      const answer = data?.answer || "Translation unavailable.";

      // Cache user result
      const current = aiHelperCache.current.get(aiSheetBlock.id) || {};
      aiHelperCache.current.set(aiSheetBlock.id, { ...current, translation: answer });

      setAiTranslationResult(answer);
      setAiSheetView("translate");
    } catch (err) {
      console.error("AI translate error:", err);
      setAiTranslationResult("Something went wrong. Try again.");
      setAiSheetView("translate");
    }
  };

  const askAiKeyVocab = async () => {
    if (!aiSheetBlock) return;
    triggerHaptic();

    // Check cache
    const cached = aiHelperCache.current.get(aiSheetBlock.id);
    if (cached?.vocab) {
      setAiVocabResult(cached.vocab);
      setAiSheetView("vocab");
      return;
    }

    setAiSheetView("loading");
    try {
      const question = `From this Arabic text, pick only the 2-3 hardest or most useful words/phrases for a learner. For each, give:\n- The Arabic word\n- Transliteration\n- Brief English meaning (one line max)\n\nDo NOT add any encouragement, greetings, or filler. Just the words.\n\nText: ${aiSheetBlock.text_ar}`;

      const { data } = await supabase.functions.invoke("lesson-ai-helper", {
        body: {
          question,
          lessonTitle: activeLesson?.title || "",
          lessonBlocks: [{ text_ar: aiSheetBlock.text_ar, text_en: aiSheetBlock.text_en || "", block_type: aiSheetBlock.block_type }],
          vocabList: [],
          grammarNotes: []
        }
      });

      const answer = data?.answer || "Could not get a response.";

      // Cache result
      const current = aiHelperCache.current.get(aiSheetBlock.id) || {};
      aiHelperCache.current.set(aiSheetBlock.id, { ...current, vocab: answer });

      setAiVocabResult(answer);
      setAiSheetView("vocab");
    } catch (err) {
      console.error("AI vocab error:", err);
      setAiVocabResult("Something went wrong. Try again.");
      setAiSheetView("vocab");
    }
  };

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

  // ✅ Helper to fetch and attach options to questions in a single batch query
  async function attachOptionsToQuestions(questions) {
    const mcqIds = questions
      .filter(q => q.question_type === "mcq")
      .map(q => q.id);

    if (mcqIds.length === 0) {
      return questions.map(q => ({ ...q, options: [] }));
    }

    try {
      const { data: allOptions, error } = await supabase
        .from("question_options")
        .select("*")
        .in("question_id", mcqIds);

      if (error) throw error;

      // Group options by question_id
      const optionsMap = (allOptions || []).reduce((acc, opt) => {
        if (!acc[opt.question_id]) acc[opt.question_id] = [];
        acc[opt.question_id].push(opt);
        return acc;
      }, {});

      return questions.map(q => {
        if (q.question_type === "mcq") {
          const options = optionsMap[q.id] || [];
          return { ...q, options: shuffleArray(options) };
        }
        return { ...q, options: [] };
      });
    } catch (err) {
      console.error("Error batch loading options:", err);
      // Fallback: return questions with empty options on error
      return questions.map(q => ({ ...q, options: [] }));
    }
  }

  // ---------- SOUND EFFECTS ----------

  function playCorrectSound() {
    try {
      const ctx = getAudioCtx();
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
      const ctx = getAudioCtx();
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
      const ctx = getAudioCtx();
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
      const ctx = getAudioCtx();
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
      const ctx = getAudioCtx();
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

  // Keep refs in sync with routing states for the hardware back listener
  useEffect(() => {
    stateRefs.current = {
      activeLesson,
      currentWotd,
      practiceMode,
      selectedStage,
      showStreaksPage,
      activePictureLesson,
      activeSpeakingLesson,
      user
    };
  }, [activeLesson, currentWotd, practiceMode, selectedStage, showStreaksPage, activePictureLesson, activeSpeakingLesson, user]);

  // Native Android hardware back button handling via Capacitor
  useEffect(() => {
    let backListenerHandle = null;

    const setupBackListener = async () => {
      backListenerHandle = await CapacitorApp.addListener('backButton', (event) => {
        // 🔴 IMPORTANT: stop default behaviour (closing app)
        event.preventDefault?.();

        const state = stateRefs.current;

        // 1. Inside a core lesson
        if (state.activeLesson) {
          setShowExitModal(true);
          return;
        }

        // 2. Inside Word of the Day
        if (state.currentWotd) {
          setCurrentWotd(null);
          return;
        }

        // 2.5. Inside Scenario Chat
        if (scenarioPhase) {
          setScenarioPhase(false);
          return;
        }

        // 3. Inside Picture Describe Lesson
        if (state.activePictureLesson) {
          setPicturePhase("lessons");
          setActivePictureLesson(null);
          setPictureVocab([]);
          setPictureVocabIndex(0);
          setPictureTranscript("");
          setPictureMatchPercent(0);
          setPictureMatchedWords([]);
          setPictureMissedWords([]);
          setShowPictureHint(false);
          setPictureRecording(false);
          setPictureCheckingAnswer(false);
          setAiFeedback(null);
          setLoadingAiFeedback(false);
          setPictureFeedbackSteps([]);
          setPictureFeedbackIndex(0);
          setPictureScore(null);
          setPictureVocabStats(null);
          setChallengeRecording(false);
          setChallengeCompleted({});
          setChallengeResult({});
          setChallengeChecking(false);
          setAnalysisStep(0);
          if (analysisTimerRef.current) { clearInterval(analysisTimerRef.current); analysisTimerRef.current = null; }
          if (challengeRecorderRef.current) {
            try { challengeRecorderRef.current.stop(); } catch { }
            challengeRecorderRef.current = null;
          }
          if (challengeStreamRef.current) {
            challengeStreamRef.current.getTracks().forEach(t => t.stop());
            challengeStreamRef.current = null;
          }
          return;
        }

        // 3.5. Inside Speaking Lesson
        if (state.activeSpeakingLesson) {
          backToSpeakingLessons();
          return;
        }

        // 4. Inside Speaking Practice sub-menu
        if (state.practiceMode) {
          setPracticeMode(null);
          return;
        }

        // 5. Inside a specific Stage (Book view)
        if (state.selectedStage) {
          setSelectedStage(null);
          return;
        }

        // 6. Inside Streaks Page
        if (state.showStreaksPage) {
          setShowStreaksPage(false);
          return;
        }

        // 7. On Home Root (None of the above are active)
        if (state.user) {
          setShowExitSheet(true);
        }
      });
    };

    setupBackListener();

    return () => {
      if (backListenerHandle && typeof backListenerHandle.remove === 'function') {
        backListenerHandle.remove();
      }
    };
  }, []); // Register only ONCE

  // Cleanup on unmount — prevent leaked timers, mic locks, and orphaned audio
  useEffect(() => {
    return () => {
      // Clear all interval/timeout timers
      try { if (analysisTimerRef.current) { clearInterval(analysisTimerRef.current); analysisTimerRef.current = null; } } catch (e) { }
      try { if (pictureTimerRef.current) { clearInterval(pictureTimerRef.current); pictureTimerRef.current = null; } } catch (e) { }
      try { if (transitionTimerRef.current) { clearTimeout(transitionTimerRef.current); transitionTimerRef.current = null; } } catch (e) { }

      // Stop all active recordings and release mic streams
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          if (mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
          }
          mediaRecorderRef.current = null;
        }
      } catch (e) { }





      try {
        if (challengeRecorderRef.current && challengeRecorderRef.current.state !== 'inactive') {
          challengeRecorderRef.current.stop();
          if (challengeRecorderRef.current.stream) {
            challengeRecorderRef.current.stream.getTracks().forEach(t => t.stop());
          }
          challengeRecorderRef.current = null;
        }
      } catch (e) { }

      try {
        if (challengeStreamRef.current) {
          challengeStreamRef.current.getTracks().forEach(t => t.stop());
          challengeStreamRef.current = null;
        }
      } catch (e) { }

      // Pause any playing audio


      // Cancel speech synthesis
      try { window.speechSynthesis?.cancel(); } catch (e) { }
    };
  }, []);

  async function handleSignUp(e) {
    if (e) e.preventDefault();
    triggerHaptic();
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
    if (e) e.preventDefault();
    triggerHaptic();
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

      // Fetch question options for MCQs in a single batch
      const questionsWithOptions = await attachOptionsToQuestions(questionsRes.data || []);

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
    // Stop any active recording and release microphone
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        // Release all mic tracks to free the audio hardware
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      } catch (e) {
        console.warn('Error cleaning up MediaRecorder:', e);
      }
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    setRecordedAudio(null);
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
    setShowDialogueReview(false);
    blockRefs.current = {};
    aiHelperCache.current.clear();
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
    resetAudio(); // Stop recording & release microphone
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

  // ---------- WORD OF THE DAY FUNCTIONS ----------

  async function loadWordOfTheDay() {
    setLoadingWotd(true);
    setWotdPhase("intro");
    setWotdExampleIndex(0);

    try {
      // Calculate which word to show based on days since start date
      const startDate = new Date('2026-02-05T00:00:00Z');
      const today = new Date();
      const daysDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
      const wordOrderIndex = (daysDiff % 100) + 1; // Cycles through 1-100

      // Fetch today's word
      const { data: wordData, error: wordError } = await supabase
        .from("word_of_the_day")
        .select("*")
        .eq("order_index", wordOrderIndex)
        .single();

      if (wordError) {
        console.error("Error loading word of the day:", wordError);
        // Fallback to first word if not found
        const { data: fallbackData } = await supabase
          .from("word_of_the_day")
          .select("*")
          .order("order_index", { ascending: true })
          .limit(1)
          .single();

        if (fallbackData) {
          setCurrentWotd(fallbackData);
          // Fetch examples for fallback word
          const { data: examplesData } = await supabase
            .from("word_of_the_day_examples")
            .select("*")
            .eq("word_id", fallbackData.id)
            .order("order_index", { ascending: true });
          setWotdExamples(examplesData || []);
        }
      } else {
        setCurrentWotd(wordData);
        // Fetch examples for this word
        const { data: examplesData } = await supabase
          .from("word_of_the_day_examples")
          .select("*")
          .eq("word_id", wordData.id)
          .order("order_index", { ascending: true });
        setWotdExamples(examplesData || []);
      }
    } catch (err) {
      console.error("Error in loadWordOfTheDay:", err);
    }

    setLoadingWotd(false);
  }

  function resetWotdFlow() {
    setWotdPhase("intro");
    setCurrentWotd(null);
    setWotdExamples([]);
    setWotdExampleIndex(0);
    setLoadingWotd(false);
  }

  // ---------- SCENARIO CHAT FUNCTIONS ----------

  async function loadTodayScenario() {
    try {
      const { data, error } = await supabase.functions.invoke("scenario-chat", {
        body: { action: "get-scenario" }
      });
      if (!error && data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        console.log('Scenario loaded:', parsed);
        setScenarioData(parsed);
      } else {
        console.error('Scenario load error:', error);
      }
      // scenarioCompleted is now tracked via user_daily_stats sync on login.
    } catch (e) {
      console.error("Error loading scenario:", e);
    }
  }






  // ---------- PICTURE DESCRIBE FUNCTIONS ----------

  async function loadPictureDescribeLessons() {
    setLoadingPictureLessons(true);
    try {
      const { data, error } = await supabase
        .from("picture_describe_lessons")
        .select("*")
        .order("order_index", { ascending: true });

      if (error) {
        console.error("Error loading picture describe lessons:", error);
      } else {
        setPictureDescribeLessons(data || []);
      }
    } catch (err) {
      console.error("Error in loadPictureDescribeLessons:", err);
    }
    setLoadingPictureLessons(false);
  }

  async function openPictureDescribeLesson(lesson) {
    setActivePictureLesson(lesson);
    setPicturePhase("vocab");
    setPictureVocabIndex(0);
    setPictureTranscript("");
    setPictureMatchPercent(0);
    setPictureMatchedWords([]);
    setPictureMissedWords([]);
    setShowPictureHint(false);

    // Load vocab for this lesson
    try {
      const { data, error } = await supabase
        .from("picture_describe_vocab")
        .select("*")
        .eq("lesson_id", lesson.id)
        .order("order_index", { ascending: true });

      if (error) {
        console.error("Error loading picture vocab:", error);
        setPictureVocab([]);
      } else {
        setPictureVocab(data || []);
      }
    } catch (err) {
      console.error("Error in openPictureDescribeLesson:", err);
      setPictureVocab([]);
    }
  }

  // Calculate vocab match percentage
  function calculateVocabMatch(transcript) {
    const normalizedTranscript = normalizeArabic(transcript);

    let matchCount = 0;
    const matched = [];
    const missed = [];

    pictureVocab.forEach(item => {
      const normalizedWord = normalizeArabic(item.arabic_text || item.arabic);
      // Check if the word appears in transcript (partial match for compound words)
      const words = normalizedWord.split(/\s+/);
      const isMatch = words.some(w => normalizedTranscript.includes(w)) ||
        normalizedTranscript.includes(normalizedWord);

      if (isMatch) {
        matchCount++;
        matched.push(item);
      } else {
        missed.push(item);
      }
    });

    const percent = pictureVocab.length > 0
      ? Math.round((matchCount / pictureVocab.length) * 100)
      : 0;

    return { percent, matched, missed };
  }

  // Start recording for picture describe
  const startPictureRecording = async () => {
    try {
      setSpeechError("");
      audioChunksRef.current = [];
      setPictureRecording(true);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Detect best supported mimeType for this device
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        ''  // fallback: let browser pick
      ];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (!mime || (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime))) {
          selectedMime = mime;
          break;
        }
      }
      console.log('Picture recording: using mimeType:', selectedMime || '(browser default)');

      const recorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        console.log('Picture ondataavailable: size =', event.data.size);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());

        console.log('Picture recording stopped. Chunks:', audioChunksRef.current.length,
          'Total size:', audioChunksRef.current.reduce((sum, c) => sum + c.size, 0));

        const blobType = selectedMime || 'audio/webm;codecs=opus';
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        console.log('Picture audioBlob size:', audioBlob.size);

        if (audioBlob.size < 100) {
          console.error('Picture recording: audio blob is too small, likely empty recording');
          setSpeechError('Recording captured no audio. Please check your microphone permissions.');
          setPictureCheckingAnswer(false);
          return;
        }

        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64String = reader.result;
          const base64Audio = base64String.split(',')[1];
          console.log('Picture base64 audio length:', base64Audio?.length);

          // Send to backend for transcription
          await processPictureAudio(base64Audio);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start(); // no timeslice — single buffer for correct WebM timestamps
      console.log('Picture describe recording started');

      // Start countdown timer
      setPictureRecordingTime(0);
      pictureTimerRef.current = setInterval(() => {
        setPictureRecordingTime(prev => {
          const next = prev + 1;
          if (next >= PICTURE_MAX_RECORD_SECONDS) {
            // Auto-stop at 2 minutes
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
              setPictureRecording(false);
            }
            clearInterval(pictureTimerRef.current);
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error("Start picture recording error:", err);
      setSpeechError("Failed to start recording: " + (err.message || err));
      setPictureRecording(false);
    }
  };

  const stopPictureRecording = async () => {
    try {
      // Clear the timer
      if (pictureTimerRef.current) {
        clearInterval(pictureTimerRef.current);
        pictureTimerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setPictureRecording(false);
        setPictureCheckingAnswer(true);
        console.log('Picture describe recording stopped');
      }
    } catch (e) {
      console.error('Failed to stop picture recording:', e);
      setSpeechError('Failed to stop recording: ' + (e.message || e));
      setPictureRecording(false);
    }
  };

  // Process audio and check against vocab
  const processPictureAudio = async (audioBase64) => {
    if (!audioBase64 || audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      setSpeechError("Recording is too long. Please try a shorter recording.");
      setPictureCheckingAnswer(false);
      return;
    }

    try {
      // Start animated analysis steps
      setAnalysisStep(0);
      analysisTimerRef.current = setInterval(() => {
        setAnalysisStep(prev => prev + 1);
      }, 2000);

      // Single call: transcribe audio + get AI feedback in one Gemini request
      const { data, error } = await supabase.functions.invoke(
        "speech-check",
        {
          body: {
            audioBase64: audioBase64,
            exerciseType: "picture-describe",
            vocabList: pictureVocab.map(v => v.arabic_text),
            lessonContext: activePictureLesson?.title || "",
            imageUrl: activePictureLesson?.image_url || ""
          }
        }
      );

      // Clear analysis timer
      if (analysisTimerRef.current) { clearInterval(analysisTimerRef.current); analysisTimerRef.current = null; }

      if (error) {
        console.error("Picture speech check error:", error);
        setSpeechError("Failed to process audio: " + error.message);
        setPictureCheckingAnswer(false);
        return;
      }

      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      console.log("Picture describe FULL response:", JSON.stringify(parsed, null, 2));
      
      // Check for edge function error (returns ok:false with _error)
      if (parsed?.ok === false && parsed?._error) {
        console.error("Picture describe API error:", parsed._error);
        setSpeechError("AI error: " + parsed._error);
        setPictureCheckingAnswer(false);
        return;
      }

      const transcript = parsed?.transcript || "";

      console.log("Picture describe transcript:", transcript);
      setPictureTranscript(transcript);

      // Calculate match percentage
      const { percent, matched, missed } = calculateVocabMatch(transcript);
      setPictureMatchPercent(percent);
      setPictureMatchedWords(matched);
      setPictureMissedWords(missed);

      // Check if passed (use lesson threshold or default 70%)
      const threshold = activePictureLesson?.pass_threshold || 70;

      // Always go to feedback phase — no more pass/fail
      setPicturePhase("feedback");
      setPictureFeedbackIndex(0);
      triggerHaptic();

      setPictureCheckingAnswer(false);

      // Process AI feedback steps from the response
      if (parsed?.steps && Array.isArray(parsed.steps)) {
        setPictureFeedbackSteps(parsed.steps);
        setPictureScore(parsed.score ?? null);
        // Store vocab stats separately (keep score as a number)
        if (parsed.vocabUsed != null) {
          setPictureVocabStats({ vocabUsed: parsed.vocabUsed, vocabTotal: parsed.vocabTotal });
        }
      } else {
        // Fallback: create basic feedback from old format
        const fallbackSteps = [];
        if (parsed?.feedback) {
          fallbackSteps.push({ type: 'segment', snippet: transcript, analysis: parsed.feedback, tip: null });
        }
        if (parsed?.corrections?.length > 0) {
          parsed.corrections.forEach(c => {
            fallbackSteps.push({ type: 'segment', snippet: c.said, analysis: c.explanation, tip: `Better: ${c.better}` });
          });
        }
        fallbackSteps.push({ type: 'vocab_check', used: matched.map(w => w.arabic_text || w.arabic), missed: missed.map(w => w.arabic_text || w.arabic), analysis: `You used ${percent}% of the target vocabulary.` });
        fallbackSteps.push({ type: 'summary', message: parsed?.encouragement || 'Keep practicing! Every attempt makes you stronger. 💪' });
        setPictureFeedbackSteps(fallbackSteps);
        setPictureScore(parsed?.overallScore ? (parsed.overallScore / 10) : (percent / 10));
      }
    } catch (err) {
      console.error("Error processing picture audio:", err);
      setSpeechError("Error processing audio");
      setPictureCheckingAnswer(false);
    }
  };

  // Fetch AI feedback from Gemini via edge function
  const fetchAiFeedback = async ({ transcript, exerciseType, expectedText, vocabList, lessonContext }) => {
    setLoadingAiFeedback(true);
    setAiFeedback(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-feedback", {
        body: { transcript, exerciseType, expectedText, vocabList, lessonContext }
      });
      if (error) {
        console.error("AI feedback error:", error);
        setLoadingAiFeedback(false);
        return;
      }
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      console.log("AI feedback:", parsed);
      setAiFeedback(parsed);
    } catch (err) {
      console.error("AI feedback exception:", err);
    }
    setLoadingAiFeedback(false);
  };

  function resetPictureDescribeFlow() {
    setPicturePhase("lessons");
    setActivePictureLesson(null);
    setPictureVocab([]);
    setPictureVocabIndex(0);
    setPictureTranscript("");
    setPictureMatchPercent(0);
    setPictureMatchedWords([]);
    setPictureMissedWords([]);
    setShowPictureHint(false);
    setPictureRecording(false);
    setPictureCheckingAnswer(false);
    setAiFeedback(null);
    setLoadingAiFeedback(false);
    setPictureFeedbackSteps([]);
    setPictureFeedbackIndex(0);
    setPictureScore(null);
    setPictureVocabStats(null);
    setChallengeRecording(false);
    setChallengeCompleted({});
    setChallengeResult({});
    setChallengeChecking(false);
    setAnalysisStep(0);
    if (analysisTimerRef.current) { clearInterval(analysisTimerRef.current); analysisTimerRef.current = null; }
    if (challengeRecorderRef.current) {
      try { challengeRecorderRef.current.stop(); } catch { }
      challengeRecorderRef.current = null;
    }
    if (challengeStreamRef.current) {
      challengeStreamRef.current.getTracks().forEach(t => t.stop());
      challengeStreamRef.current = null;
    }
    setPictureRecordingTime(0);
    if (pictureTimerRef.current) {
      clearInterval(pictureTimerRef.current);
      pictureTimerRef.current = null;
    }
  }

  // Challenge mic helpers — actually evaluate via Gemini
  const startChallengeRecording = async (stepIdx) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      challengeStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      challengeRecorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        // Convert to base64 and send to edge function
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result;
          setChallengeChecking(true);
          try {
            const step = pictureFeedbackSteps[stepIdx];
            const isSpeakChallenge = step.type === 'speak_challenge';
            const expectedText = step.type === 'correction_challenge'
              ? step.corrected
              : (step.prompt || step.hint || "");
            const { data, error } = await supabase.functions.invoke("speech-check", {
              body: {
                audioBase64: base64,
                exerciseType: isSpeakChallenge ? "speak-check" : "challenge-check",
                expectedText: expectedText
              }
            });
            if (!error && data) {
              const parsed = typeof data === "string" ? JSON.parse(data) : data;
              const pass = parsed?.pass === true;
              const feedback = parsed?.feedback || (pass ? "Good!" : "That wasn't quite right.");
              setChallengeResult(prev => ({
                ...prev,
                [stepIdx]: { good: pass, feedback }
              }));

              if (pass) {
                triggerSuccessFeedback();
                setChallengeCompleted(prev => ({ ...prev, [stepIdx]: true }));
              } else {
                triggerHaptic();
                // Don't mark as completed — allow retry
              }
            } else {
              // Network/edge error — be honest
              setChallengeResult(prev => ({ ...prev, [stepIdx]: { good: false, feedback: "Couldn't evaluate — please try again." } }));
            }
          } catch {
            setChallengeResult(prev => ({ ...prev, [stepIdx]: { good: false, feedback: "Couldn't evaluate — please try again." } }));
          }
          setChallengeChecking(false);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setChallengeRecording(true);

      // Auto-stop: 20s for speak_challenge, 10s for correction
      const step = pictureFeedbackSteps[stepIdx];
      const timeout = step?.type === 'speak_challenge' ? 30000 : 10000;
      setTimeout(() => {
        if (challengeRecorderRef.current?.state === 'recording') {
          stopChallengeRecording(stepIdx);
        }
      }, timeout);
    } catch (err) {
      console.error("Challenge mic error:", err);
      setChallengeCompleted(prev => ({ ...prev, [stepIdx]: true }));
      setChallengeResult(prev => ({ ...prev, [stepIdx]: { good: false, feedback: "Couldn't access mic." } }));
    }
  };

  const stopChallengeRecording = (stepIdx) => {
    if (challengeRecorderRef.current?.state === 'recording') {
      challengeRecorderRef.current.stop();
    }
    if (challengeStreamRef.current) {
      challengeStreamRef.current.getTracks().forEach(t => t.stop());
      challengeStreamRef.current = null;
    }
    challengeRecorderRef.current = null;
    setChallengeRecording(false);
  };

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
        .select("lesson_id, hearts_left, completed_at");

      if (error) {
        console.error("Error loading lesson progress:", error);
        setLessonProgress([]);
      } else {
        setLessonProgress(data || []);
      }

      // Load speaking lesson progress
      const { data: speakingData, error: speakingError } = await supabase
        .from("speaking_lesson_progress")
        .select("speaking_lesson_id, completed_at");

      if (speakingError) {
        console.error("Error loading speaking lesson progress:", speakingError);
        setSpeakingLessonProgress([]);
      } else {
        setSpeakingLessonProgress(speakingData || []);
      }
    }

    fetchProgress();
    loadTodayScenario();
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

      // Request microphone permission explicitly first
      try {
        const permResult = await navigator.permissions.query({ name: 'microphone' });
        if (permResult.state === 'denied') {
          setSpeechError("Microphone permission denied. Please enable it in your device settings.");
          return;
        }
      } catch (permErr) {
        // permissions.query may not be supported — continue anyway
        console.log('Permissions API not supported, will request via getUserMedia');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

      // Check if audio/webm is supported, fall back to default
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());

        const recordedMime = mediaRecorder.mimeType || 'audio/webm;codecs=opus';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedMime });

        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result;
          const base64Audio = base64String.split(',')[1];
          setRecordedAudio(base64Audio);
          console.log('Audio recorded (' + recordedMime + ' base64), length:', base64Audio.length);

          // For Speaking Practice mode, pass the current item's arabic_text
          const currentSpeakingItem = speakingLessonItems[currentSpeakingItemIndex];
          const expectedText = currentSpeakingItem?.arabic_text || null;
          const isSpeakingPractice = !!currentSpeakingItem;
          sendAudioToBackend(base64Audio, expectedText, isSpeakingPractice);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log('Recording started (' + (mimeType || 'default') + ')');

      if (practiceMode === 'speaking') {
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            stopRecording();
          }
        }, 10000);
      }
    } catch (err) {
      console.error("Start recording error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setSpeechError("Microphone access denied. Please allow microphone permission in your device settings.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setSpeechError("No microphone found on this device.");
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setSpeechError("Microphone is in use by another app. Please close it and try again.");
      } else {
        setSpeechError("Failed to start recording: " + (err.message || err));
      }
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
    if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      setSpeechError("Recording is too long. Please try a shorter recording.");
      setIsCheckingAnswer(false);
      return;
    }

    setSpeechFeedback(null); // Reset feedback
    setAiFeedback(null);
    setIsCheckingAnswer(true); // Show loading state

    try {
      // Use override if provided, otherwise fall back to speakingExercises
      const expectedText = expectedTextOverride ?? speakingExercises[0]?.prompt_ar ?? "";

      // Determine exercise type for merged transcription + feedback
      const currentSpeakingItem = speakingLessonItems[currentSpeakingItemIndex];
      const modeType = currentSpeakingModeType;
      let exType = "reading";
      if (modeType === "speaking_translate") exType = "translate";

      // Single call: transcribe audio + get AI feedback
      const { data, error } = await supabase.functions.invoke(
        "speech-check",
        {
          body: {
            audioBase64: audioBase64,
            exerciseType: exType,
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
          feedback = transcript ? "Good" : "Try again";
        } else if (score >= 0.55) feedback = "Good";
        else if (score >= 0.3) feedback = "Almost";
        else feedback = "Try again";

        setSpeechFeedback(feedback);
        setSpokenText(transcript); // Show what was transcribed

        // AI feedback already included in the response — no second call needed
        if (parsed?.overallScore !== undefined) {
          setAiFeedback({
            overallScore: parsed.overallScore,
            feedback: parsed.feedback,
            corrections: parsed.corrections || [],
            encouragement: parsed.encouragement,
            missedVocab: parsed.missedVocab || []
          });
          setLoadingAiFeedback(false);
        }

        setIsCheckingAnswer(false);

        // Play jingle sounds for speaking practice
        if (isSpeakingPractice) {
          if (feedback === "Good") {
            playSpeakingCorrectSound();
          } else {
            playSpeakingIncorrectSound();
          }
        }

        // Update speakingItemCorrect for Speaking Practice mode
        if (feedback === "Good") {
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
    setShowDialogueReview(false);
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

        // Load questions with options in batch
        const questionsWithOptions = await attachOptionsToQuestions(qData || []);

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
    setPracticeMode(null);
    setActiveTab("home");

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
    triggerHaptic();

    // Reset dialogue UI immediately
    if (activeLesson.lesson_format === "blocks") {
      setDialogueFinished(false);
      setShowDialogueReview(false);
      setRevealedCount(1); // show first line instantly
      setAutoFollow(true);
      setShowJumpToCurrent(false);
    }

    // Instant playback - with retry on failure
    audioRef.current.currentTime = 0;
    audioRef.current.play()
      .then(() => {
        setAudioPlaying(true);
        setAudioCompleted(false);
      })
      .catch((err) => {
        console.warn("Audio play failed, retrying after reload:", err);
        // Retry: reload the source and try again
        audioRef.current.src = activeLesson.audio_url;
        audioRef.current.load();
        audioRef.current.oncanplaythrough = () => {
          audioRef.current.oncanplaythrough = null;
          audioRef.current.play()
            .then(() => {
              setAudioPlaying(true);
              setAudioCompleted(false);
            })
            .catch((retryErr) => {
              console.error("Audio retry also failed:", retryErr);
            });
        };
      });
  }

  // Paragraph tap-to-play handler
  function handleParagraphClick(block) {
    if (!activeLesson?.audio_url || !audioRef.current) return;
    if (block.start_time_seconds == null) return;
    triggerHaptic();

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

    triggerHaptic(); // Add haptic feedback + sound on option selection
    setSelectedOptionId(option.id);
    setAnswerResult(null);
  }

  function handleConfirmAnswer() {
    if (!quizActive) return;
    if (quizFinished) return;
    if (selectedOptionId === null) return;

    triggerHaptic(); // Haptic feedback when confirming answer

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
          onClick={() => { triggerHaptic(); setShowProfileMenu(!showProfileMenu); }}
          aria-label="Profile menu"
        >
          <span className="profile-icon">👤</span>
        </button>

        {showProfileMenu && (
          <>
            <div
              className="profile-menu-backdrop"
              onClick={() => { triggerHaptic(); setShowProfileMenu(false); }}
            />
            <div className="profile-menu-dropdown">
              <button
                className="profile-menu-item"
                onClick={() => {
                  triggerHaptic();
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
          <div className="modal-overlay" onClick={() => { triggerHaptic(); setShowSignOutConfirm(false); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Sign out?</h3>
              <p style={{ color: "var(--text-light)", marginBottom: "1.5rem" }}>
                Are you sure you want to sign out?
              </p>
              <div className="modal-actions">
                <button
                  className="btn-outline"
                  onClick={() => { triggerHaptic(); setShowSignOutConfirm(false); }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    triggerHaptic();
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
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />

        <div className="w-full max-w-md z-10 space-y-8 animate-in fade-in zoom-in duration-500">
          {/* Logo & Header */}
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-24 h-24 bg-card rounded-[2rem] border border-border/50 shadow-xl flex items-center justify-center p-4 active:scale-95 transition-transform duration-300">
              <img
                src="/clemency-icon.png"
                alt="Ihya Institute Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h1 className="font-heading text-3xl font-bold tracking-tight">Ihya Arabic</h1>
              <p className="text-muted-foreground mt-2 text-sm font-medium tracking-wide">
                Start your journey towards mastering Arabic
              </p>
            </div>
          </div>

          {/* Auth Card */}
          <div className="bg-card/40 backdrop-blur-2xl border border-border/50 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary" />

            <div className="mb-8">
              <h2 className="font-heading text-xl font-bold">
                {authMode === "signin" ? "Welcome back" : "Join the adventure"}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                {authMode === "signin"
                  ? "Sign in to continue your progress"
                  : "Create an account to start learning"}
              </p>
            </div>

            <form
              onSubmit={authMode === "signin" ? handleSignIn : handleSignUp}
              className="space-y-5"
            >
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Icon icon="solar:letter-bold" className="text-xl" />
                  </div>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                    className="w-full bg-background/50 border border-border/50 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="explorer@arabic.id"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Icon icon="solar:lock-password-bold" className="text-xl" />
                  </div>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    className="w-full bg-background/50 border border-border/50 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {authError && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                  <Icon icon="solar:danger-bold" className="text-lg flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(224,159,62,0.3)] active:scale-[0.98] transition-all mt-4 text-sm uppercase tracking-wider"
              >
                {authMode === "signin" ? (
                  <>
                    <Icon icon="solar:login-bold" className="text-lg" />
                    Sign In
                  </>
                ) : (
                  <>
                    <Icon icon="solar:user-plus-bold" className="text-lg" />
                    Create Account
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border/30 text-center">
              <button
                type="button"
                className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2 mx-auto"
                onClick={() => {
                  triggerHaptic();
                  setAuthMode(authMode === "signin" ? "signup" : "signin");
                }}
              >
                {authMode === "signin"
                  ? "Don't have an account? Sign up"
                  : "Already a member? Sign in"}
                <Icon icon="solar:alt-arrow-right-bold" className="text-xs" />
              </button>
            </div>
          </div>

          {/* Features Row */}
          <div className="grid grid-cols-2 gap-3 pb-8">
            <div className="bg-card/30 backdrop-blur-md border border-border/30 rounded-2.5xl p-4 flex flex-col items-center text-center gap-2">
              <div className="bg-primary/20 w-8 h-8 rounded-lg flex items-center justify-center border border-primary/20">
                <Icon icon="solar:book-bookmark-bold" className="text-primary text-sm" />
              </div>
              <span className="text-[10px] font-bold text-muted-foreground tracking-tight uppercase">Dialogue Lessons</span>
            </div>
            <div className="bg-card/30 backdrop-blur-md border border-border/30 rounded-2.5xl p-4 flex flex-col items-center text-center gap-2">
              <div className="bg-secondary/20 w-8 h-8 rounded-lg flex items-center justify-center border border-secondary/20">
                <Icon icon="solar:medal-star-bold" className="text-secondary text-sm" />
              </div>
              <span className="text-[10px] font-bold text-muted-foreground tracking-tight uppercase">Track Progress</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- STREAKS PAGE ----------
  if (showStreaksPage) {
    // Generate last 30 days
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const daysInMonth = 30;
    const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (daysInMonth - 1 - i));
      return d;
    });

    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        {/* Header */}
        <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
          <button
            className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
            onClick={() => { triggerHaptic(); setShowStreaksPage(false); }}
          >
            <MdArrowBackIosNew className="text-foreground" />
          </button>
          <h1 className="font-heading text-lg font-bold">Streaks</h1>
          <div className="w-10" />
        </header>

        <main className="px-6 space-y-8 pb-12">
          {/* Hero */}
          <section className="flex flex-col items-center text-center py-6">
            <div className="relative mb-4">
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary/30">
                <Icon icon="solar:flame-bold" className="text-primary text-5xl" />
              </div>
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl -z-10" />
            </div>
            <h1 className="font-heading text-6xl font-bold text-primary">{currentStreak}</h1>
            <p className="font-heading text-xl font-bold mt-1">Day Streak!</p>
            <p className="text-sm text-muted-foreground mt-2">
              {currentStreak > 0 ? "You're on fire! Practice tomorrow to keep it going." : "Start a lesson today to begin your streak!"}
            </p>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-card rounded-3xl p-5 border border-border/50 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue/10 flex items-center justify-center">
                <Icon icon="solar:history-bold" className="text-blue text-2xl" />
              </div>
              <div>
                <span className="text-2xl font-bold">{longestStreak}</span>
                <p className="text-xs text-muted-foreground font-medium">Longest Streak</p>
              </div>
            </div>
            <div className="bg-card rounded-3xl p-5 border border-border/50 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-green/10 flex items-center justify-center">
                <Icon icon="solar:calendar-date-bold" className="text-green text-2xl" />
              </div>
              <div>
                <span className="text-2xl font-bold">{totalDays}</span>
                <p className="text-xs text-muted-foreground font-medium">Total Days</p>
              </div>
            </div>
          </section>

          {/* Calendar */}
          <section className="bg-card rounded-3xl p-6 border border-border/50">
            <h3 className="font-heading text-lg font-bold mb-4">Last 30 Days</h3>
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((d, i) => {
                const dateStr = d.toISOString().split('T')[0];
                const isToday = dateStr === todayStr;
                const isActive = activeDaysSet.has(dateStr);
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded-xl flex items-center justify-center text-xs font-bold transition-all ${isActive
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-muted/30 text-muted-foreground border border-border/30'
                      } ${isToday ? 'ring-2 ring-primary' : ''}`}
                  >
                    {isActive ? (
                      <Icon icon="solar:flame-bold" className="text-lg" />
                    ) : (
                      <span>{d.getDate()}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ---------- MAIN TAB-BASED HOME SCREEN ----------

  if (user && practiceMode === null && !activeLesson && !activeSpeakingLesson && !scenarioPhase) {

    // Helper: find next incomplete lesson
    const nextLesson = (() => {
      if (!allLessons || allLessons.length === 0) return null;
      for (const lesson of allLessons) {
        if (!isLessonCompleted(lesson.id)) return lesson;
      }
      return null;
    })();

    // Helper: find which stage the next lesson belongs to
    const nextLessonStage = nextLesson ? stages.find(s => s.id === nextLesson.stage_id) : null;

    // Completed lesson count
    const completedLessonCount = lessonProgress.length;

    return (
      <div className="min-h-screen bg-background text-foreground pb-40 font-sans selection:bg-primary/30">

        {/* ========== HOME TAB ========== */}
        {activeTab === "home" && (
          <>
            <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
              <div className="flex flex-col items-start">
                <p className="text-base font-medium text-muted-foreground font-arabic tracking-wide" dir="rtl">مرحباً</p>
                <h1 className="font-heading text-xl font-bold">{user.email?.split("@")[0] || "Explorer"}</h1>
              </div>
              <div
                className="flex items-center gap-2 bg-secondary/10 px-3 py-1.5 rounded-full border border-secondary/20 shadow-[0_0_12px_rgba(229,107,111,0.15)] cursor-pointer"
                onClick={() => { triggerHaptic(); setShowStreaksPage(true); }}
              >
                <Icon icon="solar:fire-bold" className="text-secondary text-lg" />
                <span className="text-secondary font-bold text-sm tracking-wide">{currentStreak}</span>
              </div>
            </header>

            <main className="px-6 space-y-8 mt-4">
              {/* Stats Grid */}
              <section className="grid grid-cols-2 gap-3">
                <div className="bg-card p-4 rounded-3xl flex flex-col items-center justify-center gap-1 border border-border/50 shadow-sm">
                  <Icon icon="solar:star-fall-bold" className="text-primary text-2xl mb-1" />
                  <span className="text-2xl font-heading font-bold">{stages.length > 0 ? `${stages.length}` : "—"}</span>
                  <span className="text-xs text-muted-foreground font-medium">Stages</span>
                </div>
                <div className="bg-card p-4 rounded-3xl flex flex-col items-center justify-center gap-1 border border-border/50 shadow-sm">
                  <Icon icon="solar:book-bookmark-bold" className="text-accent text-2xl mb-1" />
                  <span className="text-2xl font-heading font-bold">{completedLessonCount}/{allLessons.length}</span>
                  <span className="text-xs text-muted-foreground font-medium text-center">Lessons Completed</span>
                </div>
              </section>

              {/* Up Next Card */}
              {nextLesson && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-heading text-xl font-bold">Up Next</h2>
                  </div>
                  <div className="group relative overflow-hidden rounded-[2rem] bg-card border border-border/50 shadow-lg">
                    {nextLesson.cover_image_url && (
                      <div className="absolute inset-0 z-0">
                        <img src={nextLesson.cover_image_url} alt="Lesson Cover" className="w-full h-full object-cover opacity-40 mix-blend-overlay" />
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                      </div>
                    )}
                    <div className="relative z-10 p-6 flex flex-col h-full justify-end min-h-[180px]">
                      {nextLessonStage && (
                        <div className="flex items-center gap-2 mb-3">
                          <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border border-primary/20">
                            {nextLessonStage.title}
                          </span>
                        </div>
                      )}
                      <h3 className="font-heading text-2xl font-bold mb-1">{nextLesson.title}</h3>
                      <p className="text-muted-foreground text-sm mb-6">
                        {nextLesson.format === "dialogue" ? "Interactive dialogue lesson" : "Reading comprehension lesson"}
                      </p>
                      <button
                        className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(224,159,62,0.3)] active:scale-[0.98] transition-all"
                        onClick={() => { triggerHaptic(); setPracticeMode("book"); openLesson(nextLesson); }}
                      >
                        <Icon icon="solar:play-circle-bold" className="text-xl" />
                        Continue Learning
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* Word of the Day */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-heading text-xl font-bold">Word of the Day</h2>
                  <button
                    className="text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => { triggerHaptic(); setPracticeMode("wotd"); loadWordOfTheDay(); }}
                  >
                    <Icon icon="solar:arrow-right-bold" className="text-xl" />
                  </button>
                </div>
                <div
                  className="bg-card rounded-[2rem] p-6 border border-border/50 shadow-md relative overflow-hidden flex flex-col cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => { triggerHaptic(); setPracticeMode("wotd"); loadWordOfTheDay(); }}
                >
                  <div className="absolute top-0 right-0 w-2 h-full bg-primary rounded-r-3xl" />
                  <div dir="rtl" className="text-right mb-4">
                    <h3 className="font-heading text-5xl text-primary leading-tight font-medium" style={{ fontFamily: "'Noto Naskh Arabic', serif" }}>
                      كلمة
                    </h3>
                    <p className="text-muted-foreground text-sm mt-2 font-medium" dir="ltr">kalima</p>
                  </div>
                  <div className="h-px bg-border/50 w-full my-4" />
                  <div>
                    <p className="text-lg font-bold mb-1">Word</p>
                    <p className="text-sm text-muted-foreground italic">noun — Tap to explore today's word</p>
                  </div>
                </div>
              </section>

              {/* Daily Goal */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-heading text-xl font-bold">Daily Goal</h2>
                  <button
                    className="text-primary text-xs font-bold uppercase tracking-widest"
                    onClick={() => { triggerHaptic(); setShowGoalPicker(!showGoalPicker); }}
                  >
                    {showGoalPicker ? "Done" : "Edit"}
                  </button>
                </div>

                {showGoalPicker ? (
                  <div className="bg-card rounded-3xl p-6 border border-border/50 space-y-4">
                    <p className="text-sm text-muted-foreground font-medium">Choose your daily goal:</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[5, 10, 15, 20, 30].map(mins => (
                        <button
                          key={mins}
                          className={`py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 ${dailyGoalMinutes === mins
                            ? 'bg-primary text-white border-2 border-primary shadow-[0_2px_12px_rgba(224,159,62,0.3)]'
                            : 'bg-muted/30 text-muted-foreground border border-border/50'
                            }`}
                          onClick={() => {
                            triggerHaptic();
                            setDailyGoalMinutes(mins);
                            const today = new Date().toISOString().slice(0, 10);
                            supabase.from('user_daily_stats').update({ daily_goal_minutes: mins })
                              .eq('user_id', user.id).eq('date', today)
                              .then(({ error }) => { if (error) console.error('Error updating daily goal in DB', error) });
                          }}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (() => {
                  // Use tracked time spent on app today
                  const minutesSpent = Math.floor(dailySecondsSpent / 60);
                  const progress = Math.min(minutesSpent / dailyGoalMinutes, 1);
                  const circumference = 2 * Math.PI * 44;
                  const dashOffset = circumference - (progress * circumference);
                  const remaining = Math.max(0, dailyGoalMinutes - minutesSpent);

                  return (
                    <div className="bg-card rounded-3xl p-6 border border-border/50 flex items-center gap-6">
                      {/* Circular Progress */}
                      <div className="relative flex-shrink-0">
                        <svg width="96" height="96" viewBox="0 0 100 100" className="-rotate-90">
                          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--muted)" strokeWidth="6" />
                          <circle
                            cx="50" cy="50" r="44" fill="none"
                            stroke={progress >= 1 ? "var(--green)" : "var(--primary)"}
                            strokeWidth="6" strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          {progress >= 1 ? (
                            <Icon icon="solar:check-circle-bold" className="text-green text-3xl" />
                          ) : (
                            <>
                              <span className="text-xl font-bold">{minutesSpent}</span>
                              <span className="text-[10px] text-muted-foreground font-medium">/ {dailyGoalMinutes}m</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Text */}
                      <div className="flex-1">
                        <h3 className="font-heading font-bold text-lg mb-1">
                          {progress >= 1 ? "Goal Complete! 🎉" : `${Math.round(progress * 100)}% done`}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {progress >= 1
                            ? "Amazing work today! Keep the momentum going."
                            : `${remaining} min${remaining === 1 ? '' : 's'} left to reach your goal.`
                          }
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </section>

              {/* Daily Scenario */}
              {scenarioData && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-heading text-xl font-bold">Daily Scenario</h2>
                    {scenarioCompleted && (
                      <span className="text-xs font-bold text-green-500 bg-green-500/10 px-3 py-1 rounded-full">✓ Done</span>
                    )}
                  </div>
                  <div
                    className="bg-card rounded-[2rem] p-6 border border-border/50 shadow-md relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => {
                      triggerHaptic();
                      if (scenarioCompleted) {
                        // Show "come back tomorrow" toast
                        setSpeechError("Come back tomorrow for a new scenario! 🌙");
                        setTimeout(() => setSpeechError(""), 3000);
                        return;
                      }
                      setScenarioPhase(true);
                    }}
                  >
                    <div className="absolute top-0 left-0 w-2 h-full rounded-l-3xl" style={{ background: 'linear-gradient(to bottom, #8b5cf6, #6366f1)' }} />
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">{scenarioData.emoji}</div>
                      <div className="flex-1">
                        <h3 className="font-heading font-bold text-lg mb-0.5">{scenarioData.title}</h3>
                        <p dir="rtl" className="text-muted-foreground text-sm" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{scenarioData.titleAr}</p>
                      </div>
                      <div className="text-muted-foreground">
                        {scenarioCompleted
                          ? <Icon icon="solar:check-circle-bold" className="text-green-500 text-2xl" />
                          : <Icon icon="solar:chat-round-dots-bold" className="text-violet-500 text-2xl" />
                        }
                      </div>
                    </div>
                    {!scenarioCompleted && (
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <p className="text-xs text-muted-foreground">🎭 Practice Arabic in a real-life conversation</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Quick Actions */}
              <section className="grid grid-cols-2 gap-4">
                <button
                  className="bg-card p-5 rounded-[2rem] border border-border/50 shadow-sm flex flex-col items-start gap-4 active:scale-95 transition-transform text-left"
                  onClick={() => { triggerHaptic(); setActiveTab("speaking"); loadSpeakingModes(); }}
                >
                  <div className="bg-chart-4/10 p-3 rounded-2xl border border-chart-4/20">
                    <Icon icon="solar:microphone-3-bold" className="text-chart-4 text-2xl" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base mb-1">Speaking</h3>
                    <p className="text-xs text-muted-foreground">Practice pronunciation</p>
                  </div>
                </button>
                <button
                  className="bg-card p-5 rounded-[2rem] border border-border/50 shadow-sm flex flex-col items-start gap-4 active:scale-95 transition-transform text-left"
                  onClick={() => { triggerHaptic(); setPracticeMode("picture-describe"); loadPictureDescribeLessons(); }}
                >
                  <div className="bg-chart-2/10 p-3 rounded-2xl border border-chart-2/20">
                    <Icon icon="solar:gallery-bold" className="text-chart-2 text-2xl" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base mb-1">Visuals</h3>
                    <p className="text-xs text-muted-foreground">Describe pictures</p>
                  </div>
                </button>
              </section>
            </main>
          </>
        )}

        {/* ========== COURSES TAB ========== */}
        {activeTab === "courses" && (
          <>
            <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-xl border border-primary/30">
                  <Icon icon="solar:book-bookmark-bold" className="text-primary text-2xl" />
                </div>
                <h1 className="font-heading text-xl font-bold">Your Courses</h1>
              </div>
              {/* Current stage badge */}
              {(() => {
                const activeStage = stages.find(s => {
                  const p = getStageProgress(s.id);
                  return p.completed < p.total;
                });
                if (!activeStage) return null;
                const idx = stages.indexOf(activeStage) + 1;
                return (
                  <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full border border-border/50">
                    <Icon icon="solar:star-bold" className="text-primary text-sm" />
                    <span className="text-xs font-bold tracking-tight">Stage {idx}</span>
                  </div>
                );
              })()}
            </header>
            <main className="px-6 space-y-8">
              {loadingStages ? (
                <div className="flex justify-center py-16">
                  <Leapfrog size="40" speed="2.5" color="var(--primary)" />
                </div>
              ) : (
                stages.map((stage, stageIndex) => {
                  const progress = getStageProgress(stage.id);
                  const isCompleted = progress.completed === progress.total && progress.total > 0;
                  const isActive = progress.completed < progress.total && (stageIndex === 0 || (() => {
                    const prevProgress = getStageProgress(stages[stageIndex - 1].id);
                    return prevProgress.completed === prevProgress.total && prevProgress.total > 0;
                  })());
                  const isLocked = !isCompleted && !isActive;
                  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

                  // Get lessons for this stage
                  const stageLessons = allLessons.filter(l => l.stage_id === stage.id);

                  // Fallback cover images for stages without a database image
                  const stageCoverFallbacks = ['/stage-cover-1.png', '/stage-cover-2.png', '/stage-cover-3.png'];
                  const stageCoverImage = stage.cover_image_url || stageCoverFallbacks[stageIndex] || stageCoverFallbacks[0];

                  return (
                    <section key={stage.id} className="space-y-4">
                      <div
                        className={`relative overflow-hidden rounded-[2rem] border shadow-md group active:scale-[0.98] transition-all cursor-pointer ${isActive
                          ? 'border-2 border-primary/50 shadow-[0_0_24px_rgba(224,159,62,0.15)]'
                          : isLocked
                            ? 'border-border/50 opacity-70 grayscale-[30%]'
                            : expandedStageId === stage.id
                              ? 'border-2 border-primary/30'
                              : 'border-border/50'
                          }`}
                        onClick={() => { triggerHaptic(); setExpandedStageId(expandedStageId === stage.id ? null : stage.id); }}
                      >
                        <div className="h-32 w-full overflow-hidden">
                          <img src={stageCoverImage} alt={stage.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                        </div>
                        <div className="p-6 bg-card relative">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              {isActive && (
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-primary/20">Active</span>
                                </div>
                              )}
                              <h3 className="font-heading text-xl font-bold">{stage.title}</h3>
                              {stage.description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{stage.description}</p>}
                            </div>
                            {isCompleted && (
                              <div className="bg-green-500/20 text-green-500 p-2 rounded-full border border-green-500/20">
                                <Icon icon="solar:check-circle-bold" className="text-xl" />
                              </div>
                            )}
                            {isLocked && (
                              <div className="bg-muted p-2 rounded-full border border-border">
                                <Icon icon="solar:lock-password-bold" className="text-xl text-muted-foreground" />
                              </div>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="mt-6 flex items-center gap-3">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isCompleted ? 'bg-green-500' : isLocked ? 'bg-primary/20' : 'bg-primary'}`}
                                style={{ width: `${progressPercent}%`, boxShadow: isActive ? '0 0 8px rgba(224,159,62,0.5)' : 'none' }}
                              />
                            </div>
                            <span className={`text-xs font-bold uppercase ${isCompleted ? 'text-green-500' : isLocked ? 'text-muted-foreground' : 'text-primary'}`}>
                              {isCompleted ? 'Completed' : isLocked ? 'Locked' : `${progressPercent}%`}
                            </span>
                          </div>

                          {/* Lesson list — shown for active stage or any expanded stage */}
                          {(isActive || expandedStageId === stage.id) && stageLessons.length > 0 && (
                            <div className="mt-6 space-y-4">
                              <div className="space-y-3 pt-4 border-t border-border/50">
                                {stageLessons.map((lesson) => {
                                  const completed = isLessonCompleted(lesson.id);
                                  const isNext = nextLesson && nextLesson.id === lesson.id;
                                  const locked = !completed && !isNext;
                                  return (
                                    <div
                                      key={lesson.id}
                                      className={`flex items-center justify-between p-4 bg-muted/30 rounded-2xl border cursor-pointer active:scale-[0.97] transition-all ${isNext
                                        ? 'border-border/30 ring-1 ring-primary/30'
                                        : locked
                                          ? 'border-border/30 opacity-60'
                                          : 'border-border/30'
                                        }`}
                                      onClick={(e) => { e.stopPropagation(); triggerHaptic(); setPracticeMode("book"); openLesson(lesson); }}
                                    >
                                      <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${completed
                                          ? 'bg-green-500/10 border border-green-500/20 text-green-500'
                                          : isNext
                                            ? 'bg-primary/10 border border-primary/20 text-primary'
                                            : 'bg-muted border border-border text-muted-foreground'
                                          }`}>
                                          <Icon icon={completed ? "solar:check-circle-bold" : isNext ? "solar:play-circle-bold" : "solar:lock-password-bold"} className="text-xl" />
                                        </div>
                                        <div>
                                          <h4 className={`text-sm font-bold ${locked ? 'text-muted-foreground' : ''}`}>{lesson.title}</h4>
                                          <p className={`text-[10px] font-medium uppercase tracking-tight ${isNext ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                                            {lesson.format}{isNext ? ' • Next' : ''}
                                          </p>
                                        </div>
                                      </div>
                                      <Icon icon="solar:alt-arrow-right-linear" className={completed ? "text-muted-foreground" : isNext ? "text-primary" : "text-muted-foreground/30"} />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })
              )}
            </main>
          </>
        )}

        {/* ========== SPEAKING TAB ========== */}
        {activeTab === "speaking" && (
          <>
            <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="bg-chart-4/20 p-2 rounded-xl border border-chart-4/30">
                  <Icon icon="solar:microphone-3-bold" className="text-chart-4 text-2xl" />
                </div>
                <h1 className="font-heading text-xl font-bold">Speaking Lab</h1>
              </div>
              <div className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center">
                <Icon icon="solar:tuning-square-bold" className="text-muted-foreground" />
              </div>
            </header>
            <main className="px-6 space-y-8">
              {/* Hero banner */}
              <section>
                <div className="bg-gradient-to-br from-chart-4/20 to-transparent p-6 rounded-[2rem] border border-chart-4/20">
                  <h2 className="font-heading text-lg font-bold mb-2">Refine your accent</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Practice your pronunciation with AI feedback powered by Gemini.
                  </p>
                </div>
              </section>

              {/* Practice Modes */}
              <section className="space-y-6">
                <h2 className="font-heading text-xl font-bold px-1 mb-2">Practice Modes</h2>
                <div className="space-y-8">

                  {/* Repeat After Me — course-style card */}
                  <section className="space-y-4">
                    <div
                      className={`relative overflow-hidden rounded-[2rem] border shadow-md group active:scale-[0.98] transition-all cursor-pointer ${expandedSpeakingCard === 'repeat'
                        ? 'border-2 border-chart-4/40'
                        : 'border-border/50'
                        }`}
                      onClick={async () => {
                        triggerHaptic();
                        if (expandedSpeakingCard === 'repeat') {
                          setExpandedSpeakingCard(null);
                          setSpeakingLessons([]);
                          setSelectedSpeakingMode(null);
                          return;
                        }
                        setExpandedSpeakingCard('repeat');
                        if (speakingModes.length === 0) await loadSpeakingModes();
                        const modes = speakingModes.length > 0 ? speakingModes : (await supabase.from("speaking_modes").select("*")).data || [];
                        const repeatMode = modes.find(m => m.name?.toLowerCase().includes('read')) || modes[0];
                        if (repeatMode) loadSpeakingLessons(repeatMode.id);
                      }}
                    >
                      <div className="h-32 w-full overflow-hidden">
                        <img src="/speaking-repeat-cover.png" alt="Repeat After Me" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                      </div>
                      <div className="p-6 bg-card relative">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-heading text-xl font-bold">Repeat After Me</h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Listen to native speakers and match their rhythm and tone.</p>
                          </div>
                          <div className={`bg-chart-4/20 p-2 rounded-full border border-chart-4/20 transition-transform ${expandedSpeakingCard === 'repeat' ? 'rotate-180' : ''}`}>
                            <Icon icon="solar:alt-arrow-down-bold" className="text-chart-4" />
                          </div>
                        </div>

                        {/* Expanded lesson list */}
                        {expandedSpeakingCard === 'repeat' && (
                          <div className="mt-6 space-y-4">
                            <div className="space-y-3 pt-4 border-t border-border/50">
                              {loadingSpeakingLessons ? (
                                <div className="flex justify-center py-4"><Leapfrog size="30" speed="2.5" color="var(--chart-4)" /></div>
                              ) : speakingLessons.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-3">No lessons found</p>
                              ) : speakingLessons.map((lesson) => {
                                const completed = isSpeakingLessonCompleted(lesson.id);
                                return (
                                  <div
                                    key={lesson.id}
                                    className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/30 cursor-pointer active:scale-[0.97] transition-all"
                                    onClick={(e) => { e.stopPropagation(); triggerHaptic(); openSpeakingLesson(lesson); }}
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${completed
                                        ? 'bg-green-500/10 border border-green-500/20 text-green-500'
                                        : 'bg-chart-4/10 border border-chart-4/20 text-chart-4'
                                        }`}>
                                        <Icon icon={completed ? "solar:check-circle-bold" : "solar:microphone-3-bold"} className="text-xl" />
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-bold">{lesson.title}</h4>
                                        {lesson.prompt_text && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{lesson.prompt_text}</p>}
                                      </div>
                                    </div>
                                    <Icon icon="solar:alt-arrow-right-linear" className={completed ? "text-muted-foreground" : "text-chart-4"} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Translate & Speak — course-style card */}
                  <section className="space-y-4">
                    <div
                      className={`relative overflow-hidden rounded-[2rem] border shadow-md group active:scale-[0.98] transition-all cursor-pointer ${expandedSpeakingCard === 'translate'
                        ? 'border-2 border-chart-3/40'
                        : 'border-border/50'
                        }`}
                      onClick={async () => {
                        triggerHaptic();
                        if (expandedSpeakingCard === 'translate') {
                          setExpandedSpeakingCard(null);
                          setSpeakingLessons([]);
                          setSelectedSpeakingMode(null);
                          return;
                        }
                        setExpandedSpeakingCard('translate');
                        if (speakingModes.length === 0) await loadSpeakingModes();
                        const modes = speakingModes.length > 0 ? speakingModes : (await supabase.from("speaking_modes").select("*")).data || [];
                        const translateMode = modes.find(m => m.name?.toLowerCase().includes('translat')) || modes[1] || modes[0];
                        if (translateMode) loadSpeakingLessons(translateMode.id);
                      }}
                    >
                      <div className="h-32 w-full overflow-hidden">
                        <img src="/speaking-translate-cover.png" alt="Translate & Speak" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                      </div>
                      <div className="p-6 bg-card relative">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-heading text-xl font-bold">Translate & Speak</h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Translate the English phrase into Arabic and speak it out loud.</p>
                          </div>
                          <div className={`bg-chart-3/20 p-2 rounded-full border border-chart-3/20 transition-transform ${expandedSpeakingCard === 'translate' ? 'rotate-180' : ''}`}>
                            <Icon icon="solar:alt-arrow-down-bold" className="text-chart-3" />
                          </div>
                        </div>

                        {expandedSpeakingCard === 'translate' && (
                          <div className="mt-6 space-y-4">
                            <div className="space-y-3 pt-4 border-t border-border/50">
                              {loadingSpeakingLessons ? (
                                <div className="flex justify-center py-4"><Leapfrog size="30" speed="2.5" color="var(--chart-3)" /></div>
                              ) : speakingLessons.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-3">No lessons found</p>
                              ) : speakingLessons.map((lesson) => {
                                const completed = isSpeakingLessonCompleted(lesson.id);
                                return (
                                  <div
                                    key={lesson.id}
                                    className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/30 cursor-pointer active:scale-[0.97] transition-all"
                                    onClick={(e) => { e.stopPropagation(); triggerHaptic(); openSpeakingLesson(lesson); }}
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${completed
                                        ? 'bg-green-500/10 border border-green-500/20 text-green-500'
                                        : 'bg-chart-3/10 border border-chart-3/20 text-chart-3'
                                        }`}>
                                        <Icon icon={completed ? "solar:check-circle-bold" : "solar:microphone-3-bold"} className="text-xl" />
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-bold">{lesson.title}</h4>
                                        {lesson.prompt_text && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{lesson.prompt_text}</p>}
                                      </div>
                                    </div>
                                    <Icon icon="solar:alt-arrow-right-linear" className={completed ? "text-muted-foreground" : "text-chart-3"} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Picture Describe — course-style card, navigates to its own page */}
                  <section className="space-y-4">
                    <div
                      className="relative overflow-hidden rounded-[2rem] border border-border/50 shadow-md group active:scale-[0.98] transition-all cursor-pointer"
                      onClick={() => { triggerHaptic(); setPracticeMode("picture-describe"); loadPictureDescribeLessons(); }}
                    >
                      <div className="h-32 w-full overflow-hidden">
                        <img src="/speaking-picture-cover.png" alt="Picture Describe" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                      </div>
                      <div className="p-6 bg-card relative">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-heading text-xl font-bold">Picture Describe</h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Look at images and describe them in Arabic.</p>
                          </div>
                          <div className="bg-primary/20 p-2 rounded-full border border-primary/20">
                            <Icon icon="solar:alt-arrow-right-bold" className="text-primary" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </section>
            </main>
          </>
        )}

        {/* ========== PROFILE TAB ========== */}
        {activeTab === "profile" && (
          <>
            <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-xl border border-border">
                  <Icon icon="solar:user-circle-bold" className="text-foreground text-2xl" />
                </div>
                <h1 className="font-heading text-xl font-bold">Profile</h1>
              </div>
            </header>
            <main className="px-6 space-y-8">
              {/* Profile Card */}
              <section>
                <div className="bg-card rounded-[2rem] p-6 border border-border/50 shadow-md flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-full bg-muted border-2 border-border flex items-center justify-center mb-4">
                    <Icon icon="solar:user-circle-bold" className="text-muted-foreground text-5xl" />
                  </div>
                  <h2 className="font-heading text-xl font-bold">{user.email?.split("@")[0] || "Student"}</h2>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </section>

              {/* Stats */}
              <section className="grid grid-cols-2 gap-4">
                <div className="bg-card p-5 rounded-[2rem] border border-border/50 flex flex-col items-center gap-2">
                  <Icon icon="solar:book-bookmark-bold" className="text-primary text-2xl" />
                  <span className="text-2xl font-heading font-bold">{completedLessonCount}/{allLessons.length}</span>
                  <span className="text-xs text-muted-foreground font-medium text-center">Lessons completed</span>
                </div>
                <div
                  className="bg-card p-5 rounded-[2rem] border border-border/50 flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform"
                  onClick={() => { triggerHaptic(); setShowStreaksPage(true); }}
                >
                  <Icon icon="solar:fire-bold" className="text-secondary text-2xl" />
                  <span className="text-2xl font-heading font-bold">{currentStreak}</span>
                  <span className="text-xs text-muted-foreground font-medium text-center">Day Streak</span>
                </div>
              </section>

              {/* Actions */}
              <section className="space-y-3">
                <button
                  className="w-full bg-card p-4 rounded-2xl border border-border/50 flex items-center gap-4 text-left active:scale-[0.98] transition-all"
                  onClick={() => { triggerHaptic(); setShowStreaksPage(true); }}
                >
                  <Icon icon="solar:fire-bold" className="text-secondary text-xl" />
                  <span className="font-medium text-sm">View Streaks Calendar</span>
                  <Icon icon="solar:alt-arrow-right-linear" className="text-muted-foreground ml-auto" />
                </button>
                <button
                  className="w-full bg-destructive/10 p-4 rounded-2xl border border-destructive/20 flex items-center gap-4 text-left active:scale-[0.98] transition-all"
                  onClick={() => { triggerHaptic(); setShowSignOutConfirm(true); }}
                >
                  <Icon icon="solar:logout-3-bold" className="text-destructive text-xl" />
                  <span className="font-medium text-sm text-destructive">Sign Out</span>
                </button>
              </section>
            </main>
          </>
        )}

        {/* ========== BOTTOM TAB BAR ========== */}
        <nav className="fixed left-6 right-6 z-50" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
          <div className="bg-background/80 backdrop-blur-2xl border border-border/50 rounded-full px-6 py-4 flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <button
              className={`flex flex-col items-center gap-1 w-16 ${activeTab === "home" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); setActiveTab("home"); }}
            >
              <Icon icon={activeTab === "home" ? "solar:home-2-bold" : "solar:home-2-linear"} className="text-2xl" />
              <span className={`text-[10px] ${activeTab === "home" ? "font-bold" : "font-medium"}`}>Home</span>
            </button>
            <button
              className={`flex flex-col items-center gap-1 w-16 ${activeTab === "courses" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); setActiveTab("courses"); }}
            >
              <Icon icon={activeTab === "courses" ? "solar:book-bookmark-bold" : "solar:book-bookmark-linear"} className="text-2xl" />
              <span className={`text-[10px] ${activeTab === "courses" ? "font-bold" : "font-medium"}`}>Courses</span>
            </button>
            <button
              className={`flex flex-col items-center gap-1 w-16 ${activeTab === "speaking" ? "text-chart-4" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); setActiveTab("speaking"); loadSpeakingModes(); }}
            >
              <Icon icon={activeTab === "speaking" ? "solar:microphone-3-bold" : "solar:microphone-3-linear"} className="text-2xl" />
              <span className={`text-[10px] ${activeTab === "speaking" ? "font-bold" : "font-medium"}`}>Speaking</span>
            </button>
            <button
              className={`flex flex-col items-center gap-1 w-16 ${activeTab === "profile" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); setActiveTab("profile"); }}
            >
              <Icon icon={activeTab === "profile" ? "solar:user-circle-bold" : "solar:user-circle-linear"} className="text-2xl" />
              <span className={`text-[10px] ${activeTab === "profile" ? "font-bold" : "font-medium"}`}>Profile</span>
            </button>
          </div>
        </nav>

        {/* Sign Out Confirmation Modal */}
        {showSignOutConfirm && (
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => { triggerHaptic(); setShowSignOutConfirm(false); }}>
            <div className="bg-card rounded-3xl p-6 max-w-sm w-full border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading text-lg font-bold mb-2">Sign out?</h3>
              <p className="text-sm text-muted-foreground mb-6">Are you sure you want to sign out?</p>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 rounded-xl border border-border font-bold text-sm text-foreground bg-muted active:scale-[0.97] transition-all"
                  onClick={() => { triggerHaptic(); setShowSignOutConfirm(false); }}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-destructive active:scale-[0.97] transition-all"
                  onClick={() => { setShowSignOutConfirm(false); handleSignOut(); }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Transition Overlay */}
        {transitioning && (
          <div className="transition-overlay">
            <div className="transition-card">
              <Leapfrog size="40" speed="2.5" color="var(--primary)" />
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
                onClick={() => { triggerHaptic(); backToSpeakingLessons(); }}
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
                <div style={{ padding: '0 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '1.5rem' }}>
                    Speak this phrase:
                  </p>
                  <h2 className="quiz-question" dir="rtl" style={{ fontSize: '2rem', lineHeight: 1.8, marginBottom: '1.5rem', fontWeight: 800 }}>
                    {currentItem.arabic_text}
                  </h2>
                  <p style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem', fontWeight: 600 }}>
                    {currentItem.english_text}
                  </p>
                </div>
              )}

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
                  background: 'var(--card)',
                  border: `1px solid ${speechFeedback.includes('Good') ? 'rgba(34, 197, 94, 0.5)'
                    : speechFeedback.includes('Almost') ? 'rgba(251, 191, 36, 0.5)'
                      : 'rgba(239, 68, 68, 0.5)'
                    }`,
                  boxShadow: 'var(--shadow-soft)'
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

                  {/* Show "You said" format for both modes */}
                  <div style={{ marginTop: 16, textAlign: 'left' }}>
                    {spokenText && (
                      <div style={{
                        marginBottom: 12,
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)'
                      }}>
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-light)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          display: 'block',
                          marginBottom: '8px',
                          fontFamily: 'var(--font-sans)',
                          textAlign: 'left'
                        }}>
                          You said:
                        </span>
                        <div dir="rtl" style={{
                          fontSize: '1.2rem',
                          color: 'var(--text-primary)',
                          lineHeight: 1.5,
                          textAlign: 'right'
                        }}>
                          {spokenText}
                        </div>
                      </div>
                    )}
                    {currentSpeakingModeType === 'speaking_translate' && (
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
                          marginBottom: '8px',
                          textAlign: 'left'
                        }}>
                          Expected:
                        </span>
                        <div dir="rtl" style={{
                          fontSize: '1.2rem',
                          fontWeight: 600,
                          color: 'var(--purple)',
                          lineHeight: 1.5,
                          textAlign: 'right'
                        }}>
                          {currentItem.arabic_text}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* AI Feedback Card for Speaking Practice */}
              {loadingAiFeedback && (
                <div className="ai-feedback-card ai-feedback-loading" style={{ marginTop: '1rem' }}>
                  <div className="ai-feedback-header">
                    <span>AI is analyzing your answer...</span>
                  </div>
                  <Leapfrog size="24" speed="2.5" color="#f59e0b" />
                </div>
              )}
              {aiFeedback && !loadingAiFeedback && (
                <div className="ai-feedback-card" style={{ marginTop: '1rem' }}>
                  <div className="ai-feedback-header">
                    <span className="ai-feedback-label">AI Tutor Feedback</span>
                  </div>
                  {aiFeedback.feedback && (
                    <p className="ai-feedback-text">{aiFeedback.feedback}</p>
                  )}
                  {aiFeedback.corrections?.length > 0 && (
                    <div className="ai-feedback-corrections">
                      {aiFeedback.corrections.map((c, i) => (
                        <div key={i} className="ai-correction-item">
                          <div className="ai-correction-row">
                            <span className="ai-correction-label">You said:</span>
                            <span className="ai-correction-arabic">{c.said}</span>
                          </div>
                          <div className="ai-correction-row">
                            <span className="ai-correction-label better-label">Better:</span>
                            <span className="ai-correction-arabic">{c.better}</span>
                          </div>
                          {c.explanation && (
                            <p className="ai-correction-explanation">{c.explanation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {aiFeedback.encouragement && (
                    <p className="ai-feedback-encouragement">{aiFeedback.encouragement}</p>
                  )}
                </div>
              )}

              {/* Pad Bottom Space */}
              <div style={{ height: '140px' }} />

              {/* Fixed Bottom UI */}
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '1rem', paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 1rem)', background: 'var(--card)', borderTop: '1px solid var(--border)', zIndex: 10 }}>
                {isCheckingAnswer ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '56px' }}>
                    <div className="checking-answer-pulse" style={{ marginBottom: '8px' }}></div>
                    <p className="checking-answer-text" style={{ margin: 0 }}>Checking<span className="checking-dots"></span></p>
                  </div>
                ) : isRecording ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div onClick={() => { triggerHaptic(); stopRecording(); }} style={{ cursor: 'pointer' }}>
                      <DotLottieReact src="/animations/Audio wave micro interaction.json" loop autoplay style={{ width: '80px', height: '80px', margin: '-10px' }} />
                    </div>
                    <p style={{ color: 'var(--red)', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Tap to stop</p>
                  </div>
                ) : speakingItemCorrect ? (
                  <button
                    className="btn-primary"
                    style={{ width: '100%', padding: '1rem', height: '56px', fontSize: '1.1rem' }}
                    onClick={() => {
                      triggerHaptic();
                      if (isLastItem) {
                        setSpeakingLessonComplete(true);
                        playCelebrationSound();
                        saveSpeakingLessonProgress(activeSpeakingLesson.id);
                      } else {
                        setCurrentSpeakingItemIndex(i => i + 1);
                        setSpeakingItemCorrect(false);
                        setSpeechFeedback(null);
                        setSpokenText("");
                        setAiFeedback(null);
                      }
                    }}
                  >
                    {isLastItem ? "Finish" : "Continue"}
                  </button>
                ) : speechFeedback ? (
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      className="btn-outline"
                      style={{ flex: 1, padding: '1rem', height: '56px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => { triggerHaptic(); setSpeechFeedback(null); setSpokenText(""); setAiFeedback(null); }}
                    >
                      Retry
                    </button>
                    <button
                      className="btn-primary"
                      style={{ flex: 1, padding: '1rem', height: '56px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => {
                        triggerHaptic();
                        if (isLastItem) {
                          setSpeakingLessonComplete(true);
                          playCelebrationSound();
                          saveSpeakingLessonProgress(activeSpeakingLesson.id);
                        } else {
                          setCurrentSpeakingItemIndex(i => i + 1);
                          setSpeakingItemCorrect(false);
                          setSpeechFeedback(null);
                          setSpokenText("");
                          setAiFeedback(null);
                        }
                      }}
                    >
                      Skip
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      className="btn-outline"
                      style={{ flex: 1, padding: '1rem', height: '56px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={() => { triggerHaptic(); /* Logic for hearing audio later */ }}
                    >
                      <Icon icon="solar:volume-loud-bold" /> Hear
                    </button>
                    <button
                      className="btn-primary"
                      style={{ flex: 1, padding: '1rem', height: '56px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={() => { triggerHaptic(); setSpeechFeedback(null); setSpeakingItemCorrect(false); setAiFeedback(null); startRecording(); }}
                    >
                      <Icon icon="solar:microphone-3-bold" /> Record
                    </button>
                  </div>
                )}
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
      <div className="explorer-shell">
        <div className="texture-overlay" />
        <main className="explorer-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div className="explorer-loading">
            <Leapfrog size="50" speed="2.5" color="var(--secondary)" />
            <p>Loading lesson...</p>
          </div>
        </main>
      </div>
    );
  }

  // ---------- SCENARIO CHAT SCREEN ----------

  if (scenarioPhase) {
    return (
      <ScenarioChat
        scenarioData={scenarioData}
        scenarioCompleted={scenarioCompleted}
        user={user}
        onComplete={() => {
          setScenarioCompleted(true);
          const today = new Date().toISOString().slice(0, 10);
          supabase.from('user_daily_stats').update({ scenario_completed: true })
            .eq('user_id', user.id).eq('date', today);
          triggerHeavyHaptic();
        }}
        onExit={() => setScenarioPhase(false)}
        supabase={supabase}
        triggerHaptic={triggerHaptic}
        triggerHeavyHaptic={triggerHeavyHaptic}
      />
    );
  }


  // ---------- WORD OF THE DAY SCREEN ----------

  if (practiceMode === "wotd") {
    // Loading state
    if (loadingWotd) {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Leapfrog size="50" speed="2.5" color="var(--primary)" />
            <p className="text-muted-foreground text-sm font-medium">Loading today's word...</p>
          </div>
        </div>
      );
    }

    // No word found
    if (!currentWotd) {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center justify-center text-center px-8">
          <Icon icon="solar:sad-circle-bold" className="text-6xl text-muted-foreground mb-4" />
          <h2 className="font-heading text-xl font-bold mb-2">No Word Available</h2>
          <p className="text-sm text-muted-foreground mb-8">Check back soon for today's phrase!</p>
          <button
            className="bg-primary text-white font-bold py-4 px-8 rounded-2xl text-sm active:scale-[0.97] transition-all"
            onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); resetWotdFlow(); }}
          >
            Return Home
          </button>
        </div>
      );
    }

    // PHASE: INTRO
    if (wotdPhase === "intro") {
      return (
        <div className={`min-h-screen bg-background text-foreground font-sans flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
          {/* Back button */}
          <header className="px-6 pt-12 pb-6">
            <button
              className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); resetWotdFlow(); }}
            >
              <MdArrowBackIosNew className="text-foreground" />
            </button>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-24 h-24 rounded-full bg-chart-3/20 flex items-center justify-center border-2 border-chart-3/30 mb-6">
              <Icon icon="solar:sun-bold" className="text-chart-3 text-5xl" />
            </div>
            <h1 className="font-heading text-3xl font-bold mb-2">Word of the Day</h1>
            <p className="text-muted-foreground text-sm">Let's take a look at today's phrase</p>
          </main>

          <footer className="px-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 2rem)' }}>
            <button
              className="btn-primary" style={{ width: "100%" }}
              onClick={() => { triggerHaptic(); setWotdPhase("word"); }}
            >
              Let's Go!
            </button>
          </footer>
        </div>
      );
    }

    // PHASE: WORD DISPLAY
    if (wotdPhase === "word") {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col swipe-in">
          {/* Header */}
          <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
            <button
              className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
              onClick={() => { triggerHaptic(); setWotdPhase("intro"); }}
            >
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <span className="bg-chart-3/20 text-chart-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-chart-3/20">
              Today's Word
            </span>
            <div className="w-10" />
          </header>

          <main className="flex-1 px-6 py-6 flex flex-col justify-center space-y-6">
            {/* Arabic Card */}
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2 text-right">عربي:</p>
              <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-md" dir="rtl">
                <p className="text-3xl font-arabic leading-relaxed text-center">{currentWotd.arabic_text}</p>
                <button
                  className="mt-4 mx-auto flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-primary/20 active:scale-95 transition-all"
                  onClick={(e) => { e.stopPropagation(); speakAiAudio(currentWotd.arabic_text); }}
                >
                  <Icon icon="solar:volume-loud-bold" className="text-base" />
                  Listen
                </button>
              </div>
            </div>

            {/* English Card */}
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">English:</p>
              <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-md">
                <p className="text-xl font-medium text-center">{currentWotd.english_text}</p>
              </div>
            </div>
          </main>

          <footer className="px-6 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 2rem)' }}>
            <button
              className="btn-primary" style={{ width: "100%" }}
              onClick={() => {
                triggerHaptic();
                if (wotdExamples.length > 0) {
                  setWotdPhase("examples");
                } else {
                  setWotdPhase("complete");
                }
              }}
            >
              {wotdExamples.length > 0 ? "See Examples" : "Continue"}
            </button>
          </footer>
        </div>
      );
    }

    // PHASE: EXAMPLES
    if (wotdPhase === "examples" && wotdExamples.length > 0) {
      const currentExample = wotdExamples[wotdExampleIndex];

      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
          {/* Header */}
          <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
            <button
              className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
              onClick={() => { triggerHaptic(); setWotdPhase("word"); }}
            >
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <span className="bg-chart-3/20 text-chart-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-chart-3/20">
              Example {wotdExampleIndex + 1}/{wotdExamples.length}
            </span>
            <div className="w-10" />
          </header>

          <main key={wotdExampleIndex} className="flex-1 px-6 py-6 flex flex-col justify-center space-y-6 swipe-in">
            {/* Arabic */}
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2 text-right">عربي:</p>
              <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-md" dir="rtl">
                <p className="text-2xl font-arabic leading-relaxed text-center">{currentExample.example_arabic}</p>
                <button
                  className="mt-4 mx-auto flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-primary/20 active:scale-95 transition-all"
                  onClick={(e) => { e.stopPropagation(); speakAiAudio(currentExample.example_arabic); }}
                >
                  <Icon icon="solar:volume-loud-bold" className="text-base" />
                  Listen
                </button>
              </div>
            </div>

            {/* English */}
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">English:</p>
              <div className="bg-card rounded-3xl p-6 border-l-4 border-chart-3 border border-border/50">
                <p className="text-base">{currentExample.example_english}</p>
              </div>
            </div>

            {/* Notes */}
            {currentExample.notes && (
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">Note:</p>
                <div className="bg-muted/30 rounded-3xl p-6 border border-border/30">
                  <p className="text-sm text-muted-foreground leading-relaxed">{currentExample.notes}</p>
                </div>
              </div>
            )}
          </main>

          <footer className="px-6 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 2rem)' }}>
            <div className="flex items-center gap-3">
              <button
                className="w-14 h-14 rounded-2xl bg-card border border-border/50 flex items-center justify-center active:scale-[0.95] transition-all disabled:opacity-30"
                onClick={() => { if (wotdExampleIndex > 0) { triggerHaptic(); setWotdExampleIndex(i => i - 1); } }}
                disabled={wotdExampleIndex === 0}
              >
                <MdArrowBackIosNew className="text-foreground" />
              </button>
              <button
                className="btn-primary" style={{ flex: 1 }}
                onClick={() => {
                  triggerHaptic();
                  if (wotdExampleIndex === wotdExamples.length - 1) {
                    setWotdPhase("complete");
                  } else {
                    setWotdExampleIndex(i => i + 1);
                  }
                }}
              >
                {wotdExampleIndex === wotdExamples.length - 1 ? "FINISH" : "CONTINUE"}
              </button>
              <button
                className="w-12 h-12 rounded-2xl bg-card border border-border/50 flex items-center justify-center active:scale-[0.95] transition-all disabled:opacity-30"
                onClick={() => { if (wotdExampleIndex < wotdExamples.length - 1) { triggerHaptic(); setWotdExampleIndex(i => i + 1); } }}
                disabled={wotdExampleIndex === wotdExamples.length - 1}
              >
                <span className="text-foreground">→</span>
              </button>
            </div>
          </footer>
        </div>
      );
    }

    // PHASE: COMPLETE
    if (wotdPhase === "complete") {
      const handleShare = async () => {
        triggerHaptic();
        const shareData = {
          title: 'Word of the Day',
          text: `Today I learned: "${currentWotd.arabic_text}" means "${currentWotd.english_text}" 🌟`,
          url: 'https://clemencyhouse.com'
        };

        try {
          if (navigator.share) {
            await navigator.share(shareData);
          } else {
            await navigator.clipboard.writeText(shareData.text);
            alert('Copied to clipboard!');
          }
        } catch (err) {
          console.log('Share failed:', err);
        }
      };

      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center justify-center px-8 text-center">
          <div className="mb-4">
            <DotLottieReact
              src="/animations/done.lottie"
              loop
              autoplay
              style={{ width: '200px', height: '200px' }}
            />
          </div>

          <h1 className="font-heading text-3xl font-bold mb-2">Well Done!</h1>
          <p className="text-muted-foreground text-sm mb-8">Check in tomorrow for a new phrase</p>

          <div className="bg-card rounded-3xl p-6 border border-border/50 w-full max-w-sm mb-8">
            <p className="text-2xl font-arabic mb-2" dir="rtl">{currentWotd.arabic_text}</p>
            <div className="w-8 h-0.5 bg-border mx-auto my-3" />
            <p className="text-base text-muted-foreground">{currentWotd.english_text}</p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-sm" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 1rem)' }}>
            <button
              className="btn-outline w-full" style={{ padding: '1rem', height: '56px', fontSize: '1rem' }}
              onClick={handleShare}
            >
              <Icon icon="solar:share-bold" className="text-xl" />
              Share
            </button>
            <button
              className="btn-outline w-full" style={{ padding: '1rem', height: '56px', fontSize: '1rem' }}
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); resetWotdFlow(); }}
            >
              Return Home
            </button>
          </div>
        </div>
      );
    }
  }

  // ---------- PICTURE DESCRIBE SCREEN ----------

  if (practiceMode === "picture-describe") {
    // Loading state
    if (loadingPictureLessons) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Leapfrog size="50" speed="2.5" color="var(--primary)" />
            <p className="text-muted-foreground text-sm">Loading lessons...</p>
          </div>
        </div>
      );
    }

    // PHASE: LESSONS LIST
    if (picturePhase === "lessons") {
      return (
        <div className={`min-h-screen bg-background text-foreground font-sans pb-12 ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
          {/* Header */}
          <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
            <button
              className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); setActiveTab("speaking"); resetPictureDescribeFlow(); }}
            >
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <span className="bg-primary/20 text-primary px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-primary/20">
              Describe the Picture
            </span>
            <div className="w-10" />
          </header>

          <main className="px-6 space-y-4 mt-2">
            {pictureDescribeLessons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Icon icon="solar:gallery-bold" className="text-muted-foreground/30 text-6xl mb-4" />
                <p className="text-muted-foreground text-sm">No picture lessons found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {pictureDescribeLessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    className="bg-card rounded-3xl border border-border/50 overflow-hidden shadow-sm active:scale-[0.97] transition-all text-left flex flex-col"
                    onClick={() => { triggerHaptic(); openPictureDescribeLesson(lesson); }}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                      <img src={lesson.image_url} alt={lesson.title} className="w-full h-full object-cover" style={{ pointerEvents: 'none' }} />
                    </div>
                    <div className="p-4">
                      <h3 className="font-heading font-bold text-sm mb-0.5">{lesson.title}</h3>
                      {lesson.title_ar && <p className="text-xs text-muted-foreground font-arabic" dir="rtl">{lesson.title_ar}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </main>
        </div>
      );
    }

    // PHASE: VOCAB CAROUSEL
    if (picturePhase === "vocab" && activePictureLesson) {
      return (
        <div className="no-scroll-container swipe-in">
          <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
            <span
              style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
              onClick={() => { triggerHaptic(); setPicturePhase("lessons"); setActivePictureLesson(null); }}
            >
              <MdArrowBackIosNew />
            </span>
            <div className="lesson-title-badge" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
              {activePictureLesson.title}
            </div>
          </header>

          {pictureVocab.length === 0 ? (
            <div className="center-content">
              <p className="muted">No vocabulary added yet for this lesson.</p>
              <button
                className="btn-primary"
                onClick={() => { triggerHaptic(); setPicturePhase("picture"); }}
              >
                Continue to Picture
              </button>
            </div>
          ) : (
            <>
              <div key={pictureVocabIndex} className="carousel-content-area swipe-in">
                <div className="vocab-label" style={{ textAlign: "right", marginBottom: '0.25rem' }}>:عربي</div>
                <div className="vocab-card" style={{ direction: "rtl", borderColor: '#f59e0b' }}>
                  <span className="explorer-card-corner top-left"></span>
                  <span className="explorer-card-corner top-right"></span>
                  <span className="explorer-card-corner bottom-left"></span>
                  <span className="explorer-card-corner bottom-right"></span>
                  <div className="vocab-text-main">
                    {pictureVocab[pictureVocabIndex].arabic_text || pictureVocab[pictureVocabIndex].arabic}
                    {pictureVocab[pictureVocabIndex].note && (
                      <span style={{ display: "block", fontSize: "0.9rem", marginTop: "0.5rem", color: "var(--muted-foreground)" }}>
                        [{pictureVocab[pictureVocabIndex].note}]
                      </span>
                    )}
                  </div>
                </div>

                <div className="vocab-label" style={{ marginBottom: '0.25rem' }}>English:</div>
                <div className="vocab-card">
                  <span className="explorer-card-corner top-left"></span>
                  <span className="explorer-card-corner top-right"></span>
                  <span className="explorer-card-corner bottom-left"></span>
                  <span className="explorer-card-corner bottom-right"></span>
                  <div className="vocab-text-main">{pictureVocab[pictureVocabIndex].english_text || pictureVocab[pictureVocabIndex].english}</div>
                </div>
              </div>

              <footer className="sticky-footer">
                <div style={{ display: 'flex', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                  <button
                    className="btn-nav-arrow"
                    onClick={() => { if (pictureVocabIndex > 0) { triggerHaptic(); setPictureVocabIndex(i => i - 1); } }}
                    disabled={pictureVocabIndex === 0}
                    style={{ opacity: pictureVocabIndex === 0 ? 0.3 : 1 }}
                  >
                    <MdArrowBackIosNew />
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                    onClick={() => {
                      triggerHaptic();
                      if (pictureVocabIndex === pictureVocab.length - 1) {
                        setPicturePhase("picture");
                      } else {
                        setPictureVocabIndex(i => i + 1);
                      }
                    }}
                  >
                    {pictureVocabIndex === pictureVocab.length - 1 ? "VIEW PICTURE" : "CONTINUE"}
                  </button>
                  <button
                    className="btn-nav-arrow"
                    onClick={() => { if (pictureVocabIndex < pictureVocab.length - 1) { triggerHaptic(); setPictureVocabIndex(i => i + 1); } }}
                    disabled={pictureVocabIndex === pictureVocab.length - 1}
                    style={{ opacity: pictureVocabIndex === pictureVocab.length - 1 ? 0.3 : 1 }}
                  >
                    →
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      );
    }

    // PHASE: PICTURE + MIC
    if (picturePhase === "picture" && activePictureLesson) {
      return (
        <div className="picture-describe-screen">
          {/* Header */}
          <header className="picture-describe-header">
            <button
              className="picture-back-btn"
              onClick={() => { triggerHaptic(); setPicturePhase("vocab"); setPictureVocabIndex(0); }}
            >
              <span style={{ fontSize: '1.1rem' }}>◀</span>
              <span className="picture-btn-label">Back</span>
            </button>
            <h2 className="picture-describe-title">{activePictureLesson.title}</h2>
            <button
              className="picture-hint-btn"
              onClick={() => { triggerHaptic(); setShowPictureHint(!showPictureHint); }}
            >
              <span className="picture-hint-emoji">💡</span>
              <span className="picture-btn-label">Hints</span>
            </button>
          </header>

          {/* Picture */}
          <div className="picture-display-container">
            <img
              src={activePictureLesson.image_url}
              alt={activePictureLesson.title}
              className="picture-display-image"
            />
            {/* Circle Timer Overlay */}
            {pictureRecording && (
              <div className="picture-timer-overlay">
                <svg className="picture-timer-ring" viewBox="0 0 100 100">
                  <circle className="picture-timer-bg" cx="50" cy="50" r="44" />
                  <circle
                    className="picture-timer-progress"
                    cx="50" cy="50" r="44"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 44}`,
                      strokeDashoffset: `${2 * Math.PI * 44 * (pictureRecordingTime / PICTURE_MAX_RECORD_SECONDS)}`,
                    }}
                  />
                </svg>
                <div className="picture-timer-text">
                  <span className="picture-timer-value">
                    {Math.floor((PICTURE_MAX_RECORD_SECONDS - pictureRecordingTime) / 60)}:{String((PICTURE_MAX_RECORD_SECONDS - pictureRecordingTime) % 60).padStart(2, '0')}
                  </span>
                  <span className="picture-timer-label">remaining</span>
                </div>
              </div>
            )}
          </div>

          {/* Instruction */}
          <p className="picture-instruction">
            {pictureRecording ? "Keep talking... describe what you see!" : "Tap the microphone and describe the picture in Arabic"}
          </p>

          {/* Mic Button */}
          <div className="picture-mic-container">
            {pictureCheckingAnswer ? (
              (() => {
                const analysisMessages = [
                  { icon: '🎤', text: 'Transcribing audio...' },
                  { icon: '📝', text: 'Analysing your sentences...' },
                  { icon: '📖', text: 'Checking grammar & structure...' },
                  { icon: '🔍', text: 'Reviewing vocabulary usage...' },
                  { icon: '🤖', text: 'Preparing feedback...' },
                  { icon: '✨', text: 'Almost ready...' },
                ];
                const currentMsg = analysisMessages[Math.min(analysisStep, analysisMessages.length - 1)];
                const progress = Math.min(((analysisStep + 1) / analysisMessages.length) * 100, 95);
                const randomVocab = pictureVocab[analysisStep % pictureVocab.length];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
                    {/* Analysis message */}
                    <div style={{
                      background: 'var(--card)', borderRadius: '1.25rem', padding: '1.25rem', border: '1px solid var(--border)',
                      width: '100%', maxWidth: '280px', textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem', animation: 'pulse 1.5s ease-in-out infinite' }}>{currentMsg.icon}</div>
                      <p style={{ color: 'var(--foreground)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{currentMsg.text}</p>
                      {/* Progress bar */}
                      <div style={{ height: '4px', borderRadius: '2px', background: 'var(--muted)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary)', borderRadius: '2px', transition: 'width 1.5s ease-out' }} />
                      </div>
                    </div>
                    {/* Vocab spotlight */}
                    {randomVocab && (
                      <div style={{
                        background: 'var(--muted)', borderRadius: '1rem', padding: '0.85rem 1.25rem', border: '1px solid var(--border)',
                        textAlign: 'center', animation: 'slideUp 0.4s ease-out'
                      }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: '0.35rem' }}>Did you say?</div>
                        <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.2rem', fontWeight: 600, color: 'var(--primary)' }}>{randomVocab.arabic_text || randomVocab.arabic}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>{randomVocab.english_text || randomVocab.english}</div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <button
                className={`picture-mic-btn ${pictureRecording ? 'recording' : ''}`}
                onClick={() => {
                  triggerHaptic();
                  if (pictureRecording) {
                    stopPictureRecording();
                  } else {
                    startPictureRecording();
                  }
                }}
              >
                <span className="picture-mic-icon">{pictureRecording ? '⏹' : '🎙️'}</span>
                <span className="picture-mic-label">{pictureRecording ? 'Stop' : 'Speak'}</span>
              </button>
            )}
          </div>

          {/* Error display */}
          {speechError && (
            <p style={{ color: '#dc2626', textAlign: 'center', fontSize: '0.85rem', margin: '0 1rem 0.5rem', padding: '0.5rem 1rem', background: 'rgba(220,38,38,0.08)', borderRadius: '8px' }}>
              {speechError}
            </p>
          )}
          {/* Hint Overlay */}
          {showPictureHint && (
            <div className="picture-hint-overlay" onClick={() => setShowPictureHint(false)}>
              <div className="picture-hint-modal" onClick={(e) => e.stopPropagation()}>
                <h3>💡 Vocabulary Hint</h3>
                <div className="picture-hint-list">
                  {pictureVocab.map((item, idx) => (
                    <div key={idx} className="picture-hint-item">
                      <span className="hint-arabic">{item.arabic_text || item.arabic}</span>
                      <span className="hint-divider">—</span>
                      <span className="hint-english">{item.english_text || item.english}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-primary" onClick={() => setShowPictureHint(false)}>
                  Got it!
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // PHASE: AI FEEDBACK WALKTHROUGH (Interactive)
    if (picturePhase === "feedback" && activePictureLesson) {
      const steps = pictureFeedbackSteps;
      const currentStep = steps[pictureFeedbackIndex];
      const isLastStep = pictureFeedbackIndex >= steps.length - 1;
      const allRevealed = pictureFeedbackIndex >= steps.length;
      // Check if current step is a challenge that needs completing
      const isChallenge = currentStep && (currentStep.type === 'correction_challenge' || currentStep.type === 'speak_challenge');
      const challengeDone = challengeCompleted[pictureFeedbackIndex];

      return (
        <div className="picture-describe-screen" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 2rem)' }}>
          {/* Header */}
          <header className="picture-describe-header" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <button
              className="picture-back-btn"
              onClick={() => { triggerHaptic(); setPracticeMode("picture-describe"); resetPictureDescribeFlow(); }}
            >
              <span style={{ fontSize: '1.1rem' }}>◀</span>
              <span className="picture-btn-label">Exit</span>
            </button>
            <h2 className="picture-describe-title">{activePictureLesson.title}</h2>
            <div style={{ width: '60px' }} />
          </header>

          {/* Picture at top — compact */}
          <div style={{ padding: '0.75rem 1rem 0' }}>
            <img
              src={activePictureLesson.image_url}
              alt={activePictureLesson.title}
              style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '1rem', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Score badge */}
          {pictureScore != null && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.75rem 0' }}>
              <div style={{
                background: pictureScore >= 7 ? 'rgba(34,197,94,0.1)' : pictureScore >= 5 ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${pictureScore >= 7 ? 'rgba(34,197,94,0.3)' : pictureScore >= 5 ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)'}`,
                borderRadius: '1rem', padding: '0.4rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: pictureScore >= 7 ? '#22c55e' : pictureScore >= 5 ? '#eab308' : '#ef4444' }}>
                  {pictureScore.toFixed(1)}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>/10</span>
              </div>
            </div>
          )}

          {/* Transcript preview — only on first step */}
          {pictureTranscript && pictureFeedbackIndex === 0 && (
            <div style={{ padding: '0 1.25rem', marginBottom: '0.75rem' }}>
              <div style={{ background: 'var(--muted)', borderRadius: '1rem', padding: '0.85rem', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: '0.35rem' }}>What you said:</div>
                <p dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--foreground)', margin: 0 }}>{pictureTranscript}</p>
              </div>
            </div>
          )}

          {/* Feedback step cards */}
          <div style={{ padding: '0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {steps.slice(0, pictureFeedbackIndex + 1).map((step, idx) => (
              <div key={idx} style={{
                background: 'var(--card)', borderRadius: '1.25rem', padding: '1.15rem', border: '1px solid var(--border)',
                animation: idx === pictureFeedbackIndex ? 'slideUp 0.3s ease-out' : 'none'
              }}>
                {/* SEGMENT */}
                {step.type === 'segment' && (
                  <>
                    <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.6rem', color: 'var(--primary)', lineHeight: 1.8 }}>
                      "{step.snippet}"
                    </div>
                    <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--foreground)', margin: 0 }}>
                      {step.analysis}
                    </p>
                    {step.tip && (
                      <div style={{ background: 'rgba(234,179,8,0.08)', borderRadius: '0.75rem', padding: '0.65rem', marginTop: '0.5rem', borderLeft: '3px solid #eab308' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#eab308' }}>💡 </span>
                        <span style={{ fontSize: '0.83rem', color: 'var(--foreground)' }}>{step.tip}</span>
                      </div>
                    )}
                    {step.teach && (
                      <div style={{ background: 'rgba(20,184,166,0.08)', borderRadius: '0.75rem', padding: '0.65rem', marginTop: '0.5rem', borderLeft: '3px solid #14b8a6' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#14b8a6', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                          📚 {step.teach.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <button
                            onClick={() => { triggerHaptic(); speakArabic(step.teach.arabic); }}
                            style={{ background: 'rgba(20,184,166,0.15)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#14b8a6', flexShrink: 0 }}
                          >🔊</button>
                          <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.1rem', fontWeight: 600, color: '#14b8a6' }}>{step.teach.arabic}</div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', paddingLeft: '1.6rem' }}>{step.teach.english}</div>
                      </div>
                    )}
                  </>
                )}

                {/* CORRECTION CHALLENGE */}
                {step.type === 'correction_challenge' && (
                  <>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b', marginBottom: '0.6rem' }}>
                      🔄 Practice Correction
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--foreground)', marginBottom: '0.6rem' }}>{step.instruction}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ flex: 1, background: 'rgba(239,68,68,0.08)', borderRadius: '0.75rem', padding: '0.6rem', borderLeft: '3px solid #ef4444' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.25rem' }}>You said:</div>
                        <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1rem', color: '#ef4444' }}>{step.original}</div>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(34,197,94,0.08)', borderRadius: '0.75rem', padding: '0.6rem', borderLeft: '3px solid #22c55e' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#22c55e', marginBottom: '0.25rem' }}>Say this:</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button
                            onClick={() => { triggerHaptic(); speakArabic(step.corrected); }}
                            style={{ background: 'rgba(34,197,94,0.15)', border: 'none', cursor: 'pointer', fontSize: '1rem', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', flexShrink: 0 }}
                          >🔊</button>
                          <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1rem', color: '#22c55e', fontWeight: 600 }}>{step.corrected}</div>
                        </div>
                      </div>
                    </div>
                    {/* Mic button — show if not completed AND not currently checking */}
                    {idx === pictureFeedbackIndex && !challengeCompleted[idx] && !challengeChecking && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Show failed result + retry prompt */}
                        {challengeResult[idx] && !challengeResult[idx].good && (
                          <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.08)', width: '100%', marginBottom: '0.25rem' }}>
                            <div style={{ color: '#ef4444', fontSize: '0.83rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                              ✗ {challengeResult[idx].feedback}
                            </div>
                            <div style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>Try again or skip</div>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                          <button
                            style={{
                              width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
                              background: challengeRecording ? '#ef4444' : 'var(--primary)', color: 'white',
                              fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              animation: challengeRecording ? 'micPulse 1.5s ease-in-out infinite' : 'none',
                              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                            }}
                            onClick={() => {
                              triggerHaptic();
                              if (challengeRecording) { stopChallengeRecording(idx); }
                              else { startChallengeRecording(idx); }
                            }}
                          >
                            {challengeRecording ? '⏹' : '🎙️'}
                          </button>
                          <button
                            style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: '0.8rem', cursor: 'pointer', alignSelf: 'center' }}
                            onClick={() => { triggerHaptic(); setChallengeCompleted(prev => ({ ...prev, [idx]: true })); }}
                          >
                            Skip →
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Success result */}
                    {challengeCompleted[idx] && challengeResult[idx]?.good && (
                      <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(34,197,94,0.08)' }}>
                        <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600 }}>
                          ✓ {challengeResult[idx].feedback}
                        </div>
                      </div>
                    )}
                    {/* Skipped (not good or no result) */}
                    {challengeCompleted[idx] && !challengeResult[idx]?.good && (
                      <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(156,163,175,0.08)' }}>
                        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.83rem' }}>Skipped</div>
                      </div>
                    )}
                    {challengeChecking && idx === pictureFeedbackIndex && (
                      <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
                        <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>Checking your pronunciation...</span>
                      </div>
                    )}
                  </>
                )}

                {/* SPEAK CHALLENGE (follow-up question) */}
                {step.type === 'speak_challenge' && (
                  <>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8b5cf6', marginBottom: '0.6rem' }}>
                      🗣️ Follow-up Challenge
                    </div>
                    <p style={{ fontSize: '0.9rem', color: 'var(--foreground)', marginBottom: '0.5rem', fontWeight: 500 }}>{step.prompt}</p>
                    {step.hint && (
                      <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '0.95rem', color: 'var(--muted-foreground)', marginBottom: '0.6rem', fontStyle: 'italic' }}>
                        💡 {step.hint}
                      </div>
                    )}
                    {/* Mic button — show if not completed AND not currently checking */}
                    {idx === pictureFeedbackIndex && !challengeCompleted[idx] && !challengeChecking && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Show failed result + retry prompt */}
                        {challengeResult[idx] && !challengeResult[idx].good && (
                          <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.08)', width: '100%', marginBottom: '0.25rem' }}>
                            <div style={{ color: '#ef4444', fontSize: '0.83rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                              {challengeResult[idx].feedback}
                            </div>
                            <div style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>Try again — answer in Arabic</div>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', alignItems: 'center' }}>
                          <button
                            style={{
                              width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
                              background: challengeRecording ? '#ef4444' : '#8b5cf6', color: 'white',
                              fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              animation: challengeRecording ? 'micPulse 1.5s ease-in-out infinite' : 'none',
                              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                            }}
                            onClick={() => {
                              triggerHaptic();
                              if (challengeRecording) { stopChallengeRecording(idx); }
                              else { startChallengeRecording(idx); }
                            }}
                          >
                            {challengeRecording ? '⏹' : '🎙️'}
                          </button>
                          {challengeRecording && (
                            <span style={{ fontSize: '0.75rem', color: '#8b5cf6', fontWeight: 600 }}>Up to 30s</span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Success result */}
                    {challengeCompleted[idx] && challengeResult[idx]?.good && (
                      <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(139,92,246,0.08)' }}>
                        <div style={{ color: '#8b5cf6', fontSize: '0.85rem', fontWeight: 600 }}>
                          ✓ {challengeResult[idx].feedback}
                        </div>
                      </div>
                    )}
                    {challengeChecking && idx === pictureFeedbackIndex && (
                      <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
                        <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>Checking your response...</span>
                      </div>
                    )}
                  </>
                )}

                {/* IMPROVEMENT SUGGESTION */}
                {step.type === 'improvement' && (
                  <>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#3b82f6', marginBottom: '0.6rem' }}>
                      📈 Level Up Your Answer
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--foreground)', marginBottom: '0.6rem', lineHeight: 1.6 }}>{step.suggestion}</p>
                    {step.example && (
                      <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: '0.75rem', padding: '0.75rem', borderLeft: '3px solid #3b82f6' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#3b82f6', marginBottom: '0.3rem' }}>Try saying:</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            onClick={() => { triggerHaptic(); speakArabic(step.example); }}
                            style={{ background: 'rgba(59,130,246,0.15)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', flexShrink: 0 }}
                          >🔊</button>
                          <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.05rem', color: '#3b82f6', fontWeight: 600, lineHeight: 1.8 }}>{step.example}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* VOCAB CHECK */}
                {step.type === 'vocab_check' && (
                  <>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: '0.6rem' }}>
                      📝 Vocabulary Check
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.4rem' }}>
                      {step.used?.length || 0}/{pictureVocab.length} words used
                    </div>
                    <p style={{ fontSize: '0.83rem', color: 'var(--muted-foreground)', margin: 0 }}>{step.analysis}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Continue / Action buttons */}
          <div style={{ padding: '1.25rem 1.25rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {!allRevealed ? (
              <button
                style={{
                  width: '100%', padding: '0.9rem', borderRadius: '1rem', border: 'none', cursor: 'pointer',
                  background: ((isChallenge && !challengeDone) || challengeChecking) ? 'var(--muted)' : 'var(--primary)',
                  color: ((isChallenge && !challengeDone) || challengeChecking) ? 'var(--muted-foreground)' : 'white',
                  fontWeight: 700, fontSize: '0.93rem',
                  opacity: ((isChallenge && !challengeDone) || challengeChecking) ? 0.5 : 1,
                  pointerEvents: ((isChallenge && !challengeDone) || challengeChecking) ? 'none' : 'auto'
                }}
                onClick={() => { triggerHaptic(); setPictureFeedbackIndex(pictureFeedbackIndex + 1); }}
              >
                Continue →
              </button>
            ) : (
              <>
                {/* أحسنت congratulations */}
                <div style={{
                  textAlign: 'center', padding: '1.5rem', borderRadius: '1.25rem',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(59,130,246,0.1))',
                  border: '1px solid rgba(34,197,94,0.2)'
                }}>
                  <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '2rem', fontWeight: 700, color: '#22c55e', marginBottom: '0.25rem' }}>أحسنت!</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Great job completing this lesson!</div>
                  {pictureScore != null && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)' }}>
                        {pictureScore}/10
                      </div>
                      {pictureVocabStats && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                          📖 {pictureVocabStats.vocabUsed}/{pictureVocabStats.vocabTotal} vocab words used
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    style={{
                      flex: 1, padding: '0.9rem', borderRadius: '1rem', background: 'var(--muted)', border: '1px solid var(--border)',
                      color: 'var(--foreground)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                    }}
                    onClick={() => {
                      triggerHaptic();
                      setPicturePhase("picture");
                      setPictureTranscript("");
                      setPictureMatchPercent(0);
                      setPictureMatchedWords([]);
                      setPictureMissedWords([]);
                      setPictureFeedbackSteps([]);
                      setPictureFeedbackIndex(0);
                      setPictureScore(null);
                      setPictureVocabStats(null);
                      setChallengeCompleted({});
                      setChallengeResult({});
                    }}
                  >
                    🔄 Try Again
                  </button>
                  <button
                    style={{
                      flex: 1, padding: '0.9rem', borderRadius: '1rem', background: 'var(--primary)', border: 'none',
                      color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                    }}
                    onClick={() => { triggerHaptic(); setPracticeMode("picture-describe"); resetPictureDescribeFlow(); }}
                  >
                    ✓ Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
  }

  // ---------- SPEAKING MODES & LESSONS SCREEN ----------

  if (practiceMode === "speaking" && !activeSpeakingLesson) {
    return (
      <div className={`explorer-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
        {/* Aged paper texture overlay */}
        <div className="texture-overlay" />

        {/* Explorer Header */}
        <header className="explorer-region-header">
          <div className="explorer-region-header-content">
            <button
              className="explorer-back-btn"
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); setSelectedSpeakingMode(null); setSpeakingLessons([]); }}
            >
              <span className="explorer-back-icon">◀</span>
            </button>
            <div className="explorer-region-title-wrap">
              <h1 className="explorer-region-title">🎤 تمارين النطق</h1>
              <p className="explorer-region-subtitle" style={{ color: 'var(--secondary)' }}>Speaking Practice</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="explorer-region-main">
          {/* Decorative blurs */}
          <div className="explorer-blur" style={{ top: '2rem', right: '-3rem', background: 'var(--secondary)', opacity: 0.15 }} />
          <div className="explorer-blur explorer-blur-2" />

          <div className="explorer-region-content">
            {loadingSpeakingModes ? (
              <div className="explorer-loading">
                <Leapfrog size="40" speed="2.5" color="var(--secondary)" />
                <p>Loading modes...</p>
              </div>
            ) : speakingModes.length === 0 ? (
              <div className="explorer-empty">
                <Icon icon="solar:microphone-3-bold" className="explorer-empty-icon" />
                <p>No speaking modes found</p>
              </div>
            ) : (
              <div className="speaking-modes-grid">
                {/* Describe the Picture */}
                <button
                  onClick={() => { triggerHaptic(); setPracticeMode("picture-describe"); loadPictureDescribeLessons(); }}
                  className="speaking-feature-card"
                >
                  <div className="speaking-feature-emoji">🖼️</div>
                  <h3 className="speaking-feature-title">Describe the Picture</h3>
                  <p className="speaking-feature-title-ar">وصف الصورة</p>
                  <p className="speaking-feature-desc">Look at an image and describe what you see in Arabic</p>
                  <div className="speaking-feature-badge">
                    <span>🎯 Vocab Matching</span>
                  </div>
                </button>

                {/* Database-driven speaking modes */}
                {speakingModes.map((mode) => {
                  const isSelected = selectedSpeakingMode === mode.id;
                  // Pick emoji based on mode name
                  const modeEmoji = mode.name?.toLowerCase().includes('read') ? '📖'
                    : mode.name?.toLowerCase().includes('translat') ? '🔄'
                      : '🎤';

                  return (
                    <div key={mode.id} className="explorer-stage-wrap">
                      <button
                        onClick={() => { triggerHaptic(); loadSpeakingLessons(mode.id); }}
                        className={`speaking-feature-card ${isSelected ? 'speaking-feature-active' : ''}`}
                      >
                        <div className="speaking-feature-emoji">{modeEmoji}</div>
                        <h3 className="speaking-feature-title">{mode.name || "Mode"}</h3>
                        <p className="speaking-feature-desc">{mode.description}</p>
                        {isSelected && <div className="speaking-feature-expand-hint">▼</div>}
                      </button>

                      {/* Lessons List */}
                      {isSelected && (
                        <div className="explorer-lessons-wrap">
                          {loadingSpeakingLessons ? (
                            <div className="explorer-lessons-loading">
                              <Leapfrog size="30" speed="2.5" color="#f59e0b" />
                            </div>
                          ) : speakingLessons.length === 0 ? (
                            <p className="explorer-lessons-empty">No lessons found</p>
                          ) : (
                            <div className="explorer-lessons-list">
                              {speakingLessons.map((lesson) => {
                                const lessonCompleted = isSpeakingLessonCompleted(lesson.id);

                                return (
                                  <button
                                    key={lesson.id}
                                    onClick={() => { triggerHaptic(); openSpeakingLesson(lesson); }}
                                    className={`explorer-lesson-card ${lessonCompleted ? 'completed' : ''}`}
                                  >
                                    <div className="explorer-lesson-status">
                                      {lessonCompleted ? (
                                        <Icon icon="solar:check-circle-bold" className="explorer-lesson-check" style={{ color: 'var(--secondary)' }} />
                                      ) : (
                                        <div className="explorer-lesson-dot" style={{ background: 'var(--secondary)' }} />
                                      )}
                                    </div>
                                    <div className="explorer-lesson-info">
                                      <h4 className="explorer-lesson-title">{lesson.title}</h4>
                                      <p className="explorer-lesson-desc">{lesson.prompt_text}</p>
                                    </div>
                                    {!lessonCompleted && (
                                      <div className="explorer-lesson-play" style={{ background: 'var(--secondary)' }}>
                                        <Icon icon="solar:microphone-3-bold" />
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Global Transition Overlay */}
        {transitioning && (
          <div className="transition-overlay">
            <div className="transition-card">
              <Leapfrog size="40" speed="2.5" color="var(--secondary)" />
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
      <div className="explorer-shell">
        <div className="texture-overlay" />

        {/* Quiz Header */}
        <header className="quiz-explorer-header">
          <button
            className="quiz-map-btn"
            onClick={() => { triggerHaptic(); setShowQuitQuizConfirm(true); }}
          >
            <Icon icon="solar:map-bold" className="quiz-map-icon" />
          </button>

          {/* Journey Progress Bar */}
          <div className="quiz-journey-progress">
            <div className="quiz-journey-track">
              <div
                className="quiz-journey-fill"
                style={{ width: `${(currentQuestionIndex / Math.max(questions.length, 1)) * 100}%` }}
              />
            </div>
            <div className="quiz-journey-dots">
              {questions.map((_, idx) => (
                <div
                  key={idx}
                  className={`quiz-journey-dot ${idx < currentQuestionIndex ? 'completed' : ''} ${idx === currentQuestionIndex ? 'current' : ''}`}
                >
                  {idx === currentQuestionIndex && (
                    <Icon icon="solar:compass-bold" className="quiz-compass-icon" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Hearts Display */}
          <div className="quiz-hearts-display">
            <Icon icon="solar:heart-bold" className="quiz-heart-icon" />
            <span className="quiz-hearts-count">{hearts}</span>
          </div>
        </header>

        {/* Quit Quiz Confirmation Modal */}
        {showQuitQuizConfirm && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 className="modal-title">Leave Quest?</h3>
              <p className="text-muted">Are you sure you want to return to home? All progress will be lost.</p>
              <div className="modal-actions">
                <button className="btn-outline" style={{ flex: 1 }} onClick={() => { triggerHaptic(); setShowQuitQuizConfirm(false); }}>
                  Stay
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, backgroundColor: "var(--red)", boxShadow: "0 4px 0 var(--red-dark)" }}
                  onClick={() => {
                    triggerHaptic();
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

        {/* Quiz Main Content */}
        <main className="quiz-explorer-main">
          {!quizFinished && currentQuestion && (
            <div key={currentQuestion.id} className="quiz-question-wrap swipe-in">
              {/* Question Title */}
              <div className="quiz-lesson-label">
                <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
              </div>
              <h2 className="quiz-prompt">{currentQuestion.prompt_text}</h2>

              {/* Question Card with Corner Accents - COMMENTED OUT FOR NOW
              <div className="quiz-question-card">
                <div className="quiz-card-corner top-left" />
                <div className="quiz-card-corner top-right" />
                <div className="quiz-card-corner bottom-left" />
                <div className="quiz-card-corner bottom-right" />

                <div className="quiz-card-content">
                  {currentQuestion.options.length > 0 && currentQuestion.options[0].text && (
                    <p className="quiz-arabic-text" dir="rtl">
                      {currentQuestion.prompt_arabic || "اختر الجواب الصحيح"}
                    </p>
                  )}
                </div>
              </div>
              */}

              {/* Answer Options Grid */}
              <div className={`quiz-options-grid ${currentQuestion.options.length === 3 ? 'three-options' : ''}`}>
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedOptionId === opt.id;
                  const isCorrect = opt.is_correct;

                  let stateClass = "";
                  if (!hasAnswered) {
                    if (isSelected) stateClass = "selected";
                  } else {
                    if (isSelected && isCorrect) stateClass = "correct";
                    else if (isSelected && !isCorrect) stateClass = "wrong";
                    else if (isCorrect) stateClass = "reveal-correct";
                  }

                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleOptionClick(opt)}
                      className={`quiz-option-card ${stateClass}`}
                      disabled={hasAnswered}
                    >
                      <div className="quiz-option-dashed" />
                      <div className="quiz-option-inner">
                        <span className="quiz-option-text">{opt.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Failure Screen */}
          {quizFinished && hearts <= 0 && (
            <div className="quiz-failure-wrap swipe-in">
              <div className="quiz-failure-icon">
                <Icon icon="solar:heart-broken-bold" className="quiz-broken-heart" />
              </div>
              <h1 className="quiz-failure-title">Out of Hearts</h1>
              <p className="quiz-failure-subtitle">Don't give up! Review the lesson and try again.</p>
              <div className="quiz-failure-buttons">
                <button className="btn-primary" onClick={() => { triggerHaptic(); startQuiz(); }}>
                  Try Again
                </button>
                <button className="btn-outline" onClick={() => { triggerHaptic(); backToLessons(); }}>
                  Return Home
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Action Bar */}
        {
          !quizFinished && currentQuestion && (
            <footer className="quiz-explorer-footer">
              {/* Feedback Message */}
              {hasAnswered && (
                <div className={`quiz-feedback-bar ${answerResult === 'correct' ? 'success' : 'error'}`}>
                  <div className="quiz-feedback-icon">
                    <Icon icon={answerResult === 'correct' ? 'solar:star-rainbow-bold' : 'solar:close-circle-bold'} />
                  </div>
                  <div className="quiz-feedback-text">
                    <h3>{answerResult === 'correct' ? 'أحسنت!' : 'حاول مرة أخرى'}</h3>
                    <p>{answerResult === 'correct' ? 'Excellent work!' : 'Keep practicing!'}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="quiz-action-buttons">
                {!hasAnswered && selectedOptionId !== null && (
                  <button className="quiz-confirm-btn" onClick={handleConfirmAnswer}>
                    <span>Confirm Answer</span>
                    <Icon icon="solar:check-read-bold" />
                  </button>
                )}

                {hasAnswered && (
                  <button className="quiz-continue-btn" onClick={() => { triggerHaptic(); goToNextQuestion(); }}>
                    <span>{currentQuestionIndex === questions.length - 1 ? 'Complete Quest' : 'Continue Journey'}</span>
                    <Icon icon="solar:arrow-right-linear" />
                  </button>
                )}
              </div>
            </footer>
          )
        }
      </div >
    );
  }

  // ---------- LESSON SCREEN (3+ PHASES) ----------

  if (activeLesson && !quizActive) {
    const completed = isLessonCompleted(activeLesson.id);

    return (
      <div className={`explorer-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
        <div className="texture-overlay" />
        <main className="app-main" style={{ marginTop: 0, position: 'relative', zIndex: 10 }}>
          {lessonPhase === "lesson" && (
            <div className="lesson-content">
              {activeLesson.audio_url && (
                <audio
                  ref={audioRef}
                  src={activeLesson.audio_url}
                  preload="auto"
                  onError={(e) => {
                    console.error('Audio load error:', e.target.error?.message || 'unknown', 'code:', e.target.error?.code, 'src:', activeLesson.audio_url?.substring(0, 80));
                  }}
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
                    // Add 2-second delay before showing full dialogue for review
                    setTimeout(() => {
                      setShowDialogueReview(true);
                    }, 2000);
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

                  // For dialogue lessons: only show button initially OR after showDialogueReview (after 2s delay)
                  const showButton = !audioPlaying && (!audioCompleted || showDialogueReview);

                  return (
                    <div
                      className={`dialogue-controls-wrap ${showDialogueReview ? 'fade-in' : ''}`}
                      style={{
                        marginBottom: "1rem",
                        display: "flex",
                        justifyContent: "center",
                        opacity: showButton ? 1 : 0,
                        visibility: showButton ? 'visible' : 'hidden',
                        transition: 'opacity 0.5s ease, visibility 0.5s ease',
                      }}
                    >
                      {showButton && (
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
                                  <div key={b.id} className="paragraph-block-wrap">
                                    <div
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
                                    <button
                                      className="ai-block-trigger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openAiSheet(b);
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                        <path d="M2 17l10 5 10-5" />
                                        <path d="M2 12l10 5 10-5" />
                                      </svg>
                                    </button>
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
                        : showDialogueReview ? visibleDialogue : visibleDialogue.slice(-1);

                      return (
                        <div
                          ref={convoScrollRef}
                          className={`convo-area ${!dialogueFinished && audioPlaying ? "playback-mode" : showDialogueReview ? "list-mode" : "playback-mode"}`}
                        >
                          {visibleLines.map((b) => {
                            const speaker = b.speakers;
                            const sideClass =
                              speaker?.bubble_side === "right"
                                ? "bubble-right"
                                : "bubble-left";

                            return (
                              <div key={b.id} className="dialogue-block-wrap">
                                <div
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

              <div
                className={showDialogueReview ? 'fade-in' : ''}
                style={{
                  marginTop: "1.5rem",
                  paddingBottom: "2.5rem",
                  minHeight: "60px",
                  opacity: showDialogueReview || !audioCompleted ? 1 : 0,
                  transition: 'opacity 0.5s ease',
                }}
              >
                {(() => {
                  // Check if this is a paragraph-based lesson (they have their own proceed button)
                  const hasParagraphs = lessonBlocks.some(b => b.block_type === "paragraph");
                  const hasDialogue = lessonBlocks.some(b => b.block_type === "dialogue");

                  // Don't show this bottom proceed button for paragraph lessons
                  if (hasParagraphs) return null;

                  // For dialogue lessons: only show proceed after showDialogueReview
                  if (hasDialogue && audioCompleted && !showDialogueReview) return null;

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

          {/* AI HELPER SLIDE-UP SHEET */}
          {aiSheetOpen && aiSheetBlock && (
            <div className="ai-sheet-overlay" ref={aiOverlayRef} onClick={closeAiSheet}>
              <div
                ref={aiSheetRef}
                className="ai-sheet"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => {
                  aiDragRef.current.startY = e.touches[0].clientY;
                  aiDragRef.current.dragging = true;
                  if (aiSheetRef.current) aiSheetRef.current.style.transition = 'none';
                  if (aiOverlayRef.current) aiOverlayRef.current.style.transition = 'none';
                }}
                onTouchMove={(e) => {
                  if (!aiDragRef.current.dragging) return;
                  const dy = e.touches[0].clientY - aiDragRef.current.startY;
                  if (dy < 0) return; // only allow downward drag
                  aiDragRef.current.currentY = dy;

                  if (aiSheetRef.current) aiSheetRef.current.style.transform = `translateY(${dy}px)`;

                  // Fade overlay based on drag distance (max ~300px drag)
                  if (aiOverlayRef.current) {
                    const progress = Math.min(dy / 300, 1);
                    const opacity = 0.55 * (1 - progress);
                    aiOverlayRef.current.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
                  }
                }}
                onTouchEnd={() => {
                  if (!aiDragRef.current.dragging) return;
                  aiDragRef.current.dragging = false;
                  const dy = aiDragRef.current.currentY;

                  if (dy > 120) {
                    // Dismiss — animate out
                    if (aiSheetRef.current) {
                      aiSheetRef.current.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
                      aiSheetRef.current.style.transform = 'translateY(100%)';
                    }
                    if (aiOverlayRef.current) {
                      aiOverlayRef.current.style.transition = 'background-color 0.25s ease';
                      aiOverlayRef.current.style.backgroundColor = 'rgba(0,0,0,0)';
                    }
                    setTimeout(() => closeAiSheet(), 250);
                  } else {
                    // Snap back
                    if (aiSheetRef.current) {
                      aiSheetRef.current.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
                      aiSheetRef.current.style.transform = 'translateY(0)';
                    }
                    if (aiOverlayRef.current) {
                      aiOverlayRef.current.style.transition = 'background-color 0.2s ease';
                      aiOverlayRef.current.style.backgroundColor = 'rgba(0,0,0,0.55)';
                    }
                  }
                  aiDragRef.current.currentY = 0;
                }}
              >
                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1rem 0' }}>
                  <button
                    onClick={closeAiSheet}
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--foreground)' }}
                  >
                    ✕
                  </button>
                </div>

                {/* Content — centered */}
                <div className="ai-sheet-content">
                  {/* The Arabic text */}
                  <div className="ai-sheet-arabic-block">
                    <p className="ai-sheet-arabic" dir="rtl">{aiSheetBlock.text_ar}</p>
                  </div>

                  {/* Menu: Translate / Key Vocab */}
                  {aiSheetView === "menu" && (
                    <div className="ai-sheet-actions">
                      <button className="ai-sheet-action-btn" onClick={showTranslation}>
                        Translate
                      </button>
                      <button className="ai-sheet-action-btn ai-sheet-action-vocab" onClick={askAiKeyVocab}>
                        Key Vocab
                      </button>
                    </div>
                  )}

                  {/* Translation view */}
                  {aiSheetView === "translate" && (
                    <div className="ai-sheet-result">
                      <p className="ai-sheet-translation">
                        {aiTranslationResult}
                      </p>
                      <button className="ai-sheet-back" onClick={() => { triggerHaptic(); setAiSheetView("menu"); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        Back
                      </button>
                    </div>
                  )}

                  {/* Loading */}
                  {aiSheetView === "loading" && (
                    <div className="ai-sheet-loading">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  )}

                  {/* Key Vocab result */}
                  {aiSheetView === "vocab" && (
                    <div className="ai-sheet-result">
                      <p className="ai-sheet-vocab-text">{aiVocabResult}</p>
                      <button className="ai-sheet-back" onClick={() => { triggerHaptic(); setAiSheetView("menu"); setAiVocabResult(""); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        Back
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PHASE: TRANSITION TO GRAMMAR */}
          {
            lessonPhase === "intro_grammar" && (
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
            )
          }

          {/* PHASE: GRAMMAR SPOTLIGHT CAROUSEL (No Scrolling) */}
          {
            lessonPhase === "grammar" && grammarNotes.length > 0 && (
              <div className="vocab-fullscreen no-scroll-container swipe-in">
                <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                  <span
                    style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                    onClick={() => { triggerHaptic(); setLessonPhase("lesson"); }}
                  >
                    <MdArrowBackIosNew />
                  </span>
                  <h2 className="grammar-title-text" style={{ margin: 0, fontSize: '1.25rem' }}>{grammarNotes[grammarIndex].title}</h2>
                </header>

                <div key={grammarIndex} className="carousel-content-area swipe-in">
                  <div className="explanation-bubble" style={{ fontSize: '1.1rem', padding: '1.25rem', lineHeight: '1.7' }}>
                    {grammarNotes[grammarIndex].content_en}
                  </div>

                  <div className="arabic-box spotlight-arabic" style={{ borderLeft: '5px solid var(--blue)', padding: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <span style={{ flex: 1 }}>{grammarNotes[grammarIndex].content_ar}</span>
                    {grammarNotes[grammarIndex].content_ar && (
                      <button className="speak-btn" onClick={(e) => { e.stopPropagation(); speakArabic(grammarNotes[grammarIndex].content_ar); }} aria-label="Listen">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z" /></svg>
                      </button>
                    )}
                  </div>
                </div>

                <footer className="sticky-footer">
                  <div style={{ display: 'flex', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                    <button
                      className="btn-nav-arrow"
                      onClick={() => { if (grammarIndex > 0) { triggerHaptic(); setGrammarIndex(i => i - 1); } }}
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
                      onClick={() => { if (grammarIndex < grammarNotes.length - 1) { triggerHaptic(); setGrammarIndex(i => i + 1); } }}
                      disabled={grammarIndex === grammarNotes.length - 1}
                      style={{ opacity: grammarIndex === grammarNotes.length - 1 ? 0.3 : 1 }}
                    >
                      →
                    </button>
                  </div>
                </footer>
              </div>
            )
          }

          {/* PHASE: TRANSITION TO VOCAB */}
          {
            lessonPhase === "intro_vocab" && (
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
            )
          }

          {/* PHASE 2: VOCAB CAROUSEL */}
          {
            lessonPhase === "vocab" && (
              <div className="vocab-fullscreen no-scroll-container swipe-in">
                {/* Header with back arrow and lesson title */}
                <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                  <span
                    style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                    onClick={() => { triggerHaptic(); setLessonPhase("lesson"); }}
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
                      onClick={() => { triggerHaptic(); setLessonPhase("intro_drills"); }}
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
                          <span className="explorer-card-corner top-left"></span>
                          <span className="explorer-card-corner top-right"></span>
                          <span className="explorer-card-corner bottom-left"></span>
                          <span className="explorer-card-corner bottom-right"></span>
                          <div className="vocab-text-main">
                            {item.arabic}
                            {item.note && (
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.9rem",
                                  marginTop: "0.5rem",
                                  color: "var(--muted-foreground)",
                                }}
                              >
                                [{item.note}]
                              </span>
                            )}
                          </div>
                          <button className="speak-btn" onClick={(e) => { e.stopPropagation(); speakArabic(item.arabic); }} aria-label="Listen" style={{ marginTop: '0.5rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z" /></svg>
                          </button>
                        </div>

                        <div className="vocab-label" style={{ marginBottom: '0.25rem' }}>English:</div>
                        <div className="vocab-card">
                          <span className="explorer-card-corner top-left"></span>
                          <span className="explorer-card-corner top-right"></span>
                          <span className="explorer-card-corner bottom-left"></span>
                          <span className="explorer-card-corner bottom-right"></span>
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
                        onClick={() => { if (vocabIndex > 0) { triggerHaptic(); setVocabIndex(i => i - 1); } }}
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
                        onClick={() => { if (vocabIndex < vocabItems.length - 1) { triggerHaptic(); setVocabIndex(i => i + 1); } }}
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
          {
            lessonPhase === "speaking" && (
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
                      onClick={() => { triggerHaptic(); if (isRecording) stopRecording(); else startRecording(); }}
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
            )
          }

          {/* PHASE: TRANSITION TO DRILLS */}
          {
            lessonPhase === "intro_drills" && (
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
            )
          }

          {/* PHASE 3: USAGE DRILLS (Carousel Mode) */}
          {
            lessonPhase === "explain" && explanations.length > 0 && (
              <div className="no-scroll-container">
                {/* Header with back arrow and lesson title */}
                <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                  <span
                    style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                    onClick={() => { triggerHaptic(); setLessonPhase("lesson"); }}
                  >
                    <MdArrowBackIosNew />
                  </span>
                  <div className="lesson-title-badge">{activeLesson.title}</div>
                </header>

                <div className="carousel-content-area">
                  <div className="vocab-label" style={{ textAlign: "right", marginBottom: '0.25rem' }}>:عربي</div>
                  <div className="arabic-box spotlight-arabic" dir="rtl" style={{ fontSize: '2rem', position: 'relative' }}>
                    {explanations[explanationIndex].arabic_sentence}
                    <button className="speak-btn" onClick={(e) => { e.stopPropagation(); speakArabic(explanations[explanationIndex].arabic_sentence); }} aria-label="Listen" style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z" /></svg>
                    </button>
                  </div>

                  <div className="vocab-label" style={{ marginBottom: '0.25rem' }}>English:</div>
                  <div className="explanation-bubble" style={{ borderLeft: '4px solid var(--chart-3)' }}>
                    {explanations[explanationIndex].english_sentence}
                  </div>
                </div>

                <footer className="sticky-footer">
                  <div style={{ display: 'flex', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                    <button
                      className="btn-nav-arrow"
                      onClick={() => { if (explanationIndex > 0) { triggerHaptic(); setExplanationIndex(i => i - 1); } }}
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
                      onClick={() => { if (explanationIndex < explanations.length - 1) { triggerHaptic(); setExplanationIndex(i => i + 1); } }}
                      disabled={explanationIndex === explanations.length - 1}
                      style={{ opacity: explanationIndex === explanations.length - 1 ? 0.3 : 1 }}
                    >
                      →
                    </button>
                  </div>
                </footer>
              </div>
            )
          }

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
                      preload="auto"
                      onError={(e) => {
                        console.error('Relisten audio load error:', e.target.error?.message || 'unknown', 'code:', e.target.error?.code);
                      }}
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
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '2rem', maxWidth: '320px', width: '90%', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🚪</div>
                  <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--foreground)' }}>Leave this lesson?</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>Your progress won't be saved.</p>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      style={{ flex: 1, padding: '0.875rem', borderRadius: '1rem', background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                      onClick={() => {
                        triggerHaptic();
                        setShowExitModal(false);
                        if (audioRef.current && !audioCompleted) {
                          audioRef.current.play().then(() => {
                            setAudioPlaying(true);
                          }).catch(e => console.error("Resume failed", e));
                        }
                      }}
                    >
                      Stay
                    </button>
                    <button
                      style={{ flex: 1, padding: '0.875rem', borderRadius: '1rem', background: 'var(--destructive)', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                      onClick={() => {
                        triggerHaptic();
                        setShowExitModal(false);
                        backToLessons();
                      }}
                    >
                      Leave
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          {/* Global Transition Overlay */}
          {
            transitioning && (
              <div className="transition-overlay">
                <div className="transition-card">
                  <Leapfrog size="40" speed="2.5" color="#8b5cf6" />
                </div>
              </div>
            )
          }
        </main >
      </div >
    );
  }

  // ---------- MAIN SCREEN: STAGES + LESSONS ----------

  return (
    <div className={`explorer-shell ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
      {/* Aged paper texture overlay */}
      <div className="texture-overlay" />

      {/* Explorer Header */}
      <header className="explorer-region-header">
        <div className="explorer-region-header-content">
          <button
            className="explorer-back-btn"
            onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); }}
          >
            <span className="explorer-back-icon">◀</span>
          </button>
          <div className="explorer-region-title-wrap">
            <h1 className="explorer-region-title">📚 المراحل</h1>
            <p className="explorer-region-subtitle">Book Lessons</p>
          </div>
        </div>

        {/* Progress bar */}
        {allLessons.length > 0 && (
          <div className="explorer-progress-wrap">
            <div className="explorer-progress-bar">
              <div
                className="explorer-progress-fill"
                style={{ width: `${(lessonProgress.filter(p => p.hearts_left > 0).length / Math.max(allLessons.length, 1)) * 100}%` }}
              />
            </div>
            <span className="explorer-progress-text">
              {lessonProgress.filter(p => p.hearts_left > 0).length}/{allLessons.length} lessons completed
            </span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="explorer-region-main">
        <div className="explorer-region-content">
          {loadingStages ? (
            <div className="explorer-loading">
              <Leapfrog size="40" speed="2.5" color="var(--primary)" />
              <p>Loading stages...</p>
            </div>
          ) : stages.length === 0 ? (
            <div className="explorer-empty">
              <Icon icon="solar:map-point-wave-bold" className="explorer-empty-icon" />
              <p>No stages found</p>
            </div>
          ) : (
            <div className="explorer-stages">
              {stages.map((stage, index) => {
                const { completed, total, percent } = getStageProgress(stage.id);
                const isSelected = selectedStage === stage.id;
                const isCompleted = percent === 100;
                const isLocked = index > 0 && getStageProgress(stages[index - 1].id).percent < 50;

                return (
                  <div key={stage.id} className="explorer-stage-wrap">
                    {/* Stage Card */}
                    <button
                      onClick={() => { if (!isLocked) { triggerHaptic(); loadLessons(stage.id); } }}
                      className={`explorer-stage-card ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
                      disabled={isLocked}
                    >
                      <div className="explorer-stage-icon-wrap">
                        {isCompleted ? (
                          <Icon icon="solar:check-circle-bold" className="explorer-stage-icon completed" />
                        ) : isLocked ? (
                          <Icon icon="solar:lock-keyhole-bold" className="explorer-stage-icon locked" />
                        ) : isSelected ? (
                          <Icon icon="solar:compass-bold" className="explorer-stage-icon active" />
                        ) : (
                          <Icon icon="solar:map-point-bold" className="explorer-stage-icon" />
                        )}
                      </div>
                      <div className="explorer-stage-info">
                        <h3 className="explorer-stage-name">{stage.name || "Stage"}</h3>
                        <p className="explorer-stage-desc">{stage.description}</p>
                        {total > 0 && (
                          <div className="explorer-stage-progress">
                            <div className="explorer-stage-progress-bar">
                              <div className="explorer-stage-progress-fill" style={{ width: `${percent}%` }} />
                            </div>
                            <span className="explorer-stage-progress-text">{completed}/{total}</span>
                          </div>
                        )}
                      </div>
                      {!isLocked && (
                        <div className="explorer-stage-arrow">
                          <Icon icon="solar:alt-arrow-down-linear" className={isSelected ? 'rotated' : ''} />
                        </div>
                      )}
                    </button>

                    {/* Lessons List */}
                    {isSelected && (
                      <div className="explorer-lessons-wrap">
                        {loadingLessons ? (
                          <div className="explorer-lessons-loading">
                            <Leapfrog size="30" speed="2.5" color="var(--primary)" />
                          </div>
                        ) : lessons.length === 0 ? (
                          <p className="explorer-lessons-empty">No lessons found</p>
                        ) : (
                          <div className="explorer-lessons-list">
                            {lessons.map((lesson, lessonIndex) => {
                              const lessonCompleted = isLessonCompleted(lesson.id);
                              const isActive = lessonIndex === 0 || isLessonCompleted(lessons[lessonIndex - 1]?.id);

                              return (
                                <button
                                  key={lesson.id}
                                  onClick={() => { if (isActive) { triggerHaptic(); openLesson(lesson); } }}
                                  className={`explorer-lesson-card ${lessonCompleted ? 'completed' : ''} ${!isActive ? 'locked' : ''}`}
                                  disabled={!isActive}
                                >
                                  <div className="explorer-lesson-status">
                                    {lessonCompleted ? (
                                      <Icon icon="solar:check-circle-bold" className="explorer-lesson-check" />
                                    ) : !isActive ? (
                                      <Icon icon="solar:lock-keyhole-bold" className="explorer-lesson-lock" />
                                    ) : (
                                      <div className="explorer-lesson-dot" />
                                    )}
                                  </div>
                                  <div className="explorer-lesson-info">
                                    <h4 className="explorer-lesson-title">{lesson.title}</h4>
                                    <p className="explorer-lesson-desc">{lesson.description}</p>
                                  </div>
                                  {isActive && !lessonCompleted && (
                                    <div className="explorer-lesson-play">
                                      <Icon icon="solar:play-bold" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Global Transition Overlay */}
      {transitioning && (
        <div className="transition-overlay">
          <div className="transition-card">
            <Leapfrog size="40" speed="2.5" color="var(--primary)" />
          </div>
        </div>
      )}

      {/* NEW: Android Back Exit Bottom Sheet */}
      {showExitSheet && (
        <div className="exit-sheet-overlay" onClick={() => setShowExitSheet(false)}>
          <div
            className="exit-sheet-content"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "slideUpSheet 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
          >
            <div className="exit-sheet-handle"></div>
            <h2 className="exit-sheet-title">Are you sure you want to leave?</h2>
            <p className="exit-sheet-subtitle">Any unsaved progress may be lost.</p>
            <div className="exit-sheet-actions">
              <button
                className="btn-primary"
                style={{ flex: 1, backgroundColor: 'var(--muted)', color: 'var(--foreground)', boxShadow: 'none' }}
                onClick={() => { triggerHaptic(); setShowExitSheet(false); }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, backgroundColor: 'var(--destructive)', boxShadow: 'none' }}
                onClick={() => { triggerHaptic(); CapacitorApp.exitApp(); }}
              >
                Exit App
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
