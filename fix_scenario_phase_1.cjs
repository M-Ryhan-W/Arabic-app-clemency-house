const fs = require('fs');
let code = fs.readFileSync('src/ScenarioChat.jsx', 'utf8');

if (!code.includes('DotLottieReact')) {
  code = code.replace(
    'import { motion, AnimatePresence } from "framer-motion";\nimport { Leapfrog } from \'ldrs/react\';',
    'import { motion, AnimatePresence } from "framer-motion";\nimport { Leapfrog } from \'ldrs/react\';\nimport { DotLottieReact } from "@lottiefiles/dotlottie-react";'
  );
}

// DIFFICULTY REPLACEMENT
const diffOld = `
    // DIFFICULTY SELECTION
    if (scenarioPhase === "difficulty") {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans" style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.08) 0%, var(--background) 40%)' }}>
          <header className="px-6 pt-12 pb-6 flex items-center gap-4">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center">
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="font-heading text-lg font-bold">Daily Scenario</h1>
            </div>
            <div className="w-10" />
          </header>

          <main className="px-6 space-y-6">
            <div className="text-center py-6">
              <div className="text-6xl mb-4">{scenarioData?.emoji}</div>
              <h2 className="font-heading text-2xl font-bold mb-2">{scenarioData?.title}</h2>
              <p dir="rtl" className="text-lg text-muted-foreground" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{scenarioData?.titleAr}</p>
              <p className="text-sm text-muted-foreground mt-3">Choose your difficulty level to begin:</p>
            </div>

            {[
              { key: "easy", label: "🟢 Easy", desc: "Simple words, translations provided, hints given proactively", color: "#22c55e" },
              { key: "intermediate", label: "🟡 Intermediate", desc: "Natural Arabic, moderate vocabulary, hints on request", color: "#eab308" },
              { key: "advanced", label: "🔴 Advanced", desc: "Rich vocabulary, idioms, minimal English, challenging", color: "#ef4444" },
            ].map(d => (
              <button
                key={d.key}
                className="w-full bg-card rounded-2xl p-5 border border-border/50 shadow-sm flex items-center gap-4 active:scale-[0.97] transition-transform text-left"
                onClick={() => { triggerHaptic(); startScenarioChat(d.key); }}
              >
                <div className="text-2xl">{d.label.split(' ')[0]}</div>
                <div className="flex-1">
                  <h3 className="font-bold text-base mb-0.5">{d.label.split(' ').slice(1).join(' ')}</h3>
                  <p className="text-xs text-muted-foreground">{d.desc}</p>
                </div>
                <Icon icon="solar:arrow-right-bold" className="text-muted-foreground text-lg" />
              </button>
            ))}
          </main>
        </div>
      );
    }`;

const diffNew = `
    // DIFFICULTY SELECTION
    if (scenarioPhase === "difficulty") {
      return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col pt-12">
          <header className="px-6 pb-4 flex items-center gap-4 animate-in fade-in duration-300 z-10">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-12 h-12 rounded-full bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center active:scale-95 transition-transform">
              <MdArrowBackIosNew className="text-foreground text-xl" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="font-heading text-xl font-bold">Daily Scenario</h1>
            </div>
            <div className="w-12" />
          </header>

          <main className="flex-1 px-6 space-y-6 overflow-y-auto pb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center py-8 relative">
              <div className="text-8xl mb-6 relative inline-block">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 -z-10" />
                {scenarioData?.emoji}
              </div>
              <h2 className="font-heading text-3xl font-bold mb-3">{scenarioData?.title}</h2>
              <p dir="rtl" className="text-2xl text-primary font-bold mb-4" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{scenarioData?.titleAr}</p>
              <p className="text-muted-foreground text-base">Choose your level and start speaking</p>
            </div>

            <div className="space-y-4">
              {[
                { key: "easy", emoji: "🟢", label: "Easy", desc: "Simple words, translations, hints provided", colorClass: "border-green-500", bgGlow: "rgba(34,197,94,0.1)" },
                { key: "intermediate", emoji: "🟡", label: "Intermediate", desc: "Natural Arabic, moderate vocab, optional hints", colorClass: "border-yellow-500", bgGlow: "rgba(234,179,8,0.1)" },
                { key: "advanced", emoji: "🔴", label: "Advanced", desc: "Rich vocabulary, idioms, very challenging", colorClass: "border-red-500", bgGlow: "rgba(239,68,68,0.1)" },
              ].map(d => (
                <button
                  key={d.key}
                  className={\`w-full bg-card border border-border/50 rounded-3xl p-6 shadow-sm flex items-center gap-5 active:scale-[0.97] transition-transform text-left border-l-4 \${d.colorClass}\`}
                  onClick={() => { triggerHaptic(); startScenarioChat(d.key); }}
                >
                  <div className="text-3xl">{d.emoji}</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1">{d.label}</h3>
                    <p className="text-sm text-muted-foreground leading-snug">{d.desc}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <Icon icon="solar:arrow-right-bold" className="text-secondary text-lg" />
                  </div>
                </button>
              ))}
            </div>
          </main>
        </div>
      );
    }`;

code = code.replace(diffOld, diffNew);

// BRIEFING REPLACEMENT
const briefOld = `
    // BRIEFING SCREEN
    if (scenarioPhase === "briefing") {
      const words = scenarioData?.id ? (scenarioVocab[scenarioData.id] || []) : [];
      const userSetting = scenarioData?.id ? (scenarioContext[scenarioData.id] || scenarioData?.setting) : scenarioData?.setting;

      return (
        <div className="min-h-screen bg-background text-foreground font-sans relative flex flex-col pt-12">
          <header className="px-6 pb-6 flex items-center justify-between z-10 w-full flex-shrink-0">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-10 h-10 rounded-full bg-card border border-border/50 flex items-center justify-center animate-in fade-in duration-300">
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            {scenarioLoading && (
              <div className="bg-primary/10 rounded-full px-4 py-1.5 border border-primary/20 flex flex-row items-center gap-2 animate-in fade-in duration-300">
                <Leapfrog size="20" speed="2.5" color="var(--primary)" />
                <span className="text-primary text-xs font-bold uppercase tracking-widest">Connecting</span>
              </div>
            )}
            {!scenarioLoading && (
              <div className="bg-green-500/10 rounded-full px-4 py-1.5 border border-green-500/20 flex flex-row items-center gap-2 animate-in fade-in duration-300">
                <Icon icon="solar:check-circle-bold" className="text-green-500 text-lg" />
                <span className="text-green-500 text-xs font-bold uppercase tracking-widest">Ready</span>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-6 pb-6 z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
            <div className="flex flex-col items-center justify-center text-center mt-2 mb-8">
              <div className="text-7xl mb-6 relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 -z-10" />
                {scenarioData?.emoji}
              </div>
              <h1 className="font-heading text-3xl font-bold mb-2 text-foreground">{scenarioData?.title}</h1>
              <p dir="rtl" className="text-lg text-primary font-medium" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{scenarioData?.titleAr}</p>
            </div>

            <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                  <Icon icon="solar:info-square-bold" className="text-xl" />
                </div>
                <h3 className="font-heading text-lg font-bold">Situation Overview</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">{userSetting || "Get ready to practice your Arabic in this real-life scenario."}</p>
            </div>

            {words.length > 0 && (
              <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                    <Icon icon="solar:book-bookmark-bold" className="text-xl" />
                  </div>
                  <h3 className="font-heading text-lg font-bold">Useful Words</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {words.map((w, idx) => (
                    <button key={idx} className="bg-background/50 border border-border/50 rounded-2xl p-3 flex flex-col items-center justify-center text-center gap-1 active:scale-95 transition-transform w-full hover:border-primary/50" onClick={() => { triggerHaptic(); speakAiAudio(w.ar); }}>
                      <span dir="rtl" className="text-lg font-bold text-primary" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{w.ar}</span>
                      <span className="text-xs text-muted-foreground font-medium">{w.en}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 pb-8 z-10 w-full bg-gradient-to-t from-background via-background to-transparent pt-4">
            <button
              disabled={scenarioLoading}
              onClick={() => {
                triggerHaptic();
                setScenarioPhase("chat");
                if (scenarioMessages.length > 0) {
                  setTimeout(() => speakAiAudio(scenarioMessages[0].text), 300);
                }
              }}
              className="w-full h-14 rounded-[1.5rem] font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
              style={{
                background: scenarioLoading ? 'var(--muted)' : 'var(--primary)',
                color: scenarioLoading ? 'var(--muted-foreground)' : 'white',
                boxShadow: scenarioLoading ? 'none' : '0 8px 32px rgba(224,159,62,0.3)',
              }}
            >
              {scenarioLoading ? (
                <>
                  <Leapfrog size="20" speed="2.5" color="var(--primary)" />
                  <span>Preparing...</span>
                </>
              ) : (
                <>
                  <span>Ready to Practice!</span>
                  <Icon icon="solar:arrow-right-bold" className="text-xl" />
                </>
              )}
            </button>
          </div>
        </div>
      );
    }`;

const briefNew = `
    // BRIEFING SCREEN
    if (scenarioPhase === "briefing") {
      const words = scenarioData?.id ? (scenarioVocab[scenarioData.id] || []) : [];
      const userSetting = scenarioData?.id ? (scenarioContext[scenarioData.id] || scenarioData?.setting) : scenarioData?.setting;

      return (
        <div className="min-h-screen bg-background text-foreground font-sans relative flex flex-col pt-12">
          <header className="px-6 pb-6 flex items-center justify-between z-10 w-full flex-shrink-0">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-12 h-12 rounded-full bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center animate-in fade-in duration-300 shadow-sm active:scale-95 transition-transform">
              <MdArrowBackIosNew className="text-foreground text-xl" />
            </button>
            {scenarioLoading ? (
              <div className="bg-muted rounded-full px-5 py-2.5 border border-border/50 flex flex-row items-center gap-3 animate-in fade-in duration-300 shadow-sm">
                <Leapfrog size="24" speed="2.5" color="var(--primary)" />
                <span className="text-muted-foreground text-sm font-bold uppercase tracking-widest">Connecting</span>
              </div>
            ) : (
              <div className="bg-green-500/10 rounded-full px-5 py-2.5 border border-green-500/30 flex flex-row items-center gap-2 animate-in fade-in duration-300 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-600 dark:text-green-400 text-sm font-bold uppercase tracking-widest">Ready</span>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-6 pb-6 z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both space-y-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="text-8xl mb-6 relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 -z-10" />
                {scenarioData?.emoji}
              </div>
              <h1 className="font-heading text-3xl font-bold mb-2 text-foreground">{scenarioData?.title}</h1>
              <p dir="rtl" className="text-xl text-primary font-bold" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{scenarioData?.titleAr}</p>
            </div>

            <div className="bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary">
                  <Icon icon="solar:info-square-bold" className="text-2xl" />
                </div>
                <h3 className="font-heading text-xl font-bold">Situation Overview</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed text-base">{userSetting || "Get ready to practice your Arabic in this real-life scenario."}</p>
            </div>

            {words.length > 0 && (
              <div className="bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon icon="solar:book-bookmark-bold" className="text-2xl" />
                  </div>
                  <h3 className="font-heading text-xl font-bold">Useful Words</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {words.map((w, idx) => (
                    <button key={idx} className="bg-background border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 active:scale-95 transition-all w-full hover:border-primary/50 shadow-sm" onClick={() => { triggerHaptic(); speakAiAudio(w.ar); }}>
                      <span dir="rtl" className="text-xl font-bold text-foreground" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>{w.ar}</span>
                      <span className="text-sm text-muted-foreground font-medium">{w.en}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 pb-8 z-10 w-full pt-4 bg-background">
            <button
              disabled={scenarioLoading}
              onClick={() => {
                triggerHaptic();
                setScenarioPhase("chat");
                if (scenarioMessages.length > 0) {
                  setTimeout(() => speakAiAudio(scenarioMessages[0].text), 300);
                }
              }}
              className="w-full h-16 rounded-[2rem] font-bold text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.97]"
              style={{
                background: scenarioLoading ? 'var(--muted)' : 'var(--primary)',
                color: scenarioLoading ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                boxShadow: scenarioLoading ? 'none' : '0 8px 30px rgba(var(--primary-rgb, 139, 92, 246), 0.3)',
              }}
            >
              {scenarioLoading ? (
                <>
                  <Leapfrog size="24" speed="2.5" color="currentColor" />
                  <span>Preparing Scenario...</span>
                </>
              ) : (
                <>
                  <span>Ready to Practice!</span>
                  <Icon icon="solar:arrow-right-bold" className="text-2xl" />
                </>
              )}
            </button>
          </div>
        </div>
      );
    }`;

code = code.replace(briefOld, briefNew);
fs.writeFileSync('src/ScenarioChat.jsx', code);
