import { createRoot } from "react-dom/client";
import { App } from "./app";
import { ErrorBoundary } from "./error-boundary";
import type { Platform } from "./platform";
// After ./app, so the cascade stays panels.css, views.css, styles.css.
import "./styles.css";

/** Renders the app into the page's #root. Each shell (Mac window, browser) passes its Platform. */
export function renderApp(platform: Platform) {
  const container = document.getElementById("root");
  if (!container) throw new Error("#root fehlt.");
  createRoot(container).render(
    <ErrorBoundary platform={platform}>
      <App platform={platform} />
    </ErrorBoundary>,
  );
}
