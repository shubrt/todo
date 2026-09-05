import type { DesktopPreferences } from "../shared/contracts";

export type Bounds = { x: number; y: number; width: number; height: number };
export const defaultPreferences: DesktopPreferences = {
  alwaysOnTop: true,
  allSpaces: true,
  launchAtLogin: false,
  shortcut: "CommandOrControl+Shift+Space",
  tint: "graphite",
};

export function restoreBounds(saved: unknown, displays: Bounds[]): Bounds {
  const fallback = displays[0] ?? { x: 0, y: 0, width: 1440, height: 900 };
  const candidate = saved && typeof saved === "object" ? (saved as Partial<Bounds>) : {};
  const finite = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const width = Math.round(
    Math.min(Math.max(finite(candidate.width) ? candidate.width : 410, 340), fallback.width),
  );
  const height = Math.round(
    Math.min(Math.max(finite(candidate.height) ? candidate.height : 600, 360), fallback.height),
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

export function validatePreferences(patch: unknown): Partial<DesktopPreferences> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("Ungültige Fenstereinstellung.");
  const allowed = new Set(["alwaysOnTop", "allSpaces", "launchAtLogin", "shortcut", "tint"]);
  const result: Partial<DesktopPreferences> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) throw new Error("Unbekannte Fenstereinstellung.");
    if (key === "shortcut") {
      if (
        typeof value !== "string" ||
        value.length > 80 ||
        !/^(?:(?:CommandOrControl|Command|Control|Ctrl|Alt|Option|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Return|Enter|Escape|Up|Down|Left|Right)$/i.test(
          value,
        )
      )
        throw new Error("Nutze beispielsweise CommandOrControl+Shift+Space.");
      result.shortcut = value;
    } else if (key === "tint") {
      if (value !== "graphite" && value !== "plum" && value !== "forest")
        throw new Error("Ungültige Fensterfarbe.");
      result.tint = value;
    } else {
      if (typeof value !== "boolean")
        throw new Error("Diese Einstellung muss ein Wahrheitswert sein.");
      result[key as "alwaysOnTop" | "allSpaces" | "launchAtLogin"] = value;
    }
  }
  return result;
}

export function loadPreferences(saved: unknown): DesktopPreferences {
  try {
    return { ...defaultPreferences, ...validatePreferences(saved) };
  } catch {
    return { ...defaultPreferences };
  }
}
