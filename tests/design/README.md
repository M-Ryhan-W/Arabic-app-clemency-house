# Design review

Run the actual interface with synthetic learner data:

```sh
npm ci
npx vite --config tests/design/vite.config.js
```

Open http://127.0.0.1:4174 for the dashboard, add `?screen=signin` for authentication, or `?screen=recovery` for password recovery.

This explicit preview configuration replaces only the Supabase client. It makes no database writes and sends no authentication requests. Normal development and production builds do not use the fixture client. It is not an authentication bypass in the shipped app.

## Regression checks

- At 320 × 568 and 390 × 560, scroll to every authentication control. There must be no horizontal overflow. Input text is 16px; password visibility controls are 48px and secondary buttons at least 44px.
- Submit the sample sign-in form and confirm its preview-only error is announced. Switch to password reset and confirm the password field is removed and the success message is announced.
- At 390 × 844, confirm all four navigation labels remain visible. Scroll Home, switch to Courses, and return to approximately the same position.
- At 1440 × 900, check the sidebar, bounded dashboard, two-column courses, Community and Profile. At tablet width, retain the bottom bar.
- Activate Word of the Day with Enter, then move through the lesson. Headers and actions must stay reachable and learning content must scroll on short screens.
- With the OS reduced-motion preference enabled, verify that page movement and decorative loops stop and celebrations show a static check. Verify that audio playback/recording still functions.
- Before release, check an installed Android build for keyboard resizing, system back, safe areas, voice recording, and status-bar contrast.

## Build checks

```sh
npm run build
npm run android:debug-apk
npx eslint src/components/*.jsx src/main.jsx tests/design/*.js
git diff --check
```

The existing large app components have baseline lint findings. Compare against the base commit when assessing regressions; do not treat the new-component check as a clean lint result for the entire repository.
