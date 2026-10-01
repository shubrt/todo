export type DesktopView =
  | "priority"
  | "me"
  | "agency"
  | "work"
  | "habits"
  | "recurrences"
  | "history";
export type DesktopPreferences = {
  alwaysOnTop: boolean;
  allSpaces: boolean;
  launchAtLogin: boolean;
  shortcut: string;
  tint: "graphite" | "plum" | "forest";
};
export type PublicDesktopState = {
  configured: boolean;
  /** Set for dev runs and branch packages, shown in the title bar. */
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
  onState: (callback: (state: PublicDesktopState) => void) => () => void;
  onNavigate: (callback: (view: DesktopView) => void) => () => void;
};

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}
