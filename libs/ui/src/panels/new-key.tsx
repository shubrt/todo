import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { useMutation } from "convex/react";
import { Check, ClipboardCheck, Copy, LogIn, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlatform } from "../connection";
import { platformErrorMessage } from "../errors";
import type { CreatedIntegrationKey } from "../platform";
import { useApp } from "../store";
import { Panel, type PanelItem } from "./panel";

type Step =
  | { type: "name" }
  | { type: "waiting" }
  | { type: "created"; key: CreatedIntegrationKey; copied: boolean };

const icon = 15;

/**
 * Neuer Integrationsschlüssel: a name, a fresh Shoo login in the browser, then the key exactly
 * once with Kopieren. The key lives only in this panel; esc or Fertig drops it. Leaving while
 * the browser is open cancels the login, and a key that still arrives is revoked.
 */
export function NewKeyPanel() {
  const { platform } = usePlatform();
  const revoke = useMutation(api.auth.revokeApiKey);
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>({ type: "name" });
  // Bumped on unmount, so a late result is recognized.
  const attempt = useRef(0);
  const waiting = useRef(false);
  useEffect(
    () => () => {
      attempt.current++;
      if (waiting.current) void platform.cancelLogin();
    },
    [platform],
  );

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || waiting.current || !platform.createIntegrationKey) return;
    const current = ++attempt.current;
    waiting.current = true;
    setStep({ type: "waiting" });
    try {
      const key = await platform.createIntegrationKey(trimmed);
      if (current !== attempt.current) {
        // Cancelled after the browser came back: nobody saw this key, so it must not stay active.
        void revoke({ id: key.id as Id<"apiKeys"> }).catch(() => {});
        return;
      }
      setStep({ type: "created", key, copied: false });
    } catch (cause) {
      if (current !== attempt.current) return;
      useApp
        .getState()
        .showError(platformErrorMessage(cause, "Der Schlüssel konnte nicht erstellt werden."));
      setStep({ type: "name" });
    } finally {
      if (current === attempt.current) waiting.current = false;
    }
  }

  async function copy(created: CreatedIntegrationKey) {
    if (!platform.copyText) return;
    try {
      await platform.copyText(created.key);
      setStep({ type: "created", key: created, copied: true });
    } catch {
      useApp.getState().showError("Der Schlüssel konnte nicht kopiert werden.");
    }
  }

  let items: PanelItem[];
  let hint: ReactNode;
  if (step.type === "name") {
    items = [
      {
        id: "confirm",
        icon: <LogIn size={icon} />,
        label: "Mit Shoo bestätigen",
        keys: "enter",
        dim: !name.trim(),
        run: name.trim() ? () => void create() : undefined,
      },
    ];
    hint = "Zum Erstellen meldest du dich erneut im Browser an.";
  } else if (step.type === "waiting") {
    items = [
      { id: "waiting", icon: <LogIn size={icon} />, label: "Warte auf den Browser …", info: true },
      // Like esc: leaving the panel cancels the login (see the effect above).
      {
        id: "cancel",
        icon: <X size={icon} />,
        label: "Abbrechen",
        keys: "escape",
        run: () => useApp.getState().closePanel(),
      },
    ];
  } else {
    const { key, copied } = step;
    items = [
      {
        id: "copy",
        icon: copied ? <ClipboardCheck size={icon} /> : <Copy size={icon} />,
        label: copied ? "Kopiert" : "Kopieren",
        keys: "mod+c",
        run: () => void copy(key),
      },
      {
        id: "done",
        icon: <Check size={icon} />,
        label: "Fertig",
        keys: "escape",
        run: () => useApp.getState().closePanel(),
      },
    ];
    hint = (
      <>
        <code className="secret">{key.key}</code>
        Kopiere den Schlüssel jetzt. Er wird nicht noch einmal angezeigt.
      </>
    );
  }

  return (
    <Panel
      crumb="Neuer Schlüssel"
      placeholder="Name, z. B. task-capture"
      typing
      // The name stays visible while waiting and afterwards, but only the first step edits it.
      query={name}
      onQueryChange={(next) => {
        if (step.type === "name") setName(next.slice(0, 80));
      }}
      filter={false}
      sections={[{ id: step.type, items }]}
      hint={hint}
    />
  );
}
