import { useEffect, useState, useRef, useMemo } from "react";
import ScenarioChat from "./ScenarioChat";
import PreBookLesson from "./PreBookLesson";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabaseClient";
import { Leapfrog } from 'ldrs/react';
import 'ldrs/react/Leapfrog.css';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { VoiceRecorder } from '@independo/capacitor-voice-recorder';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { MdArrowBackIosNew, MdArrowForwardIos } from "react-icons/md";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from 'motion/react';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
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

// ===== UK TIMEZONE HELPERS =====
// All "daily" rotations and completion checks are anchored to Europe/London midnight,
// so BST vs GMT never causes 1 AM drift.
const UK_TZ = 'Europe/London';

function getUkDateString(date = new Date()) {
  // Returns YYYY-MM-DD for the given instant in UK local time.
  return new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(date);
}

function getUkDaysSince(startIso) {
  const startStr = getUkDateString(new Date(startIso));
  const todayStr = getUkDateString();
  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = todayStr.split('-').map(Number);
  return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function getCycleOffset(daysDiff, total) {
  if (!total) return 0;
  return ((daysDiff % total) + total) % total;
}

function getUkMidnightUtcIso(date = new Date()) {
  // Returns the UTC ISO string representing UK-local midnight of the given date's UK day.
  const [y, m, d] = getUkDateString(date).split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const ukHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ, hour: '2-digit', hour12: false
  }).format(guess));
  return new Date(guess.getTime() - ukHour * 3600000).toISOString();
}

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
const COMMUNITY_RETENTION_DAYS = 7;
const COMMUNITY_PAGE_SIZE = 15;
const ANDROID_DOWNLOAD_URL = 'https://ihyaarabicapp.com/download';

// ===== HAPTIC + SOUND HELPERS =====

// Light tap (buttons, navigation)
const triggerHaptic = async () => {
  playClickSound();
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch (e) { }
};

// Haptic only — no audio click (used before TTS to avoid audio session conflict)
const triggerHapticOnly = async () => {
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



// Compare two semver strings: returns -1 if a < b, 0 if equal, 1 if a > b
function compareSemver(a, b) {
  const pa = (a || '0.0.0').split('.').map(Number);
  const pb = (b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

function App() {
  // ============ FORCE UPDATE STATE ============
  const [forceUpdate, setForceUpdate] = useState(null); // null = not checked yet / ok, { update_url } = blocked

  useEffect(() => {
    const checkVersion = async () => {
      // Only check on native (Android) — web uses a different strategy
      if (!Capacitor.isNativePlatform()) return;

      try {
        const info = await CapacitorApp.getInfo(); // { version: "1.0.0", build: "1", ... }
        const localVersion = info.version;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${SUPABASE_URL}/functions/v1/app-metadata`, {
          signal: controller.signal,
          headers: { 'apikey': SUPABASE_ANON_KEY },
        });
        clearTimeout(timeout);

        if (!res.ok) return; // If endpoint fails, let the app proceed

        const metadata = await res.json();
        const minVersion = metadata.android?.minimum_required_version;
        const updateUrl = ANDROID_DOWNLOAD_URL;

        if (minVersion && compareSemver(localVersion, minVersion) < 0) {
          setForceUpdate({ update_url: updateUrl });
          // Cache for offline fallback
          localStorage.setItem('force_update_metadata', JSON.stringify(metadata.android));
        } else {
          localStorage.removeItem('force_update_metadata');
        }
      } catch {
        // Network failure — check cached metadata as fallback
        try {
          const cached = JSON.parse(localStorage.getItem('force_update_metadata'));
          if (cached) {
            const info = await CapacitorApp.getInfo();
            if (compareSemver(info.version, cached.minimum_required_version) < 0) {
              setForceUpdate({ update_url: ANDROID_DOWNLOAD_URL });
            }
          }
        } catch {}
      }
    };

    checkVersion();
  }, []);

  // ============ WEB STALENESS CHECK ============
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (typeof __APP_BUILD_TIMESTAMP__ === 'undefined') return;

    const checkWebFreshness = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/app-metadata`, {
          headers: { 'apikey': SUPABASE_ANON_KEY },
        });
        if (!res.ok) return;
        const metadata = await res.json();
        const serverBuild = metadata.web?.current_build;
        if (serverBuild && new Date(serverBuild) > new Date(__APP_BUILD_TIMESTAMP__)) {
          if (metadata.web?.force_reload) {
            window.location.reload();
          }
          // For non-forced updates, could show a banner — for now, just reload on force
        }
      } catch {}
    };

    // Check when tab regains focus
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkWebFreshness();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Also check every 10 minutes
    const interval = setInterval(checkWebFreshness, 10 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, []);

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
  const [prebookItems, setPrebookItems] = useState([]);
  const [loadingPrebookItems, setLoadingPrebookItems] = useState(false);
  const [prebookLoadError, setPrebookLoadError] = useState('');

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
  const nativeRecorderActiveRef = useRef(false);
  const recordedAudioMimeRef = useRef('audio/webm');

  // AUDIO STATE
  const audioRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCompleted, setAudioCompleted] = useState(false);
  const [dialogueAudioStarted, setDialogueAudioStarted] = useState(false);
  const [isDialogueSlow, setIsDialogueSlow] = useState(false);
  const [showDialogueTranslations, setShowDialogueTranslations] = useState(false);

  // PARAGRAPH PLAYBACK STATE
  const [playingParagraphId, setPlayingParagraphId] = useState(null);
  const [playingParagraphEnd, setPlayingParagraphEnd] = useState(null);
  const [clickedParagraphs, setClickedParagraphs] = useState(new Set());
  const [hideInstruction, setHideInstruction] = useState(false);
  const [isSlowSpeed, setIsSlowSpeed] = useState(false);
  const [showParagraphTranslations, setShowParagraphTranslations] = useState(false);
  const scenarioTtsCache = useRef({});
  // Persistent TTS cache (localStorage, LRU ~40 entries).
  // Survives app restarts so previously-played audio plays instantly
  // with zero network.
  const TTS_PERSIST_KEY = 'tts_cache_v1';
  const TTS_PERSIST_MAX = 40;
  const loadPersistTts = () => {
    try {
      const raw = localStorage.getItem(TTS_PERSIST_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };
  const getPersistTts = (text) => {
    const c = loadPersistTts();
    const entry = c[text];
    if (!entry) return null;
    entry.t = Date.now();
    try { localStorage.setItem(TTS_PERSIST_KEY, JSON.stringify(c)); } catch {}
    return entry.a;
  };
  const setPersistTts = (text, audioBase64) => {
    try {
      const c = loadPersistTts();
      c[text] = { a: audioBase64, t: Date.now() };
      const keys = Object.keys(c);
      if (keys.length > TTS_PERSIST_MAX) {
        keys.sort((k1, k2) => c[k1].t - c[k2].t);
        keys.slice(0, keys.length - TTS_PERSIST_MAX).forEach(k => delete c[k]);
      }
      localStorage.setItem(TTS_PERSIST_KEY, JSON.stringify(c));
    } catch {
      // Quota exceeded — reset with just this one entry
      try { localStorage.setItem(TTS_PERSIST_KEY, JSON.stringify({ [text]: { a: audioBase64, t: Date.now() } })); } catch {}
    }
  };

  // AUTH STATE
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authForgotMode, setAuthForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  async function upsertTodayDailyStats(patch) {
    if (!user) return { error: null };
    const today = getUkDateString();
    return supabase.from('user_daily_stats').upsert({
      user_id: user.id,
      date: today,
      daily_goal_minutes: dailyGoalMinutes,
      total_minutes_spent: Math.floor(dailySecondsSpent / 60),
      ...patch,
    }, { onConflict: 'user_id,date' });
  }

  async function markPictureCompletedForToday() {
    setPictureCompleted(true);
    const { error } = await upsertTodayDailyStats({ picture_completed: true });
    if (error) console.error('Failed to mark picture complete:', JSON.stringify(error));
  }

  async function markScenarioCompletedForToday() {
    setScenarioCompleted(true);
    const { error } = await upsertTodayDailyStats({ scenario_completed: true });
    if (error) console.error('Failed to mark scenario complete:', JSON.stringify(error));
  }

  // Sync Daily Stats from Supabase on Login
  useEffect(() => {
    if (!user) return;
    try { localStorage.removeItem('picture_completed_date'); } catch {}
    const fetchDailyStats = async () => {
      const today = getUkDateString();
      const { data, error } = await supabase.from('user_daily_stats')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      if (data) {
        setDailyGoalMinutes(data.daily_goal_minutes);
        setDailySecondsSpent(data.total_minutes_spent * 60);
        setScenarioCompleted(Boolean(data.scenario_completed));
        setPictureCompleted(Boolean(data.picture_completed));
      } else if (error?.code === 'PGRST116') {
        // Not found, create it
        await supabase.from('user_daily_stats').insert({
          user_id: user.id,
          date: today,
          daily_goal_minutes: 20,
          picture_completed: false,
          scenario_completed: false,
        });
        setDailyGoalMinutes(20);
        setDailySecondsSpent(0);
        setScenarioCompleted(false);
        setPictureCompleted(false);
      } else if (error) {
        console.error('Failed to load daily stats:', JSON.stringify(error));
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
          const today = getUkDateString();
          supabase.from('user_daily_stats').update({ total_minutes_spent: mins })
            .eq('user_id', user.id).eq('date', today)
            .then(({ error }) => { if (error) console.error('user_daily_stats sync failed:', JSON.stringify(error)); });
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
  const [showQuitStoryConfirm, setShowQuitStoryConfirm] = useState(false);

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
    user: null,
    showTeacherDashboard: false,
    showTeacherStudentPosts: false
  });

  // TRANSITION OVERLAY STATE
  const [transitioning, setTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState("forward"); // "forward" | "back"
  const transitionTimerRef = useRef(null);
  const [tabTransitionKey, setTabTransitionKey] = useState(0);
  const [tabDirection, setTabDirection] = useState('forward');
  const tabOrder = { home: 0, courses: 1, community: 2, profile: 3 };
  const switchTab = (newTab) => {
    if (newTab === activeTab) return;
    setTabDirection(tabOrder[newTab] > tabOrder[activeTab] ? 'forward' : 'back');
    setTabTransitionKey(k => k + 1);
    setActiveTab(newTab);
    window.scrollTo(0, 0);
  };

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

  // ✅ COMMUNITY STATE
  const [userProfile, setUserProfile] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileSetupName, setProfileSetupName] = useState('');
  const [profileSetupAvatar, setProfileSetupAvatar] = useState('');
  const [communityView, setCommunityView] = useState('feed'); // 'feed' | 'exercise' | 'post_detail'
  const [dailyExercises, setDailyExercises] = useState(null);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [dailyExercisesError, setDailyExercisesError] = useState('');
  const [activeExerciseType, setActiveExerciseType] = useState(null); // 'read_aloud' | 'translate' | 'daily_question'
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(null);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [loadingCommunityPosts, setLoadingCommunityPosts] = useState(false);
  const [loadingMoreCommunityPosts, setLoadingMoreCommunityPosts] = useState(false);
  const [communityHasMore, setCommunityHasMore] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [postCorrections, setPostCorrections] = useState([]);
  const [loadingCorrections, setLoadingCorrections] = useState(false);
  const [userCompletions, setUserCompletions] = useState({ read_aloud: 0, translate: 0, daily_question: 0 });
  const [communityInputMode, setCommunityInputMode] = useState('type'); // 'record' | 'type'
  const [communityTypedAnswer, setCommunityTypedAnswer] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [communityFilter, setCommunityFilter] = useState('all');
  const [correctionText, setCorrectionText] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, variant, onConfirm }
  const [deletingCorrectionId, setDeletingCorrectionId] = useState(null);
  const [userReactions, setUserReactions] = useState({}); // { post_id: 'perfect', correction_id: 'upvote' }
  const [playingPostId, setPlayingPostId] = useState(null);
  const [comAudioProgress, setComAudioProgress] = useState(0);
  const [comAudioDuration, setComAudioDuration] = useState(0);
  const [comAudioTime, setComAudioTime] = useState(0);
  const communityAudioRef = useRef(null);
  const communityExerciseRef = useRef(false);
  const correctionRecordingRef = useRef(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const previewAudioRef = useRef(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewDurationRef = useRef(0);
  const [showMyPosts, setShowMyPosts] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [myPosts, setMyPosts] = useState([]);
  const [loadingMyPosts, setLoadingMyPosts] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [showTeacherDashboard, setShowTeacherDashboard] = useState(false);
  const [teacherDashboardData, setTeacherDashboardData] = useState(null);
  const [loadingTeacherDashboard, setLoadingTeacherDashboard] = useState(false);
  const [teacherDashboardError, setTeacherDashboardError] = useState('');
  const [showTeacherStudentPosts, setShowTeacherStudentPosts] = useState(false);
  const [teacherSelectedStudent, setTeacherSelectedStudent] = useState(null);
  const [teacherStudentPosts, setTeacherStudentPosts] = useState([]);
  const [loadingTeacherStudentPosts, setLoadingTeacherStudentPosts] = useState(false);
  const [teacherStudentPostsError, setTeacherStudentPostsError] = useState('');
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [teacherStudentsVisible, setTeacherStudentsVisible] = useState(50);
  const [moderatingTargetKey, setModeratingTargetKey] = useState(null);
  const [recordingCountdown, setRecordingCountdown] = useState(null);
  const recordingTimerRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordingCancelledRef = useRef(false);
  const [completedPrompts, setCompletedPrompts] = useState(new Set());
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(new Set());
  const [infoToast, setInfoToast] = useState(null); // { message, icon }
  const infoToastTimerRef = useRef(null);
  const showInfoToast = (message, icon = 'solar:info-circle-bold') => {
    if (infoToastTimerRef.current) clearTimeout(infoToastTimerRef.current);
    setInfoToast(null);
    requestAnimationFrame(() => {
      setInfoToast({ message, icon });
      infoToastTimerRef.current = setTimeout(() => setInfoToast(null), 2500);
    });
  };
  const [pictureCompleted, setPictureCompleted] = useState(false);
  const [correctionInputMode, setCorrectionInputMode] = useState('text');
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const isTeacher = userRoles.includes('teacher');
  const isAdmin = userRoles.includes('admin');
  const canManageCommunity = isTeacher || isAdmin;
  const canViewTeacherDashboard = canManageCommunity;

  useEffect(() => {
    if (user) return;
    setUserProfile(null);
    setUserRoles([]);
    setShowTeacherDashboard(false);
    setTeacherDashboardData(null);
    setTeacherDashboardError('');
    setShowTeacherStudentPosts(false);
    setTeacherSelectedStudent(null);
    setTeacherStudentPosts([]);
    setTeacherStudentPostsError('');
    setModeratingTargetKey(null);
  }, [user]);

  // ✅ WORD OF THE DAY STATE
  const [wotdPhase, setWotdPhase] = useState("intro"); // "intro" | "word" | "examples" | "complete"
  const [currentWotd, setCurrentWotd] = useState(null);
  const [wotdExamples, setWotdExamples] = useState([]);
  const [wotdExampleIndex, setWotdExampleIndex] = useState(0);
  const [loadingWotd, setLoadingWotd] = useState(false);

  const wotdCelebratedRef = useRef(false);
  useEffect(() => {
    if (wotdPhase === "complete") {
      if (!wotdCelebratedRef.current) {
        wotdCelebratedRef.current = true;
        playCelebrationSound();
        triggerHeavyHaptic();
      }
    } else {
      wotdCelebratedRef.current = false;
    }
  }, [wotdPhase]);

  // ✅ PICTURE DESCRIBE STATE
  const [pictureDescribeLessons, setPictureDescribeLessons] = useState([]);
  const [loadingPictureLessons, setLoadingPictureLessons] = useState(false);
  const [activePictureLesson, setActivePictureLesson] = useState(null);
  const [pictureVocab, setPictureVocab] = useState([]);
  const [pictureVocabIndex, setPictureVocabIndex] = useState(0);
  const [picturePhase, setPicturePhase] = useState("lessons");
  // Phases: "lessons" | "intro" | "vocab" | "picture" | "recording" | "feedback" | "completed" | "silence" | "not_arabic" | "too_short"
  const [pictureTranscript, setPictureTranscript] = useState("");
  const [pictureMatchPercent, setPictureMatchPercent] = useState(0);
  const [pictureMatchedWords, setPictureMatchedWords] = useState([]);
  const [pictureMissedWords, setPictureMissedWords] = useState([]);
  const [showPictureHint, setShowPictureHint] = useState(false);
  const [picturePreviewUrl, setPicturePreviewUrl] = useState(null);
  const [pictureRecording, setPictureRecording] = useState(false);
  const [pictureCheckingAnswer, setPictureCheckingAnswer] = useState(false);
  const [pictureRecordingTime, setPictureRecordingTime] = useState(0);
  const pictureTimerRef = useRef(null);
  const PICTURE_MAX_RECORD_SECONDS = 90;

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
  const scenarioAudioRef = useRef(null);
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
        activeSet.add(getUkDateString(new Date(lp.completed_at)));
      }
    });
    speakingLessonProgress.forEach(sp => {
      if (sp.completed_at) {
        activeSet.add(getUkDateString(new Date(sp.completed_at)));
      }
    });

    const todayStr = getUkDateString();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const todayUtcAnchor = Date.UTC(ty, tm - 1, td);
    const yesterdayStr = getUkDateString(new Date(todayUtcAnchor - 86400000));

    let current = 0;
    const startOffset = activeSet.has(todayStr) ? 0 : (activeSet.has(yesterdayStr) ? 1 : 0);
    for (let i = startOffset; i < 365; i++) {
      const dateStr = getUkDateString(new Date(todayUtcAnchor - i * 86400000));
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

  

  // ---------- TTS (Web Speech API) ----------

  const speakAiAudio = async (text, onComplete) => {
    if (!text) return;
    try {
      // L1: in-memory cache (same session)
      if (scenarioTtsCache.current[text]) {
        if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
        const audio = new Audio(`data:audio/mp3;base64,${scenarioTtsCache.current[text]}`);
        scenarioAudioRef.current = audio;
        if (onComplete) audio.onended = onComplete;
        audio.play().catch(e => console.error("Cached audio play failed:", e));
        return;
      }

      // L2: persistent client cache (localStorage — survives restarts)
      const persisted = getPersistTts(text);
      if (persisted) {
        scenarioTtsCache.current[text] = persisted;
        if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
        const audio = new Audio(`data:audio/mp3;base64,${persisted}`);
        scenarioAudioRef.current = audio;
        if (onComplete) audio.onended = onComplete;
        audio.play().catch(e => console.error("Persisted audio play failed:", e));
        return;
      }

      // L3: network — hits edge function → DB cache or Google TTS
      const { data, error } = await supabase.functions.invoke("scenario-chat", {
        body: { action: "generate-tts", text }
      });
      if (error) throw error;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed.audioBase64) {
        scenarioTtsCache.current[text] = parsed.audioBase64;
        setPersistTts(text, parsed.audioBase64);
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

  const speakWithTTS = async (text, lang, rate) => {
    if (!text) { console.warn('TTS: no text'); return; }
    if (scenarioAudioRef.current) scenarioAudioRef.current.pause();
    // Suspend shared AudioContext to release audio focus for system TTS
    if (_sharedAudioCtx && _sharedAudioCtx.state === 'running') {
      try { _sharedAudioCtx.suspend(); } catch (_) {}
    }

    const isNative = Capacitor.isNativePlatform();
    console.log(`TTS: text="${text.substring(0,30)}..." lang=${lang} native=${isNative}`);

    if (isNative) {
      try {
        try { await TextToSpeech.stop(); } catch (_) {}
        console.log('TTS: calling native speak...');
        await TextToSpeech.speak({ text, lang, rate, volume: 1.0 });
        console.log('TTS: native speak finished OK');
        return;
      } catch (e) {
        console.warn('TTS: native failed:', e?.message || e);
        // Try with just the base language code (e.g. 'ar' instead of 'ar-SA')
        try {
          const baseLang = lang.split('-')[0];
          console.log(`TTS: retrying native with lang=${baseLang}`);
          await TextToSpeech.speak({ text, lang: baseLang, rate, volume: 1.0 });
          console.log('TTS: native retry OK');
          return;
        } catch (e2) {
          console.warn('TTS: native retry also failed:', e2?.message || e2);
        }
      }
    }

    // Web: use speechSynthesis directly
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        await new Promise(r => setTimeout(r, 50));
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang;
        utter.rate = rate;
        utter.volume = 1.0;
        const voices = window.speechSynthesis.getVoices() || [];
        console.log(`TTS: web voices available: ${voices.length}, looking for ${lang}`);
        const match = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));
        if (match) {
          console.log(`TTS: matched voice: ${match.name} (${match.lang})`);
          utter.voice = match;
        } else {
          console.log('TTS: no matching voice, using default');
        }
        utter.onerror = (ev) => console.warn('TTS: utterance error:', ev.error);
        utter.onend = () => console.log('TTS: utterance finished');
        window.speechSynthesis.speak(utter);
      } catch (e) { console.warn('TTS: web failed:', e); }
    } else {
      console.warn('TTS: speechSynthesis not available');
    }
  };

  const speakArabic = (text) => speakWithTTS(text, 'ar-SA', 0.85);
  const speakEnglish = (text) => speakWithTTS(text, 'en-US', 0.95);

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

  function isPrebookStage(stageId) {
    const stageLessons = allLessons.filter((lesson) => lesson.stage_id === stageId);
    return stageLessons.length > 0 && stageLessons.every((lesson) => lesson.lesson_format === "prebook");
  }

  function getCoreStages() {
    return stages.filter((stage) => !isPrebookStage(stage.id));
  }

  function isStageUnlocked(stageId) {
    if (isPrebookStage(stageId)) return true;

    const coreStages = getCoreStages();
    const stageIndex = coreStages.findIndex((stage) => stage.id === stageId);
    if (stageIndex <= 0) return true;

    const previousStage = coreStages[stageIndex - 1];
    const previousProgress = getStageProgress(previousStage.id);
    return previousProgress.completed === previousProgress.total && previousProgress.total > 0;
  }

  function isLessonUnlocked(stageLessons, lessonIndex, stageId) {
    if (isPrebookStage(stageId)) return true;
    return lessonIndex === 0 || isLessonCompleted(stageLessons[lessonIndex - 1]?.id);
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
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
      wotdPhase,
      practiceMode,
      selectedStage,
      showStreaksPage,
      activePictureLesson,
      activeSpeakingLesson,
      user,
      communityView,
      showMyPosts,
      showLeaderboard,
      showTeacherDashboard,
      showTeacherStudentPosts,
      activeTab,
      activeExerciseType,
      activeExerciseIndex
    };
  }, [activeLesson, currentWotd, wotdPhase, practiceMode, selectedStage, showStreaksPage, activePictureLesson, activeSpeakingLesson, user, communityView, showMyPosts, showLeaderboard, showTeacherDashboard, showTeacherStudentPosts, activeTab, activeExerciseType, activeExerciseIndex]);

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

        // 2. Inside Word of the Day — navigate back through phases
        if (state.practiceMode === "wotd") {
          setTransitionDirection("back");
          if (state.wotdPhase === "examples") {
            setWotdPhase("word");
          } else if (state.wotdPhase === "word") {
            setWotdPhase("intro");
          } else {
            // intro or complete — exit to home
            setTransitionDirection("back");
            setPracticeMode(null);
            resetWotdFlow();
          }
          return;
        }

        // 2.5. Inside Scenario Chat — handled by ScenarioChat's own listener
        if (scenarioPhase) {
          return;
        }

        // 3. Inside Picture Describe Lesson — go back to home
        if (state.activePictureLesson) {
          setTransitionDirection("back");
          exitPictureToHome();
          return;
        }
        // (legacy cleanup kept for safety)
        if (false) {
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
          setTransitionDirection("back");
          setPracticeMode(null);
          return;
        }

        // 5. Inside a specific Stage (Book view)
        if (state.selectedStage) {
          setTransitionDirection("back");
          setSelectedStage(null);
          return;
        }

        // 6. Inside Streaks Page
        if (state.showStreaksPage) {
          setTransitionDirection("back");
          setShowStreaksPage(false);
          return;
        }

        // 7. Inside My Posts overlay
        if (state.showMyPosts) {
          setTransitionDirection("back");
          setShowMyPosts(false);
          return;
        }

        // 7b. Inside Leaderboard overlay
        if (state.showLeaderboard) {
          setTransitionDirection("back");
          setShowLeaderboard(false);
          return;
        }

        // 7c. Inside Teacher student posts overlay
        if (state.showTeacherStudentPosts) {
          setTransitionDirection("back");
          setShowTeacherStudentPosts(false);
          return;
        }

        // 7d. Inside Teacher Dashboard overlay
        if (state.showTeacherDashboard) {
          setTransitionDirection("back");
          setShowTeacherDashboard(false);
          return;
        }

        // 8a. Community feed with exercise expanded (inline)
        if (state.activeTab === 'community' && state.communityView === 'feed' && state.activeExerciseType) {
          cleanupPreviewAudio();
          if (state.activeExerciseType === 'daily_question' || state.activeExerciseIndex === null) {
            setActiveExerciseType(null);
            setActiveExerciseIndex(null);
            communityExerciseRef.current = false;
            setCommunityTypedAnswer('');
            setRecordedAudio(null);
          } else {
            setActiveExerciseIndex(null);
            setCommunityTypedAnswer('');
            setRecordedAudio(null);
          }
          return;
        }

        // 8b. Inside Community sub-view (post_detail)
        if (state.activeTab === 'community' && state.communityView !== 'feed') {
          setTransitionDirection("back");
          if (state.communityView === 'post_detail') {
            if (communityAudioRef.current) { communityAudioRef.current.pause(); communityAudioRef.current = null; }
            setCommunityView('feed');
            setSelectedPost(null);
            setPostCorrections([]);
          } else {
            setCommunityView('feed');
            setActiveExerciseType(null);
            setActiveExerciseIndex(null);
            communityExerciseRef.current = false;
          }
          return;
        }

        // 9. On Home Root (None of the above are active)
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

  // Web browser back button handling via history API (mirrors Capacitor back button)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // Only for web

    // Determine if we're in any sub-screen
    const isInSubScreen = () => {
      const s = stateRefs.current;
      return !!(s.activeLesson || s.practiceMode || s.selectedStage || s.showStreaksPage ||
        s.activePictureLesson || s.activeSpeakingLesson || s.showMyPosts || s.showLeaderboard ||
        s.showTeacherDashboard || s.showTeacherStudentPosts || scenarioPhase ||
        (s.activeTab === 'community' && (s.activeExerciseType || s.communityView !== 'feed')));
    };

    // Push a history guard entry so back button triggers popstate instead of leaving
    const pushGuard = () => {
      if (isInSubScreen()) {
        window.history.pushState({ appGuard: true }, '');
      }
    };

    const handlePopState = (e) => {
      const state = stateRefs.current;

      // 1. Inside a core lesson
      if (state.activeLesson) {
        setShowExitModal(true);
        pushGuard();
        return;
      }

      // 2. Inside Word of the Day
      if (state.practiceMode === "wotd") {
        setTransitionDirection("back");
        if (state.wotdPhase === "examples") {
          setWotdPhase("word");
        } else if (state.wotdPhase === "word") {
          setWotdPhase("intro");
        } else {
          setTransitionDirection("back");
          setPracticeMode(null);
          resetWotdFlow();
        }
        pushGuard();
        return;
      }

      // 2.5. Inside Scenario Chat
      if (scenarioPhase) {
        pushGuard();
        return;
      }

      // 3. Inside Picture Describe Lesson
      if (state.activePictureLesson) {
        setTransitionDirection("back");
        exitPictureToHome();
        pushGuard();
        return;
      }

      // 3.5. Inside Speaking Lesson
      if (state.activeSpeakingLesson) {
        backToSpeakingLessons();
        pushGuard();
        return;
      }

      // 4. Inside Speaking Practice sub-menu
      if (state.practiceMode) {
        setTransitionDirection("back");
        setPracticeMode(null);
        return;
      }

      // 5. Inside a specific Stage (Book view)
      if (state.selectedStage) {
        setTransitionDirection("back");
        setSelectedStage(null);
        return;
      }

      // 6. Inside Streaks Page
      if (state.showStreaksPage) {
        setTransitionDirection("back");
        setShowStreaksPage(false);
        return;
      }

      // 7. Inside My Posts overlay
      if (state.showMyPosts) {
        setTransitionDirection("back");
        setShowMyPosts(false);
        return;
      }

      // 7b. Inside Leaderboard overlay
      if (state.showLeaderboard) {
        setTransitionDirection("back");
        setShowLeaderboard(false);
        return;
      }

      // 7c. Inside Teacher student posts overlay
      if (state.showTeacherStudentPosts) {
        setTransitionDirection("back");
        setShowTeacherStudentPosts(false);
        return;
      }

      // 7d. Inside Teacher Dashboard overlay
      if (state.showTeacherDashboard) {
        setTransitionDirection("back");
        setShowTeacherDashboard(false);
        return;
      }

      // 8a. Community feed with exercise expanded
      if (state.activeTab === 'community' && state.communityView === 'feed' && state.activeExerciseType) {
        cleanupPreviewAudio();
        if (state.activeExerciseType === 'daily_question' || state.activeExerciseIndex === null) {
          setActiveExerciseType(null);
          setActiveExerciseIndex(null);
          communityExerciseRef.current = false;
          setCommunityTypedAnswer('');
          setRecordedAudio(null);
        } else {
          setActiveExerciseIndex(null);
          setCommunityTypedAnswer('');
          setRecordedAudio(null);
        }
        pushGuard();
        return;
      }

      // 8b. Inside Community sub-view (post_detail)
      if (state.activeTab === 'community' && state.communityView !== 'feed') {
        setTransitionDirection("back");
        if (state.communityView === 'post_detail') {
          if (communityAudioRef.current) { communityAudioRef.current.pause(); communityAudioRef.current = null; }
          setCommunityView('feed');
          setSelectedPost(null);
          setPostCorrections([]);
        } else {
          setCommunityView('feed');
          setActiveExerciseType(null);
          setActiveExerciseIndex(null);
          communityExerciseRef.current = false;
        }
        return;
      }

      // 9. On Home Root — let browser navigate away naturally (don't prevent)
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [scenarioPhase]); // scenarioPhase is read directly, not from refs

  // Push/remove browser history guard when entering/leaving sub-screens (web only)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const inSubScreen = !!(activeLesson || practiceMode || selectedStage || showStreaksPage ||
      activePictureLesson || activeSpeakingLesson || showMyPosts || showLeaderboard ||
      showTeacherDashboard || showTeacherStudentPosts || scenarioPhase ||
      (activeTab === 'community' && (activeExerciseType || communityView !== 'feed')));

    if (inSubScreen && (!window.history.state || !window.history.state.appGuard)) {
      window.history.pushState({ appGuard: true }, '');
    }
  }, [activeLesson, practiceMode, selectedStage, showStreaksPage, activePictureLesson,
    activeSpeakingLesson, showMyPosts, showLeaderboard, showTeacherDashboard,
    showTeacherStudentPosts, scenarioPhase, activeTab, activeExerciseType, communityView]);

  // Scroll to top when navigating between screens
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeLesson, practiceMode, selectedStage, showStreaksPage, activePictureLesson,
    activeSpeakingLesson, showMyPosts, showLeaderboard, showTeacherDashboard,
    showTeacherStudentPosts, scenarioPhase, communityView, wotdPhase]);

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

    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      console.error('signUp failed:', JSON.stringify(error));
      setAuthError(error.message);
      return;
    }

    // Detect "email already registered" — when confirmations are off, Supabase returns
    // a user with no identities instead of throwing an error.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setAuthError("An account with this email already exists. Please sign in.");
      return;
    }

    // Fire welcome email (non-blocking — don't hold up the signup UX if it fails)
    supabase.functions.invoke('send-email', {
      body: { type: 'welcome', to: authEmail, data: { email: authEmail } }
    }).then(({ error: emailErr }) => {
      if (emailErr) console.error('Welcome email failed:', JSON.stringify(emailErr));
    });
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
      console.error('signIn failed:', JSON.stringify(error));
      setAuthError(error.message);
    } else {
      setAuthError("");
    }
  }

  async function handleForgotPassword(e) {
    if (e) e.preventDefault();
    triggerHaptic();
    setAuthError("");
    if (!authEmail) {
      setAuthError("Please enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      console.error('resetPasswordForEmail failed:', JSON.stringify(error));
      setAuthError(error.message);
    } else {
      setResetSent(true);
      setAuthError("");
    }
  }

  async function handleSetNewPassword(e) {
    if (e) e.preventDefault();
    triggerHaptic();
    setAuthError("");

    if (!newPassword || newPassword.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setAuthError("Passwords don't match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error('updateUser failed:', JSON.stringify(error));
      setAuthError(error.message);
      return;
    }

    setRecoverySuccess(true);
    setNewPassword("");
    setNewPasswordConfirm("");
    setTimeout(() => {
      setIsPasswordRecovery(false);
      setRecoverySuccess(false);
    }, 1800);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setUserRoles([]);
    setLessonProgress([]);
    setShowTeacherDashboard(false);
    setTeacherDashboardData(null);
    setShowTeacherStudentPosts(false);
    setTeacherSelectedStudent(null);
    setTeacherStudentPosts([]);
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
      const [questionsRes, vocabRes, explRes, notesRes, speakingRes, blocksRes, prebookRes] = await Promise.all([
        supabase.from("questions").select("id, question_type, prompt_text, order").eq("lesson_id", lessonId).order("order", { ascending: true }),
        supabase.from("lesson_vocab").select("*").eq("lesson_id", lessonId).order("order", { ascending: true }),
        supabase.from("lesson_explanations").select("*").eq("lesson_id", lessonId).order("order", { ascending: true }),
        supabase.from("lesson_notes").select("*").eq("lesson_id", lessonId).order("order_index", { ascending: true }),
        supabase.from("lesson_speaking_exercises").select("*").eq("lesson_id", lessonId).order("order_index", { ascending: true }),
        lessonFormat === "blocks"
          ? supabase.from("lesson_blocks").select(`id, lesson_id, block_type, order_index, text_ar, text_en, speaker_id, audio_url, start_time_seconds, end_time_seconds, speakers (id, display_name_ar, avatar_url, bubble_side)`).eq("lesson_id", lessonId).order("order_index", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        lessonFormat === "prebook"
          ? supabase.from("prebook_items").select("*").eq("lesson_id", lessonId).order("order_index", { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);

      // Fetch question options for MCQs in a single batch
      const questionsWithOptions = await attachOptionsToQuestions(questionsRes.data || []);

      // Store in cache
      const blocks = blocksRes.data || [];
      lessonContentCache.current.set(lessonId, {
        questions: questionsWithOptions,
        vocab: vocabRes.data || [],
        explanations: explRes.data || [],
        grammarNotes: notesRes.data || [],
        speakingExercises: speakingRes.data || [],
        blocks,
        prebookItems: prebookRes.data || []
      });

      // Preload avatar images in background
      const avatarUrls = [...new Set(blocks.map(b => b.speakers?.avatar_url).filter(Boolean))];
      avatarUrls.forEach(url => { const img = new Image(); img.src = url; });

      console.log("Preloaded lesson content:", lessonId);
    } catch (err) {
      console.error("Error preloading lesson:", lessonId, err);
    }
  }

  async function loadPrebookItemsForLesson(lesson) {
    const { data: directItems, error: directError } = await supabase
      .from('prebook_items')
      .select('*')
      .eq('lesson_id', lesson.id)
      .order('order_index', { ascending: true });

    if (directError) {
      throw directError;
    }

    if ((directItems || []).length > 0) {
      return directItems;
    }

    const { data: matchingLessons, error: matchingLessonsError } = await supabase
      .from('lessons')
      .select('id')
      .eq('lesson_format', 'prebook')
      .eq('title', lesson.title)
      .neq('id', lesson.id)
      .order('id', { ascending: true });

    if (matchingLessonsError) {
      throw matchingLessonsError;
    }

    const fallbackLessonIds = (matchingLessons || []).map((row) => row.id);
    if (!fallbackLessonIds.length) {
      return [];
    }

    const { data: fallbackItems, error: fallbackError } = await supabase
      .from('prebook_items')
      .select('*')
      .in('lesson_id', fallbackLessonIds)
      .order('lesson_id', { ascending: true })
      .order('order_index', { ascending: true });

    if (fallbackError) {
      throw fallbackError;
    }

    if ((fallbackItems || []).length > 0) {
      console.warn('Resolved prebook items via duplicate lesson title fallback:', lesson.title);
    }

    return fallbackItems || [];
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
        .select("*")
        .order("order", { ascending: true });

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

    if (!user) return;
    loadInitialData();
    loadUserProfile();
    loadUserRoles();
  }, [user]);

  // ---------- LOAD LESSONS FOR A STAGE ----------

  function resetAudio() {
    try {
      if (nativeRecorderActiveRef.current) {
        VoiceRecorder.stopRecording().catch(() => {});
        nativeRecorderActiveRef.current = false;
      }
    } catch (e) {
      console.warn('Error cleaning up native recorder:', e);
    }

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

  function handleRecordedAudio(base64Audio, mimeType = 'audio/webm', durationSeconds = null) {
    if (!base64Audio) {
      setSpeechError("Recording captured no audio. Please try again.");
      return;
    }

    const normalizedMime = mimeType || 'audio/webm';
    const cleanBase64 = String(base64Audio).includes(",")
      ? String(base64Audio).split(",")[1]
      : String(base64Audio);
    const dataUrl = `data:${normalizedMime};base64,${cleanBase64}`;

    recordedAudioMimeRef.current = normalizedMime;
    setRecordedAudio(dataUrl);
    setRecordedAudioUrl(dataUrl);

    if (durationSeconds && Number.isFinite(durationSeconds)) {
      setPreviewDuration(durationSeconds);
      previewDurationRef.current = durationSeconds;
    }

    if (communityExerciseRef.current) return;

    const currentSpeakingItem = speakingLessonItems[currentSpeakingItemIndex];
    const expectedText = currentSpeakingItem?.arabic_text || null;
    const isSpeakingPractice = !!currentSpeakingItem;
    sendAudioToBackend(cleanBase64, expectedText, isSpeakingPractice, normalizedMime);
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
    setDialogueAudioStarted(false);
    setIsDialogueSlow(false);
    setShowDialogueTranslations(false);
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

  // ---------- COMMUNITY FUNCTIONS ----------

  const AVATAR_OPTIONS = ['😊', '🧑‍🎓', '📚', '🌟', '🎯', '💡', '🔥', '🌍', '🎓', '✨', '🦊', '🐱', '🦁', '🐼', '🦉', '🐸'];

  async function loadUserProfile() {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      // Profile doesn't exist yet — show setup
      setShowProfileSetup(true);
      setProfileSetupName(user.email ? user.email.split('@')[0] : 'Learner');
      setProfileSetupAvatar('😊');
      return;
    }

    setUserProfile(data);
    // If display_name looks auto-generated (email prefix) and no avatar, prompt setup
    if (!data.avatar_url) {
      setShowProfileSetup(true);
      setProfileSetupName(data.display_name || '');
      setProfileSetupAvatar('😊');
    }
  }

  async function loadUserRoles() {
    if (!user) {
      setUserRoles([]);
      return;
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error loading user roles:", error);
      setUserRoles([]);
      return;
    }

    setUserRoles((data || []).map((row) => row.role));
  }

  async function saveUserProfile() {
    if (!user || !profileSetupName.trim()) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        display_name: profileSetupName.trim(),
        avatar_url: profileSetupAvatar,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Save profile error:", error);
      alert("Failed to save profile: " + error.message);
    } else {
      setUserProfile({ id: user.id, display_name: profileSetupName.trim(), avatar_url: profileSetupAvatar });
      setShowProfileSetup(false);
    }
  }

  async function loadTeacherDashboard() {
    if (!user) return;
    setLoadingTeacherDashboard(true);
    setTeacherDashboardError('');
    setExpandedStudentId(null);
    setTeacherStudentsVisible(50);

    try {
      const { data, error } = await supabase.functions.invoke("teacher-dashboard", {
        body: {},
      });

      if (error || data?.error) {
        const message = data?.error || error?.message || "Could not load teacher dashboard.";
        console.error("Teacher dashboard error:", error || data);
        setTeacherDashboardData(null);
        setTeacherDashboardError(message);
        return;
      }

      setTeacherDashboardData(data);
      if (Array.isArray(data?.roles)) {
        setUserRoles(data.roles);
      }
    } catch (err) {
      console.error("loadTeacherDashboard error:", err);
      setTeacherDashboardData(null);
      setTeacherDashboardError(err.message || "Could not load teacher dashboard.");
    } finally {
      setLoadingTeacherDashboard(false);
    }
  }

  async function loadTeacherStudentPosts(student) {
    if (!user || !canManageCommunity || !student?.user_id) return;

    setTeacherSelectedStudent(student);
    setShowTeacherStudentPosts(true);
    setLoadingTeacherStudentPosts(true);
    setTeacherStudentPostsError('');

    try {
      const { data, error } = await supabase.functions.invoke("teacher-posts", {
        body: {
          student_user_id: student.user_id,
          limit: 100,
        },
      });

      if (error || data?.error) {
        const message = data?.error || error?.message || "Could not load student posts.";
        console.error("Teacher student posts error:", error || data);
        setTeacherStudentPosts([]);
        setTeacherStudentPostsError(message);
        return;
      }

      setTeacherSelectedStudent(prev => ({ ...prev, ...(data?.student || {}) }));
      setTeacherStudentPosts(data?.posts || []);
    } catch (err) {
      console.error("loadTeacherStudentPosts error:", err);
      setTeacherStudentPosts([]);
      setTeacherStudentPostsError(err.message || "Could not load student posts.");
    } finally {
      setLoadingTeacherStudentPosts(false);
    }
  }

  function openTeacherStudentPost(post) {
    setShowTeacherStudentPosts(false);
    setShowTeacherDashboard(false);
    setTransitionDirection("forward");
    switchTab("community");
    openPostDetail(post);
  }

  async function loadDailyExercises() {
    setLoadingExercises(true);
    setDailyExercisesError('');
    try {
      const { data, error } = await supabase.rpc('get_daily_exercises');
      if (error) {
        console.error("Error loading daily exercises:", error);
        setDailyExercisesError("Could not load today's exercises. Please try again.");
      } else {
        let exercises = data || {};

        if (!exercises.daily_question) {
          const today = getUkDateString();
          const { count: questionCount, error: countError } = await supabase
            .from("daily_questions")
            .select("*", { count: "exact", head: true })
            .lte("active_date", today);

          if (countError) {
            console.error("Error counting fallback daily questions:", countError);
          }

          const questionOffset = getCycleOffset(
            getUkDaysSince('2026-04-03T00:00:00Z'),
            questionCount || 0
          );

          const { data: fallbackQuestion, error: fallbackError } = await supabase
            .from("daily_questions")
            .select("id, question_en, question_ar, active_date")
            .lte("active_date", today)
            .order("active_date", { ascending: true })
            .order("id", { ascending: true })
            .range(questionOffset, questionOffset)
            .maybeSingle();

          if (fallbackError) {
            console.error("Error loading fallback daily question:", fallbackError);
          } else if (fallbackQuestion) {
            exercises = { ...exercises, daily_question: fallbackQuestion };
          }
        }

        setDailyExercises(exercises);

        if (!exercises.daily_question) {
          setDailyExercisesError("No daily question is available yet.");
        }
      }

      // Check which exercises user already completed today (UK time)
      if (user) {
        const { data: myPosts } = await supabase
          .from("community_posts")
          .select("activity_type, prompt_text")
          .eq("user_id", user.id)
          .gte("created_at", getUkMidnightUtcIso());

        if (myPosts) {
          const counts = { read_aloud: 0, translate: 0, daily_question: 0 };
          const prompts = new Set();
          myPosts.forEach(p => {
            if (counts[p.activity_type] !== undefined) counts[p.activity_type]++;
            if (p.prompt_text) prompts.add(p.prompt_text);
          });
          setUserCompletions(counts);
          setCompletedPrompts(prompts);
        }
      }
    } catch (err) {
      console.error("loadDailyExercises error:", err);
      setDailyExercisesError("Could not load today's exercises. Please try again.");
    }
    setLoadingExercises(false);
  }

  async function loadCommunityPosts(filter = 'all', { append = false, offset = 0 } = {}) {
    if (append) setLoadingMoreCommunityPosts(true);
    else setLoadingCommunityPosts(true);
    try {
      const cutoff = new Date(Date.now() - COMMUNITY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from("community_posts")
        .select("*")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .range(offset, offset + COMMUNITY_PAGE_SIZE - 1);

      if (filter !== 'all') {
        query = query.eq("activity_type", filter);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error loading community posts:", error);
      } else {
        // Fetch profiles for all unique user_ids
        const posts = data || [];
        if (posts.length > 0) {
          const userIds = [...new Set(posts.map(p => p.user_id))];
          const postIds = posts.map(p => p.id);
          const [{ data: profiles }, { data: corrRows }] = await Promise.all([
            supabase.from("profiles").select("id, display_name, avatar_url").in("id", userIds),
            supabase.from("community_corrections").select("post_id, is_ai").in("post_id", postIds),
          ]);
          const profileMap = {};
          (profiles || []).forEach(p => { profileMap[p.id] = p; });
          const countMap = {};
          const aiSet = new Set();
          (corrRows || []).forEach(c => {
            countMap[c.post_id] = (countMap[c.post_id] || 0) + 1;
            if (c.is_ai) aiSet.add(c.post_id);
          });
          posts.forEach(p => {
            p.profiles = profileMap[p.user_id] || { display_name: 'Learner', avatar_url: null };
            p.corrections_count = countMap[p.id] || 0;
            p.has_ai_feedback = aiSet.has(p.id);
          });
        }
        if (append) {
          setCommunityPosts(prev => {
            const existing = new Set(prev.map(p => p.id));
            const merged = [...prev];
            posts.forEach(p => { if (!existing.has(p.id)) merged.push(p); });
            return merged;
          });
        } else {
          setCommunityPosts(posts);
        }
        setCommunityHasMore(posts.length === COMMUNITY_PAGE_SIZE);
      }

      // Load user's reactions
      if (user) {
        const { data: reactions } = await supabase
          .from("community_reactions")
          .select("post_id, correction_id, reaction_type")
          .eq("user_id", user.id);

        if (reactions) {
          const rMap = {};
          reactions.forEach(r => {
            if (r.post_id) rMap[`post_${r.post_id}`] = r.reaction_type;
            if (r.correction_id) rMap[`corr_${r.correction_id}`] = r.reaction_type;
          });
          setUserReactions(rMap);
        }
      }
    } catch (err) {
      console.error("loadCommunityPosts error:", err);
    }
    setLoadingCommunityPosts(false);
    setLoadingMoreCommunityPosts(false);
  }

  async function loadMoreCommunityPosts() {
    if (loadingMoreCommunityPosts || !communityHasMore) return;
    await loadCommunityPosts(communityFilter, { append: true, offset: communityPosts.length });
  }

  async function submitCommunityPost(answerText, audioBase64 = null) {
    if (!user || !activeExerciseType || !dailyExercises) {
      console.error("submitCommunityPost: guard failed", { user: !!user, activeExerciseType, dailyExercises: !!dailyExercises });
      return;
    }
    setSubmittingPost(true);

    try {
      let exercises, currentExercise, promptText, questionId = null;

      if (activeExerciseType === 'read_aloud') {
        exercises = dailyExercises.read_aloud || [];
        currentExercise = exercises[activeExerciseIndex];
        promptText = currentExercise?.arabic_text || '';
      } else if (activeExerciseType === 'translate') {
        exercises = dailyExercises.translate || [];
        currentExercise = exercises[activeExerciseIndex];
        promptText = currentExercise?.english_text || '';
      } else {
        currentExercise = dailyExercises.daily_question;
        promptText = currentExercise?.question_en || '';
        questionId = currentExercise?.id;
      }

      const insertPayload = {
        user_id: user.id,
        activity_type: activeExerciseType,
        daily_question_id: questionId,
        prompt_text: promptText,
        answer_text: answerText || null,
        audio_url: audioBase64 || null,
      };

      const { error } = await supabase.from("community_posts").insert(insertPayload);

      if (error) {
        console.error("Error submitting post:", error);
        alert("Failed to post: " + (error.message || "Unknown error"));
      } else {
        // Update completion count
        setUserCompletions(prev => ({ ...prev, [activeExerciseType]: (prev[activeExerciseType] || 0) + 1 }));
        if (promptText) {
          setCompletedPrompts(prev => {
            const next = new Set(prev);
            next.add(promptText);
            return next;
          });
        }

        // Always go back to feed after posting
        cleanupPreviewAudio();
        setCommunityView('feed');
        setActiveExerciseType(null);
        setActiveExerciseIndex(null);
        setCommunityTypedAnswer('');
        setRecordedAudio(null);
        communityExerciseRef.current = false;
        loadCommunityPosts(communityFilter);
      }
    } catch (err) {
      console.error("submitCommunityPost error:", err);
      alert("Something went wrong: " + (err.message || "Unknown error"));
    }
    setSubmittingPost(false);
  }

  async function loadMyPosts() {
    if (!user) return;
    setLoadingMyPosts(true);
    try {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("Error loading my posts:", error);
      } else {
        setMyPosts(data || []);
      }
    } catch (err) {
      console.error("loadMyPosts error:", err);
    }
    setLoadingMyPosts(false);
  }

  function showConfirm({ title, message, variant = 'danger', confirmLabel = 'Delete', onConfirm }) {
    setConfirmModal({ title, message, variant, confirmLabel, onConfirm });
  }

  async function deleteMyCorrection(correctionId, postId) {
    if (!user) return;
    setDeletingCorrectionId(correctionId);
    try {
      const { error } = await supabase
        .from("community_corrections")
        .delete()
        .eq("id", correctionId)
        .eq("user_id", user.id);
      if (error) {
        console.error("Error deleting correction:", error);
        showInfoToast('Failed to delete correction', 'solar:danger-triangle-bold');
      } else {
        setPostCorrections(prev => prev.filter(c => c.id !== correctionId));
        if (postId) {
          setCommunityPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, corrections_count: Math.max(0, (p.corrections_count || 0) - 1) } : p
          ));
        }
        showInfoToast('Correction deleted', 'solar:trash-bin-trash-bold');
      }
    } catch (err) {
      console.error("deleteMyCorrection error:", err);
    }
    setDeletingCorrectionId(null);
  }

  async function deleteMyPost(postId) {
    if (!user) return;
    setDeletingPostId(postId);
    try {
      const { error } = await supabase
        .from("community_posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", user.id);
      if (error) {
        console.error("Error deleting post:", error);
        alert("Failed to delete: " + (error.message || "Unknown error"));
      } else {
        setMyPosts(prev => prev.filter(p => p.id !== postId));
        setCommunityPosts(prev => prev.filter(p => p.id !== postId));
      }
    } catch (err) {
      console.error("deleteMyPost error:", err);
    }
    setDeletingPostId(null);
  }

  async function moderateCommunityItem({ targetType, targetId, postId = null, isAi = false, reason = '' }) {
    if (!user || !canManageCommunity) return;

    const key = `${targetType}_${targetId}`;
    setModeratingTargetKey(key);

    try {
      const { data, error } = await supabase.functions.invoke("moderate-community", {
        body: {
          target_type: targetType,
          target_id: targetId,
          reason,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Moderation failed.");
      }

      const resolvedPostId = data?.post_id || postId;
      const deletedAi = data?.is_ai ?? isAi;

      if (targetType === 'post') {
        setCommunityPosts(prev => prev.filter(post => post.id !== targetId));
        setMyPosts(prev => prev.filter(post => post.id !== targetId));

        if (selectedPost?.id === targetId) {
          if (communityAudioRef.current) {
            communityAudioRef.current.pause();
            communityAudioRef.current = null;
          }
          cleanupPreviewAudio();
          setPlayingPostId(null);
          setComAudioProgress(0);
          setComAudioTime(0);
          setCommunityView('feed');
          setSelectedPost(null);
          setPostCorrections([]);
          setCorrectionText('');
          setCorrectionInputMode('text');
          setRecordedAudio(null);
          communityExerciseRef.current = false;
          correctionRecordingRef.current = false;
        }
      } else {
        setPostCorrections(prev => prev.filter(corr => corr.id !== targetId));

        if (resolvedPostId) {
          setCommunityPosts(prev => prev.map(post => (
            post.id === resolvedPostId
              ? {
                ...post,
                corrections_count: Math.max(0, (post.corrections_count || 0) - 1),
                has_ai_feedback: deletedAi ? false : post.has_ai_feedback,
              }
              : post
          )));
          setSelectedPost(prev => (
            prev && prev.id === resolvedPostId
              ? { ...prev, has_ai_feedback: deletedAi ? false : prev.has_ai_feedback }
              : prev
          ));
        }
      }

      showInfoToast(targetType === 'post' ? 'Post deleted' : 'Correction deleted', 'solar:trash-bin-trash-bold');

      await loadCommunityPosts(communityFilter);
      if (showTeacherDashboard) {
        await loadTeacherDashboard();
      }
    } catch (err) {
      console.error("moderateCommunityItem error:", err);
      alert(err.message || "Moderation failed.");
    } finally {
      setModeratingTargetKey(null);
    }
  }

  async function togglePerfectReaction(postId) {
    if (!user) return;
    const key = `post_${postId}`;
    const existing = userReactions[key];

    if (existing === 'perfect') {
      // Remove reaction
      await supabase.from("community_reactions")
        .delete()
        .eq("user_id", user.id)
        .eq("post_id", postId)
        .eq("reaction_type", "perfect");

      setUserReactions(prev => { const n = { ...prev }; delete n[key]; return n; });
      setCommunityPosts(prev => prev.map(p => p.id === postId ? { ...p, perfect_count: Math.max(0, p.perfect_count - 1) } : p));
    } else {
      // Add reaction
      await supabase.from("community_reactions").insert({
        user_id: user.id,
        post_id: postId,
        reaction_type: "perfect",
      });

      setUserReactions(prev => ({ ...prev, [key]: 'perfect' }));
      setCommunityPosts(prev => prev.map(p => p.id === postId ? { ...p, perfect_count: p.perfect_count + 1 } : p));
    }
  }

  async function openPostDetail(post) {
    setSelectedPost(post);
    setTransitionDirection("forward");
    setCommunityView('post_detail');
    setLoadingCorrections(true);

    const { data, error } = await supabase
      .from("community_corrections")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    if (!error) {
      const corrections = data || [];
      if (corrections.length > 0) {
        const userIds = [...new Set(corrections.map(c => c.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });
        corrections.forEach(c => { c.profiles = profileMap[c.user_id] || { display_name: 'Learner', avatar_url: null }; });
      }
      setPostCorrections(corrections);
    }
    setLoadingCorrections(false);
  }

  async function requestAiFeedback(postId) {
    if (!user) return;
    setAiFeedbackLoading(prev => { const s = new Set(prev); s.add(postId); return s; });
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/community-ai-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.session?.access_token}`,
        },
        body: JSON.stringify({ post_id: postId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !json.skipped) {
        console.error("AI feedback failed:", json);
        alert(json.error || "AI feedback failed. Please try again.");
        return;
      }

      // Mark this post as having AI feedback so the button disables everywhere
      setCommunityPosts(prev => prev.map(p => p.id === postId ? { ...p, has_ai_feedback: true, corrections_count: (p.corrections_count || 0) + 1 } : p));
      if (selectedPost?.id === postId) {
        setSelectedPost(prev => prev ? { ...prev, has_ai_feedback: true } : prev);
        // Reload corrections so the AI message appears in post detail
        const { data } = await supabase
          .from("community_corrections")
          .select("*")
          .eq("post_id", postId)
          .order("created_at", { ascending: true });
        if (data) {
          const userIds = [...new Set(data.map(c => c.user_id))];
          const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", userIds);
          const profileMap = {};
          (profiles || []).forEach(p => { profileMap[p.id] = p; });
          data.forEach(c => { c.profiles = profileMap[c.user_id] || { display_name: 'Learner', avatar_url: null }; });
          setPostCorrections(data);
        }
      }
      // Success toast
      showInfoToast(json.skipped ? 'AI feedback already exists' : 'AI feedback ready!', 'solar:magic-stick-3-bold');
    } catch (e) {
      console.error("AI feedback request error:", e);
      alert("AI feedback failed. Please try again.");
    } finally {
      setAiFeedbackLoading(prev => { const s = new Set(prev); s.delete(postId); return s; });
    }
  }

  async function submitCorrection(postId, audioBase64 = null) {
    if (!user || (!correctionText.trim() && !audioBase64)) return;
    setSubmittingCorrection(true);

    try {
      const insertPayload = {
        post_id: postId,
        user_id: user.id,
        correction_text: correctionText.trim() || (audioBase64 ? '[Voice feedback]' : ''),
      };
      if (audioBase64) insertPayload.audio_url = audioBase64;

      const { data, error } = await supabase
        .from("community_corrections")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        console.error("Error submitting correction:", error);
        alert("Failed to post correction: " + (error.message || "Unknown error"));
        return;
      }

      if (data) {
        data.profiles = userProfile || { display_name: 'Learner', avatar_url: null };
        setPostCorrections(prev => [...prev, data]);
        setCorrectionText('');
        cleanupPreviewAudio();
        setRecordedAudio(null);
        setCorrectionInputMode('text');
        correctionRecordingRef.current = false;
        communityExerciseRef.current = false;
      }
    } catch (err) {
      console.error("submitCorrection error:", err);
      alert("Something went wrong: " + (err.message || "Unknown error"));
    } finally {
      setSubmittingCorrection(false);
    }
  }

  async function refreshCommunityFeed() {
    setRefreshingFeed(true);
    await Promise.all([
      loadCommunityPosts(communityFilter),
      loadDailyExercises(),
      loadLeaderboard(),
    ]);
    setRefreshingFeed(false);
  }

  async function loadLeaderboard() {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: posts } = await supabase
        .from("community_posts")
        .select("user_id")
        .gte("created_at", weekAgo);

      if (!posts || posts.length === 0) { setLeaderboard([]); return; }

      const countMap = {};
      posts.forEach(p => { countMap[p.user_id] = (countMap[p.user_id] || 0) + 1; });
      const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const userIds = sorted.map(([id]) => id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      setLeaderboard(sorted.map(([id, count]) => ({
        user_id: id,
        count,
        display_name: profileMap[id]?.display_name || 'Learner',
        avatar_url: profileMap[id]?.avatar_url || null,
      })));
    } catch (err) {
      console.error("loadLeaderboard error:", err);
    }
  }

  async function toggleCorrectionVote(correctionId, voteType) {
    if (!user) return;
    const key = `corr_${correctionId}`;
    const existing = userReactions[key];

    if (existing === voteType) {
      await supabase.from("community_reactions")
        .delete()
        .eq("user_id", user.id)
        .eq("correction_id", correctionId)
        .eq("reaction_type", voteType);

      setUserReactions(prev => { const n = { ...prev }; delete n[key]; return n; });
      setPostCorrections(prev => prev.map(c => {
        if (c.id === correctionId) {
          return { ...c, [voteType === 'upvote' ? 'upvotes' : 'downvotes']: Math.max(0, c[voteType === 'upvote' ? 'upvotes' : 'downvotes'] - 1) };
        }
        return c;
      }));
    } else {
      // Remove old vote if switching
      if (existing) {
        await supabase.from("community_reactions")
          .delete()
          .eq("user_id", user.id)
          .eq("correction_id", correctionId);
      }

      await supabase.from("community_reactions").insert({
        user_id: user.id,
        correction_id: correctionId,
        reaction_type: voteType,
      });

      setUserReactions(prev => ({ ...prev, [key]: voteType }));
      setPostCorrections(prev => prev.map(c => {
        if (c.id === correctionId) {
          const updated = { ...c };
          if (voteType === 'upvote') {
            updated.upvotes = (updated.upvotes || 0) + 1;
            if (existing === 'downvote') updated.downvotes = Math.max(0, (updated.downvotes || 0) - 1);
          } else {
            updated.downvotes = (updated.downvotes || 0) + 1;
            if (existing === 'upvote') updated.upvotes = Math.max(0, (updated.upvotes || 0) - 1);
          }
          return updated;
        }
        return c;
      }));
    }
  }

  async function submitReport() {
    if (!user || !reportTarget || !reportReason.trim()) return;
    await supabase.from("community_reports").insert({
      reporter_id: user.id,
      post_id: reportTarget.type === 'post' ? reportTarget.id : null,
      correction_id: reportTarget.type === 'correction' ? reportTarget.id : null,
      reason: reportReason.trim(),
    });
    setShowReportModal(false);
    setReportTarget(null);
    setReportReason('');
  }

  function getTimeAgo(dateStr) {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function formatAudioTime(sec) {
    if (!sec || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function stripLeadingSentenceNumber(text) {
    if (!text) return '';
    return text.replace(/^[\s\u200e\u200f]*[\d٠-٩]+\s*[\.\)\-:]\s*/, '').trim();
  }

  function formatMinutesSpent(totalMinutes) {
    const mins = Math.max(0, Number(totalMinutes || 0));
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainder = mins % 60;
    if (remainder === 0) return `${hours}h`;
    return `${hours}h ${remainder}m`;
  }

  function formatDashboardDate(dateStr) {
    if (!dateStr) return 'No activity yet';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getTeacherLeaderboard(metric, limit = 3) {
    const students = teacherDashboardData?.students || [];
    return [...students]
      .sort((a, b) => {
        const aValue = Number(a?.stats?.[metric] || 0);
        const bValue = Number(b?.stats?.[metric] || 0);
        if (bValue !== aValue) return bValue - aValue;
        return (b?.stats?.active_days_last_30 || 0) - (a?.stats?.active_days_last_30 || 0);
      })
      .slice(0, limit);
  }

  function formatLeaderboardValue(metric, value) {
    if (metric === 'minutes_last_7_days') return formatMinutesSpent(value);
    if (metric === 'current_streak') return `${value || 0}d`;
    return `${value || 0}`;
  }

  async function playCommunityAudio(postId, audioUrl) {
    // If same post is playing, toggle pause/play
    if (playingPostId === postId && communityAudioRef.current) {
      if (communityAudioRef.current.paused) {
        communityAudioRef.current.play();
        setPlayingPostId(postId);
      } else {
        communityAudioRef.current.pause();
        setPlayingPostId(null);
      }
      return;
    }
    // Stop any existing audio
    if (communityAudioRef.current) {
      communityAudioRef.current.pause();
      communityAudioRef.current.removeAttribute('src');
    }
    const src = audioUrl.startsWith('data:') ? audioUrl : `data:audio/webm;base64,${audioUrl}`;

    // Decode audio data via AudioContext to get accurate duration
    // (WebM from MediaRecorder has broken duration metadata)
    let realDuration = 0;
    try {
      const res = await fetch(src);
      const arrayBuf = await res.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      realDuration = decoded.duration;
      audioCtx.close();
    } catch (e) {
      console.warn('Could not decode audio for duration:', e);
    }

    const audio = new Audio(src);
    communityAudioRef.current = audio;
    comRealDurationRef.current = realDuration;
    setPlayingPostId(postId);
    setComAudioProgress(0);
    setComAudioTime(0);
    setComAudioDuration(realDuration);

    audio.addEventListener('timeupdate', () => {
      const dur = comRealDurationRef.current;
      const t = dur > 0 ? Math.min(audio.currentTime, dur) : audio.currentTime;
      setComAudioTime(t);
      if (dur > 0) setComAudioProgress(Math.min((t / dur) * 100, 100));
    });
    audio.addEventListener('ended', () => {
      setPlayingPostId(null);
      setComAudioProgress(0);
      setComAudioTime(0);
    });
    audio.play().catch(err => console.error("Audio play error:", err));
  }

  const comRealDurationRef = useRef(0);

  function seekCommunityAudio(val, postId) {
    if (playingPostId !== postId || !communityAudioRef.current) return;
    const dur = comRealDurationRef.current;
    if (dur > 0) {
      communityAudioRef.current.currentTime = (val / 100) * dur;
    }
  }

  // ---------- RECORDING PREVIEW PLAYER ----------

  function playPreviewAudio() {
    if (!recordedAudioUrl) return;
    if (previewAudioRef.current) {
      if (previewPlaying) {
        previewAudioRef.current.pause();
        setPreviewPlaying(false);
        return;
      }
      previewAudioRef.current.play();
      setPreviewPlaying(true);
      return;
    }
    const audio = new Audio(recordedAudioUrl);
    previewAudioRef.current = audio;
    setPreviewPlaying(true);
    setPreviewProgress(0);
    setPreviewTime(0);

    audio.addEventListener('timeupdate', () => {
      const dur = previewDurationRef.current;
      // Clamp to real duration — WebM metadata can report bogus currentTime
      const t = dur > 0 ? Math.min(audio.currentTime, dur) : audio.currentTime;
      setPreviewTime(t);
      if (dur > 0) setPreviewProgress(Math.min((t / dur) * 100, 100));
    });
    audio.addEventListener('ended', () => {
      setPreviewPlaying(false);
      setPreviewProgress(0);
      setPreviewTime(0);
    });
    audio.play().catch(err => console.error("Preview play error:", err));
  }

  function seekPreviewAudio(val) {
    if (!previewAudioRef.current) return;
    const dur = previewDurationRef.current;
    if (dur > 0) {
      previewAudioRef.current.currentTime = (val / 100) * dur;
    }
  }

  function cleanupPreviewAudio() {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl(null);
    setPreviewPlaying(false);
    setPreviewProgress(0);
    setPreviewTime(0);
    setPreviewDuration(0);
    previewDurationRef.current = 0;
  }

  // ---------- WORD OF THE DAY FUNCTIONS ----------

  async function loadWordOfTheDay() {
    setLoadingWotd(true);
    setWotdPhase("intro");
    setWotdExampleIndex(0);

    try {
      // Cycle through whatever rows exist in word_of_the_day, ordered by order_index.
      // Anchored to UK midnight on 2026-02-05 so BST/GMT can't shift the rotation.
      const daysDiff = getUkDaysSince('2026-02-05T00:00:00Z');

      const { count: wordCount, error: countError } = await supabase
        .from("word_of_the_day")
        .select("id", { count: "exact", head: true });

      if (countError || !wordCount || wordCount < 1) {
        console.error("Error counting words of the day:", countError);
        return;
      }

      const rowOffset = getCycleOffset(daysDiff, wordCount);

      const { data: wordData, error: wordError } = await supabase
        .from("word_of_the_day")
        .select("*")
        .order("order_index", { ascending: true })
        .range(rowOffset, rowOffset)
        .single();

      if (wordError || !wordData) {
        console.error("Error loading word of the day:", wordError);
        return;
      }

      setCurrentWotd(wordData);
      const { data: examplesData } = await supabase
        .from("word_of_the_day_examples")
        .select("*")
        .eq("word_id", wordData.id)
        .order("order_index", { ascending: true });
      setWotdExamples(examplesData || []);
      // Prime TTS caches from any audio stored on the rows.
      // This is the cross-device fast path — first student of the day
      // populates these columns via writeback; everyone after gets the
      // audio inline with the word query, zero extra network.
      primeWotdAudio(wordData, examplesData || []);
    } catch (err) {
      console.error("Error in loadWordOfTheDay:", err);
    }

    setLoadingWotd(false);
  }

  // Prime client caches from audio_base64 columns on wotd rows.
  // For any row missing audio, kick off a background prewarm that
  // (a) returns the audio to cache here and
  // (b) asks the edge function to write it back onto the row for future users.
  function primeWotdAudio(wordRow, examplesRows) {
    if (!wordRow) return;
    const prewarm = (text, table, id) => {
      if (!text) return;
      if (scenarioTtsCache.current[text]) return;
      const persisted = getPersistTts(text);
      if (persisted) { scenarioTtsCache.current[text] = persisted; return; }
      // Fire-and-forget background prewarm
      supabase.functions.invoke("scenario-chat", {
        body: { action: "generate-tts", text, writeback: { table, id } }
      }).then(({ data, error }) => {
        if (error) return;
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed?.audioBase64) {
          scenarioTtsCache.current[text] = parsed.audioBase64;
          setPersistTts(text, parsed.audioBase64);
        }
      }).catch(() => {});
    };

    if (wordRow.audio_base64) {
      scenarioTtsCache.current[wordRow.arabic_text] = wordRow.audio_base64;
      setPersistTts(wordRow.arabic_text, wordRow.audio_base64);
    } else {
      prewarm(wordRow.arabic_text, "word_of_the_day", wordRow.id);
    }
    for (const ex of examplesRows) {
      if (ex.audio_base64) {
        scenarioTtsCache.current[ex.example_arabic] = ex.audio_base64;
        setPersistTts(ex.example_arabic, ex.audio_base64);
      } else {
        prewarm(ex.example_arabic, "word_of_the_day_examples", ex.id);
      }
    }
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

  async function prefetchPicturePreview() {
    try {
      const { count } = await supabase
        .from("picture_describe_lessons")
        .select("*", { count: "exact", head: true });
      const totalLessons = count || 0;
      if (!totalLessons) return;
      const daysDiff = getUkDaysSince('2026-02-05T00:00:00Z');
      const lessonOffset = getCycleOffset(daysDiff, totalLessons);
      const { data: lesson } = await supabase
        .from("picture_describe_lessons")
        .select("image_url")
        .order("order_index", { ascending: true })
        .order("id", { ascending: true })
        .range(lessonOffset, lessonOffset)
        .maybeSingle();
      if (lesson?.image_url) setPicturePreviewUrl(lesson.image_url);
    } catch (e) {
      console.error("Error prefetching picture preview:", e);
    }
  }

  async function loadPictureOfTheDay() {
    setLoadingPictureLessons(true);
    try {
      // Get total count of picture lessons
      const { count } = await supabase
        .from("picture_describe_lessons")
        .select("*", { count: "exact", head: true });

      const totalLessons = count || 0;
      if (!totalLessons) return;

      // Calculate which lesson to show today (UK time)
      const daysDiff = getUkDaysSince('2026-02-05T00:00:00Z');
      const lessonOffset = getCycleOffset(daysDiff, totalLessons);

      // Fetch today's lesson
      const { data: lesson, error } = await supabase
        .from("picture_describe_lessons")
        .select("*")
        .order("order_index", { ascending: true })
        .order("id", { ascending: true })
        .range(lessonOffset, lessonOffset)
        .maybeSingle();

      if (error || !lesson) {
        console.error("Error loading picture of the day:", error);
        // Fallback to first lesson
        const { data: fallback } = await supabase
          .from("picture_describe_lessons")
          .select("*")
          .order("order_index", { ascending: true })
          .limit(1)
          .single();
        if (fallback) openPictureDescribeLesson(fallback);
      } else {
        openPictureDescribeLesson(lesson);
      }
    } catch (err) {
      console.error("Error in loadPictureOfTheDay:", err);
    }
    setLoadingPictureLessons(false);
  }

  async function openPictureDescribeLesson(lesson) {
    setActivePictureLesson(lesson);
    setPicturePhase("intro");
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

  function openPictureDescribePractice() {
    if (!pictureCompleted) {
      markPictureCompletedForToday();
    }
    setShowPictureHint(false);
    setPicturePhase("picture");
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

        // Check audio volume before sending — detect silence client-side
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const channelData = audioBuffer.getChannelData(0);
          // Calculate RMS (root mean square) volume
          let sumSquares = 0;
          for (let i = 0; i < channelData.length; i++) {
            sumSquares += channelData[i] * channelData[i];
          }
          const rms = Math.sqrt(sumSquares / channelData.length);
          console.log('Picture audio RMS volume:', rms);
          audioCtx.close();

          // RMS below 0.01 means effectively silence
          if (rms < 0.01) {
            console.log('Picture recording: detected silence (RMS too low)');
            setPictureCheckingAnswer(false);
            setPicturePhase("silence");
            return;
          }
        } catch (e) {
          console.warn('Audio volume check failed, proceeding anyway:', e);
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
            imageDescription: activePictureLesson?.image_description || ""
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

      // CHECK 1: AI detected non-Arabic language
      if (parsed?.is_arabic === false) {
        console.log("AI detected non-Arabic speech:", parsed.language_detected, "transcript:", parsed.transcript);
        setPictureCheckingAnswer(false);
        setPicturePhase("not_arabic");
        return;
      }

      const transcript = parsed?.transcript || "";

      console.log("Picture describe transcript:", transcript);
      setPictureTranscript(transcript);

      // CHECK 2: Silence / too few words
      const trimmed = transcript.trim();
      const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
      console.log("Picture describe word count:", wordCount);

      if (!trimmed || wordCount <= 2) {
        setPictureCheckingAnswer(false);
        setPicturePhase("silence");
        return;
      }

      // CHECK 3: Fallback — verify transcript actually contains Arabic characters
      const arabicChars = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
      const totalLetters = (trimmed.match(/[a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
      const arabicRatio = totalLetters > 0 ? arabicChars / totalLetters : 0;
      console.log("Arabic ratio:", arabicRatio, "arabic:", arabicChars, "total:", totalLetters);
      if (arabicRatio < 0.5) {
        setPictureCheckingAnswer(false);
        setPicturePhase("not_arabic");
        return;
      }

      // CLIENT-SIDE too-short detection (under 8 words)
      if (wordCount < 8) {
        setPictureCheckingAnswer(false);
        setPicturePhase("too_short");
        return;
      }

      // Calculate match percentage
      const { percent, matched, missed } = calculateVocabMatch(transcript);
      setPictureMatchPercent(percent);
      setPictureMatchedWords(matched);
      setPictureMissedWords(missed);

      // Always go to feedback phase
      setPicturePhase("feedback");
      setPictureFeedbackIndex(0);
      triggerHaptic();

      setPictureCheckingAnswer(false);

      // Store rating label (fair/good/excellent)
      setPictureScore(parsed.rating || null);

      // Process AI feedback steps from the response
      if (parsed?.steps && Array.isArray(parsed.steps)) {
        // Remove any AI-generated speak_challenge (we use DB follow-up instead)
        let steps = parsed.steps.filter(s => s.type !== 'speak_challenge');

        // Append DB follow-up question as the last step
        if (activePictureLesson?.follow_up_question) {
          steps.push({
            type: 'speak_challenge',
            prompt: activePictureLesson.follow_up_question,
            promptTranslation: activePictureLesson.follow_up_translation || '',
            starterWords: activePictureLesson.follow_up_starters || []
          });
        }

        setPictureFeedbackSteps(steps);
        // Derive vocab stats from the vocab_check step's used[] array (single source of truth)
        const vocabStep = steps.find(s => s.type === 'vocab_check');
        const usedCount = vocabStep?.used?.length ?? parsed.vocabUsed ?? 0;
        const totalCount = parsed.vocabTotal ?? pictureVocab.length;
        setPictureVocabStats({ vocabUsed: usedCount, vocabTotal: totalCount });
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
        // Append DB follow-up question
        if (activePictureLesson?.follow_up_question) {
          fallbackSteps.push({
            type: 'speak_challenge',
            prompt: activePictureLesson.follow_up_question,
            promptTranslation: activePictureLesson.follow_up_translation || '',
            starterWords: activePictureLesson.follow_up_starters || []
          });
        }
        setPictureFeedbackSteps(fallbackSteps);
        const fallbackPercent = parsed?.overallScore ?? percent;
        setPictureScore(fallbackPercent >= 75 ? 'excellent' : fallbackPercent >= 50 ? 'good' : 'fair');
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

  function exitPictureToHome(skipConfirm = false) {
    const inProgress = picturePhase === "picture" || picturePhase === "recording" || picturePhase === "feedback";
    if (!skipConfirm && inProgress) {
      showConfirm({
        title: 'Exit Practice?',
        message: 'Your progress will be lost if you leave now.',
        variant: 'warning',
        confirmLabel: 'Exit',
        onConfirm: () => { setPracticeMode(null); resetPictureDescribeFlow(); },
      });
      return;
    }
    setPracticeMode(null);
    resetPictureDescribeFlow();
  }

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
        const blob = new Blob(chunks, { type: 'audio/webm' });

        // Check audio volume — detect silence before sending to AI
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const channelData = audioBuffer.getChannelData(0);
          let sumSq = 0;
          for (let i = 0; i < channelData.length; i++) sumSq += channelData[i] * channelData[i];
          const rms = Math.sqrt(sumSq / channelData.length);
          audioCtx.close();
          if (rms < 0.01) {
            setChallengeResult(prev => ({ ...prev, [stepIdx]: { good: false, feedback: "We didn't hear anything — tap the mic and try again.", silent: true } }));
            setChallengeChecking(false);
            return;
          }
        } catch (e) { console.warn('Challenge audio check failed:', e); }

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
              const isSilent = !parsed?.transcript || parsed.transcript.trim() === "";
              const feedback = isSilent
                ? "We didn't hear anything — tap the mic and try speaking in Arabic."
                : (parsed?.feedback || (pass ? "Good!" : "That wasn't quite right."));
              setChallengeResult(prev => ({
                ...prev,
                [stepIdx]: { good: pass, feedback, silent: isSilent }
              }));

              if (pass) {
                triggerSuccessFeedback();
                setChallengeCompleted(prev => ({ ...prev, [stepIdx]: true }));
              } else {
                triggerHaptic();
                // Speak challenges: one attempt only — mark completed on failure
                // Correction challenges: allow retry
                if (isSpeakChallenge && !isSilent) {
                  setChallengeCompleted(prev => ({ ...prev, [stepIdx]: true }));
                }
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

      // Auto-stop: 60s for speak_challenge follow-up, 10s for correction
      const step = pictureFeedbackSteps[stepIdx];
      const timeout = step?.type === 'speak_challenge' ? 60000 : 10000;
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
        console.error("Error loading lesson progress:", JSON.stringify(error));
        setLessonProgress([]);
      } else {
        setLessonProgress(data || []);
      }

      // Load speaking lesson progress
      const { data: speakingData, error: speakingError } = await supabase
        .from("speaking_lesson_progress")
        .select("speaking_lesson_id, completed_at");

      if (speakingError) {
        console.error("Error loading speaking lesson progress:", JSON.stringify(speakingError));
        setSpeakingLessonProgress([]);
      } else {
        setSpeakingLessonProgress(speakingData || []);
      }
    }

    fetchProgress();
    loadTodayScenario();
    prefetchPicturePreview();
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
      cleanupPreviewAudio();
      setRecordedAudio(null);
      window.speechSynthesis?.cancel();
      if (_sharedAudioCtx && _sharedAudioCtx.state === 'running') {
        try { await _sharedAudioCtx.suspend(); } catch (_) {}
      }
      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      mediaRecorderRef.current = null;

      if (Capacitor.isNativePlatform()) {
        const permission = await VoiceRecorder.requestAudioRecordingPermission();
        if (!permission?.value) {
          setSpeechError("Microphone permission denied. Please enable it in your device settings.");
          return;
        }

        const status = await VoiceRecorder.getCurrentStatus().catch(() => ({ status: 'NONE' }));
        if (status.status === 'RECORDING' || status.status === 'PAUSED' || status.status === 'INTERRUPTED') {
          await VoiceRecorder.stopRecording().catch(() => null);
        }

        await VoiceRecorder.startRecording();
        nativeRecorderActiveRef.current = true;
        setIsRecording(true);
        console.log('Native recording started');

        if (practiceMode === 'speaking') {
          setTimeout(() => {
            if (nativeRecorderActiveRef.current) {
              stopRecording();
            }
          }, 10000);
        }

        if (communityExerciseRef.current && (activeExerciseType || correctionRecordingRef.current)) {
          const maxSec = activeExerciseType === 'daily_question' ? 60 : 20;
          setRecordingCountdown(maxSec);
          recordingIntervalRef.current = setInterval(() => {
            setRecordingCountdown(prev => {
              if (prev <= 1) return 0;
              return prev - 1;
            });
          }, 1000);
          recordingTimerRef.current = setTimeout(() => {
            if (nativeRecorderActiveRef.current) {
              stopRecording();
            }
          }, maxSec * 1000);
        }
        return;
      }

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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

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

        // If recording was cancelled (user backed out), discard everything
        if (recordingCancelledRef.current) {
          recordingCancelledRef.current = false;
          audioChunksRef.current = [];
          return;
        }

        const recordedMime = mediaRecorder.mimeType || 'audio/webm;codecs=opus';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedMime });

        // Create blob URL for audio preview playback
        const blobUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(blobUrl);

        // Decode to get accurate duration for preview player
        try {
          const arrayBuf = await audioBlob.arrayBuffer();
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const decoded = await audioCtx.decodeAudioData(arrayBuf);
          setPreviewDuration(decoded.duration);
          previewDurationRef.current = decoded.duration;
          audioCtx.close();
        } catch (e) {
          console.warn('Could not decode audio for preview duration:', e);
        }

        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result;
          const base64Audio = base64String.split(',')[1];
          console.log('Audio recorded (' + recordedMime + ' base64), length:', base64Audio.length);
          handleRecordedAudio(base64Audio, recordedMime);
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

      // Community exercise / correction feedback recording limits
      if (communityExerciseRef.current && (activeExerciseType || correctionRecordingRef.current)) {
        const maxSec = activeExerciseType === 'daily_question' ? 60 : 20;
        setRecordingCountdown(maxSec);
        // Countdown interval
        recordingIntervalRef.current = setInterval(() => {
          setRecordingCountdown(prev => {
            if (prev <= 1) return 0;
            return prev - 1;
          });
        }, 1000);
        // Auto-stop timeout
        recordingTimerRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            stopRecording();
          }
        }, maxSec * 1000);
      }
    } catch (err) {
      console.error("Start recording error:", err);
      const errText = String(err?.code || err?.message || err?.name || err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || errText.includes('MISSING_PERMISSION')) {
        setSpeechError("Microphone access denied. Please allow microphone permission in your device settings.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setSpeechError("No microphone found on this device.");
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError' || errText.includes('MICROPHONE_BEING_USED')) {
        setSpeechError("The microphone could not start. Close any voice/audio screen, wait a moment, and try again.");
      } else {
        setSpeechError("Failed to start recording: " + (err.message || err));
      }
    }
  };

  const stopRecording = async () => {
    // Clear community recording timers
    if (recordingTimerRef.current) { clearTimeout(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }
    setRecordingCountdown(null);
    try {
      if (nativeRecorderActiveRef.current) {
        const recording = await VoiceRecorder.stopRecording();
        nativeRecorderActiveRef.current = false;
        setIsRecording(false);

        const value = recording?.value;
        if (!recordingCancelledRef.current) {
          handleRecordedAudio(
            value?.recordDataBase64,
            value?.mimeType || 'audio/mp4',
            value?.msDuration ? value.msDuration / 1000 : null
          );
        }
        recordingCancelledRef.current = false;
        console.log('Native recording stopped');
        return;
      }

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

  // Cancel an in-progress recording without processing/sending the audio.
  // Used when the user navigates away from an exercise/correction mid-recording.
  const cancelRecording = () => {
    if (recordingTimerRef.current) { clearTimeout(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }
    setRecordingCountdown(null);
    try {
      if (nativeRecorderActiveRef.current) {
        recordingCancelledRef.current = true;
        VoiceRecorder.stopRecording().catch(() => {});
        nativeRecorderActiveRef.current = false;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        recordingCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
    } catch (e) {
      console.warn('Failed to cancel recording:', e);
    }
    setIsRecording(false);
    audioChunksRef.current = [];
  };

  // Safety net: if the user leaves a community exercise (back button, tab
  // switch, post submit, etc.) while a recording is in progress, cancel it
  // so the mic isn't left live in the background.
  useEffect(() => {
    if (!activeExerciseType && communityExerciseRef.current && !correctionRecordingRef.current && isRecording) {
      cancelRecording();
    }
  }, [activeExerciseType, isRecording]);

  useEffect(() => {
    if (activeTab !== 'community' && isRecording && communityExerciseRef.current) {
      cancelRecording();
    }
  }, [activeTab, isRecording]);

  // Send recorded audio to Supabase Edge Function
  // expectedTextOverride: optional text to compare against (for Speaking Practice mode)
  // isSpeakingPractice: if true, play jingle sounds for feedback
  const sendAudioToBackend = async (audioBase64, expectedTextOverride = null, isSpeakingPractice = false, mimeType = 'audio/webm') => {
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
            mimeType,
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
    setPrebookItems([]);
    setLoadingPrebookItems(lesson.lesson_format === 'prebook');
    setPrebookLoadError('');
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
    setDialogueAudioStarted(false);
    setIsDialogueSlow(false);
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
        if (lesson.lesson_format === 'prebook') {
          const cachedPrebookItems = cached.prebookItems || [];
          let resolvedPrebookItems = cachedPrebookItems;

          if (!resolvedPrebookItems.length) {
            resolvedPrebookItems = await loadPrebookItemsForLesson(lesson);
          }

          setPrebookItems(resolvedPrebookItems);
          setLoadingPrebookItems(false);
          setPrebookLoadError(resolvedPrebookItems.length ? '' : 'This lesson has no items yet.');
        }

        if (lesson.lesson_format === "blocks") {
          setLessonBlocks(cached.blocks);
          // Preload avatar images so they're ready before audio plays
          const avatarUrls = [...new Set((cached.blocks || []).map(b => b.speakers?.avatar_url).filter(Boolean))];
          avatarUrls.forEach(url => { const img = new Image(); img.src = url; });
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
            // Preload avatar images so they're ready before audio plays
            const avatarUrls = [...new Set((blocks || []).map(b => b.speakers?.avatar_url).filter(Boolean))];
            avatarUrls.forEach(url => { const img = new Image(); img.src = url; });
          }

          setLoadingBlocks(false);
        }

        // ✅ Load prebook items for Foundations lessons
        if (lesson.lesson_format === 'prebook') {
          try {
            const pbItems = await loadPrebookItemsForLesson(lesson);
            setPrebookItems(pbItems || []);
            setPrebookLoadError((pbItems || []).length ? '' : 'This lesson has no items yet.');
          } catch (pbErr) {
            console.error('Error loading prebook items:', pbErr);
            setPrebookItems([]);
            setPrebookLoadError('Failed to load lesson content.');
          }

          setLoadingPrebookItems(false);
        }
      }
    } catch (err) {
      console.error("Error opening lesson:", err);
      setQuestions([]);
      setVocabItems([]);
      setExplanations([]);
      setLessonBlocks([]);
      if (lesson.lesson_format === 'prebook') {
        setPrebookItems([]);
        setLoadingPrebookItems(false);
        setPrebookLoadError('Failed to load lesson content.');
      }
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
    setPrebookItems([]);
    setLoadingPrebookItems(false);
    setPrebookLoadError('');
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
    audioRef.current.playbackRate = 1.0;
    setIsDialogueSlow(false);
    audioRef.current.play()
      .then(() => {
        setAudioPlaying(true);
        setAudioCompleted(false);
        setDialogueAudioStarted(true);
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
              setDialogueAudioStarted(true);
            })
            .catch((retryErr) => {
              console.error("Audio retry also failed:", retryErr);
            });
        };
      });
  }

  function handlePauseDialogue() {
    if (!audioRef.current) return;
    triggerHaptic();
    audioRef.current.pause();
    setAudioPlaying(false);
  }

  function handleResumeDialogue() {
    if (!audioRef.current) return;
    triggerHaptic();
    audioRef.current.play()
      .then(() => setAudioPlaying(true))
      .catch((err) => console.error("Dialogue resume failed:", err));
  }

  function toggleDialogueSpeed() {
    if (!audioRef.current) return;
    triggerHaptic();
    const newSpeed = isDialogueSlow ? 1.0 : 0.8;
    audioRef.current.playbackRate = newSpeed;
    setIsDialogueSlow(!isDialogueSlow);
  }

  // Paragraph tap-to-play handler
  function handleParagraphClick(block) {
    if (!activeLesson?.audio_url || !audioRef.current) return;
    if (block.start_time_seconds == null) return;
    triggerHaptic();

    // If clicking the same block that's currently playing, toggle speed
    if (playingParagraphId === block.id && audioPlaying) {
      const newSpeed = isSlowSpeed ? 1.0 : 0.78;
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

  // ---------- FORCE UPDATE SCREEN ----------

  if (forceUpdate) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: '#0D1B2A',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', textAlign: 'center', fontFamily: 'inherit',
      }}>
        <img src="/clemency-icon.png" alt="Clemency House" style={{ width: 160, height: 160, objectFit: 'contain', marginBottom: '2.5rem', filter: 'brightness(1.6)' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F8F9FA', marginBottom: '0.75rem' }}>Update Required</h1>
        <p style={{ fontSize: '1rem', color: '#A3B1C6', lineHeight: 1.6, maxWidth: 320, marginBottom: '2.5rem' }}>
          A new version of Ihya Arabic App is available. Please update to continue using the app.
        </p>
        <button
          onClick={() => { window.open(forceUpdate.update_url || ANDROID_DOWNLOAD_URL, '_system'); }}
          className="btn-primary"
          style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}
        >
          Download Update
        </button>
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

  // ---------- PASSWORD RECOVERY SCREEN ----------

  if (isPasswordRecovery) {
    return (
      <div className="h-[100dvh] bg-background text-foreground flex flex-col font-sans relative overflow-hidden">
        <div className="noise-overlay" />
        <div className="absolute top-[8%] right-[-15%] auth-watermark" style={{ fontSize: '12rem', fontFamily: "'Amiri', serif", color: 'rgba(224,159,62,0.05)', lineHeight: 1 }}>عربي</div>

        <div className="flex-1 flex flex-col justify-center px-6 py-12 relative z-10 max-w-md mx-auto w-full">
          <div className="text-center mb-8 auth-fade-up">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(224,159,62,0.15), rgba(224,159,62,0.05))', border: '1px solid rgba(224,159,62,0.2)' }}>
              <Icon icon="solar:lock-password-bold" className="text-2xl" style={{ color: '#E09F3E' }} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>Set a new password</h1>
            <p className="text-muted-foreground/70 text-xs mt-2 tracking-wide">Choose a strong password to finish resetting</p>
          </div>

          <form onSubmit={handleSetNewPassword} className="space-y-3">
            <div className="auth-input-group auth-fade-up auth-fade-up-delay-2">
              <div className="relative group flex items-center rounded-2xl border border-border/20 bg-transparent focus-within:border-primary/40 transition-all duration-300">
                <div className="pl-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors duration-300 flex-shrink-0">
                  <Icon icon="solar:lock-password-bold" className="text-[15px]" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full bg-transparent py-3.5 pl-3 pr-2 text-sm focus:outline-none placeholder:text-muted-foreground/25 border-none tracking-wide text-white/90"
                  placeholder="New password"
                />
                <button type="button" className="pr-4 pl-2 text-muted-foreground/40 active:text-primary transition-colors flex-shrink-0" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  <Icon icon={showPassword ? "solar:eye-bold" : "solar:eye-closed-bold"} className="text-[15px]" />
                </button>
              </div>
            </div>

            <div className="auth-input-group auth-fade-up auth-fade-up-delay-3">
              <div className="relative group flex items-center rounded-2xl border border-border/20 bg-transparent focus-within:border-primary/40 transition-all duration-300">
                <div className="pl-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors duration-300 flex-shrink-0">
                  <Icon icon="solar:lock-password-bold" className="text-[15px]" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  required
                  className="w-full bg-transparent py-3.5 pl-3 pr-4 text-sm focus:outline-none placeholder:text-muted-foreground/25 border-none tracking-wide text-white/90"
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            {authError && (
              <div className="bg-destructive/8 border border-destructive/15 text-destructive text-xs font-semibold p-3 rounded-xl flex items-center justify-center gap-2 text-center backdrop-blur-sm">
                <Icon icon="solar:danger-bold" className="text-base flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {recoverySuccess && (
              <div className="bg-green/8 border border-green/15 text-green text-xs font-semibold p-3 rounded-xl flex items-center justify-center gap-2 text-center backdrop-blur-sm">
                <Icon icon="solar:check-circle-bold" className="text-base flex-shrink-0" />
                <span>Password updated! Signing you in...</span>
              </div>
            )}

            <div className="auth-fade-up auth-fade-up-delay-4">
              <button
                type="submit"
                disabled={recoverySuccess}
                className="w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-all text-sm tracking-wide relative overflow-hidden group disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #E09F3E, #D4922F)', color: '#0D1B2A', boxShadow: '0 8px 32px rgba(224,159,62,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
              >
                <Icon icon="solar:check-circle-bold" className="text-base relative z-10" />
                <span className="relative z-10">Update Password</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ---------- LOGIN LANDING SCREEN ----------

  if (!user) {
    return (
      <div className="h-[100dvh] bg-background text-foreground flex flex-col font-sans relative overflow-hidden">
        {/* Noise texture */}
        <div className="noise-overlay" />

        {/* Large floating Arabic calligraphy watermark */}
        <div className="absolute top-[8%] right-[-15%] auth-watermark" style={{ fontSize: '12rem', fontFamily: "'Amiri', serif", color: 'rgba(224,159,62,0.05)', lineHeight: 1 }}>
          عربي
        </div>
        <div className="absolute bottom-[15%] left-[-10%] auth-watermark" style={{ fontSize: '8rem', fontFamily: "'Amiri', serif", color: 'rgba(229,107,111,0.04)', lineHeight: 1, animationDelay: '-3s' }}>
          لغة
        </div>

        {/* Warm radial glow behind form */}
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full auth-glow" style={{ background: 'radial-gradient(circle, rgba(224,159,62,0.08) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[400px] h-[300px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(229,107,111,0.04) 0%, transparent 70%)' }} />

        <div className="flex-1 flex flex-col justify-center px-8 w-full max-w-sm mx-auto relative z-10">
          {/* Logo & Hero */}
          <div className="text-center mb-10 auth-fade-up">
            <div className="flex justify-center mb-5">
              <div className="relative">
                <div className="absolute inset-0 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle, rgba(224,159,62,0.2) 0%, transparent 70%)', transform: 'scale(2)' }} />
                <img src="/clemency-icon.png" alt="Ihya Institute" className="w-20 h-20 object-contain brightness-[1.6] relative z-10" />
              </div>
            </div>
            <h1 className="text-[2rem] font-semibold tracking-tight leading-[1.2] mb-3" style={{ fontFamily: "var(--font-sans)" }}>
              Discover the{' '}
              <span className="relative inline-block">
                <span style={{ color: '#E09F3E' }}>soul</span>
                <span className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #E09F3E, transparent)' }} />
              </span>
              {' '}of Arabic
            </h1>
            <p className="text-muted-foreground text-[13px] leading-relaxed max-w-[260px] mx-auto">
              Master pronunciation, script & heritage at your own pace
            </p>
          </div>

          {/* Form section title */}
          <div className="text-center mb-5 auth-fade-up auth-fade-up-delay-1">
            <h2 className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>
              {authForgotMode ? "Reset password" : authMode === "signin" ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-muted-foreground/70 text-xs mt-1.5 tracking-wide">
              {authForgotMode
                ? "We'll send a reset link to your email"
                : authMode === "signin"
                ? "Sign in to continue your progress"
                : "Start your Arabic journey today"}
            </p>
          </div>

          <form
            onSubmit={authForgotMode ? handleForgotPassword : (authMode === "signin" ? handleSignIn : handleSignUp)}
            className="space-y-3"
          >
            {/* Email input */}
            <div className="auth-input-group auth-fade-up auth-fade-up-delay-2">
              <div className="relative group flex items-center rounded-2xl border border-border/20 bg-transparent focus-within:border-primary/40 transition-all duration-300">
                <div className="pl-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors duration-300 flex-shrink-0">
                  <Icon icon="solar:letter-bold" className="text-[15px]" />
                </div>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  className="w-full bg-transparent py-3.5 pl-3 pr-4 text-sm focus:outline-none placeholder:text-muted-foreground/25 border-none tracking-wide text-white"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            {/* Password input */}
            <div
              className="auth-input-group auth-fade-up auth-fade-up-delay-3"
              style={authForgotMode ? { opacity: 0, height: 0, overflow: 'hidden', margin: 0 } : {}}
            >
              <div className="relative group flex items-center rounded-2xl border border-border/20 bg-transparent focus-within:border-primary/40 transition-all duration-300">
                <div className="pl-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors duration-300 flex-shrink-0">
                  <Icon icon="solar:lock-password-bold" className="text-[15px]" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required={!authForgotMode}
                  className="w-full bg-transparent py-3.5 pl-3 pr-2 text-sm focus:outline-none placeholder:text-muted-foreground/25 border-none tracking-wide text-white"
                  placeholder="••••••••"
                  tabIndex={authForgotMode ? -1 : 0}
                />
                <button
                  type="button"
                  className="pr-4 pl-2 text-muted-foreground/40 active:text-primary transition-colors flex-shrink-0"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  <Icon icon={showPassword ? "solar:eye-bold" : "solar:eye-closed-bold"} className="text-[15px]" />
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="text-right" style={authMode !== "signin" || authForgotMode ? { opacity: 0, height: 0, overflow: 'hidden', margin: 0 } : {}}>
              <button
                type="button"
                className="text-[11px] text-muted-foreground/50 active:text-primary transition-colors tracking-wide"
                onClick={() => { triggerHaptic(); setAuthForgotMode(true); setAuthError(""); setResetSent(false); }}
                tabIndex={authMode !== "signin" || authForgotMode ? -1 : 0}
              >
                Forgot password?
              </button>
            </div>

            {authError && (
              <div className="bg-destructive/8 border border-destructive/15 text-destructive text-xs font-semibold p-3 rounded-xl flex items-center justify-center gap-2 text-center backdrop-blur-sm">
                <Icon icon="solar:danger-bold" className="text-base flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {resetSent && (
              <div className="bg-green/8 border border-green/15 text-green text-xs font-semibold p-3 rounded-xl flex items-center justify-center gap-2 text-center backdrop-blur-sm">
                <Icon icon="solar:check-circle-bold" className="text-base flex-shrink-0" />
                <span>Reset link sent! Check your email.</span>
              </div>
            )}

            <div className="auth-fade-up auth-fade-up-delay-4">
              <button
                type="submit"
                className="w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-all text-sm tracking-wide relative overflow-hidden group"
                style={{ background: 'linear-gradient(135deg, #E09F3E, #D4922F)', color: '#0D1B2A', boxShadow: '0 8px 32px rgba(224,159,62,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-active:translate-x-[100%] transition-transform duration-700" />
                {authForgotMode ? (
                  <>
                    <Icon icon="solar:letter-bold" className="text-base relative z-10" />
                    <span className="relative z-10">Send Reset Link</span>
                  </>
                ) : (
                  <>
                    <Icon icon={authMode === "signin" ? "solar:login-bold" : "solar:user-plus-bold"} className="text-base relative z-10" />
                    <span className="relative z-10">{authMode === "signin" ? "Sign In" : "Create Account"}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Back to sign in (forgot mode) */}
          {authForgotMode && (
            <div className="text-center mt-4">
              <button
                type="button"
                className="text-xs text-muted-foreground/60 active:text-primary transition-colors tracking-wide"
                onClick={() => { triggerHaptic(); setAuthForgotMode(false); setAuthError(""); setResetSent(false); }}
              >
                ← Back to sign in
              </button>
            </div>
          )}

          {/* Switch auth mode */}
          {!authForgotMode && (
            <div className="text-center mt-6 auth-fade-up auth-fade-up-delay-5">
              <button
                type="button"
                className="text-[13px] text-muted-foreground/60 active:text-primary transition-colors"
                onClick={() => { triggerHaptic(); setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(""); setResetSent(false); }}
              >
                {authMode === "signin"
                  ? <>Don't have an account? <span className="font-bold" style={{ color: '#E09F3E' }}>Sign up</span></>
                  : <>Already a member? <span className="font-bold" style={{ color: '#E09F3E' }}>Sign in</span></>}
              </button>
            </div>
          )}

          {/* Feature pills */}
          <div className="flex justify-center gap-2.5 mt-10 auth-fade-up auth-fade-up-delay-5">
            {[
              { icon: "solar:pen-bold-duotone", label: "Lessons" },
              { icon: "solar:microphone-3-bold-duotone", label: "AI Practice" },
              { icon: "solar:cup-hot-bold-duotone", label: "Culture" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/20 text-muted-foreground/50 backdrop-blur-sm" style={{ background: 'rgba(20,36,56,0.4)' }}>
                <Icon icon={f.icon} className="text-xs" style={{ color: 'rgba(224,159,62,0.6)' }} />
                <span className="text-[10px] font-semibold tracking-wider uppercase">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- STREAKS PAGE ----------
  if (showStreaksPage) {
    // Generate last 30 days (anchored to UK time)
    const todayStr = getUkDateString();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const todayUtcAnchor = Date.UTC(ty, tm - 1, td);
    const daysInMonth = 30;
    const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
      return new Date(todayUtcAnchor - (daysInMonth - 1 - i) * 86400000);
    });

    return (
      <div className={`min-h-screen bg-background text-foreground font-sans ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
        {/* Header */}
        <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-20 bg-background backdrop-blur-xl">
          <button
            className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
            onClick={() => { triggerHaptic(); setTransitionDirection("back"); setShowStreaksPage(false); }}
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
                const dateStr = getUkDateString(d);
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
      const sortedLessons = [...allLessons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const coreLessons = sortedLessons.filter((lesson) => lesson.lesson_format !== 'prebook');
      for (const lesson of coreLessons) {
        if (!isLessonCompleted(lesson.id)) return lesson;
      }
      for (const lesson of sortedLessons) {
        if (!isLessonCompleted(lesson.id)) return lesson;
      }
      return null;
    })();

    // Completed lesson count
    const completedLessonCount = lessonProgress.length;

    return (
      <div className="min-h-screen bg-background text-foreground pb-40 font-sans selection:bg-primary/30">

        {/* ========== HOME TAB ========== */}
        {activeTab === "home" && (
          <div key={`tab-${tabTransitionKey}`} className={tabDirection === 'back' ? 'tab-slide-left' : 'tab-slide-right'}>
            <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 z-20 bg-background backdrop-blur-xl">
              <div className="flex flex-col items-start">
                <p className="text-base font-medium text-muted-foreground font-arabic tracking-wide" dir="rtl">مرحباً</p>
                <h1 className="font-heading text-xl font-bold">{userProfile?.display_name || user.email?.split("@")[0] || "Explorer"}</h1>
              </div>
              <div
                className="flex items-center gap-2 bg-secondary/10 px-3 py-1.5 rounded-full border border-secondary/20 shadow-[0_0_12px_rgba(229,107,111,0.15)] cursor-pointer"
                onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setShowStreaksPage(true); }}
              >
                <Icon icon="solar:fire-bold" className="text-secondary text-lg" />
                <span className="text-secondary font-bold text-sm tracking-wide">{currentStreak}</span>
              </div>
            </header>

            <main className="px-6 space-y-8 mt-4">
              {/* Stats Grid */}
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Daily Goal Tile */}
                  {(() => {
                    const minutesSpent = Math.floor(dailySecondsSpent / 60);
                    const progress = Math.min(minutesSpent / dailyGoalMinutes, 1);
                    const circumference = 2 * Math.PI * 34;
                    const dashOffset = circumference - (progress * circumference);
                    const remaining = Math.max(0, dailyGoalMinutes - minutesSpent);
                    return (
                      <div
                        className="bg-card p-4 rounded-3xl flex flex-col items-center justify-center gap-1 border border-border/50 shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                        onClick={() => { triggerHaptic(); setShowGoalPicker(!showGoalPicker); }}
                      >
                        <div className="relative">
                          <svg width="56" height="56" viewBox="0 0 80 80" className="-rotate-90">
                            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--muted)" strokeWidth="5" />
                            <circle
                              cx="40" cy="40" r="34" fill="none"
                              stroke={progress >= 1 ? "var(--green)" : "var(--primary)"}
                              strokeWidth="5" strokeLinecap="round"
                              strokeDasharray={circumference}
                              strokeDashoffset={dashOffset}
                              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {progress >= 1 ? (
                              <Icon icon="solar:check-circle-bold" className="text-green text-lg" />
                            ) : (
                              <>
                                <span className="text-sm font-bold">{minutesSpent}</span>
                                <span className="text-[8px] text-muted-foreground font-medium">/ {dailyGoalMinutes}m</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">
                          {progress >= 1 ? "Goal Complete!" : "Daily Goal"}
                        </span>
                      </div>
                    );
                  })()}
                  {/* Lessons Completed Tile */}
                  <div className="bg-card p-4 rounded-3xl flex flex-col items-center justify-center gap-1 border border-border/50 shadow-sm">
                    <Icon icon="solar:book-bookmark-bold" className="text-accent text-2xl mb-1" />
                    <span className="text-2xl font-heading font-bold">{completedLessonCount}/{allLessons.length}</span>
                    <span className="text-xs text-muted-foreground font-medium text-center">Lessons Completed</span>
                  </div>
                </div>
                {/* Goal Picker - slides open below tiles */}
                {showGoalPicker && (
                  <div className="bg-card rounded-3xl p-4 border border-border/50 space-y-3 goal-picker-open">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">Choose your daily goal:</p>
                      <button
                        className="text-primary text-xs font-bold uppercase tracking-widest"
                        onClick={() => { triggerHaptic(); setShowGoalPicker(false); }}
                      >
                        Done
                      </button>
                    </div>
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
                            const today = getUkDateString();
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
                )}
              </section>

              {/* Up Next Card */}
              {nextLesson && (
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #E09F3E, #E56B6F)' }} />
                    <h2 className="text-xl font-heading font-bold">Up Next</h2>
                  </div>
                  <div className="upnext-card group relative overflow-hidden rounded-[2rem] border border-border/30 shadow-xl" style={{ background: 'linear-gradient(145deg, rgba(20,36,56,0.9), rgba(13,27,42,0.95))' }}>
                    {nextLesson.cover_image_url && (
                      <div className="absolute inset-0 z-0">
                        <img src={nextLesson.cover_image_url} alt="Lesson Cover" className="w-full h-full object-cover opacity-25" style={{ filter: 'blur(1px)' }} />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(13,27,42,0.4) 0%, rgba(13,27,42,0.85) 50%, rgba(13,27,42,0.98) 100%)' }} />
                      </div>
                    )}
                    {/* Decorative corner accent */}
                    <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.07]" style={{ background: 'radial-gradient(circle at top right, #E09F3E, transparent 70%)' }} />
                    <div className="relative z-10 p-6 flex flex-col h-full items-center justify-center text-center gap-6">
                      <h3 className="text-2xl font-heading font-bold tracking-tight max-w-[26rem]">{nextLesson.title}</h3>
                      <button
                        className="w-full max-w-[22rem] font-bold py-4 rounded-2xl flex items-center justify-center active:scale-[0.97] transition-all text-sm tracking-wide relative overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, #E09F3E, #D4922F)', color: '#0D1B2A', boxShadow: '0 8px 32px rgba(224,159,62,0.2), inset 0 1px 0 rgba(255,255,255,0.12)' }}
                        onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setPracticeMode("book"); openLesson(nextLesson); }}
                      >
                        Continue Learning
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* Daily Scenario */}
              {scenarioData && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #8b5cf6, #E56B6F)' }} />
                      <h2 className="text-xl font-heading font-bold">Daily Scenario</h2>
                    </div>
                    {scenarioCompleted && (
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20 tracking-wider uppercase">Done</span>
                    )}
                  </div>
                  <div
                    className={`scenario-surface relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.97] transition-all duration-300 ${scenarioCompleted ? 'opacity-40 grayscale' : ''}`}
                    onClick={() => {
                      triggerHaptic();
                      if (scenarioCompleted) {
                        showInfoToast('Already completed today', 'solar:check-circle-bold');
                        return;
                      }
                      setScenarioPhase(true);
                    }}
                  >
                    {/* Background pattern */}
                    <div className="scenario-tile-bg" />
                    <div className="relative z-10 p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 scenario-tile-emoji">
                          {scenarioData.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Practice conversation</p>
                          <div className="flex items-baseline gap-2.5">
                            <h3 className="font-heading font-bold text-[15px] tracking-tight text-foreground/90">{scenarioData.title}</h3>
                            <span className="text-muted-foreground/40 text-xs">·</span>
                            <p dir="rtl" className="font-arabic text-sm text-muted-foreground/50 truncate">{scenarioData.titleAr}</p>
                          </div>
                        </div>
                        {scenarioCompleted && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Icon icon="solar:check-circle-bold" className="text-green-400 text-base" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Word of the Day & Picture of the Day — side by side */}
              <section className="grid grid-cols-2 gap-3">
                {/* Word of the Day */}
                <div
                  className="relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all aspect-square"
                  style={{ background: 'linear-gradient(135deg, #7c2d12, #431407)' }}
                  onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setPracticeMode("wotd"); loadWordOfTheDay(); }}
                >
                  <img src="/images/wotd.webp" alt="" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                  <div className="relative z-10 h-full flex flex-col justify-end p-4">
                    <Icon icon="solar:sun-bold" className="text-amber-400 text-2xl mb-2" />
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wide leading-tight">Word of the Day</h3>
                    <p className="text-xs text-white/60 mt-1 font-arabic" dir="rtl">كلمة اليوم</p>
                  </div>
                </div>

                {/* Picture of the Day */}
                <div
                  className={`relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all aspect-square ${pictureCompleted ? 'opacity-50 grayscale' : ''}`}
                  onClick={() => {
                    triggerHaptic();
                    if (pictureCompleted) { showInfoToast('Already completed today', 'solar:check-circle-bold'); return; }
                    setTransitionDirection("forward");
                    setPracticeMode("picture-describe");
                    loadPictureOfTheDay();
                  }}
                >
                  {picturePreviewUrl ? (
                    <img src={picturePreviewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(12px) brightness(0.4)', transform: 'scale(1.15)' }} />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-900/60 to-red-900/60" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="relative z-10 h-full flex flex-col justify-end p-4">
                    <Icon icon="solar:gallery-bold" className="text-amber-400 text-2xl mb-2" />
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wide leading-tight">Pic of the Day</h3>
                    <p className="text-xs text-white/60 mt-1">Describe what you see</p>
                  </div>
                </div>
              </section>

            </main>
          </div>
        )}

        {/* ========== COURSES TAB ========== */}
        {activeTab === "courses" && (
          <div key={`tab-${tabTransitionKey}`} className={tabDirection === 'back' ? 'tab-slide-left' : 'tab-slide-right'}>
            <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-20 bg-background backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-xl border border-primary/30">
                  <Icon icon="solar:book-bookmark-bold" className="text-primary text-2xl" />
                </div>
                <h1 className="font-heading text-xl font-bold">Your Courses</h1>
              </div>
              {/* Current stage badge */}
              {(() => {
                const coreStages = getCoreStages();
                const activeStage = coreStages.find(s => {
                  const p = getStageProgress(s.id);
                  return p.completed < p.total;
                });
                if (!activeStage) return null;
                const idx = coreStages.indexOf(activeStage) + 1;
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
                  const isPrebook = isPrebookStage(stage.id);
                  const isUnlocked = isStageUnlocked(stage.id);
                  const isActive = isPrebook ? true : progress.completed < progress.total && isUnlocked;
                  const isLocked = !isCompleted && !isActive;
                  const isExpanded = expandedStageId === stage.id;
                  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
                  const stageTitle = stage.name || stage.title || 'Stage';

                  // Get lessons for this stage
                  const stageLessons = allLessons
                    .filter(l => l.stage_id === stage.id)
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                  // Fallback cover images for stages without a database image
                  const stageCoverFallbacks = ['/stage-cover-1.webp', '/stage-cover-2.webp', '/stage-cover-3.webp'];
                  const stageCoverImage = stage.cover_image_url || stageCoverFallbacks[stageIndex] || stageCoverFallbacks[0];
                  const prebookCoverImage = '/foundations-banner.webp';

                  // ── PREBOOK STAGE (Essential Arabic) — distinct design ──
                  if (isPrebook) {
                    return (
                      <section key={stage.id} className="space-y-4">
                        <div
                          className={`prebook-stage-card relative overflow-hidden rounded-[2rem] border shadow-md group active:scale-[0.98] transition-all cursor-pointer ${isActive
                            ? 'border-2 border-[#2A9D8F]/50'
                            : isLocked
                              ? 'border-border/50 opacity-70 grayscale-[30%]'
                              : isExpanded
                                ? 'border-2 border-[#2A9D8F]/30'
                                : 'border-border/50'
                            }`}
                          onClick={() => { triggerHaptic(); setExpandedStageId(isExpanded ? null : stage.id); }}
                        >
                          <div className="h-32 w-full overflow-hidden">
                            <img src={prebookCoverImage} alt={stageTitle} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                          </div>
                          <div className="p-6 bg-card relative">
                            <div className="flex justify-between items-start gap-4 mb-2">
                              <div className="min-w-0">
                                <h3 className="font-heading text-xl font-bold">{stageTitle}</h3>
                                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                                  Learn the basics with essential vocabulary and sentence building. Recommended for absolute beginners or as a refresher before diving into the core stages
                                </p>
                              </div>
                              {isCompleted && (
                                <div className="bg-green-500/20 text-green-500 p-2 rounded-full border border-green-500/20">
                                  <Icon icon="solar:check-circle-bold" className="text-xl" />
                                </div>
                              )}
                            </div>

                            <div className="mt-6 flex items-center gap-3">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isCompleted ? 'bg-green-500' : isLocked ? 'bg-[#2A9D8F]/20' : 'bg-[#2A9D8F]'}`}
                                  style={{ width: `${progressPercent}%`, boxShadow: isActive ? '0 0 8px rgba(42,157,143,0.5)' : 'none' }}
                                />
                              </div>
                              <span className={`text-xs font-bold uppercase ${isCompleted ? 'text-green-500' : 'text-[#2A9D8F]'}`}>
                                {isCompleted ? 'Completed' : `${progressPercent}%`}
                              </span>
                            </div>

                            {/* Prebook lesson list */}
                            {isExpanded && stageLessons.length > 0 && (
                              <div className="mt-6 pt-4 border-t border-border/50">
                                <div className="space-y-3">
                                  {stageLessons.map((lesson, lessonIdx) => {
                                    const completed = isLessonCompleted(lesson.id);
                                    return (
                                      <div
                                        key={lesson.id}
                                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.97] ${completed
                                          ? 'bg-green-500/[0.04] border-green-500/20'
                                          : 'bg-muted/30 border-border/30'
                                          }`}
                                        onClick={(e) => { e.stopPropagation(); triggerHaptic(); setPracticeMode("book"); openLesson(lesson); }}
                                      >
                                        <div className="flex items-center gap-4 min-w-0">
                                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${completed
                                            ? 'bg-green-500/10 border border-green-500/20 text-green-500'
                                            : 'bg-muted border border-border text-muted-foreground'
                                            }`}>
                                            <Icon icon={completed ? "solar:check-circle-bold" : "solar:document-text-bold"} className="text-xl" />
                                          </div>
                                          <div className="min-w-0">
                                            <h4 className="text-sm font-bold truncate">{lessonIdx + 1}. {lesson.title}</h4>
                                          </div>
                                        </div>
                                        <Icon icon="solar:alt-arrow-right-linear" className={completed ? "text-green-500/70" : "text-muted-foreground"} />
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
                  }

                  // ── REGULAR BOOK STAGE ──
                  return (
                    <section key={stage.id} className="space-y-4">
                      <div
                        className={`relative overflow-hidden rounded-[2rem] border shadow-md group active:scale-[0.98] transition-all cursor-pointer ${isActive
                          ? 'border-2 border-primary/50 shadow-[0_0_24px_rgba(224,159,62,0.15)]'
                          : isLocked
                            ? 'border-border/50 opacity-70 grayscale-[30%]'
                            : isExpanded
                              ? 'border-2 border-primary/30'
                              : 'border-border/50'
                          }`}
                        onClick={() => { triggerHaptic(); setExpandedStageId(isExpanded ? null : stage.id); }}
                      >
                        <div className="h-32 w-full overflow-hidden">
                          <img src={stageCoverImage} alt={stageTitle} className="w-full h-full object-cover" />
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
                              <h3 className="font-heading text-xl font-bold">{stageTitle}</h3>
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
                          {isExpanded && stageLessons.length > 0 && (
                            <div className="mt-6 space-y-4">
                              <div className="space-y-3 pt-4 border-t border-border/50">
                                {stageLessons.map((lesson, lessonIdx) => {
                                  const completed = isLessonCompleted(lesson.id);
                                  const isUnlockedLesson = isLessonUnlocked(stageLessons, lessonIdx, stage.id);
                                  const isNext = isUnlockedLesson && !completed;
                                  const locked = !isUnlockedLesson;
                                  return (
                                    <div
                                      key={lesson.id}
                                      className={`flex items-center justify-between p-4 bg-muted/30 rounded-2xl border transition-all ${isNext
                                        ? 'border-border/30 ring-1 ring-primary/30 cursor-pointer active:scale-[0.97]'
                                        : locked
                                          ? 'border-border/30 opacity-60 cursor-default'
                                          : 'border-border/30 cursor-pointer active:scale-[0.97]'
                                        }`}
                                      onClick={(e) => { e.stopPropagation(); if (locked) return; triggerHaptic(); setPracticeMode("book"); openLesson(lesson); }}
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
          </div>
        )}

        {/* Floating info toast */}
        {infoToast && (
          <div className="info-toast-float fixed top-1/2 left-1/2 z-[9999] px-4 py-3 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-bold shadow-2xl flex items-center gap-2 pointer-events-none">
            <Icon icon={infoToast.icon} className="text-base" />
            {infoToast.message}
          </div>
        )}

        {/* ========== COMMUNITY TAB ========== */}
        {activeTab === "community" && (
          <div key={`tab-${tabTransitionKey}`} className={tabDirection === 'back' ? 'tab-slide-left' : 'tab-slide-right'}>

            {/* --- POST DETAIL VIEW --- */}
            {communityView === 'post_detail' && selectedPost && (
              <div className={`min-h-screen bg-background ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
                <header className="px-6 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-20 bg-background backdrop-blur-xl">
                  <button
                    className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center active:scale-95 transition-all"
                    onClick={() => { triggerHaptic(); setTransitionDirection("back"); if (communityAudioRef.current) { communityAudioRef.current.pause(); communityAudioRef.current = null; } setPlayingPostId(null); setComAudioProgress(0); setCommunityView('feed'); setSelectedPost(null); setPostCorrections([]); setCorrectionText(''); setCorrectionInputMode('text'); setRecordedAudio(null); communityExerciseRef.current = false; correctionRecordingRef.current = false; }}
                  >
                    <MdArrowBackIosNew className="text-foreground text-lg" />
                  </button>
                  <h1 className="font-heading text-lg font-bold">Community</h1>
                </header>

                <div className="px-6 pb-32">
                  {/* Original post */}
                  <div className="bg-card border border-border/50 rounded-2xl p-5 mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">
                        {selectedPost.profiles?.avatar_url || '😊'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold">{selectedPost.profiles?.display_name || 'Learner'}</p>
                        <p className="text-xs text-muted-foreground">{getTimeAgo(selectedPost.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageCommunity && (
                          <button
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive bg-destructive/10 active:bg-destructive/20 disabled:opacity-50"
                            disabled={moderatingTargetKey === `post_${selectedPost.id}`}
                            onClick={() => {
                              triggerHaptic();
                              showConfirm({
                                title: 'Delete Post',
                                message: 'Delete this post for everyone? This cannot be undone.',
                                onConfirm: () => moderateCommunityItem({ targetType: 'post', targetId: selectedPost.id, reason: 'Admin removed community post' }),
                              });
                            }}
                          >
                            {moderatingTargetKey === `post_${selectedPost.id}`
                              ? <Leapfrog size="12" speed="2.5" color="var(--destructive)" />
                              : <Icon icon="solar:trash-bin-trash-bold" className="text-base" />}
                          </button>
                        )}
                        <button
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground active:bg-muted/30"
                          onClick={() => { triggerHaptic(); setReportTarget({ type: 'post', id: selectedPost.id }); setShowReportModal(true); }}
                        >
                          <Icon icon="solar:flag-linear" className="text-lg" />
                        </button>
                      </div>
                    </div>
                    <div className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider mb-3 ${
                      selectedPost.activity_type === 'read_aloud' ? 'bg-chart-4/15 text-chart-4'
                      : selectedPost.activity_type === 'translate' ? 'bg-chart-3/15 text-chart-3'
                      : 'bg-blue-500/15 text-blue-400'
                    }`}>
                      {selectedPost.activity_type === 'read_aloud' ? 'Read Aloud' : selectedPost.activity_type === 'translate' ? 'Translate' : 'Daily Question'}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{selectedPost.prompt_text}</p>
                    <p className="text-lg font-arabic leading-relaxed" dir="rtl">{selectedPost.answer_text}</p>
                    {selectedPost.audio_url && (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-primary/10 mt-3">
                        <button
                          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                          onClick={() => { triggerHaptic(); playCommunityAudio(selectedPost.id, selectedPost.audio_url); }}
                        >
                          <Icon icon={playingPostId === selectedPost.id ? "solar:pause-bold" : "solar:play-bold"} className="text-sm text-primary-foreground" />
                        </button>
                        <div className="flex-1 flex flex-col gap-1">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={playingPostId === selectedPost.id ? comAudioProgress : 0}
                            onChange={(e) => { seekCommunityAudio(parseFloat(e.target.value), selectedPost.id); }}
                            className="community-audio-slider w-full"
                          />
                          <div className="flex justify-between">
                            <span className="text-[10px] text-primary/70">{playingPostId === selectedPost.id ? formatAudioTime(comAudioTime) : '0:00'}</span>
                            <span className="text-[10px] text-primary/70">{playingPostId === selectedPost.id && comAudioDuration ? formatAudioTime(comAudioDuration) : '--:--'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Corrections */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-heading text-sm font-bold text-muted-foreground uppercase tracking-wider">
                      {postCorrections.length > 0 ? `Corrections (${postCorrections.length})` : 'No corrections yet'}
                    </h3>
                    {user && selectedPost.user_id === user.id && !postCorrections.some(c => c.is_ai) && (
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border border-violet-500/30 text-violet-400 text-xs font-bold active:scale-95 transition-all disabled:opacity-60"
                        disabled={aiFeedbackLoading.has(selectedPost.id)}
                        onClick={() => { triggerHaptic(); requestAiFeedback(selectedPost.id); }}
                      >
                        {aiFeedbackLoading.has(selectedPost.id)
                          ? <Leapfrog size="14" speed="2.5" color="#8b5cf6" />
                          : <Icon icon="solar:magic-stick-3-bold" className="text-sm" />}
                        Ask AI
                      </button>
                    )}
                  </div>

                  {loadingCorrections ? (
                    <div className="flex justify-center py-8"><Leapfrog size="30" speed="2.5" color="var(--primary)" /></div>
                  ) : (
                    <div className="space-y-4">
                      {postCorrections.map((corr, idx) => {
                        const isBest = idx === 0 && postCorrections.length > 1 && (corr.upvotes || 0) > 0;
                        return (
                          <div key={corr.id} className={`bg-card border rounded-2xl p-4 ${isBest ? 'border-primary/40' : 'border-border/50'}`}>
                            {isBest && (
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-xs">🏆</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Best Correction</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 mb-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${corr.is_ai ? 'bg-blue-500/20' : 'bg-primary/20'}`}>
                                {corr.is_ai ? '🤖' : (corr.profiles?.avatar_url || '😊')}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold">{corr.is_ai ? 'AI Tutor' : (corr.profiles?.display_name || 'Learner')}</p>
                                  {corr.is_ai && (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[9px] font-bold uppercase tracking-wider">AI Generated</span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">{getTimeAgo(corr.created_at)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {canManageCommunity && (
                                  <button
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive bg-destructive/10 active:bg-destructive/20 disabled:opacity-50"
                                    disabled={moderatingTargetKey === `correction_${corr.id}`}
                                    onClick={() => {
                                      triggerHaptic();
                                      showConfirm({
                                        title: 'Delete Correction',
                                        message: 'Delete this correction for everyone? This cannot be undone.',
                                        onConfirm: () => moderateCommunityItem({
                                          targetType: 'correction',
                                          targetId: corr.id,
                                          postId: selectedPost.id,
                                          isAi: corr.is_ai,
                                          reason: 'Admin removed correction',
                                        }),
                                      });
                                    }}
                                  >
                                    {moderatingTargetKey === `correction_${corr.id}`
                                      ? <Leapfrog size="12" speed="2.5" color="var(--destructive)" />
                                      : <Icon icon="solar:trash-bin-trash-bold" className="text-xs" />}
                                  </button>
                                )}
                                {/* User can delete their own correction */}
                                {!canManageCommunity && user && corr.user_id === user.id && !corr.is_ai && (
                                  <button
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive bg-destructive/10 active:bg-destructive/20 disabled:opacity-50"
                                    disabled={deletingCorrectionId === corr.id}
                                    onClick={() => {
                                      triggerHaptic();
                                      showConfirm({
                                        title: 'Delete Correction',
                                        message: 'Remove your correction? This cannot be undone.',
                                        onConfirm: () => deleteMyCorrection(corr.id, selectedPost.id),
                                      });
                                    }}
                                  >
                                    {deletingCorrectionId === corr.id
                                      ? <Leapfrog size="12" speed="2.5" color="var(--destructive)" />
                                      : <Icon icon="solar:trash-bin-trash-bold" className="text-xs" />}
                                  </button>
                                )}
                                {!corr.is_ai && (
                                  <button
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground active:bg-muted/30"
                                    onClick={() => { triggerHaptic(); setReportTarget({ type: 'correction', id: corr.id }); setShowReportModal(true); }}
                                  >
                                    <Icon icon="solar:flag-linear" className="text-sm" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm leading-relaxed mb-3">{corr.correction_text}</p>
                            {corr.audio_url && (
                              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-primary/10 mb-3" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                                  onClick={() => { triggerHaptic(); playCommunityAudio(corr.id, corr.audio_url); }}
                                >
                                  <Icon icon={playingPostId === corr.id ? "solar:pause-bold" : "solar:play-bold"} className="text-sm text-primary-foreground" />
                                </button>
                                <span className="text-[10px] text-primary/70">{playingPostId === corr.id ? formatAudioTime(comAudioTime) : '0:00'}</span>
                                <input type="range" min="0" max="100" step="0.1" value={playingPostId === corr.id ? comAudioProgress : 0} onChange={(e) => { seekCommunityAudio(parseFloat(e.target.value), corr.id); }} className="community-audio-slider flex-1" />
                                <span className="text-[10px] text-primary/70">{playingPostId === corr.id && comAudioDuration ? formatAudioTime(comAudioDuration) : '--:--'}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3">
                              <button
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                                  userReactions[`corr_${corr.id}`] === 'upvote' ? 'bg-green-500/15 text-green-500' : 'bg-muted/30 text-muted-foreground'
                                }`}
                                onClick={() => { triggerHaptic(); toggleCorrectionVote(corr.id, 'upvote'); }}
                              >
                                <Icon icon="solar:like-bold" className="text-sm" />{corr.upvotes || 0}
                              </button>
                              <button
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                                  userReactions[`corr_${corr.id}`] === 'downvote' ? 'bg-destructive/15 text-destructive' : 'bg-muted/30 text-muted-foreground'
                                }`}
                                onClick={() => { triggerHaptic(); toggleCorrectionVote(corr.id, 'downvote'); }}
                              >
                                <Icon icon="solar:dislike-bold" className="text-sm" />{corr.downvotes || 0}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bottom correction input */}
                <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 px-6 z-[60]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)', paddingTop: '0.75rem' }}>
                  {/* Text / Voice toggle */}
                  <div className="flex gap-2 mb-2 px-1">
                    <button
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${correctionInputMode === 'text' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}
                      onClick={() => { triggerHaptic(); setCorrectionInputMode('text'); }}
                    >
                      <Icon icon="solar:pen-bold" className="inline mr-1 text-xs" />Type
                    </button>
                    <button
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${correctionInputMode === 'record' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}
                      onClick={() => { triggerHaptic(); setCorrectionInputMode('record'); }}
                    >
                      <Icon icon="solar:microphone-3-bold" className="inline mr-1 text-xs" />Speak
                    </button>
                  </div>

                  {correctionInputMode === 'text' ? (
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        dir="auto"
                        className="flex-1 bg-muted/30 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                        placeholder="Add a correction..."
                        value={correctionText}
                        onChange={(e) => setCorrectionText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && correctionText.trim()) { triggerHaptic(); submitCorrection(selectedPost.id); } }}
                      />
                      <button
                        className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                        disabled={!correctionText.trim() || submittingCorrection}
                        onClick={() => { triggerHaptic(); submitCorrection(selectedPost.id); }}
                      >
                        {submittingCorrection
                          ? <Leapfrog size="18" speed="2.5" color="var(--primary-foreground)" />
                          : <Icon icon="solar:plain-bold" className="text-lg text-primary-foreground" />
                        }
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {!recordedAudio ? (
                        <>
                          <div className="flex-1 text-center">
                            <p className="text-xs text-muted-foreground mb-1">
                              {isRecording ? `Recording... ${recordingCountdown != null ? `${Math.floor(recordingCountdown / 60)}:${String(recordingCountdown % 60).padStart(2, '0')}` : 'tap to stop'}` : 'Tap to record your feedback'}
                            </p>
                          </div>
                          <button
                            className={`w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-all ${isRecording ? 'bg-destructive animate-pulse' : 'bg-primary'}`}
                            onClick={() => { triggerHaptic(); if (isRecording) { stopRecording(); } else { communityExerciseRef.current = true; correctionRecordingRef.current = true; startRecording(); } }}
                          >
                            <Icon icon={isRecording ? "solar:stop-bold" : "solar:microphone-3-bold"} className="text-lg text-white" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border/50 rounded-xl px-3 py-2">
                            <button
                              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                              onClick={() => { triggerHaptic(); playPreviewAudio(); }}
                            >
                              <Icon icon={previewPlaying ? "solar:pause-bold" : "solar:play-bold"} className="text-xs text-primary-foreground" />
                            </button>
                            <div className="flex-1 flex flex-col gap-0.5">
                              <input type="range" min="0" max="100" step="0.1" value={previewProgress} onChange={(e) => { seekPreviewAudio(parseFloat(e.target.value)); }} className="community-audio-slider w-full" />
                            </div>
                            <button
                              className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0 active:scale-95"
                              onClick={() => { triggerHaptic(); cleanupPreviewAudio(); setRecordedAudio(null); correctionRecordingRef.current = false; communityExerciseRef.current = false; }}
                            >
                              <Icon icon="solar:trash-bin-trash-bold" className="text-xs text-destructive" />
                            </button>
                          </div>
                          <button
                            className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                            disabled={submittingCorrection}
                            onClick={() => { triggerHaptic(); submitCorrection(selectedPost.id, recordedAudio); }}
                          >
                            {submittingCorrection
                              ? <Leapfrog size="18" speed="2.5" color="var(--primary-foreground)" />
                              : <Icon icon="solar:plain-bold" className="text-lg text-primary-foreground" />
                            }
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- MAIN FEED VIEW --- */}
            {communityView === 'feed' && (
              <>
                <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-20 bg-background backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    {activeExerciseType && (
                      <button
                        className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center active:scale-95 transition-all"
                        onClick={() => {
                          triggerHaptic();
                          if (isRecording) cancelRecording();
                          cleanupPreviewAudio();
                          if (activeExerciseType === 'daily_question' || activeExerciseIndex === null) {
                            setActiveExerciseType(null);
                            setActiveExerciseIndex(null);
                            communityExerciseRef.current = false;
                            setCommunityTypedAnswer('');
                            setRecordedAudio(null);
                          } else {
                            setActiveExerciseIndex(null);
                            setCommunityTypedAnswer('');
                            setRecordedAudio(null);
                          }
                        }}
                      >
                        <MdArrowBackIosNew className="text-foreground text-lg" />
                      </button>
                    )}
                    {!activeExerciseType && (
                      <div className="bg-primary/20 p-2 rounded-xl border border-primary/30">
                        <Icon icon="solar:users-group-rounded-bold" className="text-primary text-2xl" />
                      </div>
                    )}
                    <h1 className="font-heading text-xl font-bold">Community</h1>
                  </div>
                  {!activeExerciseType && (
                    <div className="flex items-center gap-2">
                      <button
                        className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center active:scale-95 transition-all"
                        onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setShowLeaderboard(true); }}
                        aria-label="Top contributors Last 3 days"
                      >
                        <Icon icon="solar:cup-star-bold" className="text-lg text-amber-400" />
                      </button>
                      <button
                        className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center active:scale-95 transition-all"
                        onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setShowMyPosts(true); loadMyPosts(); }}
                        aria-label="My posts"
                      >
                        <Icon icon="solar:chat-round-dots-bold" className="text-lg text-primary" />
                      </button>
                    </div>
                  )}
                </header>

                <main className="px-6 space-y-6 pb-24">
                  {/* Daily Challenges */}
                  <section className="space-y-3">
                    {/* Daily Question — Hero Banner */}
                    {(() => { const dqDone = userCompletions.daily_question >= 1; return (
                    <div className={activeExerciseType && activeExerciseType !== 'daily_question' ? 'tile-fly-off' : 'tile-selected'}>
                      <div
                        className={`exercise-glow-tile relative rounded-2xl overflow-hidden transition-all ${!activeExerciseType ? 'cursor-pointer active:scale-[0.98]' : ''} ${dqDone && !activeExerciseType ? 'opacity-50 grayscale' : ''}`}
                        style={{ height: '95px' }}
                        onClick={() => {
                          if (activeExerciseType) return;
                          triggerHaptic();
                          if (dqDone) { showInfoToast('Already submitted today', 'solar:check-circle-bold'); return; }
                          if (!dailyExercises) loadDailyExercises();
                          setActiveExerciseType('daily_question');
                          setActiveExerciseIndex(0);
                          setCommunityTypedAnswer('');
                          communityExerciseRef.current = true;
                        }}
                      >
                        <img src="/images/daily-question.webp" alt="" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/20" />
                        <div className="relative z-10 h-full flex flex-col justify-center p-4">
                          <h3 className="text-lg font-extrabold text-foreground tracking-wide uppercase drop-shadow-lg">Daily Question</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">Answer today's question in Arabic</p>
                        </div>
                        <span className="absolute bottom-2 right-3 z-10 text-xs font-bold text-foreground/80">{userCompletions.daily_question}/1</span>
                      </div>
                    </div>
                    ); })()}

                    {/* Read Aloud & Translate */}
                    {(() => { const raDone = userCompletions.read_aloud >= 3; const trDone = userCompletions.translate >= 3; return (
                    <div className={`${!activeExerciseType ? 'grid grid-cols-2' : 'flex flex-col'} gap-3`}>
                      <div className={activeExerciseType && activeExerciseType !== 'read_aloud' ? 'tile-fly-off' : 'tile-selected'}>
                        <div
                          className={`exercise-glow-tile relative rounded-2xl overflow-hidden bg-card border border-border/50 transition-all ${!activeExerciseType ? 'cursor-pointer active:scale-[0.97]' : ''} ${raDone && !activeExerciseType ? 'opacity-50 grayscale' : ''}`}
                          style={{ height: '130px' }}
                          onClick={() => {
                            if (activeExerciseType) return;
                            triggerHaptic();
                            if (raDone) { showInfoToast('All 3 already submitted today', 'solar:check-circle-bold'); return; }
                            if (!dailyExercises) loadDailyExercises();
                            setActiveExerciseType('read_aloud');
                            setActiveExerciseIndex(null);
                            setCommunityTypedAnswer('');
                            communityExerciseRef.current = true;
                          }}
                        >
                          <div className="relative h-[55px] overflow-hidden">
                            <img src="/images/read-aloud.webp" alt="" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                          </div>
                          <div className="px-3 pt-2 pb-2.5">
                            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wide leading-tight">Read Aloud</h3>
                            <p className="text-[10px] text-muted-foreground">Read Arabic sentences</p>
                          </div>
                          <span className="absolute bottom-2 right-3 text-[10px] font-bold text-foreground/80">{userCompletions.read_aloud}/3</span>
                        </div>
                      </div>

                      <div className={activeExerciseType && activeExerciseType !== 'translate' ? 'tile-fly-off' : 'tile-selected'}>
                        <div
                          className={`exercise-glow-tile relative rounded-2xl overflow-hidden bg-card border border-border/50 transition-all ${!activeExerciseType ? 'cursor-pointer active:scale-[0.97]' : ''} ${trDone && !activeExerciseType ? 'opacity-50 grayscale' : ''}`}
                          style={{ height: '130px' }}
                          onClick={() => {
                            if (activeExerciseType) return;
                            triggerHaptic();
                            if (trDone) { showInfoToast('All 3 already submitted today', 'solar:check-circle-bold'); return; }
                            if (!dailyExercises) loadDailyExercises();
                            setActiveExerciseType('translate');
                            setActiveExerciseIndex(null);
                            setCommunityTypedAnswer('');
                            communityExerciseRef.current = true;
                          }}
                        >
                          <div className="relative h-[55px] overflow-hidden">
                            <img src="/images/translate.webp" alt="" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                          </div>
                          <div className="px-3 pt-2 pb-2.5">
                            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wide leading-tight">Translate</h3>
                            <p className="text-[10px] text-muted-foreground">English to Arabic</p>
                          </div>
                          <span className="absolute bottom-2 right-3 text-[10px] font-bold text-foreground/80">{userCompletions.translate}/3</span>
                        </div>
                      </div>
                    </div>
                    ); })()}

                    {/* ===== INLINE EXERCISE CONTENT (appears below selected tile) ===== */}
                    {activeExerciseType && (() => {
                      const isReadAloud = activeExerciseType === 'read_aloud';
                      const isTranslate = activeExerciseType === 'translate';
                      const isDailyQ = activeExerciseType === 'daily_question';
                      const items = isReadAloud ? (dailyExercises?.read_aloud || []) : isTranslate ? (dailyExercises?.translate || []) : [dailyExercises?.daily_question].filter(Boolean);
                      const accentColor = isReadAloud ? 'chart-4' : isTranslate ? 'chart-3' : 'primary';
                      const current = activeExerciseIndex !== null ? items[activeExerciseIndex] : null;
                      return (
                        <div className="exercise-input-appear space-y-3 pt-2">
                          {loadingExercises ? (
                            <div className="flex justify-center py-12"><Leapfrog size="30" speed="2.5" color="var(--primary)" /></div>
                          ) : dailyExercisesError ? (
                            <div className="bg-card border border-destructive/30 rounded-2xl p-5 text-center space-y-3">
                              <Icon icon="solar:danger-triangle-bold" className="text-2xl text-destructive mx-auto" />
                              <p className="text-sm text-muted-foreground">{dailyExercisesError}</p>
                              <button
                                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
                                onClick={() => { triggerHaptic(); loadDailyExercises(); }}
                              >
                                Try again
                              </button>
                            </div>
                          ) : !dailyExercises ? (
                            <div className="flex justify-center py-12"><Leapfrog size="30" speed="2.5" color="var(--primary)" /></div>
                          ) : (
                            <>
                              {/* Sentence/question cards — fly off when one is selected */}
                              {!isDailyQ && items.map((item, idx) => {
                                const isSelected = activeExerciseIndex === idx;
                                const isHidden = activeExerciseIndex !== null && !isSelected;
                                const promptKey = isReadAloud ? item.arabic_text : item.english_text;
                                const isCompleted = completedPrompts.has(promptKey);
                                const displayArabic = stripLeadingSentenceNumber(item.arabic_text);
                                const displayEnglish = stripLeadingSentenceNumber(item.english_text);
                                return (
                                  <div
                                    key={item.id}
                                    className={`bg-card border rounded-2xl p-5 transition-all duration-300 ${
                                      isHidden ? 'exercise-fly-off' : ''
                                    } ${isCompleted && !isSelected ? 'opacity-50' : ''} ${isSelected ? `border-${accentColor}/50 ring-1 ring-${accentColor}/30` : 'border-border/50 cursor-pointer active:scale-[0.98]'}`}
                                    style={isHidden ? { pointerEvents: 'none' } : {}}
                                    onClick={() => {
                                      if (activeExerciseIndex !== null || isCompleted) return;
                                      triggerHaptic();
                                      setActiveExerciseIndex(idx);
                                      setCommunityTypedAnswer('');
                                      setRecordedAudio(null);
                                    }}
                                  >
                                    <div className={isSelected ? 'text-center space-y-3' : 'flex items-center gap-4'}>
                                      {!isSelected && (
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-green-500/15' : `bg-${accentColor}/15`}`}>
                                          {isCompleted ? (
                                            <Icon icon="solar:check-circle-bold" className="text-lg text-green-500" />
                                          ) : (
                                            <span className={`text-sm font-bold text-${accentColor}`}>{idx + 1}</span>
                                          )}
                                        </div>
                                      )}
                                      <div className={`min-w-0 ${isSelected ? 'space-y-2' : 'flex-1'}`}>
                                        {isReadAloud ? (
                                          <>
                                            <p
                                              className={`font-arabic font-semibold ${isCompleted ? 'text-muted-foreground' : 'text-white'} ${isSelected ? 'text-3xl leading-loose' : 'text-2xl leading-loose'}`}
                                              dir="rtl"
                                            >
                                              {isSelected ? displayArabic : item.arabic_text}
                                            </p>
                                            {item.english_text && (
                                              <p className={`${isSelected ? 'text-sm text-muted-foreground max-w-md mx-auto leading-relaxed' : 'text-sm text-muted-foreground mt-1'}`}>
                                                {isSelected ? displayEnglish : item.english_text}
                                              </p>
                                            )}
                                          </>
                                        ) : (
                                          <p className={`leading-relaxed ${isCompleted ? 'text-muted-foreground' : 'text-foreground'} ${isSelected ? 'text-xl font-bold max-w-lg mx-auto' : 'text-sm'}`}>
                                            {isSelected ? displayEnglish : item.english_text}
                                          </p>
                                        )}
                                        {isCompleted && !isSelected && <p className="text-[10px] text-green-500 font-bold mt-1">Already submitted</p>}
                                      </div>
                                      {activeExerciseIndex === null && !isCompleted && (
                                        <Icon icon="solar:alt-arrow-right-linear" className="text-muted-foreground flex-shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Input UI — appears when sentence selected or immediately for daily question */}
                              {((isDailyQ && items.length > 0) || (activeExerciseIndex !== null && current)) && (() => {
                                const activeItem = isDailyQ ? items[0] : current;
                                return (
                                  <div className="exercise-input-appear space-y-4 pt-2">
                                    {/* Show daily question text inline */}
                                    {isDailyQ && activeItem && (
                                      <div className="bg-card border border-primary/30 rounded-2xl p-5">
                                        {activeItem.question_ar && (
                                          <p className="text-2xl font-arabic font-semibold text-foreground leading-loose text-center" dir="rtl">
                                            {activeItem.question_ar}
                                          </p>
                                        )}
                                        <p className="text-sm text-muted-foreground leading-relaxed text-center mt-2">
                                          {activeItem.question_en}
                                        </p>
                                      </div>
                                    )}

                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider text-center">
                                      {isReadAloud ? 'Read this aloud in Arabic' : isDailyQ ? 'Answer in Arabic' : 'Translate to Arabic'}
                                    </p>

                                    {!isReadAloud && (
                                      <div className="flex bg-card border border-border/50 rounded-xl p-1">
                                        <button
                                          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${communityInputMode === 'type' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground'}`}
                                          onClick={() => { triggerHaptic(); setCommunityInputMode('type'); }}
                                        >
                                          <Icon icon="solar:pen-bold" className="inline mr-1.5" />Type
                                        </button>
                                        <button
                                          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${communityInputMode === 'record' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground'}`}
                                          onClick={() => { triggerHaptic(); setCommunityInputMode('record'); }}
                                        >
                                          <Icon icon="solar:microphone-3-bold" className="inline mr-1.5" />Record
                                        </button>
                                      </div>
                                    )}

                                    {(!isReadAloud && communityInputMode === 'type') ? (
                                      <div className="space-y-4">
                                        <textarea
                                          dir="rtl"
                                          lang="ar"
                                          className="w-full bg-card border border-border/50 rounded-2xl p-4 text-lg font-arabic text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 transition-colors"
                                          rows={4}
                                          placeholder="اكتب إجابتك هنا..."
                                          value={communityTypedAnswer}
                                          maxLength={500}
                                          onChange={(e) => setCommunityTypedAnswer(e.target.value)}
                                        />
                                        {communityTypedAnswer.length >= 450 && (
                                          <p className={`text-xs text-right ${communityTypedAnswer.length >= 500 ? 'text-destructive' : 'text-muted-foreground'}`}>{communityTypedAnswer.length}/500</p>
                                        )}
                                        <button
                                          className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(224,159,62,0.3)] active:scale-[0.98] transition-all disabled:opacity-50"
                                          disabled={!communityTypedAnswer.trim() || submittingPost}
                                          onClick={() => { triggerHaptic(); submitCommunityPost(communityTypedAnswer.trim()); }}
                                        >
                                          {submittingPost ? <Leapfrog size="24" speed="2.5" color="var(--primary-foreground)" /> : (
                                            <>
                                              <Icon icon="solar:plain-bold" className="text-xl" />
                                              Post to Community
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center gap-4">
                                        {!recordedAudio && (
                                          <>
                                            <p className="text-sm text-muted-foreground">
                                              {isRecording
                                                ? recordingCountdown != null
                                                  ? `Recording... ${Math.floor(recordingCountdown / 60)}:${String(recordingCountdown % 60).padStart(2, '0')}`
                                                  : 'Recording... tap to stop'
                                                : `Tap to record (max ${activeExerciseType === 'daily_question' ? '1 min' : '20s'})`}
                                            </p>
                                            <button
                                              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${isRecording
                                                ? 'bg-destructive shadow-[0_0_24px_rgba(230,57,70,0.4)] animate-pulse'
                                                : 'bg-primary shadow-[0_4px_16px_rgba(224,159,62,0.3)]'
                                              }`}
                                              onClick={() => {
                                                triggerHaptic();
                                                if (isRecording) { stopRecording(); } else { startRecording(); }
                                              }}
                                            >
                                              <Icon icon={isRecording ? "solar:stop-bold" : "solar:microphone-3-bold"} className="text-3xl text-white" />
                                            </button>
                                          </>
                                        )}

                                        {recordedAudio && !isRecording && (
                                          <div className="w-full space-y-3">
                                            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-card border border-border/50">
                                              <button
                                                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                                                onClick={() => { triggerHaptic(); playPreviewAudio(); }}
                                              >
                                                <Icon icon={previewPlaying ? "solar:pause-bold" : "solar:play-bold"} className="text-xs text-primary-foreground" />
                                              </button>
                                              <div className="flex-1 flex flex-col gap-0.5">
                                                <input
                                                  type="range" min="0" max="100" step="0.1"
                                                  value={previewProgress}
                                                  onChange={(e) => { seekPreviewAudio(parseFloat(e.target.value)); }}
                                                  className="community-audio-slider w-full"
                                                />
                                                <div className="flex justify-between">
                                                  <span className="text-[10px] text-primary/70">{formatAudioTime(previewTime)}</span>
                                                  <span className="text-[10px] text-primary/70">{previewDuration ? formatAudioTime(previewDuration) : '--:--'}</span>
                                                </div>
                                              </div>
                                              <button
                                                className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                                                onClick={() => { triggerHaptic(); cleanupPreviewAudio(); setRecordedAudio(null); }}
                                              >
                                                <Icon icon="solar:refresh-bold" className="text-xs text-muted-foreground" />
                                              </button>
                                            </div>
                                            <button
                                              className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(224,159,62,0.3)] active:scale-[0.98] transition-all disabled:opacity-50 text-sm"
                                              disabled={submittingPost}
                                              onClick={() => { triggerHaptic(); cleanupPreviewAudio(); submitCommunityPost(null, recordedAudio); }}
                                            >
                                              {submittingPost ? <Leapfrog size="20" speed="2.5" color="var(--primary-foreground)" /> : (
                                                <>
                                                  <Icon icon="solar:plain-bold" className="text-base" />
                                                  Post to Community
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        )}

                                        {speechError && <p className="text-xs text-destructive text-center">{speechError}</p>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </section>

                  {/* Recent Activity — flies off when exercise is active */}
                  <section className={activeExerciseType ? 'section-fly-off' : ''}>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="font-heading text-sm font-bold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
                      <button
                        className="w-8 h-8 rounded-lg bg-card border border-border/50 flex items-center justify-center active:scale-95 transition-all"
                        onClick={() => { triggerHaptic(); refreshCommunityFeed(); }}
                        aria-label="Refresh feed"
                      >
                        <Icon icon="solar:refresh-bold" className={`text-sm text-muted-foreground ${refreshingFeed ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {/* Filter chips */}
                    <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
                      {[
                        { key: 'all', label: 'All' },
                        { key: 'read_aloud', label: 'Read Aloud' },
                        { key: 'translate', label: 'Translate' },
                        { key: 'daily_question', label: 'Daily Q' },
                      ].map(f => (
                        <button
                          key={f.key}
                          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                            communityFilter === f.key
                              ? 'bg-primary text-primary-foreground shadow-md'
                              : 'bg-card border border-border/50 text-muted-foreground'
                          }`}
                          onClick={() => { triggerHaptic(); setCommunityFilter(f.key); loadCommunityPosts(f.key); }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Posts feed */}
                    {loadingCommunityPosts ? (
                      <div className="flex justify-center py-12"><Leapfrog size="30" speed="2.5" color="var(--primary)" /></div>
                    ) : communityPosts.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-4xl mb-3">📝</div>
                        <p className="text-sm text-muted-foreground">No posts yet. Be the first!</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Complete a challenge above to post your answer.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {communityPosts.map(post => (
                          <div key={post.id} className="bg-card border border-border/50 rounded-2xl p-5 active:scale-[0.99] transition-all cursor-pointer" onClick={() => { triggerHaptic(); openPostDetail(post); }}>
                            {/* Post header */}
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-base">
                                {post.profiles?.avatar_url || '😊'}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold">{post.profiles?.display_name || 'Learner'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">{getTimeAgo(post.created_at)}</span>
                                {canManageCommunity && (
                                  <button
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive bg-destructive/10 active:bg-destructive/20 disabled:opacity-50"
                                    disabled={moderatingTargetKey === `post_${post.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerHaptic();
                                      showConfirm({
                                        title: 'Delete Post',
                                        message: 'Delete this post for everyone? This cannot be undone.',
                                        onConfirm: () => moderateCommunityItem({ targetType: 'post', targetId: post.id, reason: 'Admin removed community post' }),
                                      });
                                    }}
                                    aria-label="Delete post"
                                    title="Delete post"
                                  >
                                    {moderatingTargetKey === `post_${post.id}`
                                      ? <Leapfrog size="12" speed="2.5" color="var(--destructive)" />
                                      : <Icon icon="solar:trash-bin-trash-bold" className="text-sm" />}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Activity badge + prompt + answer */}
                            <div className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider mb-2 ${
                              post.activity_type === 'read_aloud' ? 'bg-chart-4/15 text-chart-4'
                              : post.activity_type === 'translate' ? 'bg-chart-3/15 text-chart-3'
                              : 'bg-blue-500/15 text-blue-400'
                            }`}>
                              {post.activity_type === 'read_aloud' ? 'Read Aloud' : post.activity_type === 'translate' ? 'Translate' : 'Daily Question'}
                            </div>
                            {post.prompt_text && <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">{post.prompt_text}</p>}
                            {post.answer_text && <p className="text-sm font-arabic leading-snug line-clamp-2" dir="rtl">{post.answer_text}</p>}
                            {post.audio_url && (
                              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-primary/10 mb-4" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 active:scale-95 transition-all"
                                  onClick={() => { triggerHaptic(); playCommunityAudio(post.id, post.audio_url); }}
                                >
                                  <Icon icon={playingPostId === post.id ? "solar:pause-bold" : "solar:play-bold"} className="text-sm text-primary-foreground" />
                                </button>
                                <span className="text-[10px] text-primary/70 w-8 text-center flex-shrink-0">{playingPostId === post.id ? formatAudioTime(comAudioTime) : '0:00'}</span>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  value={playingPostId === post.id ? comAudioProgress : 0}
                                  onChange={(e) => { seekCommunityAudio(parseFloat(e.target.value), post.id); }}
                                  className="community-audio-slider flex-1"
                                />
                                <span className="text-[10px] text-primary/70 w-8 text-center flex-shrink-0">{playingPostId === post.id && comAudioDuration ? formatAudioTime(comAudioDuration) : '--:--'}</span>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-3 pt-3 border-t border-border/30">
                              <button
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                                  userReactions[`post_${post.id}`] === 'perfect'
                                    ? 'bg-green-500/15 text-green-500 border border-green-500/30'
                                    : 'bg-muted/30 text-muted-foreground border border-transparent'
                                }`}
                                onClick={(e) => { e.stopPropagation(); triggerHaptic(); togglePerfectReaction(post.id); }}
                              >
                                <Icon icon="solar:like-bold" className="text-sm" />
                                Perfect{post.perfect_count > 0 ? ` (${post.perfect_count})` : ''}
                              </button>
                              <button
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-muted/30 text-muted-foreground transition-all active:scale-95"
                                onClick={(e) => { e.stopPropagation(); triggerHaptic(); openPostDetail(post); }}
                              >
                                <Icon icon="solar:pen-bold" className="text-sm" />
                                {post.corrections_count > 0 ? `Corrections (${post.corrections_count})` : 'Suggest Correction'}
                              </button>
                              {user && post.user_id === user.id && !post.has_ai_feedback && (
                                <button
                                  className="ml-auto w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border border-violet-500/30 text-violet-400 active:scale-95 transition-all disabled:opacity-60"
                                  disabled={aiFeedbackLoading.has(post.id)}
                                  onClick={(e) => { e.stopPropagation(); triggerHaptic(); requestAiFeedback(post.id); }}
                                  aria-label="Ask AI tutor"
                                  title="Ask AI tutor"
                                >
                                  {aiFeedbackLoading.has(post.id)
                                    ? <Leapfrog size="14" speed="2.5" color="#8b5cf6" />
                                    : <Icon icon="solar:magic-stick-3-bold" className="text-base" />}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {communityHasMore && (
                          <button
                            className="w-full py-3 rounded-2xl bg-card border border-border/50 text-sm font-bold text-primary active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                            disabled={loadingMoreCommunityPosts}
                            onClick={() => { triggerHaptic(); loadMoreCommunityPosts(); }}
                          >
                            {loadingMoreCommunityPosts
                              ? <Leapfrog size="16" speed="2.5" color="var(--primary)" />
                              : 'Load more'}
                          </button>
                        )}
                      </div>
                    )}
                  </section>

                </main>
              </>
            )}
          </div>
        )}

        {/* ========== PROFILE TAB ========== */}
        {activeTab === "profile" && (
          <div key={`tab-${tabTransitionKey}`} className={tabDirection === 'back' ? 'tab-slide-left' : 'tab-slide-right'}>
            <header className="px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-20 bg-background backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-xl border border-primary/30">
                  <Icon icon="solar:user-circle-bold" className="text-primary text-2xl" />
                </div>
                <h1 className="font-heading text-xl font-bold">Profile</h1>
              </div>
            </header>
            <main className="px-6 space-y-8">
              {/* Profile Card */}
              <section>
                <div className="bg-card rounded-[2rem] p-6 border border-border/50 shadow-md flex flex-col items-center text-center">
                  <button
                    className="relative w-20 h-20 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center mb-4 active:scale-95 transition-all group"
                    onClick={() => {
                      triggerHaptic();
                      setProfileSetupName(userProfile?.display_name || user.email?.split('@')[0] || 'Learner');
                      setProfileSetupAvatar(userProfile?.avatar_url || '😊');
                      setShowProfileSetup(true);
                    }}
                  >
                    <span className="text-4xl">{userProfile?.avatar_url || '😊'}</span>
                    <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                      <Icon icon="solar:pen-bold" className="text-[10px] text-primary-foreground" />
                    </div>
                  </button>
                  <h2 className="font-heading text-xl font-bold">{userProfile?.display_name || user.email?.split("@")[0] || "Student"}</h2>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  {userRoles.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {userRoles.filter(role => role !== 'student').map(role => (
                        <span
                          key={role}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            role === 'admin'
                              ? 'bg-destructive/15 text-destructive border border-destructive/30'
                              : 'bg-primary/15 text-primary border border-primary/30'
                          }`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  )}
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
                  onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setShowStreaksPage(true); }}
                >
                  <Icon icon="solar:fire-bold" className="text-secondary text-2xl" />
                  <span className="text-2xl font-heading font-bold">{currentStreak}</span>
                  <span className="text-xs text-muted-foreground font-medium text-center">Day Streak</span>
                </div>
              </section>

              {/* Actions */}
              <section className="space-y-3">
                {canViewTeacherDashboard && (
                  <button
                    className="w-full bg-card p-4 rounded-2xl border border-border/50 flex items-center gap-4 text-left active:scale-[0.98] transition-all"
                    onClick={() => {
                      triggerHaptic();
                      setTransitionDirection("forward");
                      setShowTeacherDashboard(true);
                      loadTeacherDashboard();
                    }}
                  >
                    <Icon icon="solar:shield-user-bold" className="text-primary text-xl" />
                    <span className="font-medium text-sm">Teacher Dashboard</span>
                    <Icon icon="solar:alt-arrow-right-linear" className="text-muted-foreground ml-auto" />
                  </button>
                )}
                <button
                  className="w-full bg-card p-4 rounded-2xl border border-border/50 flex items-center gap-4 text-left active:scale-[0.98] transition-all"
                  onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setShowMyPosts(true); loadMyPosts(); }}
                >
                  <Icon icon="solar:chat-round-dots-bold" className="text-primary text-xl" />
                  <span className="font-medium text-sm">My Community Posts</span>
                  <Icon icon="solar:alt-arrow-right-linear" className="text-muted-foreground ml-auto" />
                </button>
                <button
                  className="w-full bg-card p-4 rounded-2xl border border-border/50 flex items-center gap-4 text-left active:scale-[0.98] transition-all"
                  onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setShowStreaksPage(true); }}
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

          </div>
        )}

        {/* My Community Posts Overlay — rendered outside tab conditionals so it works from any tab */}
        {showLeaderboard && (
            <div className={`fixed inset-0 z-50 bg-background flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
                <header className="px-6 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-20 bg-background backdrop-blur-xl border-b border-border/30">
                  <button className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-all"
                    onClick={() => { triggerHaptic(); setTransitionDirection("back"); setShowLeaderboard(false); }}>
                    <Icon icon="solar:alt-arrow-left-linear" className="text-lg" />
                  </button>
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:cup-star-bold" className="text-xl text-amber-400" />
                    <h1 className="font-heading text-lg font-bold">Top Contributors Last 3 days</h1>
                  </div>
                </header>
                <div className="flex-1 overflow-y-auto px-6 py-4 pb-20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-3">This Week</p>
                  {leaderboard.length === 0 ? (
                    <div className="text-center py-16">
                      <Icon icon="solar:cup-star-linear" className="text-4xl text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No posts yet this week</p>
                      <p className="text-muted-foreground/60 text-xs mt-1">Be the first to contribute!</p>
                    </div>
                  ) : (
                    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                      {leaderboard.map((entry, idx) => (
                        <div key={entry.user_id} className={`flex items-center gap-3 px-4 py-4 ${idx < leaderboard.length - 1 ? 'border-b border-border/30' : ''}`}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                            idx === 0 ? 'bg-amber-500/20 text-amber-400' : idx === 1 ? 'bg-slate-300/20 text-slate-400' : idx === 2 ? 'bg-orange-600/20 text-orange-500' : 'bg-muted/30 text-muted-foreground'
                          }`}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg flex-shrink-0">
                            {entry.avatar_url || '😊'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{entry.display_name}</p>
                          </div>
                          <span className="text-sm font-bold text-primary">{entry.count} {entry.count === 1 ? 'post' : 'posts'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            </div>
        )}

        {showTeacherDashboard && (
            <div className={`fixed inset-0 z-50 bg-background flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
                <header className="px-6 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-20 bg-background backdrop-blur-xl border-b border-border/30">
                  <button
                    className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-all"
                    onClick={() => { triggerHaptic(); setTransitionDirection("back"); setShowTeacherDashboard(false); }}
                  >
                    <Icon icon="solar:alt-arrow-left-linear" className="text-lg" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h1 className="font-heading text-lg font-bold truncate">Teacher Dashboard</h1>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Student activity and progress</p>
                  </div>
                  <button
                    className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                    onClick={() => { triggerHaptic(); loadTeacherDashboard(); }}
                    disabled={loadingTeacherDashboard}
                    aria-label="Refresh dashboard"
                  >
                    <Icon icon="solar:refresh-bold" className={`text-lg ${loadingTeacherDashboard ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                  </button>
                </header>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 pb-20">
                  {teacherDashboardError ? (
                    <div className="bg-card border border-destructive/30 rounded-2xl p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center flex-shrink-0">
                          <Icon icon="solar:danger-triangle-bold" className="text-destructive text-lg" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground mb-1">Dashboard unavailable</p>
                          <p className="text-sm text-muted-foreground">{teacherDashboardError}</p>
                        </div>
                      </div>
                    </div>
                  ) : loadingTeacherDashboard && !teacherDashboardData ? (
                    <div className="flex justify-center py-12">
                      <Leapfrog size="28" speed="2.5" color="var(--primary)" />
                    </div>
                  ) : (
                    <>
                      <section className="grid grid-cols-2 gap-3">
                        <div className="bg-card border border-border/50 rounded-2xl p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Students</p>
                          <p className="font-heading text-3xl font-bold">{teacherDashboardData?.overview?.student_count ?? 0}</p>
                        </div>
                        <div className="bg-card border border-border/50 rounded-2xl p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Active Today</p>
                          <p className="font-heading text-3xl font-bold">{teacherDashboardData?.overview?.active_today ?? 0}</p>
                        </div>
                        <div className="bg-card border border-border/50 rounded-2xl p-4 col-span-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Book Lessons In Course</p>
                          <p className="text-sm font-bold text-foreground">
                            {teacherDashboardData?.overview?.total_book_lessons ?? 0} book
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">Course progress is based on book lessons only.</p>
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="font-heading text-sm font-bold text-muted-foreground uppercase tracking-wider">Class Overview</h2>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Top 3 students</span>
                        </div>
                        <div className="space-y-3">
                          {[
                            {
                              key: 'current_streak',
                              title: 'Streak Leaders',
                              subtitle: 'Current streak',
                              accent: 'text-amber-400',
                              icon: 'solar:fire-bold',
                            },
                            {
                              key: 'minutes_last_7_days',
                              title: 'Minutes Leaders',
                              subtitle: 'Last 7 days',
                              accent: 'text-primary',
                              icon: 'solar:clock-circle-bold',
                            },
                            {
                              key: 'posts_last_7_days',
                              title: 'Post Leaders',
                              subtitle: 'Active posts in 7 days',
                              accent: 'text-blue-400',
                              icon: 'solar:chat-round-dots-bold',
                            },
                          ].map((board) => {
                            const leaders = getTeacherLeaderboard(board.key, 3);
                            return (
                              <div key={board.key} className="bg-card border border-border/50 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Icon icon={board.icon} className={`text-lg ${board.accent}`} />
                                  <div>
                                    <p className="text-sm font-bold text-foreground">{board.title}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{board.subtitle}</p>
                                  </div>
                                </div>
                                {leaders.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No student data yet.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {leaders.map((student, idx) => (
                                      <div key={`${board.key}_${student.user_id}`} className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border/30 px-3 py-2.5">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                          idx === 0 ? 'bg-amber-500/15 text-amber-400' : idx === 1 ? 'bg-slate-300/15 text-slate-300' : 'bg-orange-600/15 text-orange-400'
                                        }`}>
                                          {idx + 1}
                                        </div>
                                        <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-base flex-shrink-0">
                                          {student.avatar_url || '😊'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-bold text-foreground truncate">{student.display_name || 'Learner'}</p>
                                          <p className="text-[10px] text-muted-foreground">{student.email || 'Student'}</p>
                                        </div>
                                        <span className={`text-sm font-bold ${board.accent}`}>
                                          {formatLeaderboardValue(board.key, student?.stats?.[board.key])}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="font-heading text-sm font-bold text-muted-foreground uppercase tracking-wider">Students</h2>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {teacherDashboardData?.students?.length
                              ? `${Math.min(teacherStudentsVisible, teacherDashboardData.students.length)} of ${teacherDashboardData.students.length}`
                              : (teacherDashboardData?.generated_at ? `Updated ${getTimeAgo(teacherDashboardData.generated_at)}` : '')}
                          </span>
                        </div>

                        {!teacherDashboardData?.students?.length ? (
                          <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
                            <Icon icon="solar:users-group-rounded-linear" className="text-4xl text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">No students to show yet.</p>
                          </div>
                        ) : (
                          <>
                            <div className="bg-card border border-border/50 rounded-2xl overflow-hidden divide-y divide-border/40">
                              {teacherDashboardData.students.slice(0, teacherStudentsVisible).map((student) => {
                                const isExpanded = expandedStudentId === student.user_id;
                                return (
                                  <div key={student.user_id}>
                                    <button
                                      type="button"
                                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-muted/40 transition-colors"
                                      onClick={() => {
                                        triggerHaptic();
                                        setExpandedStudentId(isExpanded ? null : student.user_id);
                                      }}
                                    >
                                      <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-base flex-shrink-0">
                                        {student.avatar_url || '😊'}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-foreground truncate">{student.display_name || 'Learner'}</p>
                                      </div>
                                      {student.stats?.was_active_today && (
                                        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" aria-label="Active today" />
                                      )}
                                      <Icon
                                        icon="solar:alt-arrow-down-linear"
                                        className={`text-base text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                      />
                                    </button>

                                    {isExpanded && (
                                      <div className="px-4 pb-4 pt-1 bg-muted/20">
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                          {student.stats?.was_active_today && (
                                            <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 text-[9px] font-bold uppercase tracking-wider">Active today</span>
                                          )}
                                        </div>
                                        {student.email && <p className="text-xs text-muted-foreground break-all">{student.email}</p>}
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                                          <span>Last active {student.last_active_at ? getTimeAgo(student.last_active_at) : 'never'}</span>
                                          <span>Joined {formatDashboardDate(student.joined_at)}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mt-4">
                                          <div className="rounded-2xl bg-card border border-border/30 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Time</p>
                                            <p className="text-sm font-bold text-foreground">{formatMinutesSpent(student.stats?.minutes_today ?? 0)} today</p>
                                            <p className="text-xs text-muted-foreground mt-1">{formatMinutesSpent(student.stats?.minutes_last_7_days ?? 0)} in 7 days</p>
                                          </div>
                                          <div className="rounded-2xl bg-card border border-border/30 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Streak</p>
                                            <p className="text-sm font-bold text-foreground">{student.stats?.current_streak ?? 0} day streak</p>
                                            <p className="text-xs text-muted-foreground mt-1">{student.stats?.active_days_last_30 ?? 0} active days in 30</p>
                                          </div>
                                          <div className="rounded-2xl bg-card border border-border/30 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Book Lessons</p>
                                            <p className="text-sm font-bold text-foreground">
                                              {student.stats?.book_lessons_completed ?? 0}/{teacherDashboardData?.overview?.total_book_lessons ?? 0}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">{student.stats?.book_progress_percent ?? 0}% complete</p>
                                          </div>
                                          <div className="rounded-2xl bg-card border border-border/30 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Active Posts</p>
                                            <p className="text-sm font-bold text-foreground">
                                              {student.stats?.posts_last_7_days ?? 0} this week
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">{student.stats?.total_posts ?? 0} total posts</p>
                                          </div>
                                          <div className="rounded-2xl bg-card border border-border/30 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Daily Scenario</p>
                                            <p className={`text-sm font-bold ${student.stats?.scenario_completed_today ? 'text-green-500' : 'text-foreground'}`}>
                                              {student.stats?.scenario_completed_today ? 'Completed' : 'Not completed'}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">Today</p>
                                          </div>
                                          <div className="rounded-2xl bg-card border border-border/30 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Daily Picture</p>
                                            <p className={`text-sm font-bold ${student.stats?.picture_completed_today ? 'text-green-500' : 'text-foreground'}`}>
                                              {student.stats?.picture_completed_today ? 'Completed' : 'Not completed'}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">Today</p>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
                                          <span>Total time: <span className="text-foreground font-bold">{formatMinutesSpent(student.stats?.total_minutes ?? 0)}</span></span>
                                          <span>Posts: <span className="text-foreground font-bold">{student.stats?.total_posts ?? 0}</span></span>
                                          <span>Best streak: <span className="text-foreground font-bold">{student.stats?.longest_streak ?? 0}</span></span>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border/30">
                                          <span className="text-xs text-muted-foreground">
                                            {student.stats?.was_active_today ? 'Active on the app today' : 'Not active today'}
                                          </span>
                                          <button
                                            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
                                            disabled={!student.stats?.total_posts || (loadingTeacherStudentPosts && teacherSelectedStudent?.user_id === student.user_id)}
                                            onClick={() => {
                                              triggerHaptic();
                                              loadTeacherStudentPosts(student);
                                            }}
                                          >
                                            {loadingTeacherStudentPosts && teacherSelectedStudent?.user_id === student.user_id
                                              ? 'Loading...'
                                              : 'View Posts'}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {teacherStudentsVisible < teacherDashboardData.students.length && (
                              <button
                                type="button"
                                className="w-full mt-4 px-4 py-3 rounded-2xl bg-card border border-border/50 text-sm font-bold text-foreground active:scale-[0.99] transition-all"
                                onClick={() => {
                                  triggerHaptic();
                                  setTeacherStudentsVisible((n) => n + 50);
                                }}
                              >
                                Load more ({teacherDashboardData.students.length - teacherStudentsVisible} remaining)
                              </button>
                            )}
                          </>
                        )}
                      </section>
                    </>
                  )}
                </div>
            </div>
        )}

        {showTeacherStudentPosts && (
            <div className={`fixed inset-0 z-[60] bg-background flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
                <header className="px-6 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-20 bg-background backdrop-blur-xl border-b border-border/30">
                  <button
                    className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-all"
                    onClick={() => { triggerHaptic(); setTransitionDirection("back"); setShowTeacherStudentPosts(false); }}
                  >
                    <Icon icon="solar:alt-arrow-left-linear" className="text-lg" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h1 className="font-heading text-lg font-bold truncate">{teacherSelectedStudent?.display_name || 'Student Posts'}</h1>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Community posts</p>
                  </div>
                  <button
                    className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                    onClick={() => { triggerHaptic(); loadTeacherStudentPosts(teacherSelectedStudent); }}
                    disabled={loadingTeacherStudentPosts || !teacherSelectedStudent?.user_id}
                    aria-label="Refresh posts"
                  >
                    <Icon icon="solar:refresh-bold" className={`text-lg ${loadingTeacherStudentPosts ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                  </button>
                </header>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 pb-20">
                  {teacherStudentPostsError ? (
                    <div className="bg-card border border-destructive/30 rounded-2xl p-5">
                      <p className="text-sm font-bold text-foreground mb-1">Could not load posts</p>
                      <p className="text-sm text-muted-foreground">{teacherStudentPostsError}</p>
                    </div>
                  ) : loadingTeacherStudentPosts && teacherStudentPosts.length === 0 ? (
                    <div className="flex justify-center py-12">
                      <Leapfrog size="28" speed="2.5" color="var(--primary)" />
                    </div>
                  ) : teacherStudentPosts.length === 0 ? (
                    <div className="text-center py-16">
                      <Icon icon="solar:chat-round-dots-linear" className="text-4xl text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No posts yet</p>
                      <p className="text-muted-foreground/60 text-xs mt-1">This student has not posted to the community.</p>
                    </div>
                  ) : (
                    teacherStudentPosts.map(post => (
                      <div
                        key={post.id}
                        className="bg-card border border-border/50 rounded-2xl p-5 active:scale-[0.99] transition-all cursor-pointer"
                        onClick={() => { triggerHaptic(); openTeacherStudentPost(post); }}
                      >
                        <div className="flex items-center justify-between mb-2 gap-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            post.activity_type === 'read_aloud' ? 'bg-chart-4/15 text-chart-4' :
                            post.activity_type === 'translate' ? 'bg-primary/15 text-primary' :
                            'bg-secondary/15 text-secondary'
                          }`}>
                            {post.activity_type === 'read_aloud' ? 'Read Aloud' : post.activity_type === 'translate' ? 'Translate' : 'Daily Question'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{getTimeAgo(post.created_at)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1 line-clamp-2">{post.prompt_text}</p>
                        {post.answer_text && (
                          <p className="text-sm font-medium mb-2 line-clamp-3" dir="rtl" lang="ar" style={{ fontFamily: 'var(--font-arabic)' }}>
                            {post.answer_text}
                          </p>
                        )}
                        {post.audio_url && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <Icon icon="solar:microphone-bold" className="text-xs text-primary/60" />
                            <span className="text-[10px] text-primary/60">Audio attached</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                            <span>{post.perfect_count || 0} perfect</span>
                            <span>{post.corrections_count || 0} corrections</span>
                          </div>
                          <span className="text-xs font-bold text-primary">Open</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
            </div>
        )}

        {showMyPosts && (
            <div className={`fixed inset-0 z-50 bg-background flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
                <header className="px-6 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-20 bg-background backdrop-blur-xl border-b border-border/30">
                  <button className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-all"
                    onClick={() => { triggerHaptic(); setTransitionDirection("back"); setShowMyPosts(false); }}>
                    <Icon icon="solar:alt-arrow-left-linear" className="text-lg" />
                  </button>
                  <h1 className="font-heading text-lg font-bold">My Community Posts</h1>
                </header>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 pb-20">
                  {loadingMyPosts ? (
                    <div className="flex justify-center py-12">
                      <Leapfrog size="28" speed="2.5" color="var(--primary)" />
                    </div>
                  ) : myPosts.length === 0 ? (
                    <div className="text-center py-16">
                      <Icon icon="solar:chat-round-dots-linear" className="text-4xl text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No posts yet</p>
                      <p className="text-muted-foreground/60 text-xs mt-1">Complete community exercises to post!</p>
                    </div>
                  ) : (
                    myPosts.map(post => (
                      <div key={post.id} className="bg-card border border-border/50 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            post.activity_type === 'read_aloud' ? 'bg-chart-4/15 text-chart-4' :
                            post.activity_type === 'translate' ? 'bg-primary/15 text-primary' :
                            'bg-secondary/15 text-secondary'
                          }`}>
                            {post.activity_type === 'read_aloud' ? 'Read Aloud' : post.activity_type === 'translate' ? 'Translate' : 'Daily Question'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{getTimeAgo(post.created_at)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">{post.prompt_text}</p>
                        {post.answer_text && (
                          <p className="text-sm font-medium mb-2" dir="rtl" lang="ar" style={{ fontFamily: 'var(--font-arabic)' }}>
                            {post.answer_text}
                          </p>
                        )}
                        {post.audio_url && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <Icon icon="solar:microphone-bold" className="text-xs text-primary/60" />
                            <span className="text-[10px] text-primary/60">Audio attached</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                          <span className="text-[10px] text-muted-foreground/60">
                            {post.perfect_count > 0 ? `${post.perfect_count} perfect` : ''}
                          </span>
                          <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium active:scale-95 transition-all disabled:opacity-50"
                            disabled={deletingPostId === post.id}
                            onClick={() => {
                              triggerHaptic();
                              showConfirm({
                                title: 'Delete Post',
                                message: 'Delete this post? This cannot be undone.',
                                onConfirm: () => deleteMyPost(post.id),
                              });
                            }}
                          >
                            {deletingPostId === post.id ? (
                              <Leapfrog size="14" speed="2.5" color="var(--destructive)" />
                            ) : (
                              <><Icon icon="solar:trash-bin-trash-bold" className="text-sm" />Delete</>
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
            </div>
        )}

        {/* ========== BOTTOM TAB BAR ========== */}
        <nav className={`fixed left-6 right-6 z-50 ${((communityView === 'post_detail' || communityView === 'exercise') && activeTab === 'community') || (activeTab === 'community' && activeExerciseType) || showMyPosts || showLeaderboard || showTeacherDashboard || showTeacherStudentPosts ? 'hidden' : ''}`} style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
          <div className="bg-background/80 backdrop-blur-2xl border border-border/50 rounded-full px-6 py-4 flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <button
              className={`flex flex-col items-center gap-0.5 w-16 transition-all ${activeTab === "home" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); switchTab("home"); }}
            >
              <Icon icon={activeTab === "home" ? "solar:home-2-bold" : "solar:home-2-linear"} className="text-2xl" />
              {activeTab === "home" && <span className="text-[10px] font-bold">Home</span>}
            </button>
            <button
              className={`flex flex-col items-center gap-0.5 w-16 transition-all ${activeTab === "courses" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); switchTab("courses"); }}
            >
              <Icon icon={activeTab === "courses" ? "solar:book-bookmark-bold" : "solar:book-bookmark-linear"} className="text-2xl" />
              {activeTab === "courses" && <span className="text-[10px] font-bold">Courses</span>}
            </button>
            <button
              className={`flex flex-col items-center gap-0.5 w-16 transition-all ${activeTab === "community" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); switchTab("community"); if (!dailyExercises) loadDailyExercises(); loadCommunityPosts(communityFilter); loadLeaderboard(); }}
            >
              <Icon icon={activeTab === "community" ? "solar:users-group-rounded-bold" : "solar:users-group-rounded-linear"} className="text-2xl" />
              {activeTab === "community" && <span className="text-[10px] font-bold">Community</span>}
            </button>
            <button
              className={`flex flex-col items-center gap-0.5 w-16 transition-all ${activeTab === "profile" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => { triggerHaptic(); switchTab("profile"); }}
            >
              <Icon icon={activeTab === "profile" ? "solar:user-circle-bold" : "solar:user-circle-linear"} className="text-2xl" />
              {activeTab === "profile" && <span className="text-[10px] font-bold">Profile</span>}
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

        {/* Profile Setup Modal */}
        {showProfileSetup && (
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => { if (userProfile) setShowProfileSetup(false); }}>
            <div className="bg-card rounded-3xl p-6 max-w-sm w-full border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading text-lg font-bold mb-1">{userProfile?.avatar_url ? 'Edit Profile' : 'Set up your profile'}</h3>
              <p className="text-sm text-muted-foreground mb-5">Choose a name and avatar for the community.</p>

              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-4xl">
                  {profileSetupAvatar || '😊'}
                </div>
              </div>
              <div className="grid grid-cols-8 gap-2 mb-5">
                {AVATAR_OPTIONS.map(emoji => (
                  <button
                    key={emoji}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all active:scale-90 ${
                      profileSetupAvatar === emoji ? 'bg-primary/20 border-2 border-primary' : 'bg-muted/30 border border-border/30'
                    }`}
                    onClick={() => { triggerHaptic(); setProfileSetupAvatar(emoji); }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <input
                type="text"
                className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 mb-5"
                placeholder="Display name"
                value={profileSetupName}
                onChange={(e) => setProfileSetupName(e.target.value)}
                maxLength={20}
              />

              <button
                className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
                disabled={!profileSetupName.trim()}
                onClick={() => { triggerHaptic(); saveUserProfile(); }}
              >
                Save Profile
              </button>
            </div>
          </div>
        )}

        {/* Report Abuse Modal */}
        {showReportModal && (
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => { triggerHaptic(); setShowReportModal(false); setReportTarget(null); setReportReason(''); }}>
            <div className="bg-card rounded-3xl p-6 max-w-sm w-full border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading text-lg font-bold mb-1">Report Content</h3>
              <p className="text-sm text-muted-foreground mb-4">Tell us why this content is inappropriate.</p>
              <textarea
                className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 mb-4"
                rows={3}
                placeholder="Describe the issue..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 rounded-xl border border-border font-bold text-sm text-foreground bg-muted active:scale-[0.97] transition-all"
                  onClick={() => { triggerHaptic(); setShowReportModal(false); setReportTarget(null); setReportReason(''); }}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-destructive active:scale-[0.97] transition-all disabled:opacity-50"
                  disabled={!reportReason.trim()}
                  onClick={() => { triggerHaptic(); submitReport(); }}
                >
                  Report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Confirm Modal */}
        {confirmModal && (
          <div className="confirm-overlay" onClick={() => setConfirmModal(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <div className={`confirm-icon ${confirmModal.variant === 'warning' ? 'warning' : 'danger'}`}>
                <Icon icon={confirmModal.variant === 'warning' ? 'solar:danger-triangle-bold' : 'solar:trash-bin-trash-bold'} />
              </div>
              <h3 className="confirm-title">{confirmModal.title}</h3>
              <p className="confirm-message">{confirmModal.message}</p>
              <div className="confirm-actions">
                <button className="confirm-btn confirm-btn-cancel" onClick={() => { triggerHaptic(); setConfirmModal(null); }}>
                  Cancel
                </button>
                <button
                  className={`confirm-btn ${confirmModal.variant === 'warning' ? 'confirm-btn-warning' : 'confirm-btn-danger'}`}
                  onClick={() => { triggerHaptic(); confirmModal.onConfirm(); setConfirmModal(null); }}
                >
                  {confirmModal.confirmLabel || 'Delete'}
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
            Continue <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
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
      <div className="scenario-enter">
        <ScenarioChat
          scenarioData={scenarioData}
          user={user}
          markScenarioCompletedForToday={markScenarioCompletedForToday}
          onComplete={() => {
            triggerHeavyHaptic();
          }}
          onExit={() => setScenarioPhase(false)}
          supabase={supabase}
          triggerHaptic={triggerHaptic}
          triggerHeavyHaptic={triggerHeavyHaptic}
        />
      </div>
    );
  }


  // ---------- WORD OF THE DAY SCREEN ----------

  if (practiceMode === "wotd") {
    // Loading state
    if (loadingWotd) {
      return (
        <div className="h-[100dvh] overflow-hidden bg-background text-foreground font-sans flex items-center justify-center">
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
        <div className="h-[100dvh] overflow-hidden bg-background text-foreground font-sans flex flex-col items-center justify-center text-center px-8">
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
        <div className={`h-[100dvh] overflow-hidden bg-background text-foreground font-sans flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
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

          <footer className="px-6 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 2rem)' }}>
            <button
              className="prebook-continue-btn" style={{ width: "100%" }}
              onClick={() => { triggerHaptic(); setTransitionDirection("forward"); setWotdPhase("word"); }}
            >
              Let's Go!
              <Icon icon="solar:arrow-right-linear" />
            </button>
          </footer>
        </div>
      );
    }

    // PHASE: WORD DISPLAY
    if (wotdPhase === "word") {
      return (
        <div className={`h-[100dvh] overflow-hidden bg-background text-foreground font-sans flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
          {/* Header */}
          <header className="px-6 pt-12 pb-4 flex items-center justify-between bg-background">
            <button
              className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setWotdPhase("intro"); }}
            >
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <span className="bg-chart-3/20 text-chart-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-chart-3/20">
              Today's Word
            </span>
            <div className="w-10" />
          </header>

          <main className="flex-1 px-6 py-6 flex flex-col justify-center space-y-6 min-h-0">
            {/* Arabic Card */}
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2 text-right">عربي:</p>
              <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-md" dir="rtl">
                <p className="text-3xl font-arabic leading-relaxed text-center">{currentWotd.arabic_text}</p>
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

          <footer className="px-6 pt-4 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 2rem)' }}>
            <div className="prebook-action-row">
              <button
                className="prebook-audio-btn"
                onClick={() => { triggerHaptic(); speakAiAudio(currentWotd.arabic_text); }}
              >
                <Icon icon="solar:volume-loud-bold" />
              </button>
              <button
                className="prebook-continue-btn"
                onClick={() => {
                  triggerHaptic();
                  setTransitionDirection("forward");
                  if (wotdExamples.length > 0) {
                    setWotdPhase("examples");
                  } else {
                    setWotdPhase("complete");
                  }
                }}
              >
                {wotdExamples.length > 0 ? "See Examples" : "Continue"}
                <Icon icon="solar:arrow-right-linear" />
              </button>
            </div>
          </footer>
        </div>
      );
    }

    // PHASE: EXAMPLES
    if (wotdPhase === "examples" && wotdExamples.length > 0) {
      const currentExample = wotdExamples[wotdExampleIndex];

      return (
        <div className={`h-[100dvh] overflow-hidden bg-background text-foreground font-sans flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
          {/* Header */}
          <header className="px-6 pt-12 pb-4 flex items-center justify-between bg-background">
            <button
              className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setWotdPhase("word"); }}
            >
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <span className="bg-chart-3/20 text-chart-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-chart-3/20">
              Example {wotdExampleIndex + 1}/{wotdExamples.length}
            </span>
            <div className="w-10" />
          </header>

          <main key={wotdExampleIndex} className="flex-1 px-6 py-6 flex flex-col justify-center space-y-6 swipe-in min-h-0">
            {/* Arabic */}
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2 text-right">عربي:</p>
              <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-md" dir="rtl">
                <p className="text-2xl font-arabic leading-relaxed text-center">{currentExample.example_arabic}</p>
              </div>
            </div>

            {/* English */}
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">English:</p>
              <div className="bg-card rounded-3xl p-6 border-l-4 border-chart-3 border border-border/50">
                <p className="text-base text-center">{currentExample.example_english}</p>
              </div>
            </div>

            {/* Notes */}
            {currentExample.notes && (
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">Note:</p>
                <div className="bg-muted/30 rounded-3xl p-6 border border-border/30">
                  <p className="text-sm text-muted-foreground leading-relaxed text-center">{currentExample.notes}</p>
                </div>
              </div>
            )}
          </main>

          <footer className="px-6 pt-4 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 2rem)' }}>
            <div className="prebook-action-row">
              <button
                className="prebook-audio-btn"
                onClick={() => { triggerHaptic(); speakAiAudio(currentExample.example_arabic); }}
              >
                <Icon icon="solar:volume-loud-bold" />
              </button>
              <button
                className="prebook-continue-btn"
                onClick={() => {
                  triggerHaptic();
                  setTransitionDirection("forward");
                  if (wotdExampleIndex === wotdExamples.length - 1) {
                    setWotdPhase("complete");
                  } else {
                    setWotdExampleIndex(i => i + 1);
                  }
                }}
              >
                {wotdExampleIndex === wotdExamples.length - 1 ? "Finish" : "Continue"}
                <Icon icon="solar:arrow-right-linear" />
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
        const shareUrl = 'https://ihyaarabicapp.com/download';
        const shareText = 'Download the Ihya Arabic App for Android.';
        const shareData = {
          title: 'Ihya Arabic App',
          text: shareText,
          url: shareUrl,
        };

        try {
          if (Capacitor.isNativePlatform()) {
            await Share.share(shareData);
          } else if (navigator.share) {
            await navigator.share(shareData);
          } else {
            window.open(shareUrl, '_blank', 'noopener,noreferrer');
          }
        } catch (err) {
          if (err?.name !== 'AbortError') {
            console.log('Share failed:', err);
          }
        }
      };

      return (
        <div className={`h-[100dvh] overflow-hidden bg-background text-foreground font-sans flex flex-col ${transitionDirection === 'back' ? 'page-transition-back' : 'page-transition'}`}>
          {/* Decorative top gradient */}
          <div className="relative w-full pt-16 pb-8 flex flex-col items-center">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center mb-5">
                <Icon icon="solar:star-bold" className="text-primary text-4xl" />
              </div>
              <h1 className="font-heading text-3xl font-bold mb-1">Well Done!</h1>
              <p className="text-muted-foreground text-sm">Check in tomorrow for a new phrase</p>
            </div>
          </div>

          <main className="flex-1 px-6 flex flex-col items-center justify-center min-h-0">
            {/* Word card */}
            <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-lg w-full max-w-sm mb-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-chart-3 to-secondary" />
              <p className="text-3xl font-arabic text-center leading-relaxed mb-4" dir="rtl">{currentWotd.arabic_text}</p>
              <div className="w-12 h-0.5 bg-border/50 mx-auto mb-4" />
              <p className="text-lg font-medium text-center text-muted-foreground">{currentWotd.english_text}</p>
              {currentWotd.transliteration && (
                <p className="text-sm text-primary/60 text-center mt-2 italic">{currentWotd.transliteration}</p>
              )}
            </div>

            {/* Stats row */}
            {wotdExamples.length > 0 && (
              <div className="flex items-center gap-6 mb-6">
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold text-primary">{wotdExamples.length}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Examples</span>
                </div>
                <div className="w-px h-8 bg-border/50" />
                <div className="flex flex-col items-center">
                  <Icon icon="solar:check-circle-bold" className="text-2xl text-chart-4" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Complete</span>
                </div>
              </div>
            )}
          </main>

          <footer className="px-6 space-y-3 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 24px) + 1.5rem)' }}>
            <button
              className="prebook-continue-btn" style={{ width: "100%" }}
              onClick={handleShare}
            >
              <Icon icon="solar:share-bold" />
              Share
            </button>
            <button
              className="prebook-continue-btn" style={{ width: "100%" }}
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPracticeMode(null); resetWotdFlow(); }}
            >
              <Icon icon="solar:home-2-bold" />
              Return Home
            </button>
          </footer>
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
          <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 z-20 bg-background backdrop-blur-xl">
            <button
              className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center"
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); exitPictureToHome(true); }}
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

    // PHASE: INTRO
    if (picturePhase === "intro" && activePictureLesson) {
      return (
        <div className="picture-describe-screen">
          <header className="picture-describe-header">
            <button
              className="picture-back-btn"
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); exitPictureToHome(true); }}
            >
              <MdArrowBackIosNew style={{ fontSize: '1.1rem' }} />
            </button>
            <h2 className="picture-describe-title">{activePictureLesson.title}</h2>
            <div style={{ width: '2.5rem' }} />
          </header>

          <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            <img
              src={activePictureLesson.image_url}
              alt={activePictureLesson.title}
              style={{ width: '100%', borderRadius: '1rem', border: '1px solid var(--border)', objectFit: 'cover', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
            />

            <div style={{ background: 'var(--card)', borderRadius: '1.25rem', padding: '1.25rem', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b', marginBottom: '0.5rem' }}>
                Today's Picture
              </div>
              <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--foreground)', margin: 0 }}>
                This is today's picture. Try to describe it in as much detail as possible — include every detail you can see. First, let's go through the vocabulary you'll need.
              </p>
            </div>
          </div>

          <div style={{ padding: '1rem 1.25rem calc(env(safe-area-inset-bottom, 20px) + 1.25rem)' }}>
            <button
              style={{
                width: '100%', padding: '0.95rem', borderRadius: '1rem', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white', fontWeight: 700, fontSize: '0.95rem'
              }}
              onClick={() => { triggerHaptic(); setPicturePhase("vocab"); }}
            >
              Continue to Vocabulary <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
            </button>
          </div>
        </div>
      );
    }

    // PHASE: VOCAB CAROUSEL
    if (picturePhase === "vocab" && activePictureLesson) {
      return (
        <div className={`no-scroll-container ${transitionDirection === 'back' ? 'swipe-in-left' : 'swipe-in'}`}>
          <header className="fixed-header" style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
            <span
              style={{ fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); setPicturePhase("intro"); }}
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
                onClick={() => { triggerHaptic(); openPictureDescribePractice(); }}
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
                        openPictureDescribePractice();
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
                    <MdArrowForwardIos />
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
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); exitPictureToHome(true); }}
            >
              <MdArrowBackIosNew style={{ fontSize: '1.1rem' }} />
            </button>
            <h2 className="picture-describe-title">{activePictureLesson.title}</h2>
          </header>

          {/* Picture */}
          {/* Picture */}
          <div className="picture-display-container">
            <img
              src={activePictureLesson.image_url}
              alt={activePictureLesson.title}
              className="picture-display-image"
            />
          </div>

          {/* Bottom Panel */}
          <div className="bg-card border-t border-border/50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] flex-shrink-0 flex flex-col relative z-20 pb-safe">
            {/* Recording indicator panel */}
            {pictureRecording && (
              <div className="px-5 pt-4 pb-2">
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-red-400">Recording</span>
                    <span className="ml-auto text-xs font-mono font-bold text-muted-foreground">{pictureRecordingTime}s / {PICTURE_MAX_RECORD_SECONDS}s</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Describe what you see in the picture</p>
                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-linear"
                      style={{
                        width: `${(pictureRecordingTime / PICTURE_MAX_RECORD_SECONDS) * 100}%`,
                        background: pictureRecordingTime >= PICTURE_MAX_RECORD_SECONDS - 4 ? '#ef4444' : pictureRecordingTime >= PICTURE_MAX_RECORD_SECONDS - 8 ? '#eab308' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {showPictureHint && !pictureCheckingAnswer && (
              <div className="picture-hint-panel-shell">
                <div className="picture-hint-panel">
                  <div className="picture-hint-panel-header">
                    <h3>Vocabulary Hint</h3>
                    <button
                      type="button"
                      className="picture-hint-close-btn"
                      onClick={() => { triggerHaptic(); setShowPictureHint(false); }}
                    >
                      <Icon icon="solar:close-circle-bold" className="text-xl" />
                    </button>
                  </div>
                  <div className="picture-hint-panel-list">
                    {pictureVocab.map((item, idx) => (
                      <div key={idx} className="picture-hint-item">
                        <span className="hint-arabic">{item.arabic_text || item.arabic}</span>
                        <span className="hint-divider">-</span>
                        <span className="hint-english">{item.english_text || item.english}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Button Row */}
            <div className="px-6 pb-14 pt-4 bg-card">
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        background: 'var(--card)', borderRadius: '1.25rem', padding: '1.25rem', border: '1px solid var(--border)',
                        width: '100%', maxWidth: '280px', textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem', animation: 'pulse 1.5s ease-in-out infinite' }}>{currentMsg.icon}</div>
                        <p style={{ color: 'var(--foreground)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{currentMsg.text}</p>
                        <div style={{ height: '4px', borderRadius: '2px', background: 'var(--muted)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary)', borderRadius: '2px', transition: 'width 1.5s ease-out' }} />
                        </div>
                      </div>
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
                <div className="flex items-center justify-center gap-12">
                  {/* Hint Button — accessible even while recording */}
                  {pictureVocab.length > 0 && (
                    <button
                      onClick={() => { triggerHaptic(); setShowPictureHint(!showPictureHint); }}
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors active:scale-95 border ${
                        showPictureHint
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                          : 'bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-amber-500/20 text-amber-500'
                      }`}
                    >
                      <Icon icon="solar:lightbulb-bolt-bold" className="text-2xl" />
                    </button>
                  )}

                  {/* Mic / Stop Button */}
                  <button
                    onClick={() => {
                      triggerHaptic();
                      if (pictureRecording) {
                        stopPictureRecording();
                      } else {
                        startPictureRecording();
                      }
                    }}
                    className={`w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center shadow-lg transition-all duration-200 text-white select-none ${pictureRecording
                        ? 'bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                        : 'bg-primary active:scale-95 shadow-[0_4px_20px_rgba(224,159,62,0.3)]'
                      }`}
                  >
                    <Icon
                      icon={pictureRecording ? "solar:stop-bold" : "solar:microphone-bold"}
                      className="text-3xl"
                    />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Error display */}
          {speechError && (
            <p style={{ color: '#dc2626', textAlign: 'center', fontSize: '0.85rem', margin: '0 1rem 0.5rem', padding: '0.5rem 1rem', background: 'rgba(220,38,38,0.08)', borderRadius: '8px' }}>
              {speechError}
            </p>
          )}
        </div>
      );
    }

    // PHASE: SILENCE — no speech detected
    if (picturePhase === "silence" && activePictureLesson) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', gap: '1.5rem' }}>
          <div style={{ fontSize: '3rem' }}>🔇</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.5rem' }}>We didn't hear anything</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>Make sure your microphone is working and try speaking clearly in Arabic.</div>
          </div>
          <button
            style={{ padding: '0.9rem 2rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: '0.93rem' }}
            onClick={() => { triggerHaptic(); setPicturePhase("picture"); setPictureTranscript(""); }}
          >
            Try Again
          </button>
        </div>
      );
    }

    // PHASE: NOT ARABIC — user spoke in wrong language
    if (picturePhase === "not_arabic" && activePictureLesson) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', gap: '1.5rem' }}>
          <div style={{ fontSize: '3rem' }}>🗣️</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.5rem' }}>Please speak in Arabic</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>It sounds like you were speaking in another language. Try again and describe the picture in Arabic using the vocabulary words.</div>
          </div>
          <button
            style={{ padding: '0.9rem 2rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: '0.93rem' }}
            onClick={() => { triggerHaptic(); setPicturePhase("picture"); setPictureTranscript(""); }}
          >
            Try Again
          </button>
        </div>
      );
    }

    // PHASE: TOO SHORT — answer was too brief
    if (picturePhase === "too_short" && activePictureLesson) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', gap: '1.5rem' }}>
          <div style={{ fontSize: '3rem' }}>📝</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.5rem' }}>Your answer was too short</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>Try to describe the picture in more detail — aim for at least 3-4 sentences using the vocabulary words.</div>
          </div>
          <button
            style={{ padding: '0.9rem 2rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: '0.93rem' }}
            onClick={() => { triggerHaptic(); setPicturePhase("picture"); setPictureTranscript(""); }}
          >
            Try Again
          </button>
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
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); exitPictureToHome(); }}
            >
              <MdArrowBackIosNew style={{ fontSize: '1.1rem' }} />
            </button>
            <h2 className="picture-describe-title">{activePictureLesson.title}</h2>
          </header>

          {/* Picture at top — compact */}
          <div style={{ padding: '0.75rem 1rem 0' }}>
            <img
              src={activePictureLesson.image_url}
              alt={activePictureLesson.title}
              style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '1rem', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Rating badge */}
          {pictureScore && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.75rem 0' }}>
              <div style={{
                background: pictureScore === 'excellent' ? 'rgba(34,197,94,0.1)' : pictureScore === 'good' ? 'rgba(59,130,246,0.1)' : 'rgba(234,179,8,0.1)',
                border: `1px solid ${pictureScore === 'excellent' ? 'rgba(34,197,94,0.3)' : pictureScore === 'good' ? 'rgba(59,130,246,0.3)' : 'rgba(234,179,8,0.3)'}`,
                borderRadius: '1rem', padding: '0.4rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: pictureScore === 'excellent' ? '#22c55e' : pictureScore === 'good' ? '#3b82f6' : '#eab308', textTransform: 'capitalize' }}>
                  {pictureScore}
                </span>
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
                            onClick={() => { triggerHapticOnly(); speakArabic(step.teach.arabic); }}
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
                            onClick={() => { triggerHapticOnly(); speakArabic(step.corrected); }}
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
                            <Icon icon={challengeRecording ? "solar:stop-bold" : "solar:microphone-bold"} style={{ fontSize: '1.6rem' }} />
                          </button>
                          <button
                            style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: '0.8rem', cursor: 'pointer', alignSelf: 'center' }}
                            onClick={() => { triggerHaptic(); setChallengeCompleted(prev => ({ ...prev, [idx]: true })); }}
                          >
                            Skip <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
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
                      Follow-up Challenge
                    </div>
                    <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.05rem', color: 'var(--foreground)', marginBottom: '0.35rem', fontWeight: 600, lineHeight: 1.8, textAlign: 'right', unicodeBidi: 'plaintext' }}>{step.prompt}</div>
                    {step.promptTranslation && (
                      <p style={{ fontSize: '0.83rem', color: 'var(--muted-foreground)', margin: '0 0 0.5rem 0' }}>{step.promptTranslation}</p>
                    )}
                    {step.starterWords?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem', justifyContent: 'flex-end' }}>
                        {step.starterWords.map((word, wi) => (
                          <span key={wi} dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', padding: '0.3rem 0.7rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600 }}>{word}</span>
                        ))}
                      </div>
                    )}
                    {/* Legacy hint fallback */}
                    {!step.starterWords && step.hint && (
                      <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '0.95rem', color: 'var(--muted-foreground)', marginBottom: '0.6rem', fontStyle: 'italic' }}>
                        {step.hint}
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
                          <div style={{ position: 'relative', width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {challengeRecording && (
                              <svg
                                width="84"
                                height="84"
                                viewBox="0 0 84 84"
                                aria-hidden="true"
                                style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}
                              >
                                <circle cx="42" cy="42" r="38" fill="none" stroke="rgba(139,92,246,0.16)" strokeWidth="4" />
                                <circle
                                  cx="42"
                                  cy="42"
                                  r="38"
                                  fill="none"
                                  stroke="#8b5cf6"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  strokeDasharray="238.76"
                                  strokeDashoffset="238.76"
                                  style={{ animation: 'challengeRingProgress 60s linear forwards' }}
                                />
                              </svg>
                            )}
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
                              <Icon icon={challengeRecording ? "solar:stop-bold" : "solar:microphone-bold"} style={{ fontSize: '1.6rem' }} />
                            </button>
                          </div>
                          {!challengeRecording && (
                            <button
                              style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: '0.8rem', cursor: 'pointer' }}
                              onClick={() => { triggerHaptic(); setChallengeCompleted(prev => ({ ...prev, [idx]: true })); }}
                            >
                              Skip <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
                            </button>
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
                    {/* Failed result (one attempt only) */}
                    {challengeCompleted[idx] && challengeResult[idx] && !challengeResult[idx].good && (
                      <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.08)' }}>
                        <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>
                          {challengeResult[idx].feedback}
                        </div>
                      </div>
                    )}
                    {/* Skipped (no result) */}
                    {challengeCompleted[idx] && !challengeResult[idx] && (
                      <div style={{ textAlign: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(156,163,175,0.08)' }}>
                        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.83rem' }}>Skipped</div>
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
                            onClick={() => { triggerHapticOnly(); speakArabic(step.example); }}
                            style={{ background: 'rgba(59,130,246,0.15)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', flexShrink: 0 }}
                          >🔊</button>
                          <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.05rem', color: '#3b82f6', fontWeight: 600, lineHeight: 1.8 }}>{step.example}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* VOCAB CHECK */}
                {step.type === 'vocab_check' && (() => {
                  const used = step.used?.length ?? 0;
                  const total = pictureVocab.length || 1;
                  const ratio = used / total;
                  const label = ratio >= 0.75 ? 'You used most of the vocabulary' : ratio >= 0.5 ? 'You used a good amount of the vocabulary' : 'You used some of the vocabulary';
                  const labelColor = ratio >= 0.75 ? '#22c55e' : ratio >= 0.5 ? '#3b82f6' : '#f59e0b';
                  return (
                    <>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: '0.6rem' }}>
                        Vocabulary Check
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: labelColor, marginBottom: '0.4rem' }}>
                        {label}
                      </div>
                      {step.used?.length > 0 && (
                        <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '0.83rem', color: 'var(--muted-foreground)', marginBottom: '0.3rem' }}>
                          {step.used.join('، ')}
                        </div>
                      )}
                      {step.missed?.length > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: 0 }}>
                          <span style={{ fontWeight: 600 }}>Missed: </span>
                          <span dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{step.missed.join('، ')}</span>
                        </div>
                      )}
                    </>
                  );
                })()}
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
                Continue <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
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
                  {pictureScore && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{
                        fontSize: '1.3rem', fontWeight: 700,
                        color: pictureScore === 'excellent' ? '#22c55e' : pictureScore === 'good' ? '#3b82f6' : '#f59e0b'
                      }}>
                        {pictureScore === 'excellent' ? 'Excellent' : pictureScore === 'good' ? 'Good' : 'Fair'}
                      </div>
                      {pictureVocabStats && (() => {
                        const r = pictureVocabStats.vocabUsed / (pictureVocabStats.vocabTotal || 1);
                        const vl = r >= 0.75 ? 'Used most of the vocabulary' : r >= 0.5 ? 'Used a good amount of vocabulary' : 'Used some of the vocabulary';
                        return <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>{vl}</div>;
                      })()}
                    </div>
                  )}
                </div>
                <button
                  style={{
                    width: '100%', padding: '0.9rem', borderRadius: '1rem', background: 'var(--primary)', border: 'none',
                    color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                  }}
                  onClick={() => { triggerHaptic(); setPicturePhase("completed"); }}
                >
                  ✓ Done
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    // PHASE: COMPLETED
    if (picturePhase === "completed" && activePictureLesson) {
      return (
        <div className="picture-describe-screen">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', textAlign: 'center', gap: '1.25rem' }}>
            <div style={{ fontSize: '4rem', lineHeight: 1 }}>🎉</div>
            <div>
              <h1 style={{
                fontSize: '1.9rem', fontWeight: 800, margin: '0 0 0.4rem',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
              }}>
                Congratulations!
              </h1>
              <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>
                أحسنت!
              </div>
            </div>
            <img
              src={activePictureLesson.image_url}
              alt={activePictureLesson.title}
              style={{ width: '60%', maxWidth: '240px', borderRadius: '1rem', border: '1px solid var(--border)', objectFit: 'cover', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}
            />
            <p style={{ fontSize: '1rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '320px' }}>
              You've completed today's picture description. Be sure to check back tomorrow for a new picture!
            </p>
          </div>
          <div style={{ padding: '1rem 1.25rem calc(env(safe-area-inset-bottom, 20px) + 1.25rem)' }}>
            <button
              style={{
                width: '100%', padding: '0.95rem', borderRadius: '1rem', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white', fontWeight: 700, fontSize: '0.95rem'
              }}
              onClick={() => { triggerHaptic(); setTransitionDirection("back"); exitPictureToHome(true); }}
            >
              Home
            </button>
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

  // ---------- PRE-BOOK LESSON SCREEN ----------

  if (activeLesson && activeLesson.lesson_format === 'prebook') {
    return (
      <PreBookLesson
        items={prebookItems}
        loading={loadingPrebookItems || loadingQuestions}
        error={prebookLoadError}
        onComplete={({ xp, maxStreak, accuracy }) => {
          saveLessonProgress(3);
          backToLessons();
        }}
        onExit={backToLessons}
      />
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
            Continue Learning <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
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
                {currentQuestion.options.map((opt, optIdx) => {
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
                      style={{ '--i': optIdx }}
                    >
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
        <main className="app-main lesson-route-main" style={{ position: 'relative', zIndex: 10 }}>
          {lessonPhase === "lesson" && activeLesson.lesson_format === "blocks" && (
            <button
              className="story-close-btn"
              onClick={() => { triggerHaptic(); setShowQuitStoryConfirm(true); }}
              aria-label="Close story"
            >
              <Icon icon="solar:close-circle-bold" className="text-2xl" />
            </button>
          )}
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
                    setDialogueAudioStarted(false);
                    setIsDialogueSlow(false);
                    if (audioRef.current) audioRef.current.playbackRate = 1.0;
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

              <div className="lesson-scene-header">
                <div className="scene-ornament"><span className="scene-diamond" /></div>
                <h1 className="scene-title">{activeLesson.title}</h1>
                <div className="scene-ornament"><span className="scene-diamond" /></div>
              </div>

              {activeLesson.description && (
                <p className="lesson-description">{activeLesson.description}</p>
              )}

              {activeLesson.audio_url && (
                (() => {
                  // Check if this lesson has paragraph or dialogue blocks
                  const hasParagraphs = lessonBlocks.some(b => b.block_type === "paragraph");
                  const hasDialogue = lessonBlocks.some(b => b.block_type === "dialogue");

                  // Hide master audio button for paragraph-based lessons (they use tap-to-play)
                  if (hasParagraphs) return null;

                  // Hide audio button for legacy lessons (non-blocks format) - only show for dialogue lessons
                  if (activeLesson.lesson_format !== "blocks" || !hasDialogue) return null;

                  // Hide entirely during the 2s post-completion review delay
                  const inReviewDelay = audioCompleted && !showDialogueReview;
                  const showControls = !inReviewDelay;

                  // Determine main button label/handler
                  let mainLabel, mainHandler;
                  if (audioCompleted && showDialogueReview) {
                    mainLabel = "Replay audio";
                    mainHandler = handleStartLessonAudio;
                  } else if (audioPlaying) {
                    mainLabel = "Pause";
                    mainHandler = handlePauseDialogue;
                  } else if (dialogueAudioStarted) {
                    mainLabel = "Resume";
                    mainHandler = handleResumeDialogue;
                  } else {
                    mainLabel = "Start lesson audio";
                    mainHandler = handleStartLessonAudio;
                  }

                  // Show slow-down toggle whenever dialogue audio is in active playback (playing or paused, not completed)
                  const showSlowToggle = dialogueAudioStarted && !audioCompleted;

                  // Pick an icon for the primary action
                  let mainIcon;
                  if (audioCompleted && showDialogueReview) mainIcon = "solar:restart-bold";
                  else if (audioPlaying) mainIcon = "solar:pause-bold";
                  else mainIcon = "solar:play-bold";

                  return (
                    <div
                      className={`dialogue-controls-wrap ${showDialogueReview ? 'fade-in' : ''} ${showControls ? '' : 'is-hidden'}`}
                    >
                      {showControls && (
                        <>
                          <button
                            className="dlg-btn dlg-btn--primary"
                            onClick={mainHandler}
                          >
                            <Icon icon={mainIcon} className="dlg-btn-icon" />
                            <span>{mainLabel}</span>
                          </button>
                          {showSlowToggle && (
                            <button
                              className={`dlg-btn dlg-btn--toggle ${isDialogueSlow ? 'is-active' : ''}`}
                              onClick={toggleDialogueSpeed}
                              aria-pressed={isDialogueSlow}
                              aria-label={isDialogueSlow ? "Set to normal speed" : "Set to slow speed (0.8×)"}
                            >
                              <span className="dlg-btn-dot" />
                              <span>Slow 0.8×</span>
                            </button>
                          )}
                          <button
                            className={`dlg-btn dlg-btn--toggle ${showDialogueTranslations ? 'is-active' : ''}`}
                            onClick={() => { triggerHaptic(); setShowDialogueTranslations(v => !v); }}
                            aria-pressed={showDialogueTranslations}
                            aria-label={showDialogueTranslations ? "Hide translation" : "Show translation"}
                          >
                            <span className="dlg-btn-dot" />
                            <span>Translation</span>
                          </button>
                        </>
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
                            <div className="dialogue-controls-wrap">
                              <button
                                className={`dlg-btn dlg-btn--toggle ${showParagraphTranslations ? 'is-active' : ''}`}
                                onClick={() => { triggerHaptic(); setShowParagraphTranslations(v => !v); }}
                                aria-pressed={showParagraphTranslations}
                                aria-label={showParagraphTranslations ? "Hide translation" : "Show translation"}
                              >
                                <span className="dlg-btn-dot" />
                                <span>Translation</span>
                              </button>
                            </div>

                            {/* Instruction Box - fades after first click */}
                            {!hideInstruction && (
                              <div className="instruction-box">
                                <div>Tap any paragraph to hear it read aloud</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.25rem' }}>Tap again to slow down or speed up!</div>
                              </div>
                            )}

                            {/* Render paragraph blocks */}
                            <div className="paragraph-list">
                              {paragraphBlocks.map((b, idx) => {
                                const isPlaying = playingParagraphId === b.id;
                                const wasClicked = clickedParagraphs.has(b.id);
                                const isThisBlockSlow = isPlaying && isSlowSpeed;
                                return (
                                  <div key={b.id} className="paragraph-block-wrap" style={{ '--i': idx }}>
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
                                          isThisBlockSlow ? (
                                            <span className="audio-playing-icon" style={{ fontSize: '0.9rem' }}>🐢</span>
                                          ) : (
                                            <div className="sound-bars">
                                              <span /><span /><span />
                                            </div>
                                          )
                                        ) : (
                                          <svg className="play-icon-svg" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M8 5v14l11-7z" />
                                          </svg>
                                        )}
                                      </div>
                                      <div className="paragraph-content">
                                        <div className="paragraph-text" dir="rtl">
                                          {b.text_ar}
                                        </div>
                                        {showParagraphTranslations && b.text_en && (
                                          <div className="paragraph-translation">
                                            {b.text_en}
                                          </div>
                                        )}
                                      </div>
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
                                Proceed <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
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
                          {visibleLines.map((b, idx) => {
                            const speaker = b.speakers;
                            const sideClass =
                              speaker?.bubble_side === "right"
                                ? "bubble-right"
                                : "bubble-left";

                            return (
                              <div key={b.id} className="dialogue-block-wrap" style={{ '--i': idx }}>
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

                                  <div className="bubble-stack">
                                    {speaker?.display_name_ar && (
                                      <div className="speaker-name">{speaker.display_name_ar}</div>
                                    )}
                                    <div className="bubble">
                                      <div className="bubble-text" dir="rtl">
                                        {b.text_ar}
                                      </div>
                                      {showDialogueTranslations && b.text_en && (
                                        <div className="bubble-translation">
                                          {b.text_en}
                                        </div>
                                      )}
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
                        Proceed <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
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
          {
            lessonPhase === "intro_grammar" && (
              <div className="no-scroll-container transition-screen swipe-in">
                <div className="transition-screen-media">
                  <img src="/images/explanation-icon.webp" alt="Story" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div className="transition-screen-copy">
                  <h1 className="page-title" style={{ marginTop: '2.5rem', marginBottom: '0.5rem' }}>Story Explanation</h1>
                  <p className="page-subtitle">Let's have a look at the story content in more detail!</p>
                </div>
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

                <div key={grammarIndex} className="carousel-content-area fade-in">
                  <div className="explanation-bubble" style={{ fontSize: '1.1rem', padding: '1.25rem', lineHeight: '1.7' }}>
                    {grammarNotes[grammarIndex].content_en}
                  </div>

                  <div className="arabic-box spotlight-arabic" style={{ borderLeft: '5px solid var(--blue)', padding: '1.5rem' }}>
                    {grammarNotes[grammarIndex].content_ar}
                  </div>
                </div>

                <footer className="sticky-footer">
                  <div className="lesson-action-row">
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
                      onClick={(e) => { e.stopPropagation(); triggerHaptic(); speakArabic(grammarNotes[grammarIndex].content_ar); }}
                      disabled={!grammarNotes[grammarIndex].content_ar}
                      aria-label="Listen"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block', margin: '0 auto' }}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z" /></svg>
                    </button>
                    <button
                      className="btn-nav-arrow"
                      onClick={() => {
                        triggerHaptic();
                        if (grammarIndex === grammarNotes.length - 1) {
                          setLessonPhase("intro_vocab");
                        } else {
                          setGrammarIndex(i => i + 1);
                        }
                      }}
                    >
                      <MdArrowForwardIos />
                    </button>
                  </div>
                </footer>
              </div>
            )
          }

          {/* PHASE: TRANSITION TO VOCAB */}
          {
            lessonPhase === "intro_vocab" && (
              <div className="no-scroll-container transition-screen swipe-in">
                <div className="transition-screen-media">
                  <img src="/images/vocab-book.webp" alt="Vocabulary" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div className="transition-screen-copy">
                  <h1 className="page-title" style={{ marginTop: '2.5rem', marginBottom: '0.5rem' }}>New Words</h1>
                  <p className="page-subtitle">Let's take a look at the new words we have learnt!</p>
                </div>
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
                      <div key={vocabIndex} className="carousel-content-area fade-in">
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
                        </div>

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
                    <div className="lesson-action-row">
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
                        onClick={(e) => { e.stopPropagation(); triggerHaptic(); speakArabic(vocabItems[vocabIndex].arabic); }}
                        aria-label="Listen"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block', margin: '0 auto' }}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z" /></svg>
                      </button>
                      <button
                        className="btn-nav-arrow"
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
                        <MdArrowForwardIos />
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
              <div className="speaking-practice no-scroll-container swipe-in">
                <div className="speaking-practice-body">
                  <h2 style={{ marginBottom: '1rem' }}>Speaking Practice</h2>

                  <p dir="rtl" style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.8, margin: 0 }}>
                    {speakingExercises[0]?.prompt_ar}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '140px', justifyContent: 'center', width: '100%' }}>
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
                        style={{ maxWidth: 320, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        disabled={isCheckingAnswer}
                      >
                        <Icon icon={isRecording ? "solar:stop-bold" : "solar:microphone-bold"} style={{ fontSize: '1.2em' }} />
                        {isRecording ? "Stop recording" : "Start recording"}
                      </button>
                    )}
                  </div>

                  {speechError && (
                    <p style={{ color: 'red', margin: 0 }}>
                      {speechError}
                    </p>
                  )}

                  {speechFeedback && (
                    <div style={{
                      width: '100%',
                      marginTop: 4,
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
                    <div style={{ color: 'var(--text-secondary)' }}>
                      🔴 Recording...
                    </div>
                  )}
                </div>

                <footer className="sticky-footer">
                  <button
                    className="btn-outline"
                    onClick={() => { triggerHaptic(); setLessonPhase('intro_drills'); }}
                  >
                    Continue
                  </button>
                </footer>
              </div>
            )
          }

          {/* PHASE: TRANSITION TO DRILLS */}
          {
            lessonPhase === "intro_drills" && (
              <div className="no-scroll-container transition-screen swipe-in">
                <div className="transition-screen-media">
                  <img src="/images/sentence-practice.webp" alt="Sentence Practice" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div className="transition-screen-copy">
                  <h1 className="page-title" style={{ marginTop: '2.5rem', marginBottom: '0.5rem' }}>Sentence Practice</h1>
                  <p className="page-subtitle">Let's look at some ways of using these words in sentences!</p>
                </div>
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
              <div className="no-scroll-container swipe-in">
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

                <div key={explanationIndex} className="carousel-content-area fade-in">
                  <div className="arabic-box spotlight-arabic" dir="rtl" style={{ fontSize: '2rem' }}>
                    {explanations[explanationIndex].arabic_sentence}
                  </div>

                  <div className="explanation-bubble" style={{ borderLeft: '4px solid var(--chart-3)' }}>
                    {explanations[explanationIndex].english_sentence}
                  </div>
                </div>

                <footer className="sticky-footer">
                  <div className="lesson-action-row">
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
                      onClick={(e) => { e.stopPropagation(); triggerHaptic(); speakArabic(explanations[explanationIndex].arabic_sentence); }}
                      aria-label="Listen"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block', margin: '0 auto' }}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z" /></svg>
                    </button>
                    <button
                      className="btn-nav-arrow"
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
                      <MdArrowForwardIos />
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
                <div className="relisten-content">
                  <div className="relisten-ornament">
                    <span className="relisten-ornament-diamond" />
                  </div>

                  <div className="relisten-icon-container">
                    <img src="/clemency-icon.png" alt="Ihya Institute" className="relisten-icon" />
                    <div className="relisten-icon-ring" />
                  </div>

                  <h1 className="relisten-title">
                    Let's have another listen
                  </h1>
                  <p className="relisten-subtitle">
                    Listen again without the text — trust your ears!
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

                      <div className="relisten-player">
                        {/* Pulse rings when audio is playing */}
                        {audioPlaying && (
                          <>
                            <div className="play-ring play-ring-1" />
                            <div className="play-ring play-ring-2" />
                            <div className="play-ring play-ring-3" />
                          </>
                        )}

                        {/* Circular progress ring */}
                        {!audioCompleted && (
                          <svg className="circular-progress" viewBox="0 0 100 100">
                            <circle className="progress-track" cx="50" cy="50" r="46" />
                            <circle
                              className="progress-fill"
                              cx="50" cy="50" r="46"
                              strokeDasharray={2 * Math.PI * 46}
                              strokeDashoffset={(1 - audioProgress / 100) * 2 * Math.PI * 46}
                              transform="rotate(-90 50 50)"
                            />
                          </svg>
                        )}

                        <button
                          className="btn-play-large"
                          onClick={() => {
                            if (!activeLesson?.audio_url || !audioRef.current) return;
                            triggerHaptic();
                            const el = audioRef.current;
                            try { el.pause(); } catch (_) {}
                            setAudioProgress(0);
                            setAudioCompleted(false);
                            const attemptPlay = () => {
                              try { el.currentTime = 0; } catch (_) {}
                              el.play()
                                .then(() => {
                                  setAudioPlaying(true);
                                  setAudioCompleted(false);
                                })
                                .catch((err) => {
                                  console.warn("Relisten play failed, reloading:", err);
                                  el.src = activeLesson.audio_url;
                                  el.load();
                                  const onReady = () => {
                                    el.removeEventListener("canplaythrough", onReady);
                                    try { el.currentTime = 0; } catch (_) {}
                                    el.play()
                                      .then(() => {
                                        setAudioPlaying(true);
                                        setAudioCompleted(false);
                                      })
                                      .catch((e2) => console.error("Relisten retry failed:", e2));
                                  };
                                  el.addEventListener("canplaythrough", onReady, { once: true });
                                });
                            };
                            if (el.ended || el.readyState < 2) {
                              el.src = activeLesson.audio_url;
                              el.load();
                              const onReady = () => {
                                el.removeEventListener("canplaythrough", onReady);
                                attemptPlay();
                              };
                              el.addEventListener("canplaythrough", onReady, { once: true });
                            } else {
                              attemptPlay();
                            }
                          }}
                          disabled={audioPlaying}
                        >
                          {audioPlaying ? (
                            <div className="play-sound-bars">
                              <span /><span /><span /><span /><span />
                            </div>
                          ) : (
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <footer className="sticky-footer relisten-footer">
                  <button
                    className={`btn-primary ${audioCompleted ? '' : 'action-slot-hidden'}`}
                    onClick={() => { triggerHaptic(); setLessonPhase("pre_quiz"); }}
                  >
                    Continue to Quiz <MdArrowForwardIos style={{ display: 'inline', verticalAlign: 'middle', fontSize: '0.8em' }} />
                  </button>
                  <button
                    className={audioCompleted ? "btn-outline" : "btn-primary"}
                    onClick={() => { triggerHaptic(); setLessonPhase("pre_quiz"); }}
                  >
                    Skip to Quiz
                  </button>
                </footer>
              </div>
            )
          }

          {/* PHASE 5: PRE-QUIZ */}
          {
            lessonPhase === "pre_quiz" && (
              <div className="pre-quiz-screen swipe-in">
                <div className="quiz-frame">
                  <div className="quiz-frame-ring" />
                  <div className="quiz-frame-ring-inner" />
                  <span className="quiz-frame-corner" />
                  <span className="quiz-frame-corner" />
                  <span className="quiz-frame-corner" />
                  <span className="quiz-frame-corner" />
                  <span className="quiz-ready-text" dir="rtl">مُستَعِد؟</span>
                </div>

                <div className="quiz-ornament">
                  <span className="quiz-ornament-diamond" />
                </div>

                <p className="quiz-subtitle">Take the quiz to complete this lesson!</p>

                <button
                  className="btn-start-quiz"
                  onClick={() => { triggerHaptic(); startQuiz(); }}
                  disabled={questions.length === 0}
                >
                  {questions.length === 0 ? "No questions loaded" : "ابدأ"}
                </button>
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

          {/* Quit Story Confirmation Modal */}
          {showQuitStoryConfirm && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3 className="modal-title">Leave Story?</h3>
                <p className="text-muted">Are you sure you want to return to home? Your progress in this story will be lost.</p>
                <div className="modal-actions">
                  <button className="btn-outline" style={{ flex: 1 }} onClick={() => { triggerHaptic(); setShowQuitStoryConfirm(false); }}>
                    Stay
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, backgroundColor: "var(--red)", boxShadow: "0 4px 0 var(--red-dark)" }}
                    onClick={() => {
                      triggerHaptic();
                      setShowQuitStoryConfirm(false);
                      backToLessons();
                    }}
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>
          )}

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
                const isLocked = !isStageUnlocked(stage.id);

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
                              const isActive = isLessonUnlocked(lessons, lessonIndex, stage.id);

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
