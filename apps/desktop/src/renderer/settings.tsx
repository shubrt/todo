import {
  Check,
  ChevronDown,
  KeyRound,
  LoaderCircle,
  LogOut,
  Pin,
  Radio,
  SlidersHorizontal,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { DesktopPreferences } from "../shared/contracts";
import { usePlatform } from "./platform";
import { Dialog } from "./ui";

export function ConnectionForm({ onConnected }: { onConnected?: () => void }) {
  const platform = usePlatform();
  const [mode, setMode] = useState<"paste" | "manual">("paste");
  const [input, setInput] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const state = await window.desktop.connect(
        mode === "paste"
          ? input.trim()
          : JSON.stringify({ siteUrl: siteUrl.trim(), apiKey: apiKey.trim() }),
      );
      setInput("");
      setApiKey("");
      setSiteUrl("");
      platform.update(state);
      onConnected?.();
    } catch {
      setError(
        "Die Verbindung konnte nicht hergestellt werden. Prüfe die Verbindungsdaten und deine Internetverbindung.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="connection-form" onSubmit={(event) => void connect(event)}>
      <div className="connect-symbol">
        <KeyRound size={21} />
      </div>
      <h1>
        Deine Aufgaben.
        <br />
        Immer in Reichweite.
      </h1>
      <p>Erstelle in den Web-Einstellungen eine Geräteverbindung und füge sie hier ein.</p>
      <div className="form-tabs">
        <button
          type="button"
          className={mode === "paste" ? "selected" : ""}
          onClick={() => setMode("paste")}
        >
          Verbindung einfügen
        </button>
        <button
          type="button"
          className={mode === "manual" ? "selected" : ""}
          onClick={() => setMode("manual")}
        >
          URL & Schlüssel
        </button>
      </div>
      {mode === "paste" ? (
        <label className="field">
          <span>Verbindungsdaten</span>
          <textarea
            rows={3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Verbindungscode oder JSON …"
            spellCheck={false}
            autoComplete="off"
            maxLength={8192}
            required
          />
        </label>
      ) : (
        <>
          <label className="field">
            <span>Backend-URL</span>
            <input
              type="url"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://dein-projekt.convex.site"
              spellCheck={false}
              autoComplete="off"
              required
              maxLength={300}
            />
          </label>
          <label className="field">
            <span>Geräteschlüssel</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="todo_…"
              autoComplete="off"
              required
              maxLength={100}
            />
          </label>
        </>
      )}
      {(error || platform.state?.error) && (
        <p className="error-text" role="alert">
          {error ?? platform.state?.error}
        </p>
      )}
      <button
        className="button primary"
        disabled={pending || (mode === "paste" ? !input.trim() : !siteUrl.trim() || !apiKey.trim())}
      >
        {pending ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
        {pending ? "Verbindung wird geprüft …" : "Verbinden"}
      </button>
      <small>Dein Schlüssel wird verschlüsselt auf diesem Mac gespeichert.</small>
    </form>
  );
}

export function WindowSettings({ onClose }: { onClose: () => void }) {
  const { state, update } = usePlatform();
  const [shortcut, setShortcut] = useState(
    state?.preferences.shortcut ?? "CommandOrControl+Shift+Space",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnect, setDisconnect] = useState(false);
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
    <Dialog title="Dein schwebendes Fenster" onClose={onClose}>
      <div className="window-settings">
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
        {state?.configured && (
          <div className="connection-details">
            <span>
              <span className="status-dot" />
              Verbunden
            </span>
            <code>{state.siteUrl}</code>
            {disconnect ? (
              <>
                <p className="hint">
                  Den gespeicherten Schlüssel von diesem Mac entfernen? Deine Aufgaben bleiben
                  erhalten.
                </p>
                <div className="button-row">
                  <button
                    className="button danger"
                    disabled={pending}
                    onClick={() => {
                      setPending(true);
                      void window.desktop
                        .disconnect()
                        .then((next) => {
                          update(next);
                          onClose();
                        })
                        .catch(() => {
                          setError("Die Verbindung konnte nicht entfernt werden.");
                          setPending(false);
                        });
                    }}
                  >
                    Verbindung entfernen
                  </button>
                  <button className="button secondary" onClick={() => setDisconnect(false)}>
                    Behalten
                  </button>
                </div>
              </>
            ) : (
              <button className="text-button" onClick={() => setDisconnect(true)}>
                <LogOut size={13} />
                Verbindung entfernen
              </button>
            )}
          </div>
        )}
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
        <button className="button secondary" onClick={onClose}>
          Fertig <ChevronDown size={14} />
        </button>
      </div>
    </Dialog>
  );
}
