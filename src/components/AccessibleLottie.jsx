import { useReducedMotion } from "motion/react";
import { lazy, Suspense } from "react";

const DotLottieReact = lazy(() =>
  import("@lottiefiles/dotlottie-react").then((module) => ({
    default: module.DotLottieReact,
  })),
);

// Canvas animations need their own reduced-motion alternative; CSS cannot stop them.
export default function AccessibleLottie({
  src,
  loop,
  autoplay,
  style,
  ...props
}) {
  const reducedMotion = useReducedMotion();
  const celebration = src?.includes("done.lottie");
  if (reducedMotion) {
    return (
      <div className="motion-static-indicator" style={style} aria-hidden="true">
        {celebration ? "✓" : "♫"}
      </div>
    );
  }
  return (
    <Suspense fallback={<div style={style} aria-hidden="true" />}>
      <DotLottieReact
        {...props}
        src={src}
        style={style}
        autoplay={autoplay}
        loop={celebration ? false : loop}
      />
    </Suspense>
  );
}
