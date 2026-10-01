import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function isTrustedRenderer(url: string, rendererFile: string, devOrigin?: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    if (devOrigin) return parsed.origin === devOrigin && parsed.pathname === "/";
    return (
      parsed.protocol === "file:" &&
      !parsed.search &&
      resolve(fileURLToPath(parsed)) === resolve(rendererFile)
    );
  } catch {
    return false;
  }
}

export function validateTokenOptions(value: unknown): { forceRefreshToken: boolean } {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "forceRefreshToken") ||
    !("forceRefreshToken" in value) ||
    typeof value.forceRefreshToken !== "boolean"
  )
    throw new Error("Ungültige Tokenanfrage.");
  return { forceRefreshToken: value.forceRefreshToken };
}

/** Name for a new integration key: trimmed, 1 to 80 characters like the backend requires. */
export function validateKeyName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 80)
    throw new Error("Der Schlüsselname muss 1 bis 80 Zeichen lang sein.");
  return name;
}

/** Text for the clipboard, e.g. a new integration key. At most 4096 characters. */
export function validateClipboardText(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096)
    throw new Error("Dieser Text kann nicht kopiert werden.");
  return value;
}
