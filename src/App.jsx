import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

function App() {
  const [stages, setStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(true);

  const [allLessons, setAllLessons] = useState([]); // all lessons (for progress)
  const [lessons, setLessons] = useState([]); // lessons for selected stage
  const [selectedStage, setSelectedStage] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [activeLesson, setActiveLesson] = useState(null);

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

  // LESSON FLOW STATE
  const [lessonPhase, setLessonPhase] = useState("lesson");
  // "lesson" -> "intro_grammar" -> "grammar" -> "intro_vocab" -> "vocab" -> "intro_drills" -> "explain" -> "relisten" -> "pre_quiz"

  // VOCAB / EXPLANATION / GRAMMAR STATE
  const [vocabItems, setVocabItems] = useState([]);
  const [vocabIndex, setVocabIndex] = useState(0);
  const [explanations, setExplanations] = useState([]);
  const [explanationIndex, setExplanationIndex] = useState(0);
  const [grammarNotes, setGrammarNotes] = useState([]);
  const [grammarIndex, setGrammarIndex] = useState(0);

  // AUDIO STATE
  const audioRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCompleted, setAudioCompleted] = useState(false);

  // PARAGRAPH PLAYBACK STATE
  const [playingParagraphId, setPlayingParagraphId] = useState(null);
  const [playingParagraphEnd, setPlayingParagraphEnd] = useState(null);
  const [clickedParagraphs, setClickedParagraphs] = useState(new Set());
  const [hideInstruction, setHideInstruction] = useState(false);

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
  const [showExitAppConfirm, setShowExitAppConfirm] = useState(false);

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

  useEffect(() => {
    // Handle the back button intercept
    const handleBackButton = (e) => {
      e.preventDefault();

      if (activeLesson) {
        // If in a lesson, ask to return to home
        setShowExitModal(true);
      } else {
        // If on home screen, ask to exit app
        setShowExitAppConfirm(true);
      }

      // Push state back so the next back button click also gets intercepted
      window.history.pushState(null, null, window.location.pathname);
    };

    // Initial push to start intercepting
    window.history.pushState(null, null, window.location.pathname);
    window.addEventListener('popstate', handleBackButton);

    return () => window.removeEventListener('popstate', handleBackButton);
  }, [activeLesson]);

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
  }

  // ---------- LOAD PROGRESS WHEN USER CHANGES ----------

  useEffect(() => {
    async function fetchProgress() {
      if (!user) {
        setLessonProgress([]);
        return;
      }

      const { data, error } = await supabase
        .from("lesson_progress")
        .select("lesson_id, hearts_left");

      if (error) {
        console.error("Error loading lesson progress:", error);
        setLessonProgress([]);
      } else {
        setLessonProgress(data || []);
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

  // ---------- OPEN LESSON: QUESTIONS + VOCAB + EXPLANATIONS + BLOCKS ----------

  async function openLesson(lesson) {
    setActiveLesson(lesson);
    setLessonPhase("lesson");
    resetQuiz();
    resetAudio();

    setQuestions([]);
    setVocabItems([]);
    setExplanations([]);
    setGrammarNotes([]);
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
    } catch (err) {
      console.error("Error opening lesson:", err);
      setQuestions([]);
      setVocabItems([]);
      setExplanations([]);
      setLessonBlocks([]);
    } finally {
      setLoadingQuestions(false);
    }
  }

  function backToLessons() {
    setActiveLesson(null);
    resetQuiz();
    resetAudio();
    resetLessonFlow();
    setQuestions([]);
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

    const startTime = block.start_time_seconds || 0;
    const endTime = block.end_time_seconds || audioRef.current.duration;

    setPlayingParagraphId(block.id);
    setPlayingParagraphEnd(endTime);

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
        <span className="heart-count">{hearts}</span>
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

  // ---------- LOGIN LANDING SCREEN ----------

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-overlay" />
        <div className="auth-content">
          <div className="auth-left">
            <div className="auth-logo animate-slide-up">
              <img
                src="/logo.png"
                alt="Clemency House Logo"
                style={{ width: "120px", height: "auto" }}
              />
            </div>
            <h1 className="text-display animate-slide-up delay-100">
              Welcome to the Clemency House Arabic App!
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

  // ---------- QUIZ SCREEN ----------

  if (activeLesson && quizActive) {
    const currentQuestion = questions[currentQuestionIndex];

    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-logo">
            <img src="/logo.png" alt="Logo" style={{ height: "50px" }} />
          </div>
          <div className="app-header-right">
            <ProfileMenu />
          </div>
        </header>

        <main className="app-main quiz-screen">
          <div className="page-card quiz-card">
            <div className="quiz-header-row">
              <button className="btn-link" onClick={backToLessons}>
                ← Back to lesson
              </button>
              <HeartsBar />
            </div>

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

                <div className="quiz-options">
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

            {/* CELEBRATION SCREEN - SUCCESS */}
            {quizFinished && hearts > 0 && (
              <div className="celebration-screen swipe-in">
                <div className="confetti-container">
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                  <div className="confetti"></div>
                </div>

                <div className="celebration-trophy">
                  <img src="/images/trophy.png" alt="Trophy" style={{ width: '180px' }} />
                </div>
                <h1 className="celebration-title">Congratulations!</h1>
                <p className="celebration-message">
                  You've successfully completed this lesson with {hearts} heart{hearts === 1 ? "" : "s"} remaining.
                </p>
                <footer className="sticky-footer">
                  <button className="btn-primary btn-home" onClick={backToLessons}>
                    Return Home
                  </button>
                </footer>
              </div>
            )}

            {/* FAILURE SCREEN */}
            {quizFinished && hearts <= 0 && (
              <div className="page-card center-content swipe-in">
                <div className="icon-circle" style={{ background: '#fee2e2', borderColor: '#fca5a5' }}>😢</div>
                <h1 className="page-title" style={{ color: 'var(--red)' }}>Out of Hearts</h1>
                <p className="page-subtitle">
                  Don't give up! Review the lesson and try again.
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button className="btn-outline" onClick={startQuiz}>
                    Try Again
                  </button>
                  <button className="btn-primary" onClick={backToLessons}>
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
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-content">
            <div
              className="app-logo home-link"
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  setAudioPlaying(false);
                }
                setShowExitModal(true);
              }}
            >
              <img src="/logo.png" alt="Logo" style={{ height: "50px" }} />
              <span className="home-text">Home</span>
            </div>

            <div className="app-header-right">
              <ProfileMenu />
            </div>
          </div>
        </header>

        <main className="app-main">
          {lessonPhase === "lesson" && (
            <div className="page-card">
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
                                Tap any paragraph to hear it read aloud
                              </div>
                            )}

                            {/* Render paragraph blocks */}
                            <div className="paragraph-list">
                              {paragraphBlocks.map((b) => {
                                const isPlaying = playingParagraphId === b.id;
                                const wasClicked = clickedParagraphs.has(b.id);
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
                                        <span className="audio-playing-icon">🔊</span>
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
                                onClick={() => setLessonPhase(grammarNotes.length > 0 ? "intro_grammar" : "intro_vocab")}
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

              <div style={{ marginTop: "2rem", minHeight: "60px" }}>
                {(() => {
                  // Check if this is a paragraph-based lesson (they have their own proceed button)
                  const hasParagraphs = lessonBlocks.some(b => b.block_type === "paragraph");

                  // Don't show this bottom proceed button for paragraph lessons
                  if (hasParagraphs) return null;

                  if (!activeLesson.audio_url || audioCompleted) {
                    return (
                      <button
                        className="btn-primary"
                        onClick={() => setLessonPhase(grammarNotes.length > 0 ? "intro_grammar" : "intro_vocab")}
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
            <div className="no-scroll-container transition-screen">
              <div className="icon-circle">
                <img src="/images/explanation-icon.png" alt="Explanation" className="placeholder-img" />
              </div>
              <h1 className="page-title">Story Explanation</h1>
              <p className="page-subtitle">Let's have a look at the story content in more detail!</p>
              <footer className="sticky-footer">
                <button className="btn-primary" onClick={() => setLessonPhase("grammar")}>
                  Continue
                </button>
              </footer>
            </div>
          )}

          {/* PHASE: GRAMMAR SPOTLIGHT CAROUSEL (No Scrolling) */}
          {lessonPhase === "grammar" && grammarNotes.length > 0 && (
            <div className="vocab-fullscreen no-scroll-container swipe-in">
              <header className="fixed-header">
                <button className="btn-bubbly-icon" onClick={() => setGrammarIndex(prev => Math.max(0, prev - 1))}>←</button>
                <div className="header-bubbly-title">Grammar Point {grammarIndex + 1}</div>
                <div style={{ width: '50px' }} />
              </header>

              <div key={grammarIndex} className="grammar-content-area swipe-in">
                <h2 className="grammar-title-text">{grammarNotes[grammarIndex].title}</h2>

                <div className="explanation-bubble">
                  {grammarNotes[grammarIndex].content_en}
                </div>

                <div className="arabic-box spotlight-arabic">
                  {grammarNotes[grammarIndex].content_ar}
                </div>
              </div>

              <footer className="sticky-footer">
                {grammarIndex < grammarNotes.length - 1 ? (
                  <button className="btn-primary" onClick={() => setGrammarIndex(i => i + 1)}>
                    Next Note
                  </button>
                ) : (
                  <button className="btn-primary" onClick={() => setLessonPhase("intro_vocab")}>
                    Proceed to Vocab →
                  </button>
                )}
              </footer>
            </div>
          )}

          {/* PHASE: TRANSITION TO VOCAB */}
          {lessonPhase === "intro_vocab" && (
            <div className="no-scroll-container transition-screen">
              <div className="icon-circle">
                <img src="/images/vocab-icon.png" alt="Vocabulary" className="placeholder-img" />
              </div>
              <h1 className="page-title">New Words</h1>
              <p className="page-subtitle">Let's take a look at the new words we have learnt!</p>
              <footer className="sticky-footer">
                <button className="btn-primary" onClick={() => setLessonPhase("vocab")}>
                  Continue
                </button>
              </footer>
            </div>
          )}

          {/* PHASE 2: VOCAB CAROUSEL */}
          {lessonPhase === "vocab" && (
            <div className="vocab-fullscreen swipe-in" style={{ paddingTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "2rem",
                }}
              >
                <button
                  className="btn-bubbly-icon"
                  style={{ width: "45px", height: "45px" }}
                  onClick={() => {
                    if (vocabIndex > 0) setVocabIndex((i) => i - 1);
                    else setLessonPhase("lesson");
                  }}
                >
                  ←
                </button>
                <div style={{ flex: 1 }} />
              </div>

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
                    <div key={vocabIndex} className="swipe-in">
                      <div className="vocab-label" style={{ textAlign: "right" }}>
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

                      <div className="vocab-label">English:</div>
                      <div className="vocab-card">
                        <div className="vocab-text-main">{item.english}</div>
                      </div>

                      <div className="vocab-footer">
                        {vocabIndex === vocabItems.length - 1 ? (
                          <button
                            className="btn-main-action"
                            onClick={() => setLessonPhase("intro_drills")}
                          >
                            FINISH VOCAB →
                          </button>
                        ) : (
                          <button
                            className="btn-main-action"
                            onClick={() => setVocabIndex((i) => i + 1)}
                          >
                            NEXT WORD →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )
          }

          {/* PHASE: TRANSITION TO DRILLS */}
          {lessonPhase === "intro_drills" && (
            <div className="no-scroll-container transition-screen">
              <div className="icon-circle">
                <img src="/images/drills-icon.png" alt="Drills" className="placeholder-img" />
              </div>
              <h1 className="page-title">Sentence Practice</h1>
              <p className="page-subtitle">Let's look at some ways of using these words in sentences!</p>
              <footer className="sticky-footer">
                <button className="btn-primary" onClick={() => setLessonPhase("explain")}>
                  Continue
                </button>
              </footer>
            </div>
          )}

          {/* PHASE 3: USAGE DRILLS (Carousel Mode) */}
          {lessonPhase === "explain" && explanations.length > 0 && (
            <div className="no-scroll-container">
              {/* Header identifying the phase */}
              <header className="fixed-header">
                <button className="btn-bubbly-icon" onClick={() => {
                  if (explanationIndex > 0) setExplanationIndex(i => i - 1);
                  else setLessonPhase("intro_drills");
                }}>←</button>
                <div className="header-bubbly-title">Usage Drill {explanationIndex + 1}</div>
                <div style={{ width: '50px' }} />
              </header>

              <div className="grammar-content-area">
                <div className="vocab-label" style={{ textAlign: "right" }}>:عربي</div>
                <div className="arabic-box spotlight-arabic" dir="rtl" style={{ fontSize: '2rem' }}>
                  {explanations[explanationIndex].arabic_sentence}
                </div>

                <div className="vocab-label">English:</div>
                <div className="explanation-bubble" style={{ borderLeft: '5px solid var(--green)', background: '#f0fff4' }}>
                  {explanations[explanationIndex].english_sentence}
                </div>
              </div>

              <footer className="sticky-footer">
                <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                  {explanationIndex < explanations.length - 1 ? (
                    <button
                      className="btn-primary"
                      style={{ width: '100%' }}
                      onClick={() => setExplanationIndex(i => i + 1)}
                    >
                      Next Sentence
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      style={{ width: '100%', background: 'var(--blue)', boxShadow: '0 4px 0 var(--blue-dark)' }}
                      onClick={() => {
                        setLessonPhase("relisten");
                        setAudioCompleted(false);
                        setAudioProgress(0);
                      }}
                    >
                      Mastered! Review Audio →
                    </button>
                  )}
                </div>
              </footer>
            </div>
          )}

          {/* PHASE 4: RELISTEN */}
          {
            lessonPhase === "relisten" && (
              <div
                className="page-card swipe-in"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "60vh",
                  textAlign: "center",
                }}
              >
                <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
                  Let's have another listen
                </h1>
                <p className="muted" style={{ marginBottom: "2rem" }}>
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

                    <div style={{ marginBottom: "2rem" }}>
                      <button
                        className="btn-circle btn-bubbly-icon"
                        style={{
                          width: "80px",
                          height: "80px",
                          fontSize: "2rem",
                          margin: "0 auto",
                        }}
                        onClick={handleStartLessonAudio}
                        disabled={audioPlaying}
                      >
                        {audioPlaying ? "🔊" : "▶️"}
                      </button>
                    </div>

                    {activeLesson.audio_url && !audioCompleted && (
                      <div className="audio-progress-fixed">
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
                    style={{ animation: "slideDown 0.3s ease-out" }}
                    onClick={() => setLessonPhase("pre_quiz")}
                  >
                    Continue to Quiz →
                  </button>
                )}

                <div style={{ flex: 1 }} />

                <button
                  className="btn-link"
                  style={{ marginTop: "2rem" }}
                  onClick={() => setLessonPhase("pre_quiz")}
                >
                  Skip to quiz →
                </button>
              </div>
            )
          }

          {/* PHASE 5: PRE-QUIZ */}
          {
            lessonPhase === "pre_quiz" && (
              <div className="page-card swipe-in" style={{ textAlign: "center", padding: "3rem 1rem" }}>
                <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>📝</div>
                <h1 className="page-title">Ready?</h1>
                <p
                  className="page-subtitle"
                  style={{ marginBottom: "3rem", fontSize: "1.2rem" }}
                >
                  Take the quiz to complete this lesson!
                </p>

                <button
                  className="btn-primary"
                  style={{ fontSize: "1.5rem", padding: "1.5rem" }}
                  onClick={startQuiz}
                  disabled={questions.length === 0}
                >
                  {questions.length === 0 ? "No questions loaded" : "START QUIZ"}
                </button>
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

          {showExitAppConfirm && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3 className="modal-title">Exit App?</h3>
                <p className="text-muted">Are you sure you want to close the app?</p>
                <div className="modal-actions">
                  <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowExitAppConfirm(false)}>
                    Stay
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, backgroundColor: "var(--red)", boxShadow: "0 4px 0 var(--red-dark)" }}
                    onClick={() => window.close()} /* Note: window.close() only works in some webview contexts */
                  >
                    Exit
                  </button>
                </div>
              </div>
            </div>
          )}
        </main >
      </div >
    );
  }

  // ---------- MAIN SCREEN: STAGES + LESSONS ----------

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-content">
          <div className="app-logo">
            <img src="/logo.png" alt="Logo" style={{ height: "50px" }} />
          </div>
          <div className="app-header-right">
            <ProfileMenu />
          </div>
        </div>
      </header>

      <main className="app-main">
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.9rem", color: "var(--text-light)", margin: 0 }}>
                Stages
              </p>
              <h1 className="page-title" style={{ fontSize: "2rem", fontFamily: "'Amiri', serif", direction: "rtl", margin: 0 }}>
                المراحل
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
                        onClick={() => loadLessons(stage.id)}
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
    </div>
  );
}

export default App;
