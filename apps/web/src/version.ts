/** Whether /version.json names another build than `current`; false when it can't be read. */
export async function hasNewVersion(current: string) {
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    const { version } = (await response.json()) as { version?: unknown };
    return typeof version === "string" && version !== current;
  } catch {
    return false;
  }
}

/**
 * Reloads into a newer deploy when the app comes back to the foreground with nothing open that
 * a reload would lose (`idle`). Otherwise it waits for the next time it comes back.
 */
export function watchVersion(current: string, idle: () => boolean) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !idle()) return;
    void hasNewVersion(current).then((newer) => {
      if (newer && idle()) location.reload();
    });
  });
}
