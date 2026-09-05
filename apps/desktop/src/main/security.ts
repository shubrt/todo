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

export function validateConnectionInput(value: unknown): string {
  if (typeof value !== "string" || value.length < 5 || value.length > 8192)
    throw new Error("Die Verbindungsdaten sind ungültig.");
  return value;
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
