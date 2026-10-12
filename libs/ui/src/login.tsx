import { Check, CircleAlert, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlatform } from "./connection";
import { platformErrorMessage } from "./errors";
import { useApp } from "./store";
import { Keycaps } from "./ui";

/**
 * ↵ and esc for a prompt screen. Listens in the capture phase so it runs before the global
 * Escape (hide window); stays out of the way while a panel is open.
 */
function usePromptKeys(keys: { enter?: () => void; escape?: () => void }) {
  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || useApp.getState().panels.length) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const run =
        event.key === "Enter"
          ? latest.current.enter
          : event.key === "Escape"
            ? latest.current.escape
            : undefined;
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

function Prompt({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="login">
      <span className="big">{icon}</span>
      {children}
    </div>
  );
}

/**
 * Sign-in with Shoo in the browser (no stored connection, or the device key was rejected).
 * ↵ starts it, esc cancels the wait. `onConnected` runs once this device holds a device key.
 */
export function LoginView({ onConnected }: { onConnected: () => void }) {
  const { platform, state, update } = usePlatform();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  async function login() {
    if (pending) return;
    cancelled.current = false;
    setPending(true);
    setError(null);
    try {
      update(await platform.login());
      onConnected();
    } catch (cause) {
      if (!cancelled.current)
        setError(
          platformErrorMessage(cause, "Die Anmeldung ist fehlgeschlagen. Versuche es erneut."),
        );
    } finally {
      setPending(false);
    }
  }
  function cancel() {
    cancelled.current = true;
    void platform.cancelLogin();
  }
  usePromptKeys({
    enter: pending ? undefined : () => void login(),
    escape: pending ? cancel : undefined,
  });
  const message = error ?? state?.error;
  const mac = platform.kind === "mac";
  return (
    <Prompt icon={<Check size={34} />}>
      <p>{mac ? "Melde dich im Browser mit Shoo an." : "Melde dich mit Shoo an."}</p>
      {pending ? (
        <button className="act" onClick={cancel}>
          Warte auf den Browser …
        </button>
      ) : (
        <button className="act" onClick={() => void login()}>
          Mit Shoo anmelden
          <Keycaps combo="enter" />
        </button>
      )}
      <small>
        {pending
          ? "esc bricht ab"
          : mac
            ? "Dein Geräteschlüssel liegt verschlüsselt im Schlüsselbund."
            : "Dein Geräteschlüssel bleibt auf diesem Gerät."}
      </small>
      {message && (
        <p className="err" role="alert">
          {message}
        </p>
      )}
    </Prompt>
  );
}

/** Signed in, but the backend is unreachable: ↵ retries with a new client. */
export function OfflineView({ onRetry, onLogin }: { onRetry: () => void; onLogin: () => void }) {
  usePromptKeys({ enter: onRetry });
  return (
    <Prompt icon={<WifiOff size={34} />}>
      <p>Deine Aufgaben sind gerade nicht erreichbar.</p>
      <button className="act" onClick={onRetry}>
        Erneut verbinden
        <Keycaps combo="enter" />
      </button>
      <button className="link" onClick={onLogin}>
        Neu anmelden
      </button>
    </Prompt>
  );
}

/** Signed in, but lists.bootstrap failed: the reason and ↵ to try again. */
export function LoadFailedView({ message, onRetry }: { message: string; onRetry: () => void }) {
  usePromptKeys({ enter: onRetry });
  return (
    <Prompt icon={<CircleAlert size={34} />}>
      <p>{message}</p>
      <button className="act" onClick={onRetry}>
        Erneut versuchen
        <Keycaps combo="enter" />
      </button>
    </Prompt>
  );
}

/** The window could not reach its shell (the main process on the Mac). */
export function PlatformErrorView({ message }: { message: string }) {
  return (
    <div className="login">
      <p className="err" role="alert">
        {message}
      </p>
    </div>
  );
}
