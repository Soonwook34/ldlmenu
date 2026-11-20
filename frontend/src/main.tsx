import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import { UIProvider } from "./components/ui";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <UIProvider>
        <App />
      </UIProvider>
    </MotionConfig>
  </StrictMode>,
);
