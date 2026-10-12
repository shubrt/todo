import type {
  CreatedIntegrationKey,
  DesktopNavigation,
  DesktopPreferences,
  PlatformState,
} from "@todo/ui/platform";

// The shared UI owns these types; the main process and preload use them through this file.
export type { CreatedIntegrationKey, DesktopNavigation, DesktopPreferences };
/** The window's state: the shared PlatformState, and the Mac always has window preferences. */
export type PublicDesktopState = PlatformState & { preferences: DesktopPreferences };
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
