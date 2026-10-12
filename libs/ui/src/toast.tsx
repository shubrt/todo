import { CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { useApp } from "./store";

/** The error toast at the bottom (store.showError), gone after 6s or on click. */
export function Toast() {
  const toast = useApp((state) => state.toast);
  const dismiss = useApp((state) => state.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, 6000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);
  if (!toast) return null;
  return (
    <div className="toast" role="alert" onClick={dismiss}>
      <CircleAlert size={14} className="x" />
      {toast.message}
    </div>
  );
}
