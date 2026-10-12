import { PlatformError, type Platform } from "@todo/ui/platform";
import type { DesktopBridge } from "../shared/contracts";

/**
 * The main process's German message of a failed IPC call. Electron rejects with
 * "Error invoking remote method '<channel>': <Name>Error: <message>"; undefined otherwise.
 */
export function ipcMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  return /^Error invoking remote method '[^']*': (?:\w*Error: )?([\s\S]+)$/.exec(message)?.[1];
}

/** `call` with its IPC rejections turned into a PlatformError; other errors pass unchanged. */
function unwrap<A extends unknown[], R>(call: (...args: A) => Promise<R>) {
  return async (...args: A) => {
    try {
      return await call(...args);
    } catch (cause) {
      const message = ipcMessage(cause);
      if (message === undefined) throw cause;
      throw new PlatformError(message);
    }
  };
}

/** window.desktop as the shared UI's Platform: the Mac has every capability. */
export function desktopPlatform(bridge: DesktopBridge): Platform {
  return {
    kind: "mac",
    getState: unwrap(bridge.getState),
    onState: bridge.onState,
    login: unwrap(bridge.login),
    cancelLogin: unwrap(bridge.cancelLogin),
    disconnect: unwrap(bridge.disconnect),
    fetchAccessToken: unwrap(bridge.fetchAccessToken),
    hide: unwrap(bridge.hide),
    showEmojiPanel: unwrap(bridge.showEmojiPanel),
    setPreferences: unwrap(bridge.setPreferences),
    onNavigate: bridge.onNavigate,
    createIntegrationKey: unwrap(bridge.createIntegrationKey),
    copyText: unwrap(bridge.copyText),
  };
}
