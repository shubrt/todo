import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

let coarse: MediaQueryList | undefined;

/**
 * True when the primary pointer is a finger (the iPhone), always false on the Mac. Read at
 * render or event time; the primary pointer does not change while the app runs. Touch-only
 * CSS sits in `@media (pointer: coarse)` for the same reason.
 */
export const isTouch = () => (coarse ??= matchMedia("(pointer: coarse)")).matches;

/** Ms a finger rests before a press counts as long. */
const hold = 450;
/** Px a finger may move meanwhile; more makes it a scroll. */
const slop = 8;

/** Set by drag.ts while a row is lifted; touch-layer.ts then keeps the finger from scrolling. */
export const gesture = { lock: false };

/** Where and with which finger a long press started. */
export type Press = { target: HTMLElement; x: number; y: number; pointerId: number };

/** Whether the finger has gone farther than `slop` from where the press started. */
export const outside = (press: Press, event: PointerEvent) =>
  Math.hypot(event.clientX - press.x, event.clientY - press.y) > slop;

/** Ends the edit in progress as leaving its field does: the field's blur saves (TitleInput). */
export function leaveField() {
  const field = document.activeElement;
  if (field instanceof HTMLInputElement) field.blur();
}

/**
 * Opens the keyboard inside a tap for a field that mounts later (a list still loading): a
 * hidden field takes the focus now, the real field's autoFocus takes it over, and iOS keeps
 * the keyboard up meanwhile. The hidden field goes away when it loses the focus.
 */
export function holdKeyboard() {
  const proxy = document.createElement("input");
  proxy.className = "kb-hold";
  proxy.tabIndex = -1;
  proxy.setAttribute("aria-hidden", "true");
  proxy.addEventListener("blur", () => proxy.remove(), { once: true });
  document.body.append(proxy);
  proxy.focus();
}

/**
 * Long press on touch: returns a pointer-down handler that calls `onHold` once the finger has
 * rested `hold` ms within `slop` px. When `onHold` returns true it took the press, and the
 * click iOS may send on release (wherever it lands, e.g. on a panel opened meanwhile) is
 * swallowed; otherwise the release stays a tap. A mouse is ignored. A plain factory, not a
 * hook, so panel rows can use it inside a map.
 */
export function longPress(onHold: (press: Press) => boolean) {
  return (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") return;
    const press: Press = {
      target: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId === press.pointerId && outside(press, next)) stop();
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId === press.pointerId) stop();
    };
    const timer = setTimeout(() => {
      stop();
      if (onHold(press)) swallowClick();
    }, hold);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
}

/** Px a drawer must be pulled down for letting go to close it. */
const closeAt = 80;

/**
 * Touch: a finger pulling down on a drawer's head moves the drawer along. Letting go more than
 * `closeAt` px down calls `close`; short of that, or when iOS cancels, the drawer slides back.
 * Returns the head's pointer-down handler, which ignores a mouse. The head needs
 * `touch-action: none`, or iOS takes the move as a scroll and cancels.
 */
export function pullDown(drawer: RefObject<HTMLElement | null>, close: () => void) {
  return (event: ReactPointerEvent<HTMLElement>) => {
    const element = drawer.current;
    if (event.pointerType !== "touch" || !element) return;
    const { pointerId, clientY: startY } = event;
    let pulled = 0;
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pulled = Math.max(0, next.clientY - startY);
      element.style.transition = "none";
      element.style.transform = pulled ? `translateY(${pulled}px)` : "";
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (next.type === "pointerup" && pulled > closeAt) return close();
      element.style.transition = "transform 150ms ease";
      element.style.transform = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
}

/**
 * Swallows the next click. Whether iOS sends one after a long press is unverified, so the next
 * pointer-down, which comes before any later tap's click, ends the wait as well.
 */
function swallowClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    done();
  };
  const done = () => {
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("pointerdown", done, true);
  };
  window.addEventListener("click", swallow, true);
  window.addEventListener("pointerdown", done, true);
}
