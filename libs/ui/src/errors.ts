import { PlatformError } from "./platform";

/** The German message of a ConvexError({ code, message }), else `fallback`. */
export function safeError(
  cause: unknown,
  fallback = "Die Änderung konnte nicht gespeichert werden. Bitte versuche es erneut.",
) {
  const data = cause && typeof cause === "object" && "data" in cause ? cause.data : undefined;
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string")
    return data.message;
  return fallback;
}

/** The message of a PlatformError (German, meant for the user), else `fallback`. */
export function platformErrorMessage(cause: unknown, fallback: string) {
  return cause instanceof PlatformError ? cause.message : fallback;
}
