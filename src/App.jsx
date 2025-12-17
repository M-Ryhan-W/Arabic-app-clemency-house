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
  // "lesson" | "vocab" | "explain"

  // VOCAB / EXPLANATION STATE
  const [vocabItems, setVocabItems] = useState([]);
  const [vocabIndex, setVocabIndex] = useState(0);
  const [explanations, setExplanations] = useState([]);

  // AUDIO STATE
  const audioRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCompleted, setAudioCompleted] = useState(false);

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

  // ---------- SCROLL TO TOP ON VIEW CHANGE ----------
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [lessonPhase, activeLesson, quizActive, selectedStage]);

  // ---------- SOUND EFFECTS ----------

  useEffect(() => {
    // Simple "blob" / "bloop" sound generator using Web Audio API
    // This avoids needing external assets and allows dynamic control
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx;

    function playClickSound() {
      try {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';

        // Pitch envelope: Start slightly high, drop quickly (the "bloop" shape)
        const t = audioCtx.currentTime;
        oscillator.frequency.setValueAtTime(600, t);
        oscillator.frequency.exponentialRampToValueAtTime(300, t + 0.1);

        // Amplitude envelope: Short and snappy, quite quiet
        gainNode.gain.setValueAtTime(0.15, t);
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(t + 0.15);
      } catch (e) {
        console.error("Sound play failed", e);
      }
    }

    function handleGlobalClick(e) {
      // Play sound for buttons, links, or elements with clickable-like classes
      const target = e.target.closest('button, a, .stage-card, .lesson-row, input, [role="button"]');
      if (target) {
        playClickSound();
      }
    }

    window.addEventListener('click', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      if (audioCtx) audioCtx.close();
    };
  }, []);

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
  }

  function resetLessonFlow() {
    setLessonPhase("lesson");
    setVocabItems([]);
    setVocabIndex(0);
    setExplanations([]);
  }

  function loadLessons(stageId) {
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

  // ---------- OPEN LESSON: QUESTIONS + VOCAB + EXPLANATIONS ----------

  async function openLesson(lesson) {
    setActiveLesson(lesson);
    setLessonPhase("lesson");
    resetQuiz();
    resetAudio();
    setQuestions([]);
    setVocabItems([]);
    setExplanations([]);
    setVocabIndex(0);
    setLoadingQuestions(true);

    try {
      // Load questions
      const { data: qData, error: qError } = await supabase
        .from("questions")
        .select("id, question_type, prompt_text, order")
        .eq("lesson_id", lesson.id)
        .order("order", { ascending: true });

      if (qError) {
        throw qError;
      }

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
    } catch (err) {
      console.error("Error opening lesson:", err);
      setQuestions([]);
      setVocabItems([]);
      setExplanations([]);
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

        if (existingIndex === -1) {
          return [...prev, newEntry];
        }
        const copy = [...prev];
        copy[existingIndex] = newEntry;
        return copy;
      });
    }
  }

  // ---------- AUDIO CONTROL ----------

  function handleStartLessonAudio() {
    if (!activeLesson?.audio_url || !audioRef.current) return;

    // 1 second delay before playing
    setTimeout(() => {
      try {
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .then(() => {
            setAudioPlaying(true);
            setAudioCompleted(false);
          })
          .catch((err) => {
            console.error("Audio play failed:", err);
          });
      } catch (err) {
        console.error("Audio error:", err);
      }
    }, 1000);
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
    if (hasAnswered) return; // already confirmed this question

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
    } else {
      setAnswerResult("wrong");
      setHearts((prev) => {
        const newHearts = prev - 1;
        if (newHearts <= 0) {
          setQuizFinished(true);
        }
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
      }
      return;
    }

    setCurrentQuestionIndex((i) => i + 1);
    setSelectedOptionId(null);
    setAnswerResult(null);
    setHasAnswered(false);
  }

  function HeartsBar() {
    const total = 5;
    const arr = Array.from({ length: total });

    return (
      <div className="hearts-bar">
        {arr.map((_, i) => (
          <span
            key={i}
            className={`heart ${i < hearts ? "heart-full" : "heart-empty"}`}
          >
            ❤️
          </span>
        ))}
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
              <img src="/logo.png" alt="Clemency House Logo" style={{ width: '120px', height: 'auto' }} />
            </div>
            <h1 className="text-display animate-slide-up delay-100">
              Welcome to the Clemency House Arabic App!
            </h1>
            <p className="animate-slide-up delay-200" style={{ fontSize: '1.2rem', lineHeight: '1.6', maxWidth: '500px' }}>
              Designed by students for students, to aid your journey towards mastering Arabic.
            </p>
            <div className="auth-badge-row animate-slide-up delay-300">
              <span className="auth-badge">Using العربية للناشئين books</span>
              <span className="auth-badge">Dialogue based to aid listening skills</span>
              <span className="auth-badge">Progress saved with quizzes</span>
            </div>
          </div>

          <div className="auth-right animate-slide-up delay-300">
            <div className="auth-card">
              <h2>
                {authMode === "signin" ? "Welcome back" : "Create account"}
              </h2>
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
          <div className="app-logo"><img src="/logo.png" alt="Logo" style={{ height: '50px' }} /></div>
          <div className="app-header-right">
            <button className="btn-outline" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="app-main">
          <div className="page-card">
            <button className="btn-link" onClick={backToLessons}>
              ← Back to lesson
            </button>

            <HeartsBar />

            <div className="quiz-progress-row">
              <span className="quiz-progress-text">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
              <div className="quiz-progress-bar">
                <div
                  className="quiz-progress-fill"
                  style={{
                    width: `${((currentQuestionIndex + 1) /
                      Math.max(questions.length, 1)) *
                      100
                      }%`,
                  }}
                />
              </div>
            </div>

            {quizFinished && hearts <= 0 && (
              <div className="banner banner-danger">
                You ran out of hearts. Lesson failed.
              </div>
            )}

            {quizFinished && hearts > 0 && (
              <div className="banner banner-success">
                Nice! You finished the quiz with {hearts} heart
                {hearts === 1 ? "" : "s"} left.
              </div>
            )}

            {!quizFinished && currentQuestion && (
              <>
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
                      <button
                        className="btn-primary"
                        onClick={handleConfirmAnswer}
                      >
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
              </>
            )}

            {quizFinished && (
              <div className="quiz-actions">
                <button className="btn-outline" onClick={startQuiz}>
                  Retry quiz
                </button>
                <button className="btn-secondary" onClick={backToLessons}>
                  Back to lesson
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ---------- LESSON SCREEN (3 PHASES) ----------

  if (activeLesson && !quizActive) {
    const completed = isLessonCompleted(activeLesson.id);

    return (
      <div className="app-shell">
        {/* Only show standard header for Phase 1 and 3 (optional, user said 'remove play audio button' implying custom UI for vocab) */}
        {lessonPhase !== "vocab" && (
          <header className="app-header">
            <div className="app-logo"><img src="/logo.png" alt="Logo" style={{ height: '50px' }} /></div>
            <div className="app-header-right">
              <button className="btn-outline" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </header>
        )}

        <main className="app-main">
          {lessonPhase === "lesson" && (
            <div className="page-card">
              <button className="btn-link" onClick={backToLessons}>
                ← Back to lessons
              </button>

              {/* Hidden audio element (used by Start lesson button) */}
              {activeLesson.audio_url && (
                <audio
                  ref={audioRef}
                  src={activeLesson.audio_url}
                  onTimeUpdate={(e) => {
                    if (e.target.duration > 0) {
                      setAudioProgress((e.target.currentTime / e.target.duration) * 100);
                    }
                  }}
                  onEnded={() => {
                    // Add 0.5s delay before marking as complete/enabling Proceed
                    setTimeout(() => {
                      setAudioPlaying(false);
                      setAudioCompleted(true);
                    }, 500);
                  }}
                  onPlay={() => setAudioPlaying(true)}
                  onPause={(e) => {
                    if (e.target.currentTime < e.target.duration) {
                      setAudioPlaying(false);
                    }
                  }}
                  style={{ display: "none" }}
                />
              )}

              <div className="lesson-header-row">
                <h1 className="lesson-title">{activeLesson.title}</h1>
                {completed && (
                  <span className="pill pill-completed">✓ Completed</span>
                )}
              </div>
              <p className="lesson-description">{activeLesson.description}</p>

              {/* PHASE 1: MAIN LESSON / STORY */}
              {lessonPhase === "lesson" && (
                <>
                  {activeLesson.audio_url && (
                    <div
                      style={{
                        marginBottom: "1rem",
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <button
                        className="btn-primary"
                        onClick={handleStartLessonAudio}
                        disabled={audioPlaying}
                      >
                        {audioPlaying
                          ? "Playing…"
                          : audioCompleted
                            ? "Replay audio"
                            : "Start lesson audio"}
                      </button>
                    </div>
                  )}

                  <section className="section">
                    <h2 className="section-title">النص العربي</h2>
                    <div className="arabic-box">
                      {activeLesson.transcript_ar || "لا يوجد نص عربي بعد"}
                    </div>
                  </section>

                  <section className="section">
                    <h3 className="section-subtitle">Translation</h3>
                    <p className="translation-text">
                      {activeLesson.transcript_en || "No English translation yet."}
                    </p>
                  </section>

                  {activeLesson.notes && (
                    <section className="section">
                      <h3 className="section-subtitle">Notes</h3>
                      <p className="notes-text">{activeLesson.notes}</p>
                    </section>
                  )}

                  <div style={{ marginTop: "2rem", minHeight: '60px' }}>
                    {!activeLesson.audio_url || audioCompleted ? (
                      <button
                        className="btn-primary"
                        onClick={() => setLessonPhase("vocab")}
                      >
                        Proceed →
                      </button>
                    ) : (
                      /* Progress Bar when audio not complete */
                      (activeLesson.audio_url && !audioCompleted) && (
                        <div className="audio-progress-fixed">
                          <div className="audio-progress-fill-fixed" style={{ width: `${audioProgress}%` }}></div>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PHASE 2: VOCAB CAROUSEL (Custom Fullscreen UI) */}
          {lessonPhase === "vocab" && (
            <div className="vocab-fullscreen">
              {/* BUBBLY HEADER */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                {/* BACK BUTTON */}
                <button
                  className="btn-bubbly-icon"
                  onClick={() => {
                    if (vocabIndex > 0) {
                      setVocabIndex(i => i - 1);
                    } else {
                      setLessonPhase("lesson");
                    }
                  }}
                >
                  ←
                </button>

                {/* CENTERED TITLE */}
                <div className="header-bubbly-title">
                  {activeLesson.title}
                </div>

                {/* HOME BUTTON */}
                <button
                  className="btn-bubbly-icon"
                  onClick={() => setShowExitModal(true)}
                >
                  🏠
                </button>
              </div>

              {vocabItems.length === 0 ? (
                <div className="center-content">
                  <p className="muted">No vocabulary added yet for this lesson.</p>
                  <button className="btn-primary" onClick={() => setLessonPhase("explain")}>
                    Continue
                  </button>
                </div>
              ) : (
                (() => {
                  const item = vocabItems[vocabIndex];
                  return (
                    <>
                      <div className="vocab-label">English:</div>
                      <div className="vocab-card">
                        <div className="vocab-text-main">{item.english}</div>
                      </div>

                      <div className="vocab-label" style={{ textAlign: "right" }}>
                        :عربي
                      </div>
                      <div className="vocab-card" style={{ direction: "rtl" }}>
                        <div className="vocab-text-main">
                          {item.arabic}
                          {item.note && <span style={{ display: 'block', fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--text-light)' }}>
                            [{item.note}]
                          </span>}
                        </div>
                      </div>

                      <div className="vocab-footer">
                        {/* LARGE NEXT BUTTON */}
                        {vocabIndex === vocabItems.length - 1 ? (
                          <button
                            className="btn-main-action"
                            onClick={() => setLessonPhase("explain")}
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
                    </>
                  );
                })()
              )}
            </div>
          )}

          {/* PHASE 3: EXPLANATION */}
          {lessonPhase === "explain" && (
            <div className="page-card">
              <button className="btn-link" onClick={() => setLessonPhase("vocab")}>
                ← Back to vocab
              </button>

              <section className="section">
                <h2 className="section-title">How do we use these words?</h2>

                {explanations.length === 0 ? (
                  <p className="muted">
                    No explanation sentences yet for this lesson.
                  </p>
                ) : (
                  <ul className="explanation-list">
                    {explanations.map((ex) => (
                      <li key={ex.id} className="explanation-item">
                        <div className="arabic-sentence">
                          {ex.arabic_sentence}
                        </div>
                        <div className="english-sentence">
                          {ex.english_sentence}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="quiz-actions" style={{ marginTop: "2rem" }}>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setLessonPhase("relisten");
                    setAudioCompleted(false);
                    setAudioProgress(0);
                  }}
                >
                  Let's Review →
                </button>
              </div>
            </div>
          )}

          {/* PHASE 4: RELISTEN (Story Again) */}
          {lessonPhase === "relisten" && (
            <div className="page-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
              <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Let's have another listen</h1>
              <p className="muted" style={{ marginBottom: '2rem' }}>Listen to the story one more time before the quiz.</p>

              {activeLesson.audio_url && (
                <>
                  <audio
                    ref={audioRef}
                    src={activeLesson.audio_url}
                    onTimeUpdate={(e) => {
                      if (e.target.duration > 0) {
                        setAudioProgress((e.target.currentTime / e.target.duration) * 100);
                      }
                    }}
                    onEnded={() => {
                      setTimeout(() => {
                        setAudioPlaying(false);
                        setAudioCompleted(true);
                      }, 500);
                    }}
                    onPlay={() => setAudioPlaying(true)}
                    onPause={(e) => {
                      if (e.target.currentTime < e.target.duration) {
                        setAudioPlaying(false);
                      }
                    }}
                    style={{ display: "none" }}
                  />

                  <div style={{ marginBottom: '2rem' }}>
                    <button
                      className="btn-circle btn-bubbly-icon"
                      style={{ width: '80px', height: '80px', fontSize: '2rem', margin: '0 auto' }}
                      onClick={handleStartLessonAudio}
                      disabled={audioPlaying}
                    >
                      {audioPlaying ? '🔊' : '▶️'}
                    </button>
                  </div>

                  {/* Progress Bar */}
                  {(activeLesson.audio_url && !audioCompleted) && (
                    <div className="audio-progress-fixed">
                      <div className="audio-progress-fill-fixed" style={{ width: `${audioProgress}%` }}></div>
                    </div>
                  )}
                </>
              )}

              {audioCompleted && (
                <button
                  className="btn-primary"
                  style={{ animation: 'slideDown 0.3s ease-out' }}
                  onClick={() => setLessonPhase("pre_quiz")}
                >
                  Continue to Quiz →
                </button>
              )}
            </div>
          )}

          {/* PHASE 5: PRE-QUIZ (Start Screen) */}
          {lessonPhase === "pre_quiz" && (
            <div className="page-card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📝</div>
              <h1 className="page-title">Ready?</h1>
              <p className="page-subtitle" style={{ marginBottom: '3rem', fontSize: '1.2rem' }}>
                Take the quiz to complete this lesson!
              </p>

              <button
                className="btn-primary"
                style={{ fontSize: '1.5rem', padding: '1.5rem' }}
                onClick={startQuiz}
                disabled={questions.length === 0}
              >
                {questions.length === 0 ? "No questions loaded" : "START QUIZ"}
              </button>
            </div>
          )}

          {/* EXIT CONFIRMATION MODAL */}
          {showExitModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div className="modal-title">Are you sure?</div>
                <p className="text-muted">
                  You're about to leave the lesson. All progress in this session will be lost.
                </p>
                <div className="modal-actions">
                  <button
                    className="btn-outline"
                    style={{ flex: 1 }}
                    onClick={() => setShowExitModal(false)}
                  >
                    CANCEL
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, backgroundColor: 'var(--red)', boxShadow: '0 4px 0 var(--red-dark)' }}
                    onClick={() => {
                      setShowExitModal(false);
                      backToLessons();
                    }}
                  >
                    QUIT
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ---------- MAIN SCREEN: STAGES + LESSONS ----------

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo"><img src="/logo.png" alt="Logo" style={{ height: '50px' }} /></div>
        <div className="app-header-right">
          <button className="btn-outline" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="page-layout">
          <section className="page-card" style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
            <h1 className="page-title" style={{ fontSize: '2rem', marginBottom: '2rem' }}>Your stages</h1>

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
                    <div key={stage.id} style={{ marginBottom: '1.5rem' }}>
                      <button
                        onClick={() => loadLessons(stage.id)}
                        className="stage-card"
                        style={{
                          width: '100%',
                          marginBottom: 0,
                          borderColor: isSelected ? 'var(--blue)' : 'var(--gray-200)',
                          background: isSelected ? 'var(--white)' : 'var(--white)'
                        }}
                      >
                        <div className="stage-card-top">
                          <div>
                            <div className="stage-name">
                              {stage.name || "Stage"}
                            </div>
                            <div className="stage-description">
                              {stage.description}
                            </div>
                          </div>
                          {total > 0 && (
                            <span className="stage-progress-text">
                              {completed}/{total} lessons • {percent}%
                            </span>
                          )}
                        </div>
                        {total > 0 && (
                          <div className="stage-progress-bar">
                            <div
                              className="stage-progress-fill"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        )}
                      </button>

                      {/* ACCORDION: Show lessons if this stage is selected */}
                      {isSelected && (
                        <div className="lesson-container-inline">
                          {loadingLessons ? (
                            <p className="muted" style={{ textAlign: 'center' }}>Loading lessons…</p>
                          ) : lessons.length === 0 ? (
                            <p className="muted" style={{ textAlign: 'center' }}>No lessons found.</p>
                          ) : (
                            <ul className="lesson-list">
                              {lessons.map((lesson) => {
                                const completed = isLessonCompleted(lesson.id);
                                return (
                                  <li key={lesson.id}>
                                    <button
                                      onClick={() => openLesson(lesson)}
                                      className={`lesson-row ${completed ? "lesson-completed" : ""
                                        }`}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "1rem",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "1.5rem",
                                            color: completed
                                              ? "var(--yellow)"
                                              : "var(--gray-300)",
                                          }}
                                        >
                                          {completed ? "★" : "●"}
                                        </span>
                                        <div>
                                          <div className="lesson-row-title">
                                            {lesson.title}
                                          </div>
                                          <div className="lesson-row-desc">
                                            {lesson.description}
                                          </div>
                                        </div>
                                      </div>
                                      {completed && (
                                        <span className="pill pill-completed">
                                          ✓ Done
                                        </span>
                                      )}
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
