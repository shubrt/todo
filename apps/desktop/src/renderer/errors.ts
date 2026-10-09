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

/** Electron prefixes errors thrown in IPC handlers; the rest is the main process's German message. */
export function ipcErrorMessage(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : "";
  const match = /^Error invoking remote method '[^']*': (?:\w*Error: )?([\s\S]+)$/.exec(message);
  return match?.[1] ?? fallback;
}
