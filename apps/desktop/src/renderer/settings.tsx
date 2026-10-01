import { api } from "@todo/backend/api";
import { useQuery } from "convex/react";
import { ChevronDown, LogIn, LogOut, Pin, Radio, SlidersHorizontal } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { DesktopPreferences } from "../shared/contracts";
import { AccountTab } from "./account";
import { KeysTab } from "./keys";
import { usePlatform } from "./platform";
import { Dialog, ipcErrorMessage } from "./ui";

// Login view: the main process opens Shoo in the browser and waits for its callback.
export function ConnectionForm({ onConnected }: { onConnected?: () => void }) {
  const platform = usePlatform();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  async function login() {
    if (pending) return;
    cancelled.current = false;
    setPending(true);
    setError(null);
    try {
      platform.update(await window.desktop.login());
      onConnected?.();
    } catch (cause) {
      if (!cancelled.current)
        setError(ipcErrorMessage(cause, "Die Anmeldung ist fehlgeschlagen. Versuche es erneut."));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="connection-form">
      <div className="connect-symbol">
        <LogIn size={21} />
      </div>
      <h1>
        Deine Aufgaben.
        <br />
        Immer in Reichweite.
      </h1>
      <p>Die Anmeldung öffnet sich in deinem Browser.</p>
      {(error || platform.state?.error) && (
        <p className="error-text" role="alert">
          {error ?? platform.state?.error}
        </p>
      )}
      <button className="button primary" disabled={pending} onClick={() => void login()}>
        {pending ? "Warte auf die Anmeldung im Browser …" : "Mit Shoo anmelden"}
      </button>
      {pending && (
        <button
          className="text-button"
          onClick={() => {
            cancelled.current = true;
            void window.desktop.cancelLogin();
          }}
        >
          Abbrechen
        </button>
      )}
      <small>Der Geräteschlüssel wird verschlüsselt auf diesem Mac gespeichert.</small>
    </div>
  );
}

const tabs = [
  { id: "window", label: "Fenster" },
  { id: "account", label: "Konto" },
  { id: "keys", label: "Schlüssel" },
] as const;
type Tab = (typeof tabs)[number]["id"];
const tabMoves: Record<string, (index: number) => number> = {
  ArrowLeft: (index) => index - 1,
  ArrowRight: (index) => index + 1,
  Home: () => 0,
  End: () => tabs.length - 1,
};

// Settings sheet of the connected workspace: window preferences, the synced Konto values and
// the API keys. Needs the Convex client and the workspace's task actions.
export function Settings({ onClose }: { onClose: () => void }) {
  const keys = useQuery(api.auth.listApiKeys, {});
  const [tab, setTab] = useState<Tab>("window");
  // Id of the integration key created in this sheet, marked "neu" in the list.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const id = useId();
  function moveTab(event: KeyboardEvent, index: number) {
    const move = tabMoves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = tabs[(move(index) + tabs.length) % tabs.length]!;
    setTab(next.id);
    document.getElementById(`${id}-${next.id}`)?.focus();
  }
  return (
    <Dialog title="Einstellungen" className="top" onClose={onClose}>
      <div className="settings-tabs" role="tablist" aria-label="Einstellungen">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`${id}-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`${id}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {item.label}
            {item.id === "keys" && keys && <span className="badge">{keys.length}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === "window" ? (
          <div className="window-settings">
            <WindowPreferences />
            <ShortcutHelp />
            <DoneButton onClose={onClose} />
          </div>
        ) : tab === "account" ? (
          <div className="window-settings">
            <AccountTab />
            <ConnectionDetails onClose={onClose} />
          </div>
        ) : (
          <KeysTab keys={keys} fresh={freshKey} onCreated={setFreshKey} />
        )}
      </div>
    </Dialog>
  );
}

// Settings sheet before sign-in or when it fails (login, loading, "Noch keine Verbindung."):
// window preferences only. A network drop keeps the full sheet with writes locked.
export function WindowSettings({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Einstellungen" className="top" onClose={onClose}>
      <div className="window-settings">
        <WindowPreferences />
        <ConnectionDetails onClose={onClose} />
        <ShortcutHelp />
        <DoneButton onClose={onClose} />
      </div>
    </Dialog>
  );
}

// Preferences of this Mac's window, stored by the main process.
function WindowPreferences() {
  const { state, update } = usePlatform();
  const [shortcut, setShortcut] = useState(
    state?.preferences.shortcut ?? "CommandOrControl+Shift+Space",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(patch: Partial<DesktopPreferences>) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      update(await window.desktop.setPreferences(patch));
    } catch {
      setError(
        "Die Einstellung konnte nicht übernommen werden. Der Kurzbefehl könnte belegt sein. Autostart benötigt die installierte App.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <label className="switch-field">
        <span>
          <Pin size={16} />
          Immer im Vordergrund
        </span>
        <input
          type="checkbox"
          checked={state?.preferences.alwaysOnTop ?? true}
          disabled={pending}
          onChange={(event) => void save({ alwaysOnTop: event.target.checked })}
        />
      </label>
      <label className="switch-field">
        <span>
          <Radio size={16} />
          Auf allen Schreibtischen
        </span>
        <input
          type="checkbox"
          checked={state?.preferences.allSpaces ?? true}
          disabled={pending}
          onChange={(event) => void save({ allSpaces: event.target.checked })}
        />
      </label>
      <p className="hint">
        Auch über Apps im Vollbild sichtbar. Das Fenster bleibt beim Wechsel zu einer anderen App
        stehen.
      </p>
      <label className="switch-field">
        <span>Bei Anmeldung starten</span>
        <input
          type="checkbox"
          checked={state?.preferences.launchAtLogin ?? false}
          disabled={pending}
          onChange={(event) => void save({ launchAtLogin: event.target.checked })}
        />
      </label>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save({ shortcut });
        }}
      >
        <label className="field">
          <span>Globaler Kurzbefehl</span>
          <input
            value={shortcut}
            onChange={(event) => setShortcut(event.target.value)}
            maxLength={80}
            spellCheck={false}
          />
        </label>
        <button
          className="button secondary"
          disabled={pending || shortcut === state?.preferences.shortcut}
        >
          Kurzbefehl speichern
        </button>
      </form>
      <label className="field">
        <span>
          <SlidersHorizontal size={14} />
          Fensterfarbe
        </span>
        <select
          value={state?.preferences.tint ?? "graphite"}
          disabled={pending}
          onChange={(event) =>
            void save({ tint: event.target.value as DesktopPreferences["tint"] })
          }
        >
          <option value="graphite">Graphit</option>
          <option value="plum">Pflaume</option>
          <option value="forest">Wald</option>
        </select>
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

// Connection status. "Verbindung entfernen" revokes this Mac's device key and logs out.
function ConnectionDetails({ onClose }: { onClose: () => void }) {
  const { state, update } = usePlatform();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state?.configured) return null;
  return (
    <div className="connection-details">
      <span>
        <span className="status-dot" />
        Verbunden
      </span>
      <code>{state.siteUrl}</code>
      {confirm ? (
        <>
          <p className="hint">
            Abmelden und den Geräteschlüssel dieses Macs widerrufen? Deine Aufgaben bleiben
            erhalten.
          </p>
          <div className="button-row">
            <button
              className="button danger"
              disabled={pending}
              onClick={() => {
                setPending(true);
                setError(null);
                void window.desktop
                  .disconnect()
                  .then((next) => {
                    update(next);
                    onClose();
                  })
                  .catch((cause: unknown) => {
                    setError(
                      ipcErrorMessage(cause, "Die Verbindung konnte nicht entfernt werden."),
                    );
                    setPending(false);
                  });
              }}
            >
              Verbindung entfernen
            </button>
            <button className="button secondary" onClick={() => setConfirm(false)}>
              Behalten
            </button>
          </div>
        </>
      ) : (
        <button className="text-button" onClick={() => setConfirm(true)}>
          <LogOut size={13} />
          Verbindung entfernen
        </button>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ShortcutHelp() {
  return (
    <div className="shortcut-help">
      <span>
        <kbd>⌘ 1–5</kbd>Bereich wechseln
      </span>
      <span>
        <kbd>⌘ N</kbd>Neue Aufgabe
      </span>
      <span>
        <kbd>⌘ ↵</kbd>Aufgabe erledigen
      </span>
      <span>
        <kbd>⌥ ↑ ↓</kbd>Aufgabe verschieben
      </span>
      <span>
        <kbd>Esc</kbd>Fenster ausblenden
      </span>
    </div>
  );
}

function DoneButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="button secondary" onClick={onClose}>
      Fertig <ChevronDown size={14} />
    </button>
  );
}
