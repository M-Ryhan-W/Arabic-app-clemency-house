import { useRef, useState } from "react";
import { Icon } from "@iconify/react";

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-control">
        <Icon icon="solar:lock-password-linear" aria-hidden="true" />
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={onToggle}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          <Icon
            icon={visible ? "solar:eye-bold" : "solar:eye-closed-bold"}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}

export default function AuthScreen({
  mode,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  error,
  success,
  onSubmit,
  onModeChange,
}) {
  const [pending, setPending] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const submitting = useRef(false);
  const recovery = mode === "recovery";
  const forgot = mode === "forgot";
  const signup = mode === "signup";
  const heading = recovery
    ? "A fresh start"
    : forgot
      ? "Forgot your password?"
      : signup
        ? "Your Arabic journey starts here"
        : "Welcome back";
  const description = recovery
    ? "Choose a new password to get back to learning."
    : forgot
      ? "Enter your email and we’ll send you a reset link."
      : signup
        ? "Build confidence, one conversation at a time."
        : "A little practice today. A little more confidence tomorrow.";
  const action = recovery
    ? "Update password"
    : forgot
      ? "Send reset link"
      : signup
        ? "Create account"
        : "Sign in";

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setConnectionError("");
    try {
      await onSubmit(event);
    } catch {
      setConnectionError(
        "We couldn’t connect. Please check your connection and try again.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-layout">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <div className="auth-wordmark">
            <img
              src="/clemency-icon.png"
              width="64"
              height="64"
              alt="Ihya Institute"
            />
            <span>
              IHYA <span>ARABIC</span>
            </span>
          </div>
          <div className="auth-story-copy">
            <p className="auth-eyebrow">LANGUAGE · CONNECTION · HERITAGE</p>
            <h1 id="auth-story-title">
              Discover the <span>soul of Arabic.</span>
            </h1>
            <p>
              Find your voice through guided lessons, everyday conversations,
              and the beauty of Arabic.
            </p>
          </div>
          <div className="auth-lesson-preview">
            <div className="auth-preview-top">
              <span>A LITTLE ARABIC, EVERY DAY</span>
              <Icon icon="solar:sun-2-linear" aria-hidden="true" />
            </div>
            <p lang="ar" dir="rtl">
              أَهْلًا وَسَهْلًا
            </p>
            <span className="auth-transliteration">Ahlan wa sahlan</span>
            <span className="auth-translation">You’re welcome here.</span>
            <div className="auth-preview-line" />
            <span className="auth-preview-note">
              Every conversation begins with a first word.
            </span>
          </div>
          <div className="auth-features">
            <span>
              <Icon icon="solar:book-bookmark-linear" aria-hidden="true" />{" "}
              Guided lessons
            </span>
            <span>
              <Icon icon="solar:microphone-3-linear" aria-hidden="true" />{" "}
              Speaking practice
            </span>
          </div>
        </section>

        <section className="auth-form-panel" aria-labelledby="auth-title">
          <div className="auth-form-intro">
            <span className="auth-form-ornament" aria-hidden="true">
              ✦
            </span>
            <h2 id="auth-title">{heading}</h2>
            <p>{description}</p>
          </div>
          <form className="auth-form" onSubmit={submit} aria-busy={pending}>
            <fieldset disabled={pending || (recovery && Boolean(success))}>
              {!recovery && (
                <div className="auth-field">
                  <label htmlFor="auth-email">Email address</label>
                  <div className="auth-control">
                    <Icon icon="solar:letter-linear" aria-hidden="true" />
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              )}
              {!forgot && (
                <PasswordField
                  id="auth-password"
                  label={recovery ? "New password" : "Password"}
                  value={password}
                  onChange={setPassword}
                  visible={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  autoComplete={
                    signup || recovery ? "new-password" : "current-password"
                  }
                />
              )}
              {recovery && (
                <PasswordField
                  id="auth-confirm-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  autoComplete="new-password"
                />
              )}
              {!signup && !forgot && !recovery && (
                <button
                  className="auth-text-button auth-forgot"
                  type="button"
                  onClick={() => onModeChange("forgot")}
                >
                  Forgot password?
                </button>
              )}
              {(error || connectionError) && (
                <p className="auth-message auth-error" role="alert">
                  {error || connectionError}
                </p>
              )}
              {success && (
                <p className="auth-message auth-success" role="status">
                  {success}
                </p>
              )}
              <button className="auth-submit" type="submit">
                <span>{pending ? "Please wait…" : action}</span>
                <Icon
                  icon={
                    forgot ? "solar:letter-linear" : "solar:arrow-right-linear"
                  }
                  aria-hidden="true"
                />
              </button>
            </fieldset>
          </form>
          {!recovery && (
            <button
              className="auth-text-button auth-switch"
              type="button"
              disabled={pending}
              onClick={() =>
                onModeChange(forgot || signup ? "signin" : "signup")
              }
            >
              {forgot ? (
                "Back to sign in"
              ) : signup ? (
                <>
                  Already a member? <strong>Sign in</strong>
                </>
              ) : (
                <>
                  New to Ihya? <strong>Create an account</strong>
                </>
              )}
            </button>
          )}
          <p className="auth-form-footnote">
            Learn at your pace. Make it part of your day.
          </p>
        </section>
      </div>
    </main>
  );
}
