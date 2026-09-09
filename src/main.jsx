import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/noto-naskh-arabic/wght.css";
import "./experience.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
