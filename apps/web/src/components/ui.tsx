import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Spinner({ label = "Wird geladen …" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-body">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function CheckControl({
  done,
  pending,
  disabled,
  onClick,
  title,
}: {
  done: boolean;
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`check-control ${done ? "checked" : ""}`}
      role="checkbox"
      aria-checked={done}
      aria-label={title}
      disabled={disabled || pending || done}
      onClick={onClick}
    >
      {pending ? (
        <LoaderCircle size={13} className="spin" />
      ) : done ? (
        <Check size={13} strokeWidth={3} />
      ) : null}
    </button>
  );
}

export function formatDay(day: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("de-DE", options ?? { day: "numeric", month: "short" }).format(
    new Date(`${day}T12:00:00`),
  );
}

export function localDay(timeZone = "Europe/Berlin", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
