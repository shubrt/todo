import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
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
      className="sheet"
      aria-label={title}
      onCancel={onClose}
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
