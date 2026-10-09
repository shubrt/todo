/** Targets the tray menu opens in the window: a special list, the Cmd+P switcher or settings. */
export type DesktopNavigation = "important" | "history" | "recurrences" | "switcher" | "settings";
/** Per-Mac window preferences, stored in userData/window.json next to the window bounds. */
export type DesktopPreferences = {
  alwaysOnTop: boolean;
  allSpaces: boolean;
  launchAtLogin: boolean;
  shortcut: string;
};
export type PublicDesktopState = {
  configured: boolean;
  /** App version, e.g. "0.2.0", shown in the settings info section. */
  version: string;
  /** Set for dev runs and branch packages so the window can tell them apart from the real app. */
  variant?: string;
  cloudUrl?: string;
  siteUrl?: string;
  error?: string;
  preferences: DesktopPreferences;
};
/** A new integration key. `key` is the secret: shown once, never stored by the app. */
export type CreatedIntegrationKey = { id: string; name: string; prefix: string; key: string };
export type DesktopBridge = {
  getState: () => Promise<PublicDesktopState>;
  /** Opens the Shoo login in the system browser and resolves once this Mac holds a device key. */
  login: () => Promise<PublicDesktopState>;
  /**
   * Stops a login or key creation that still waits for the browser. The pending `login()` or
   * `createIntegrationKey()` then rejects.
   */
  cancelLogin: () => Promise<void>;
  /**
   * Creates an integration key (e.g. for task-capture) after a fresh Shoo login in the browser.
   * Needs a connection. Shares the one-at-a-time guard and `cancelLogin` with `login()`.
   * `name` is trimmed and must be 1 to 80 characters.
   */
  createIntegrationKey: (name: string) => Promise<CreatedIntegrationKey>;
  /** Puts text (at most 4096 characters) on the clipboard; the renderer has no clipboard access. */
  copyText: (text: string) => Promise<void>;
  /** Revokes this Mac's device key (best effort) and forgets the stored connection. */
  disconnect: () => Promise<PublicDesktopState>;
  fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>;
  setPreferences: (patch: Partial<DesktopPreferences>) => Promise<PublicDesktopState>;
  hide: () => Promise<void>;
  /**
   * Opens the macOS emoji picker. The picked emoji is typed into the focused text field, so
   * focus an input before calling this.
   */
  showEmojiPanel: () => Promise<void>;
  onState: (callback: (state: PublicDesktopState) => void) => () => void;
  /** Called when the tray menu asks the window to open a target. The window is already shown. */
  onNavigate: (callback: (target: DesktopNavigation) => void) => () => void;
};

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}
