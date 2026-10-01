import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

// Modal sheet. Escape, the close button and a click on the backdrop call onClose. Sheets can
// stack: Escape then closes only the topmost one.
export function Dialog({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** "top" pins the sheet to the top, for sheets whose height changes (tabs). */
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`sheet ${className}`}
      aria-label={title}
      onCancel={(event) => {
        // React also hands a nested sheet's cancel to its parents.
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet-content">
        <header className="sheet-heading">
          <h2>{title}</h2>
          <button className="icon" aria-label="Schließen" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function dayLabel(day: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(
    new Date(`${day}T12:00:00`),
  );
}
export function dateTimeInput(timestamp: number | undefined) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function safeError(
  cause: unknown,
  fallback = "Die Änderung konnte nicht gespeichert werden. Bitte versuche es erneut.",
) {
  const data = cause && typeof cause === "object" && "data" in cause ? cause.data : undefined;
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string")
    return data.message;
  return fallback;
}

// Electron prefixes errors thrown in IPC handlers; the rest is the main process's German message.
export function ipcErrorMessage(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : "";
  const match = /^Error invoking remote method '[^']*': (?:\w*Error: )?([\s\S]+)$/.exec(message);
  return match?.[1] ?? fallback;
}
