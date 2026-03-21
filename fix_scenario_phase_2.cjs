const fs = require('fs');
let code = fs.readFileSync('src/ScenarioChat.jsx', 'utf8');

const chatOld = `
    // CHAT SCREEN
    if (scenarioPhase === "chat") {
      const lastAi = [...scenarioMessages].reverse().find(m => m.role === 'ai');
      const elapsedSec = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;
      const timeRemaining = Math.max(0, 300 - elapsedSec);
      const showTimeWarning = timeRemaining > 0 && timeRemaining <= 60 && !scenarioLoading;
      return (
        <div className="bg-background text-foreground font-sans flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
          {/* Header — compact */}
          <header className="px-4 pt-12 pb-2 flex items-center gap-3 border-b border-border/30 flex-shrink-0" style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.08) 0%, transparent 100%)' }}>
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-8 h-8 rounded-full bg-card border border-border/50 flex items-center justify-center">
              <MdArrowBackIosNew className="text-foreground text-xs" />
            </button>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-lg">{scenarioData?.emoji}</span>
              <h1 className="font-heading text-sm font-bold">{scenarioData?.title}</h1>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-2 py-0.5 rounded-full border border-border/50" style={{
                color: scenarioDifficulty === 'easy' ? '#22c55e' : scenarioDifficulty === 'intermediate' ? '#eab308' : '#ef4444',
                borderColor: scenarioDifficulty === 'easy' ? 'rgba(34,197,94,0.3)' : scenarioDifficulty === 'intermediate' ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)',
              }}>{scenarioDifficulty === 'intermediate' ? 'Medium' : scenarioDifficulty === 'easy' ? 'Easy' : 'Hard'}</span>
            </div>
            {/* Time warning indicator */}
            {showTimeWarning && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full animate-in fade-in duration-500" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                <span className="text-[10px] text-red-400 font-bold">{Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}</span>
              </div>
            )}
          </header>

          {/* Messages — top portion, scrollable */}
          <div className="overflow-y-auto px-3 py-2 space-y-2" style={{ maxHeight: '30vh', minHeight: '15vh', flexShrink: 0 }}>
            {scenarioMessages.map((msg, i) => (
              <div key={i} className={\`flex \${msg.role === 'user' ? 'justify-end' : 'justify-start'}\`}>
                <div
                  style={{
                    maxWidth: '88%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: msg.role === 'user' ? '1rem 1rem 0.2rem 1rem' : '1rem 1rem 1rem 0.2rem',
                    background: msg.role === 'user' ? 'var(--primary)' : 'var(--card)',
                    color: msg.role === 'user' ? 'white' : 'var(--foreground)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '0.9rem', lineHeight: 1.7, fontWeight: 500 }}>
                    {msg.text}
                  </div>
                  {msg.role === 'ai' && (
                    <div className="flex items-center gap-2 mt-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                      {msg.translation && (
                        msg.isTranslationVisible ? (
                          <p className="text-[11px] text-muted-foreground italic flex-1">{msg.translation}</p>
                        ) : (
                          <button
                            onClick={() => {
                              triggerHaptic();
                              setScenarioMessages(prev => prev.map((m, idx) => idx === i ? { ...m, isTranslationVisible: true } : m));
                            }}
                            className="text-[11px] text-violet-400 font-medium flex-1 text-left"
                          >
                            Show translation
                          </button>
                        )
                      )}
                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(msg.text); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted-foreground)' }}
                      >
                        <Icon icon="solar:volume-loud-bold" className="text-base" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {scenarioLoading && (
              <div className="flex justify-start">
                <div style={{ padding: '0.5rem 0.75rem', borderRadius: '1rem 1rem 1rem 0.2rem', background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400" style={{ animation: 'pulse 1s ease-in-out 0.2s infinite' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400" style={{ animation: 'pulse 1s ease-in-out 0.4s infinite' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={scenarioChatEndRef} />
          </div>

          {/* Bottom Panel — takes most of the screen */}
          <div className="flex-1 flex flex-col border-t border-border/50 overflow-y-auto" style={{ background: 'var(--card)', borderTopLeftRadius: '1.5rem', borderTopRightRadius: '1.5rem', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}>

            {/* Suggested Response Card */}
            {lastAi && !scenarioLoading && (lastAi.suggestedResponse || lastAi.hint) && (
              <div className="px-5 pt-4 pb-2 flex-shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Written hint */}
                {lastAi.hint && (
                  <p className="text-xs text-muted-foreground text-center mb-3">
                    <Icon icon="solar:chat-round-dots-bold" className="inline mr-1 text-sm" style={{ verticalAlign: '-2px' }} />
                    {lastAi.hint}
                  </p>
                )}

                {/* Suggested response */}
                {lastAi.suggestedResponse && (
                  <div style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '0.75rem 1rem' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Try saying</span>
                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(lastAi.suggestedResponse); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      >
                        <Icon icon="solar:volume-loud-bold" className="text-base text-primary" />
                      </button>
                    </div>
                    <div dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', sans-serif", fontSize: '1.05rem', lineHeight: 1.8, fontWeight: 600, color: 'var(--primary)', textAlign: 'right' }}>
                      {lastAi.suggestedResponse}
                    </div>
                    {lastAi.suggestedResponseTranslation && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{lastAi.suggestedResponseTranslation}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* More Help — toggle button + expanded content */}
            {lastAi?.audioHelp && !scenarioLoading && (
              <div className="px-5 pt-1 pb-1 flex-shrink-0">
                <button
                  onClick={() => { triggerHaptic(); setShowScenarioMoreHelp(prev => !prev); }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl transition-all active:scale-[0.98]"
                  style={{ background: showScenarioMoreHelp ? 'rgba(139,92,246,0.08)' : 'transparent', border: '1px solid var(--border)' }}
                >
                  <Icon icon={showScenarioMoreHelp ? "solar:alt-arrow-up-bold" : "solar:lightbulb-bold"} className="text-sm" style={{ color: 'var(--primary)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                    {showScenarioMoreHelp ? 'Hide Help' : 'Need More Help?'}
                  </span>
                </button>

                {showScenarioMoreHelp && (
                  <div className="mt-2 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-1 duration-200" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                    <p className="text-sm leading-relaxed text-foreground" style={{ lineHeight: 1.7 }}>
                      {lastAi.audioHelp}
                    </p>
                  </div>
                )}
              </div>
            )}



            {/* Spacer */}
            <div className="flex-1" style={{ minHeight: '1rem' }} />

            {/* Mic Button — pill shaped */}
            <div className="px-6 pb-1 flex-shrink-0">
              <button
                onClick={() => {
                  if (scenarioRecording) {
                    stopScenarioRecording();
                  } else if (!scenarioLoading) {
                    startScenarioRecording();
                  }
                }}
                disabled={scenarioLoading}
                className="w-full active:scale-[0.97] transition-transform"
                style={{
                  height: 56, borderRadius: '1.5rem',
                  background: scenarioRecording ? 'linear-gradient(135deg, #ef4444, #dc2626)' : scenarioLoading ? 'var(--muted)' : 'var(--primary)',
                  border: 'none', cursor: scenarioLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                  boxShadow: scenarioRecording ? '0 0 25px rgba(239,68,68,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
                  color: 'white',
                  fontSize: '0.9rem', fontWeight: 700,
                  letterSpacing: '0.02em'
                }}
              >
                <Icon icon={scenarioRecording ? "solar:stop-bold" : "solar:microphone-bold"} className="text-xl" />
                <span>{scenarioRecording ? \`Recording... \${scenarioRecordingSeconds}s\` : scenarioLoading ? 'Thinking...' : 'Tap to Speak'}</span>
              </button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground opacity-40 pb-1 pt-1">
              Hold to record your response
            </p>
          </div>
        </div>
      );
    }`;

const chatNew = `
    // CHAT SCREEN
    if (scenarioPhase === "chat") {
      const lastAi = [...scenarioMessages].reverse().find(m => m.role === 'ai');
      const elapsedSec = scenarioStartTimeRef.current ? Math.floor((Date.now() - scenarioStartTimeRef.current) / 1000) : 0;
      const timeRemaining = Math.max(0, 300 - elapsedSec);
      const showTimeWarning = timeRemaining > 0 && timeRemaining <= 60 && !scenarioLoading;
      return (
        <div className="bg-background text-foreground font-sans flex flex-col h-screen overflow-hidden relative">
          
          {/* 60s Time Warning Toast */}
          <AnimatePresence>
            {showTimeWarning && (
              <motion.div 
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="absolute top-20 left-4 right-4 z-50 bg-red-500/10 border border-red-500/30 text-red-500 rounded-2xl p-4 shadow-lg backdrop-blur-md flex items-center justify-center gap-3"
              >
                <Icon icon="solar:alarm-bold" className="text-2xl animate-pulse" />
                <span className="font-bold text-sm">1 minute remaining — wrap up your conversation!</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <header className="px-5 pt-12 pb-4 flex items-center gap-4 bg-background z-10 flex-shrink-0 shadow-sm">
            <button onClick={() => { triggerHaptic(); resetScenarioChat(); }} className="w-10 h-10 rounded-full bg-card/80 border border-border/50 flex items-center justify-center active:scale-95 transition-transform">
              <MdArrowBackIosNew className="text-foreground" />
            </button>
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{scenarioData?.emoji}</span>
                <h1 className="font-heading text-lg font-bold">{scenarioData?.title}</h1>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full border border-border/50" style={{
                  color: scenarioDifficulty === 'easy' ? '#22c55e' : scenarioDifficulty === 'intermediate' ? '#eab308' : '#ef4444',
                  backgroundColor: scenarioDifficulty === 'easy' ? 'rgba(34,197,94,0.1)' : scenarioDifficulty === 'intermediate' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
                }}>{scenarioDifficulty === 'intermediate' ? 'Medium' : scenarioDifficulty === 'easy' ? 'Easy' : 'Hard'}</span>
                {timeRemaining <= 60 && (
                  <span className="text-[10px] font-bold text-red-500 flex items-center gap-1 animate-pulse">
                    <Icon icon="solar:clock-circle-bold" />
                    {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 z-0">
            {scenarioMessages.map((msg, i) => (
              <div key={i} className={\`flex \${msg.role === 'user' ? 'justify-end' : 'justify-start'}\`}>
                <div
                  className={\`shadow-sm \${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/50'}\`}
                  style={{
                    maxWidth: '85%',
                    padding: '1rem',
                    borderRadius: msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : '1.5rem 1.5rem 1.5rem 0.25rem',
                  }}
                >
                  <div dir="rtl" className="text-lg leading-relaxed font-semibold" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>
                    {msg.text}
                  </div>
                  {msg.role === 'ai' && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
                      {msg.translation && (
                        msg.isTranslationVisible ? (
                          <p className="text-xs text-muted-foreground italic flex-1 leading-normal">{msg.translation}</p>
                        ) : (
                          <button
                            onClick={() => {
                              triggerHaptic();
                              setScenarioMessages(prev => prev.map((m, idx) => idx === i ? { ...m, isTranslationVisible: true } : m));
                            }}
                            className="text-xs text-primary font-bold flex-1 text-left py-2 active:opacity-70 transition-opacity"
                          >
                            Show translation
                          </button>
                        )
                      )}
                      <button
                        onClick={() => { triggerHaptic(); speakAiAudio(msg.text); }}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-secondary/10 text-secondary active:scale-95 transition-transform flex-shrink-0"
                      >
                        <Icon icon="solar:volume-loud-bold" className="text-xl" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {scenarioLoading && (
              <div className="flex justify-start">
                <div className="bg-card border border-border/50 shadow-sm" style={{ padding: '1rem', borderRadius: '1.5rem 1.5rem 1.5rem 0.25rem' }}>
                  <Leapfrog size="24" speed="2.5" color="var(--primary)" />
                </div>
              </div>
            )}
            <div ref={scenarioChatEndRef} />
          </div>

          {/* Bottom Panel */}
          <div className="bg-card border-t border-border/50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] flex-shrink-0 flex flex-col relative z-20 pb-safe">
            
            <div className="flex-1 overflow-y-auto max-h-[40vh] px-5 pt-4 pb-2 scrollbar-hide">
              {/* Suggested Response Card */}
              {lastAi && !scenarioLoading && (lastAi.suggestedResponse || lastAi.hint) && (
                <div className="mb-4 animate-in fade-in duration-300">
                  {lastAi.hint && (
                    <p className="text-sm text-primary font-medium text-center mb-3">
                      <Icon icon="solar:chat-round-dots-bold" className="inline mr-2 text-lg align-text-bottom" />
                      {lastAi.hint}
                    </p>
                  )}

                  {lastAi.suggestedResponse && (
                    <div className="bg-background border border-border/50 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Try saying</span>
                        <button
                          onClick={() => { triggerHaptic(); speakAiAudio(lastAi.suggestedResponse); }}
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10 text-primary active:scale-95 transition-transform"
                        >
                          <Icon icon="solar:volume-loud-bold" className="text-lg" />
                        </button>
                      </div>
                      <div dir="rtl" className="text-xl leading-relaxed font-bold text-primary text-right mb-1" style={{ fontFamily: "'Noto Sans Arabic', sans-serif" }}>
                        {lastAi.suggestedResponse}
                      </div>
                      {lastAi.suggestedResponseTranslation && (
                        <p className="text-sm text-muted-foreground italic text-right">{lastAi.suggestedResponseTranslation}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* More Help Toggle */}
              {lastAi?.audioHelp && !scenarioLoading && (
                <div className="mb-4">
                  <button
                    onClick={() => { triggerHaptic(); setShowScenarioMoreHelp(prev => !prev); }}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl transition-all active:scale-[0.98] bg-secondary/10 text-secondary font-bold text-sm"
                  >
                    <Icon icon={showScenarioMoreHelp ? "solar:alt-arrow-up-bold" : "solar:lightbulb-bold"} className="text-lg" />
                    <span>{showScenarioMoreHelp ? 'Hide Help' : 'Need More Help?'}</span>
                  </button>

                  {showScenarioMoreHelp && (
                    <div className="mt-3 p-4 rounded-2xl bg-background border border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <p className="text-base leading-relaxed text-foreground">
                        {lastAi.audioHelp}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mic Area */}
            <div className="px-6 pb-6 pt-2 flex flex-col items-center justify-center bg-card">
              <div className="relative">
                {scenarioRecording && (
                  <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-red-500 text-white font-bold text-xs px-3 py-1 rounded-full shadow-lg animate-bounce">
                    Release to send
                  </div>
                )}
                {scenarioRecording && (
                  <div className="absolute top-0 -right-6 bg-background border border-red-500/30 text-red-500 font-bold text-xs px-2 py-1 rounded-full shadow-sm">
                    {scenarioRecordingSeconds}s
                  </div>
                )}
                
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    if (!scenarioLoading) startScenarioRecording();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    if (scenarioRecording) stopScenarioRecording();
                  }}
                  onMouseDown={(e) => {
                    if (!scenarioLoading) startScenarioRecording();
                  }}
                  onMouseUp={(e) => {
                    if (scenarioRecording) stopScenarioRecording();
                  }}
                  disabled={scenarioLoading}
                  className={\`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform text-white select-none \${scenarioRecording ? 'bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.6)]' : scenarioLoading ? 'bg-muted text-muted-foreground' : 'bg-primary'}\`}
                >
                  <Icon icon={scenarioLoading ? "solar:hourglass-bold" : scenarioRecording ? "solar:microphone-3-bold" : "solar:microphone-bold"} className="text-4xl" />
                </button>
              </div>
              <p className="text-center text-xs text-muted-foreground font-medium mt-3">
                {scenarioRecording ? 'Recording...' : scenarioLoading ? 'Getting reply...' : 'Hold to speak'}
              </p>
            </div>
            
          </div>
        </div>
      );
    }`;

code = code.replace(chatOld, chatNew);
fs.writeFileSync('src/ScenarioChat.jsx', code);
