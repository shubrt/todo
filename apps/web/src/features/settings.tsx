import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@todo/backend/api";
import { useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, LogOut, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useSessionAuth } from "../auth";
import { Modal, Spinner } from "../components/ui";
import { areas, useTaskActions, type Area } from "./task-context";
import { RecurrenceSettings } from "./recurrences";
import { deviceConnectionJson } from "./device-connection";

export function SettingsView() {
  const settings = useQuery(api.settings.get, {});
  if (!settings) return <Spinner />;
  return (
    <div className="settings-view">
      <Preferences
        defaultArea={settings.defaultArea}
        timeZone={settings.timeZone}
        key={`${settings.defaultArea}-${settings.timeZone}`}
      />
      <RecurrenceSettings />
      <ApiKeys />
      <Account />
    </div>
  );
}

function Preferences({ defaultArea, timeZone }: { defaultArea: Area; timeZone: string }) {
  const [area, setArea] = useState(defaultArea);
  const [zone, setZone] = useState(timeZone);
  const update = useMutation(api.settings.update);
  const actions = useTaskActions();
  function submit(event: FormEvent) {
    event.preventDefault();
    void actions.run(
      "preferences",
      () => update({ defaultArea: area, timeZone: zone }),
      "Einstellungen gespeichert.",
    );
  }
  return (
    <section className="settings-section">
      <h2>Dein Alltag</h2>
      <p>Wohin neue Gedanken gehen und wann dein Tag beginnt.</p>
      <form onSubmit={submit}>
        <div className="field-grid">
          <label className="field">
            <span>Standardbereich</span>
            <select value={area} onChange={(event) => setArea(event.target.value as Area)}>
              {areas.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
            <small>Für neue Aufgaben ohne eindeutige Zuordnung.</small>
          </label>
          <label className="field">
            <span>Zeitzone</span>
            <input
              list="timezones"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              required
            />
            <datalist id="timezones">
              {[
                "Europe/Berlin",
                "Europe/Vienna",
                "Europe/Zurich",
                "Europe/London",
                "America/New_York",
                "America/Los_Angeles",
                "Asia/Tokyo",
                "UTC",
              ].map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <small>Für Tageswechsel, Termine und deinen Verlauf.</small>
          </label>
        </div>
        <button
          className="button secondary"
          disabled={
            !actions.connected ||
            actions.pending.has("preferences") ||
            (area === defaultArea && zone === timeZone)
          }
        >
          Einstellungen speichern
        </button>
      </form>
    </section>
  );
}

function ApiKeys() {
  const keys = useQuery(api.auth.listApiKeys, {});
  const create = useAction(api.auth.createApiKey);
  const revoke = useMutation(api.auth.revokeApiKey);
  const actions = useTaskActions();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "connection" | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const deviceConnection = newKey
    ? deviceConnectionJson(import.meta.env.VITE_CONVEX_URL, newKey)
    : null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await actions.run("key-create", () => create({ name: name.trim() }));
    if (result) {
      setNewKey(result.key);
      setName("");
    }
  }
  return (
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>API-Schlüssel</h2>
          <p>Für deine Desktop-App, Habits auf dem Handy und eigene Eingänge.</p>
        </div>
        <button
          className="button secondary compact"
          onClick={() => {
            setCreateOpen(true);
            setNewKey(null);
            setCopied(null);
          }}
        >
          <Plus size={15} />
          Schlüssel
        </button>
      </div>
      {keys === undefined ? (
        <Spinner />
      ) : keys.length === 0 ? (
        <p className="settings-empty">Noch kein API-Schlüssel angelegt.</p>
      ) : (
        <div className="key-list">
          {keys.map((key) => (
            <div className={`key-item ${key.revokedAt ? "revoked" : ""}`} key={key._id}>
              <KeyRound size={18} />
              <div>
                <strong>{key.name}</strong>
                <small>
                  <code>{key.prefix}…</code> ·{" "}
                  {key.revokedAt
                    ? "Widerrufen"
                    : `Erstellt am ${new Intl.DateTimeFormat("de-DE").format(key.createdAt)}`}
                </small>
              </div>
              {!key.revokedAt &&
                (confirmRevoke === key._id ? (
                  <div className="button-row">
                    <button
                      className="button danger compact"
                      disabled={!actions.connected || actions.pending.has(key._id)}
                      onClick={() => {
                        void actions.run(
                          key._id,
                          async () => {
                            await revoke({ id: key._id });
                            setConfirmRevoke(null);
                          },
                          "Schlüssel widerrufen.",
                        );
                      }}
                    >
                      Widerrufen
                    </button>
                    <button className="text-button" onClick={() => setConfirmRevoke(null)}>
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    className="icon-button"
                    aria-label={`${key.name} widerrufen`}
                    onClick={() => setConfirmRevoke(key._id)}
                  >
                    <Trash2 size={16} />
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      {createOpen && (
        <Modal
          title={newKey ? "Dein neuer API-Schlüssel" : "API-Schlüssel erstellen"}
          onClose={() => {
            setCreateOpen(false);
            setNewKey(null);
          }}
        >
          {newKey ? (
            <div className="new-key">
              <div className="key-notice">
                <ShieldCheck size={20} />
                <p>Kopiere den Schlüssel jetzt. Er wird dir nur dieses eine Mal angezeigt.</p>
              </div>
              {deviceConnection && (
                <div className="device-connection">
                  <label className="field">
                    <span>Geräteverbindung</span>
                    <textarea
                      aria-label="Geräteverbindung"
                      value={deviceConnection}
                      readOnly
                      rows={5}
                      spellCheck={false}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <small>
                      Komplett kopieren und beim Verbinden in der Desktop- oder mobilen App
                      einfügen. Enthält den Schlüssel und die passende Backend-Adresse.
                    </small>
                  </label>
                  <button
                    className="button primary"
                    onClick={() => {
                      void actions.run("connection-copy", async () => {
                        await navigator.clipboard.writeText(deviceConnection);
                        setCopied("connection");
                      });
                    }}
                  >
                    {copied === "connection" ? <Check size={16} /> : <Copy size={16} />}
                    {copied === "connection"
                      ? "Geräteverbindung kopiert"
                      : "Geräteverbindung kopieren"}
                  </button>
                </div>
              )}
              <p className="field-hint">Einzelner API-Schlüssel für eigene Integrationen:</p>
              <code>{newKey}</code>
              <div className="form-footer">
                <button
                  className="button secondary"
                  onClick={() => {
                    setCreateOpen(false);
                    setNewKey(null);
                  }}
                >
                  Schließen
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    void actions.run("key-copy", async () => {
                      await navigator.clipboard.writeText(newKey);
                      setCopied("key");
                    });
                  }}
                >
                  {copied === "key" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "key" ? "Kopiert" : "Schlüssel kopieren"}
                </button>
              </div>
            </div>
          ) : (
            <form className="detail-form" onSubmit={(event) => void submit(event)}>
              <label className="field">
                <span>Name</span>
                <input
                  autoFocus
                  placeholder="Zum Beispiel Raycast auf dem MacBook"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <p className="field-hint">
                Ein Schlüssel erlaubt Zugriff auf deine Aufgaben und deinen Verlauf. Du kannst ihn
                hier jederzeit widerrufen.
              </p>
              <div className="form-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setCreateOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  className="button primary"
                  disabled={!name.trim() || !actions.connected || actions.pending.has("key-create")}
                >
                  Schlüssel erstellen
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}

function Account() {
  const { logout } = useSessionAuth();
  const actions = useTaskActions();
  return (
    <section className="settings-section account-section">
      <div>
        <h2>Anmeldung</h2>
        <p>Dein persönlicher Zugang über Shoo.</p>
      </div>
      <button
        className="button secondary"
        disabled={actions.pending.has("logout")}
        onClick={() => {
          void actions.run("logout", logout);
        }}
      >
        <LogOut size={15} />
        Abmelden
      </button>
    </section>
  );
}
