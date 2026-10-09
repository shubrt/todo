import { createRoot } from "react-dom/client";
import { DesktopApp } from "./app";
import { DesktopErrorBoundary } from "./error-boundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <DesktopErrorBoundary>
    <DesktopApp />
  </DesktopErrorBoundary>,
);
