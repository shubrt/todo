import { useEffect, type RefObject } from "react";
import { useApp } from "./store";
import { gesture, isTouch } from "./touch";

/**
 * The phone's window behavior, called once by the app frame with its `.app` element; does
 * nothing on the Mac. Each part sets itself up at mount and returns its cleanup. Kept out of
 * touch.ts: store.ts calls isTouch while it is created, so touch.ts must not import the store.
 */
export function useTouchLayer(app: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!isTouch()) return;
    const stops = [followViewport(), panelHistory(), guardScroll(app.current)];
    return () => stops.forEach((stop) => stop());
  }, [app]);
}

/**
 * Mirrors the visual viewport into CSS variables: `--vv-h` and `--vv-top` size and place the
 * fixed `.app`, so it ends at the top of the virtual keyboard and the bottom-anchored panels
 * sit above it; `--kb` is the keyboard height, which drops the home indicator's inset.
 */
function followViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const style = document.documentElement.style;
  const update = (event?: Event) => {
    style.setProperty("--vv-h", `${viewport.height}px`);
    style.setProperty("--vv-top", `${viewport.offsetTop}px`);
    style.setProperty(
      "--kb",
      `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
    );
    // The keyboard just opened or grew: keep the field being typed in visible.
    const field = document.activeElement;
    if (event?.type === "resize" && field instanceof HTMLInputElement)
      field.scrollIntoView({ block: "nearest" });
  };
  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
  };
}

/** The panel depth a history entry stands for: 0 for the app's own entry. */
const depthOf = (state: unknown) =>
  typeof state === "object" && state && "panel" in state && typeof state.panel === "number"
    ? state.panel
    : 0;

/**
 * Keeps one history entry per open panel, so iOS's edge swipe back closes the top panel.
 * Panels closed in the app go back as many entries. A swipe forward into entries whose panels
 * are gone is undone. Starts on a clean entry: after a reload, the entries keep their state
 * but the panels are gone.
 */
function panelHistory() {
  history.replaceState(null, "");
  let depth = 0;
  // A history.go of ours is under way. It is async, so the next sync waits for its popstate.
  let going = false;
  const sync = () => {
    if (going) return;
    const open = useApp.getState().panels.length;
    while (depth < open) history.pushState({ panel: ++depth }, "");
    if (open < depth) {
      going = true;
      history.go(open - depth);
    }
  };
  const onPop = (event: PopStateEvent) => {
    const ours = going;
    going = false;
    depth = depthOf(event.state);
    const { panels } = useApp.getState();
    // One stack change, so the subscriber finds the history already in step.
    if (!ours && panels.length > depth) useApp.setState({ panels: panels.slice(0, depth) });
    else sync();
  };
  const unsubscribe = useApp.subscribe(sync);
  window.addEventListener("popstate", onPop);
  return () => {
    unsubscribe();
    window.removeEventListener("popstate", onPop);
  };
}

/**
 * While a row is lifted (gesture.lock), a moving finger must not scroll. iOS honors that only
 * from a non-passive touchmove listener that existed before the touch began, so it is set up
 * at mount, on the app's element rather than the whole document.
 */
function guardScroll(app: HTMLElement | null) {
  if (!app) return () => {};
  const guard = (event: TouchEvent) => {
    if (gesture.lock) event.preventDefault();
  };
  app.addEventListener("touchmove", guard, { passive: false });
  return () => app.removeEventListener("touchmove", guard);
}
