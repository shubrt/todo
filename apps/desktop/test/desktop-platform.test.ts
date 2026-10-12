import { PlatformError } from "@todo/ui/platform";
import { describe, expect, it, vi } from "vite-plus/test";
import { desktopPlatform, ipcMessage } from "../src/renderer/desktop-platform";
import type { DesktopBridge } from "../src/shared/contracts";

const ipcError = (message: string) =>
  new Error(`Error invoking remote method 'desktop:login': ${message}`);

/** A bridge whose only working call is `login`. */
function bridgeWith(login: DesktopBridge["login"]): DesktopBridge {
  const unused = () => Promise.reject(new Error("nicht benutzt"));
  return {
    getState: unused,
    login,
    cancelLogin: unused,
    createIntegrationKey: unused,
    copyText: unused,
    disconnect: unused,
    fetchAccessToken: unused,
    setPreferences: unused,
    hide: unused,
    showEmojiPanel: unused,
    onState: () => () => {},
    onNavigate: () => () => {},
  };
}

describe("IPC-Fehler", () => {
  it("liest die Meldung des Hauptprozesses ohne Electron-Präfix", () => {
    expect(ipcMessage(ipcError("Error: Die Anmeldung ist abgelaufen."))).toBe(
      "Die Anmeldung ist abgelaufen.",
    );
    expect(ipcMessage(ipcError("LoginError: Shoo antwortet nicht."))).toBe("Shoo antwortet nicht.");
    expect(ipcMessage(new Error("Netzwerkfehler"))).toBeUndefined();
  });

  it("macht daraus einen PlatformError und lässt andere Fehler durch", async () => {
    const other = new Error("Netzwerkfehler");
    const login = vi
      .fn<DesktopBridge["login"]>()
      .mockRejectedValueOnce(ipcError("Error: Die Anmeldung ist abgelaufen."))
      .mockRejectedValueOnce(other);
    const platform = desktopPlatform(bridgeWith(login));

    const failed = platform.login();
    await expect(failed).rejects.toBeInstanceOf(PlatformError);
    await expect(failed).rejects.toThrow("Die Anmeldung ist abgelaufen.");
    await expect(platform.login()).rejects.toBe(other);
  });
});
