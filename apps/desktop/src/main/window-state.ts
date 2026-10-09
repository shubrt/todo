import type { DesktopPreferences } from "../shared/contracts";

export type Bounds = { x: number; y: number; width: number; height: number };
export const defaultPreferences: DesktopPreferences = {
  alwaysOnTop: true,
  allSpaces: true,
  launchAtLogin: false,
  shortcut: "CommandOrControl+Shift+Space",
};
/** Smallest window size, shared by the BrowserWindow limits and `restoreBounds`. */
export const minimumSize = { width: 340, height: 360 };

/**
 * Brings saved bounds back onto a connected display: default 410x600, at least `minimumSize`,
 * at most the display. Without a usable position the window goes to the top right.
 */
export function restoreBounds(saved: unknown, displays: Bounds[]): Bounds {
  const fallback = displays[0] ?? { x: 0, y: 0, width: 1440, height: 900 };
  const candidate = saved && typeof saved === "object" ? (saved as Partial<Bounds>) : {};
  const finite = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const width = Math.round(
    Math.min(
      Math.max(finite(candidate.width) ? candidate.width : 410, minimumSize.width),
      fallback.width,
    ),
  );
  const height = Math.round(
    Math.min(
      Math.max(finite(candidate.height) ? candidate.height : 600, minimumSize.height),
      fallback.height,
    ),
  );
  if (finite(candidate.x) && finite(candidate.y)) {
    const display = displays.find(
      (item) =>
        candidate.x! + width > item.x + 80 &&
        candidate.x! < item.x + item.width - 80 &&
        candidate.y! + 40 > item.y &&
        candidate.y! < item.y + item.height - 80,
    );
    if (display)
      return {
        x: Math.round(
          Math.max(
            display.x,
            Math.min(candidate.x, display.x + display.width - Math.min(width, display.width)),
          ),
        ),
        y: Math.round(
          Math.max(
            display.y,
            Math.min(candidate.y, display.y + display.height - Math.min(height, display.height)),
          ),
        ),
        width: Math.min(width, display.width),
        height: Math.min(height, display.height),
      };
  }
  return {
    x: Math.round(Math.max(fallback.x, fallback.x + fallback.width - width - 24)),
    y: Math.round(fallback.y + Math.min(48, Math.max(0, fallback.height - height))),
    width,
    height,
  };
}

/** An Electron accelerator: one or more modifiers, then one key, e.g. "CommandOrControl+Shift+Space". */
const acceleratorPattern =
  /^(?:(?:CommandOrControl|Command|Control|Ctrl|Alt|Option|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Return|Enter|Escape|Up|Down|Left|Right)$/i;

/**
 * Validates a preferences patch from the renderer. Unknown keys, wrong types and shortcuts
 * without a modifier other than Shift throw.
 */
export function validatePreferences(patch: unknown): Partial<DesktopPreferences> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("Ungültige Fenstereinstellung.");
  const result: Partial<DesktopPreferences> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "shortcut") {
      if (typeof value !== "string" || value.length > 80 || !acceleratorPattern.test(value))
        throw new Error("Nutze beispielsweise CommandOrControl+Shift+Space.");
      // Shift alone is no modifier for a global shortcut: Shift+A would take capital A from
      // every app.
      if (/^(?:Shift\+)+[^+]+$/i.test(value))
        throw new Error("Ein Kurzbefehl braucht ⌘, ⌃ oder ⌥. ⇧ allein reicht nicht.");
      result.shortcut = value;
    } else if (key === "alwaysOnTop" || key === "allSpaces" || key === "launchAtLogin") {
      if (typeof value !== "boolean")
        throw new Error("Diese Einstellung muss ein Wahrheitswert sein.");
      result[key] = value;
    } else throw new Error("Unbekannte Fenstereinstellung.");
  }
  return result;
}

/**
 * Preferences saved in window.json. Keys this version no longer knows (e.g. the removed `tint`)
 * are dropped so an update keeps the other preferences. An invalid value means a damaged file
 * and falls back to the defaults.
 */
export function loadPreferences(saved: unknown): DesktopPreferences {
  if (!saved || typeof saved !== "object") return { ...defaultPreferences };
  const known = Object.entries(saved).filter(([key]) => Object.hasOwn(defaultPreferences, key));
  try {
    return { ...defaultPreferences, ...validatePreferences(Object.fromEntries(known)) };
  } catch {
    return { ...defaultPreferences };
  }
}
