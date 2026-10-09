import { describe, expect, it } from "vite-plus/test";
import {
  isTrustedRenderer,
  validateClipboardText,
  validateKeyName,
  validateTokenOptions,
} from "../src/main/security";
import { loadPreferences, restoreBounds, validatePreferences } from "../src/main/window-state";

describe("Desktop-Grenzen", () => {
  it("erlaubt nur das gebündelte Fenster oder die explizite lokale Entwicklungsorigin", () => {
    const file = "/Applications/todo.app/Contents/Resources/app.asar/dist/renderer/index.html";
    expect(isTrustedRenderer(`file://${file}`, file)).toBe(true);
    expect(isTrustedRenderer("file:///tmp/index.html", file)).toBe(false);
    expect(isTrustedRenderer("https://example.com/", file)).toBe(false);
    expect(isTrustedRenderer(`file://${file}?url=https://example.com`, file)).toBe(false);
    expect(isTrustedRenderer("http://127.0.0.1:4321/", file, "http://127.0.0.1:4321")).toBe(true);
    expect(isTrustedRenderer("http://127.0.0.1:4322/", file, "http://127.0.0.1:4321")).toBe(false);
    expect(isTrustedRenderer("http://evil@127.0.0.1:4321/", file, "http://127.0.0.1:4321")).toBe(
      false,
    );
    expect(isTrustedRenderer("http://127.0.0.1:4321/other", file, "http://127.0.0.1:4321")).toBe(
      false,
    );
  });

  it("weist unbekannte IPC-Argumente zurück", () => {
    expect(() => validateTokenOptions({ forceRefreshToken: true, session: "private" })).toThrow();
    expect(() => validateTokenOptions({ forceRefreshToken: "yes" })).toThrow();
    expect(validateTokenOptions({ forceRefreshToken: false })).toEqual({
      forceRefreshToken: false,
    });
    expect(() => validatePreferences({ ownerId: "somebody" })).toThrow();
    expect(() => validatePreferences({ alwaysOnTop: "true" })).toThrow();
    expect(() => validatePreferences({ shortcut: "Space" })).toThrow();
    expect(() => validatePreferences({ tint: "forest" })).toThrow();
    expect(
      validatePreferences({ shortcut: "CommandOrControl+Shift+Space", allSpaces: false }),
    ).toEqual({ shortcut: "CommandOrControl+Shift+Space", allSpaces: false });
  });

  it("verlangt für den globalen Kurzbefehl einen Modifier außer Shift", () => {
    for (const shortcut of ["Shift+A", "Shift+Space", "shift+Shift+Return"])
      expect(() => validatePreferences({ shortcut })).toThrow("⇧ allein reicht nicht");
    for (const shortcut of ["Alt+Shift+L", "Control+Space", "Shift+Command+1"])
      expect(validatePreferences({ shortcut })).toEqual({ shortcut });
  });

  it("behält gespeicherte Einstellungen, wenn window.json noch die alte Fensterfarbe enthält", () => {
    const saved = {
      alwaysOnTop: false,
      allSpaces: false,
      launchAtLogin: true,
      shortcut: "Alt+Space",
      tint: "plum",
      toString: "legacy",
    };
    expect(loadPreferences(saved)).toEqual({
      alwaysOnTop: false,
      allSpaces: false,
      launchAtLogin: true,
      shortcut: "Alt+Space",
    });
  });

  it("prüft Schlüsselnamen und Text für die Zwischenablage", () => {
    expect(validateKeyName("  task-capture  ")).toBe("task-capture");
    expect(validateKeyName("x".repeat(80))).toHaveLength(80);
    for (const name of ["", "   ", "x".repeat(81), 42, null, { name: "x" }])
      expect(() => validateKeyName(name)).toThrow();
    expect(validateClipboardText(" todo_abc ")).toBe(" todo_abc ");
    for (const text of ["", "x".repeat(4097), 1, ["todo_abc"]])
      expect(() => validateClipboardText(text)).toThrow();
  });

  it("holt ein Fenster von einem entfernten Monitor vollständig zurück", () => {
    const displays = [{ x: 0, y: 38, width: 1440, height: 862 }];
    const bounds = restoreBounds({ x: 4000, y: -1200, width: 410, height: 600 }, displays);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(38);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
  });

  it("behält gültige Positionen auch bei negativen Koordinaten und repariert beschädigte Werte", () => {
    const displays = [
      { x: 0, y: 0, width: 1440, height: 900 },
      { x: -1920, y: 0, width: 1920, height: 1080 },
    ];
    expect(restoreBounds({ x: -700, y: 50, width: 410, height: 600 }, displays)).toEqual({
      x: -700,
      y: 50,
      width: 410,
      height: 600,
    });
    const malformed = restoreBounds({ x: NaN, y: Infinity, width: -10, height: 9e10 }, displays);
    expect(malformed.width).toBe(340);
    expect(malformed.height).toBe(900);
    expect(Number.isFinite(malformed.x)).toBe(true);
    expect(loadPreferences({ shortcut: "broken", alwaysOnTop: false }).alwaysOnTop).toBe(true);
    const tiny = restoreBounds(null, [{ x: 0, y: 0, width: 320, height: 300 }]);
    expect(tiny.x).toBe(0);
    expect(tiny.y).toBe(0);
  });
});
