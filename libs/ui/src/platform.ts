/** Targets the Mac tray menu opens in the window: a special list, the ⌘P switcher or settings. */
export type DesktopNavigation = "important" | "history" | "recurrences" | "switcher" | "settings";
/** Per-Mac window preferences, stored by the desktop shell next to the window bounds. */
export type DesktopPreferences = {
  alwaysOnTop: boolean;
  allSpaces: boolean;
  launchAtLogin: boolean;
  shortcut: string;
};
/** A new integration key. `key` is the secret: shown once, never stored by the app. */
export type CreatedIntegrationKey = { id: string; name: string; prefix: string; key: string };

export type PlatformState = {
  configured: boolean;
  /** App version, e.g. "0.2.0", shown in the settings info section. */
  version: string;
  /** Set for dev runs and branch packages so the window can tell them apart from the real app. */
  variant?: string;
  cloudUrl?: string;
  siteUrl?: string;
  /** Why the last login or startup step failed, in German; shown on the login and in settings. */
  error?: string;
  /** Window preferences; only the Mac has them. */
  preferences?: DesktopPreferences;
};

/** A failed Platform call whose message is German and meant for the user. */
export class PlatformError extends Error {
  override name = "PlatformError";
}

/**
 * What the shared UI needs from its shell (Electron window, browser), passed to `renderApp`.
 * Optional members exist only where the shell has them (all of them on the Mac). Calls reject
 * with a PlatformError when the message is meant for the user.
 */
export type Platform = {
  /** "mac" for the Electron app, "web" for the browser; picks device-specific copy. */
  kind: "mac" | "web";
  getState: () => Promise<PlatformState>;
  onState: (callback: (state: PlatformState) => void) => () => void;
  /** Starts the Shoo login; resolves once this device holds a device key. */
  login: () => Promise<PlatformState>;
  /** Stops a login or key creation that still waits for the browser; that call then rejects. */
  cancelLogin: () => Promise<void>;
  /** Revokes this device's key (best effort) and forgets the stored connection. */
  disconnect: () => Promise<PlatformState>;
  fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>;
  /** Hides the window (esc with nothing open, ⌘W). */
  hide?: () => Promise<void>;
  /** Opens the macOS emoji picker, which types into the focused field. */
  showEmojiPanel?: () => Promise<void>;
  setPreferences?: (patch: Partial<DesktopPreferences>) => Promise<PlatformState>;
  /** Called when the tray menu asks the window to open a target. */
  onNavigate?: (callback: (target: DesktopNavigation) => void) => () => void;
  /** Integration key after a fresh Shoo login; `name` trimmed, 1 to 80 characters. */
  createIntegrationKey?: (name: string) => Promise<CreatedIntegrationKey>;
  /** Puts text on the clipboard. */
  copyText?: (text: string) => Promise<void>;
};
