import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  Copy,
  KeyRound,
  Laptop,
  LoaderCircle,
  LogIn,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CreatedIntegrationKey } from "../shared/contracts";
import { useTasks } from "./task-context";
import { Dialog, ipcErrorMessage } from "./ui";

type ApiKey = FunctionReturnType<typeof api.auth.listApiKeys>[number];
// The backend refuses more active keys.
const keyLimit = 30;
const groups = [
  { kind: "device", label: "Geräte", Icon: Laptop },
  { kind: "integration", label: "Integrationen", Icon: Plug },
  { kind: null, label: "Ohne Typ", Icon: KeyRound },
] as const;

// Schlüssel tab: active keys by kind with revoke on hover or focus. This Mac's own key is only
// removed through "Verbindung entfernen". `fresh` is the key created here, marked "neu"; the
// settings sheet holds it so the mark survives tab switches until the sheet closes.
export function KeysTab({
  keys,
  fresh,
  onCreated,
}: {
  keys: ApiKey[] | undefined;
  fresh: string | null;
  onCreated: (id: string) => void;
}) {
  const revoke = useMutation(api.auth.revokeApiKey);
  const { run, pending, connected } = useTasks();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!keys) return <p className="empty-section">Schlüssel laden …</p>;
  return (
    <div className="key-list">
      {groups.map(({ kind, label, Icon }) => {
        const items = keys.filter((key) => key.kind === kind);
        if (!items.length) return null;
        return (
          <section key={label} className="key-group">
            <h3>
              {label}
              <span className="badge">{items.length}</span>
            </h3>
            {items.map((key) => (
              <div key={key.id} className="key-row">
                <Icon size={14} className="key-icon" />
                <div className="key-body">
                  <div className="key-name">
                    {key.name}
                    {key.id === fresh && <span className="key-new">neu</span>}
                  </div>
                  <div className="metadata">
                    <code>{key.prefix}</code>·<span>{createdLabel(key.createdAt)}</span>
                  </div>
                </div>
                {key.current ? (
                  <span className="key-here">Dieser Mac</span>
                ) : (
                  <button
                    className="icon"
                    title="Widerrufen"
                    aria-label={`${key.name} widerrufen`}
                    disabled={!connected || pending.has(key.id)}
                    onClick={() => {
                      setError(null);
                      void run(key.id, () => revoke({ id: key.id }), undefined, setError);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="button-row key-footer">
        <button
          className="button secondary"
          disabled={keys.length >= keyLimit}
          onClick={() => setCreating(true)}
        >
          <Plus size={14} />
          Neuer Integrationsschlüssel
        </button>
        <span>
          {keys.length} von {keyLimit} aktiv
        </span>
      </div>
      {creating && <NewKeyDialog onCreated={onCreated} onClose={() => setCreating(false)} />}
    </div>
  );
}

// "heute", "14. Sept.", or with the year for older keys.
function createdLabel(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "heute";
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

// New integration key: a name, a fresh Shoo login in the browser, then the key exactly once.
// The key lives only in this sheet's state; closing the sheet drops it.
function NewKeyDialog({
  onCreated,
  onClose,
}: {
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const revoke = useMutation(api.auth.revokeApiKey);
  const [name, setName] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [created, setCreated] = useState<CreatedIntegrationKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by Abbrechen and on close, so a late result is ignored.
  const attempt = useRef(0);
  const inFlight = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (created ? copyButton : waiting ? cancelButton : nameInput).current?.focus();
  }, [created, waiting]);
  useEffect(
    () => () => {
      attempt.current++;
      if (inFlight.current) void window.desktop.cancelLogin();
    },
    [],
  );
  async function confirm(event: FormEvent) {
    event.preventDefault();
    // Enter in the read-only name field would submit again while waiting.
    if (inFlight.current || !name.trim()) return;
    const current = ++attempt.current;
    inFlight.current = true;
    setWaiting(true);
    setError(null);
    try {
      const key = await window.desktop.createIntegrationKey(name.trim());
      if (current !== attempt.current) {
        // Cancelled after the browser came back: nobody saw this key, so it must not stay active.
        void revoke({ id: key.id as Id<"apiKeys"> }).catch(() => {});
        return;
      }
      onCreated(key.id);
      setCreated(key);
    } catch (cause) {
      if (current === attempt.current)
        setError(ipcErrorMessage(cause, "Der Schlüssel konnte nicht erstellt werden."));
    } finally {
      if (current === attempt.current) {
        inFlight.current = false;
        setWaiting(false);
      }
    }
  }
  function cancel() {
    attempt.current++;
    inFlight.current = false;
    setWaiting(false);
    void window.desktop.cancelLogin();
  }
  async function copy(key: string) {
    setError(null);
    try {
      await window.desktop.copyText(key);
      setCopied(true);
    } catch {
      setError("Der Schlüssel konnte nicht kopiert werden.");
    }
  }
  const errorText = error && (
    <p className="error-text" role="alert">
      {error}
    </p>
  );
  if (created)
    return (
      <Dialog title={created.name} onClose={onClose}>
        <div className="detail-form">
          <p className="key-once">
            Kopiere den Schlüssel jetzt. Er wird nicht noch einmal angezeigt.
          </p>
          <code className="key-secret">{created.key}</code>
          {errorText}
          <div className="button-row end">
            <button className="button secondary" onClick={onClose}>
              Fertig
            </button>
            <button
              ref={copyButton}
              className="button primary"
              onClick={() => void copy(created.key)}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        </div>
      </Dialog>
    );
  return (
    <Dialog title="Neuer Integrationsschlüssel" onClose={onClose}>
      <form className="detail-form" onSubmit={(event) => void confirm(event)}>
        <label className="field">
          <span>Name</span>
          <input
            ref={nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            readOnly={waiting}
            maxLength={80}
            placeholder="z. B. task-capture"
            autoComplete="off"
            spellCheck={false}
          />
          {!waiting && <small>Zum Erstellen meldest du dich erneut im Browser an.</small>}
        </label>
        {errorText}
        {waiting ? (
          <>
            <button type="button" className="button primary" disabled>
              <LoaderCircle size={14} />
              Warte auf die Anmeldung im Browser …
            </button>
            <button ref={cancelButton} type="button" className="text-button" onClick={cancel}>
              Abbrechen
            </button>
          </>
        ) : (
          <div className="button-row end">
            <button type="button" className="button secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button className="button primary" disabled={!name.trim()}>
              <LogIn size={14} />
              Mit Shoo bestätigen
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
