const fs = require('fs');
let code = fs.readFileSync('src/ScenarioChat.jsx', 'utf8');

const oldSummary = `    // SUMMARY SCREEN
    if (scenarioPhase === "summary") {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans" style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.1) 0%, var(--background) 50%)' }}>
          <main className="px-6 pt-16 pb-12 space-y-8">
            <div className="text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h1 className="font-heading text-3xl font-bold mb-2">Conversation Complete!</h1>
              <p className="text-muted-foreground">Great job practicing your Arabic!</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-sm">{scenarioData?.emoji}</span>
                <span className="text-sm font-medium">{scenarioData?.title}</span>
                <span className="text-xs text-muted-foreground capitalize">• {scenarioDifficulty}</span>
              </div>
            </div>

            {scenarioKeyPhrases.length > 0 && (
              <section>
                <h2 className="font-heading text-lg font-bold mb-4">📚 Key Phrases Learned</h2>
                <div className="space-y-3">
                  {scenarioKeyPhrases.map((kp, i) => (
                    <div key={i} className="bg-card rounded-2xl p-4 border border-border/50 flex items-center gap-3">
                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(kp.arabic); }}
                        style={{ background: 'rgba(139,92,246,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}
                      >🔊</button>
                      <div className="flex-1">
                        <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.05rem', fontWeight: 600, color: '#8b5cf6', marginBottom: '0.15rem' }}>{kp.arabic}</div>
                        <div className="text-sm text-muted-foreground">{kp.english}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <button
              className="w-full py-4 rounded-2xl font-bold text-base text-white"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}
              onClick={() => { triggerHaptic(); resetScenarioChat(); }}
            >
              Back to Home
            </button>
          </main>
        </div>
      );
    }`;

const newSummary = `    // SUMMARY SCREEN
    if (scenarioPhase === "summary") {
      const elapsedSec = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      
      return (
        <div className="min-h-screen bg-background text-foreground font-sans relative" style={{ background: 'linear-gradient(180deg, rgba(34,197,94,0.1) 0%, var(--background) 50%)' }}>
          
          <div className="absolute top-10 left-0 w-full flex justify-center pointer-events-none z-0">
            <DotLottieReact src="/animations/done.lottie" loop autoplay style={{ width: 180, height: 180, opacity: 0.15 }} />
          </div>

          <main className="px-6 pt-16 pb-12 space-y-8 z-10 relative animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center pt-8">
              <div className="text-8xl mb-6 relative inline-block">
                <div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full scale-150 -z-10" />
                🎉
              </div>
              <h1 className="font-heading text-4xl font-bold mb-3 text-foreground">Complete!</h1>
              <p className="text-muted-foreground text-lg mb-4">Great job practicing your Arabic!</p>
              
              <div className="inline-flex items-center gap-3 bg-card border border-border/50 px-5 py-2.5 rounded-full shadow-sm">
                <span className="text-xl">{scenarioData?.emoji}</span>
                <span className="text-base font-bold">{scenarioData?.title}</span>
                <span className="text-sm text-muted-foreground font-semibold px-2 border-l border-border/50 capitalize">{scenarioDifficulty}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center">
                <Icon icon="solar:chat-round-line-bold" className="text-3xl text-primary mb-2" />
                <span className="text-2xl font-bold">{scenarioTurnCount}</span>
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Turns Taken</span>
              </div>
              <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center">
                <Icon icon="solar:clock-circle-bold" className="text-3xl text-secondary mb-2" />
                <span className="text-2xl font-bold">{mins > 0 ? \`\${mins}m \` : ''}{secs}s</span>
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Time Spent</span>
              </div>
            </div>

            {scenarioKeyPhrases.length > 0 && (
              <section className="bg-card/40 border border-border/50 rounded-3xl p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Icon icon="solar:star-fall-bold" className="text-2xl" />
                  </div>
                  <h2 className="font-heading text-xl font-bold">Key Phrases Learned</h2>
                </div>
                <div className="space-y-4">
                  {scenarioKeyPhrases.map((kp, i) => (
                    <div key={i} className="bg-background rounded-2xl p-5 border border-border/50 flex items-center gap-4 shadow-sm">
                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(kp.arabic); }}
                        className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center cursor-pointer active:scale-95 transition-transform flex-shrink-0"
                      >
                        <Icon icon="solar:volume-loud-bold" className="text-2xl" />
                      </button>
                      <div className="flex-1">
                        <div dir="rtl" className="text-xl font-bold text-primary mb-1" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{kp.arabic}</div>
                        <div className="text-sm text-muted-foreground font-semibold">{kp.english}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <button
              className="w-full h-16 rounded-[2rem] font-bold text-base uppercase tracking-widest text-white mt-8 flex items-center justify-center gap-3"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', boxShadow: '0 8px 30px rgba(var(--primary-rgb, 139, 92, 246), 0.3)' }}
              onClick={() => { triggerHaptic(); resetScenarioChat(); }}
            >
              <span>Back to Home</span>
              <Icon icon="solar:home-2-bold" className="text-2xl" />
            </button>
          </main>
        </div>
      );
    }`;

code = code.replace(oldSummary, newSummary);
fs.writeFileSync('src/ScenarioChat.jsx', code);
