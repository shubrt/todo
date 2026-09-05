export type DesktopView = "priority" | "me" | "agency" | "work" | "habits" | "history";
export type DesktopPreferences = {
  alwaysOnTop: boolean;
  allSpaces: boolean;
  launchAtLogin: boolean;
  shortcut: string;
  tint: "graphite" | "plum" | "forest";
};
export type PublicDesktopState = {
  configured: boolean;
  cloudUrl?: string;
  siteUrl?: string;
  error?: string;
  preferences: DesktopPreferences;
};
export type DesktopBridge = {
  getState: () => Promise<PublicDesktopState>;
  connect: (input: string) => Promise<PublicDesktopState>;
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
