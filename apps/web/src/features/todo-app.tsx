import { api } from "@todo/backend/api";
import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  CircleCheck,
  Clock3,
  History,
  LayoutList,
  Menu,
  Plus,
  Repeat2,
  Settings2,
  Sparkles,
  Star,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSessionAuth } from "../auth";
import { backendConfigured } from "../providers";
import { localDay, Spinner } from "../components/ui";
import {
  areas,
  areaLabels,
  TaskActionsProvider,
  type Area,
  type Task,
  type View,
} from "./task-context";
import { TaskList } from "./task-list";
import { TaskDetail } from "./task-detail";
import { HabitSetup, RecurrenceModal } from "./recurrences";
import { HistoryView } from "./history";
import { SettingsView } from "./settings";

export function TodoApp() {
  const auth = useSessionAuth();
  if (auth.isLoading)
    return (
      <div className="welcome-loading">
        <Brand />
        <Spinner label="Dein Platz wird vorbereitet …" />
      </div>
    );
  if (!backendConfigured || !auth.configured || !auth.isAuthenticated) return <Welcome />;
  return <AuthenticatedApp />;
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="todo Startseite">
      <span className="brand-mark">
        <Check size={23} strokeWidth={3} />
      </span>
      <span>
        todo<span className="brand-period">.</span>
      </span>
    </a>
  );
}

function Welcome() {
  const auth = useSessionAuth();
  const [loginError, setLoginError] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("authError");
    const messages: Record<string, string> = {
      account_not_allowed:
        "Dieses Shoo-Konto hat keinen Zugang zu deinen Aufgaben. Bitte verwende das freigegebene Konto.",
      invalid_login: "Die Anmeldung ist abgelaufen oder ungültig. Bitte starte sie noch einmal.",
      login_failed: "Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
    };
    if (code && messages[code]) setLoginError(messages[code]);
  }, []);
  const configured = backendConfigured && auth.configured;
  return (
    <div className="welcome">
      <header className="welcome-header">
        <Brand />
        <span className="welcome-private">
          <span />
          Dein persönlicher Überblick
        </span>
      </header>
      <main className="welcome-main">
        <div className="welcome-copy">
          <span className="eyebrow">Ein Gedanke weniger im Kopf.</span>
          <h1>
            Platz für das
            <br />
            <span>Wesentliche.</span>
          </h1>
          <p>
            Was ansteht, was warten kann und was du geschafft hast. Deine Aufgaben an einem Ort, mit
            Raum für jeden Teil deines Alltags.
          </p>
          <div className="welcome-areas">
            <span>
              <UserRound size={15} />
              me
            </span>
            <span>
              <BriefcaseBusiness size={15} />
              agency
            </span>
            <span>
              <LayoutList size={15} />
              work
            </span>
          </div>
          {configured ? (
            <a className="button primary login-button" href="/api/auth/login">
              Mit Shoo anmelden <ArrowRight size={17} />
            </a>
          ) : (
            <div className="setup-notice">
              <span className="setup-notice-icon">
                <Settings2 size={20} />
              </span>
              <div>
                <strong>Bereit für deine Aufgaben.</strong>
                <p>
                  Der persönliche Zugang wird noch eingerichtet. Sobald die Verbindung steht, kannst
                  du dich hier mit Shoo anmelden.
                </p>
              </div>
            </div>
          )}
          {(auth.error || loginError) && (
            <div className="auth-error" role="alert">
              <p>
                {loginError ??
                  (configured
                    ? auth.error
                    : "Die Verbindung zu deinem persönlichen Zugang ist noch nicht verfügbar.")}
              </p>
              <button className="text-button" onClick={auth.retry}>
                Erneut prüfen <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-card">
            <div className="art-card-head">
              <span className="art-dot" />
              <span>Ein klarer nächster Schritt</span>
              <Sparkles size={16} />
            </div>
            <div className="art-heading">Alles an seinem Platz.</div>
            <div className="art-line complete">
              <span>
                <Check size={16} />
              </span>
              <i />
            </div>
            <div className="art-line">
              <span />
              <i />
            </div>
            <div className="art-line short">
              <span />
              <i />
            </div>
            <div className="art-card-footer">
              <span>Gedanken festhalten.</span>
              <span>Freiraum schaffen.</span>
            </div>
          </div>
          <div className="art-floating art-done">
            <CircleCheck size={20} />
            <span>Erledigt bleibt im Blick.</span>
          </div>
          <div className="art-floating art-focus">
            <Star size={17} fill="currentColor" />
            <span>Das Wichtigste zuerst.</span>
          </div>
          <span className="art-spark spark-one">+</span>
          <span className="art-spark spark-two">+</span>
        </div>
      </main>
      <footer className="welcome-footer">
        <span>Für deinen Alltag. In deinem Tempo.</span>
        <span>
          me <i /> agency <i /> work <i /> habits
        </span>
      </footer>
    </div>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const auth = useSessionAuth();
  if (isLoading)
    return (
      <div className="welcome-loading">
        <Brand />
        <Spinner label="Verbinde deine Aufgaben …" />
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="standalone">
        <Brand />
        <h1>Die Verbindung braucht einen neuen Anlauf.</h1>
        <p>
          {auth.error ?? "Deine Anmeldung konnte noch nicht mit den Aufgaben verbunden werden."}
        </p>
        <button className="button primary" onClick={() => window.location.reload()}>
          Erneut verbinden
        </button>
        <a className="text-button" href="/api/auth/login">
          Neu anmelden
        </a>
      </div>
    );
  return <Workspace />;
}

function Workspace() {
  const [view, setView] = useState<View>("priority");
  const [list, setList] = useState<"active" | "backlog">("active");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [pending, setPending] = useState(new Set<string>());
  const pendingRef = useRef(new Set<string>());
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const connection = useConvexConnectionState();
  const connected = connection.isWebSocketConnected;
  const settings = useQuery(api.settings.get, {});
  const areaView = areas.includes(view as Area);
  const tasks = useQuery(
    api.tasks.list,
    view === "history" || view === "settings"
      ? "skip"
      : view === "priority"
        ? { view: "priority" }
        : view === "habits"
          ? { view: "habits" }
          : { view: "area", area: view as Area, list },
  );
  const deferred = useQuery(api.tasks.deferred, areaView ? { area: view as Area } : "skip");
  const summary = useQuery(api.tasks.summary, {});
  const create = useMutation(api.tasks.create);
  const complete = useMutation(api.tasks.complete);
  const clearInbox = useMutation(api.tasks.clearInbox);
  const reorder = useMutation(api.tasks.reorder);
  const addSubtask = useMutation(api.tasks.addSubtask);
  const update = useMutation(api.tasks.update);
  const captureRef = useRef<HTMLInputElement>(null);
  const today = settings?.currentLocalDate ?? localDay();

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), toast.error ? 9000 : 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (view === "history" || view === "settings" || view === "habits") {
          setView(settings?.defaultArea ?? "me");
          setTimeout(() => captureRef.current?.focus(), 0);
        } else captureRef.current?.focus();
      }
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, settings?.defaultArea]);

  const run = useCallback(
    async <T,>(
      key: string,
      operation: () => Promise<T>,
      success?: string,
    ): Promise<T | undefined> => {
      if (pendingRef.current.has(key)) return undefined;
      if (!connected) {
        setToast({
          message: "Die Verbindung wird wiederhergestellt. Versuche es gleich noch einmal.",
          error: true,
        });
        return undefined;
      }
      pendingRef.current.add(key);
      setPending(new Set(pendingRef.current));
      try {
        const result = await operation();
        if (success) setToast({ message: success, error: false });
        return result;
      } catch (cause: unknown) {
        const data = cause && typeof cause === "object" && "data" in cause ? cause.data : undefined;
        const message =
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : "Die Änderung konnte nicht gespeichert werden. Bitte versuche es erneut.";
        setToast({ message, error: true });
        return undefined;
      } finally {
        pendingRef.current.delete(key);
        setPending(new Set(pendingRef.current));
      }
    },
    [connected],
  );

  function navigate(next: View) {
    setView(next);
    setList("active");
    setMobileOpen(false);
  }
  const parents = tasks?.filter((task) => !task.parentId) ?? [];
  const doneCount = parents.filter((task) => task.state === "done").length;
  const openCount = parents.length - doneCount;
  const names: Record<View, { title: string; intro: string }> = {
    priority: {
      title: "Das Wichtigste zuerst.",
      intro: "Was jetzt zählt. Über alle Bereiche hinweg.",
    },
    me: {
      title: "Zeit für mich.",
      intro: "Für deinen Alltag und alles, was dir persönlich wichtig ist.",
    },
    agency: { title: "Raum für deine Firma.", intro: "Deine Projekte. Deine nächsten Schritte." },
    work: { title: "Klarer Kopf für den Job.", intro: "Was du im Arbeitsalltag bewegen möchtest." },
    habits: {
      title: "Ein bisschen. Jeden Tag.",
      intro: "Deine täglichen Gewohnheiten, in deinem Tempo.",
    },
    history: {
      title: "Du hast etwas bewegt.",
      intro: "Dein Rückblick. Tag für Tag, Aufgabe für Aufgabe.",
    },
    settings: {
      title: "So passt es für dich.",
      intro: "Deine Standards, Wiederholungen und Verbindungen.",
    },
  };
  const actions = {
    connected,
    pending,
    run,
    complete: (task: Task) => {
      void run(
        task._id,
        () =>
          complete({
            taskId: task._id,
            ...(task.occurrenceKey ? { occurrenceKey: task.occurrenceKey } : {}),
          }),
        "Erledigt. Im Verlauf festgehalten.",
      );
    },
    clearInbox: (task: Task) => {
      void run(task._id, () => clearInbox({ taskId: task._id }), "Inbox-Markierung entfernt.");
    },
    edit: (task: Task) => setSelected(task),
    toggleAi: (task: Task) => {
      void run(task._id, () => update({ taskId: task._id, isAi: !task.isAi }));
    },
    togglePriority: (task: Task) => {
      void run(task._id, () => update({ taskId: task._id, highPriority: !task.highPriority }));
    },
    addSubtask: async (taskId: Task["_id"], title: string) =>
      Boolean(
        await run(
          taskId,
          async () => {
            await addSubtask({ taskId, title });
            return true;
          },
          "Unteraufgabe hinzugefügt.",
        ),
      ),
    reorder: (siblings: Task[], task: Task, direction: -1 | 1) => {
      const sortable = siblings.filter((item) => item.state === task.state);
      const index = sortable.findIndex((item) => item._id === task._id);
      if (index < 0 || index + direction < 0 || index + direction >= sortable.length) return;
      const ids = sortable.map((item) => item._id);
      [ids[index], ids[index + direction]] = [ids[index + direction]!, ids[index]!];
      void run(task._id, () =>
        reorder({
          taskIds: ids,
          ...(task.parentId
            ? { parentId: task.parentId }
            : task.kind === "habit"
              ? { kind: "habit" as const }
              : { kind: "task" as const, area: task.area, list: task.list }),
        }),
      );
    },
  };

  return (
    <TaskActionsProvider value={actions}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Zum Inhalt
        </a>
        {mobileOpen && (
          <button
            className="sidebar-backdrop"
            aria-label="Navigation schließen"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
          <div className="sidebar-brand">
            <Brand />
            <button
              className="icon-button mobile-only"
              aria-label="Navigation schließen"
              onClick={() => setMobileOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="workspace-label">
            <span className="workspace-avatar">
              <UserRound size={15} />
            </span>
            <div>
              Mein Überblick<small>Persönlicher Bereich</small>
            </div>
            <span className="workspace-dot" />
          </div>
          <nav aria-label="Hauptnavigation">
            <NavItem
              icon={<Star size={18} />}
              label="Priorität"
              selected={view === "priority"}
              onClick={() => navigate("priority")}
              count={summary?.priority}
            />
            <div className="nav-group-label">Meine Bereiche</div>
            <NavItem
              icon={<UserRound size={18} />}
              label="me"
              subtitle={areaLabels.me}
              selected={view === "me"}
              onClick={() => navigate("me")}
              count={summary?.me}
            />
            <NavItem
              icon={<BriefcaseBusiness size={18} />}
              label="agency"
              subtitle={areaLabels.agency}
              selected={view === "agency"}
              onClick={() => navigate("agency")}
              count={summary?.agency}
            />
            <NavItem
              icon={<LayoutList size={18} />}
              label="work"
              subtitle={areaLabels.work}
              selected={view === "work"}
              onClick={() => navigate("work")}
              count={summary?.work}
            />
            <div className="nav-divider" />
            <NavItem
              icon={<Repeat2 size={18} />}
              label="Habits"
              selected={view === "habits"}
              onClick={() => navigate("habits")}
              count={summary?.habits}
            />
            <NavItem
              icon={<History size={18} />}
              label="Verlauf"
              selected={view === "history"}
              onClick={() => navigate("history")}
            />
          </nav>
          <div className="sidebar-bottom">
            <div className="day-progress">
              <span className="progress-icon">
                <CheckCheck size={18} />
              </span>
              <div>
                <strong>{summary?.todayCompleted ?? 0} heute erledigt</strong>
                <span>Jeder Schritt zählt.</span>
              </div>
            </div>
            <NavItem
              icon={<Settings2 size={18} />}
              label="Einstellungen"
              selected={view === "settings"}
              onClick={() => navigate("settings")}
            />
            <div className={`connection-status ${connected ? "" : "disconnected"}`}>
              <span />
              {connected ? "Alles auf dem aktuellen Stand" : "Verbindung wird hergestellt …"}
            </div>
          </div>
        </aside>
        <div className="workspace-main">
          <header className="topbar">
            <div className="breadcrumbs">
              <button
                className="icon-button mobile-only"
                aria-label="Navigation öffnen"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} />
              </button>
              <span>Mein Überblick</span>
              <span className="breadcrumb-slash">/</span>
              <strong>
                {view === "priority"
                  ? "Priorität"
                  : view === "history"
                    ? "Verlauf"
                    : view === "settings"
                      ? "Einstellungen"
                      : view === "habits"
                        ? "Habits"
                        : view}
              </strong>
            </div>
            <div className="topbar-date">
              {new Intl.DateTimeFormat("de-DE", {
                weekday: "short",
                day: "numeric",
                month: "long",
                timeZone: settings?.timeZone ?? "Europe/Berlin",
              }).format(new Date())}
              <span className="topbar-avatar">
                <UserRound size={15} />
              </span>
            </div>
          </header>
          {!connected && (
            <div className="connection-banner" role="status">
              <WifiOff size={16} />
              Die Verbindung wird wiederhergestellt. Änderungen sind gleich wieder möglich.
            </div>
          )}
          <main id="main-content" className="main-content">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {view === "priority"
                    ? "Mit klarem Fokus"
                    : view === "habits"
                      ? "Deine tägliche Routine"
                      : view === "history"
                        ? "Was geschafft ist, bleibt"
                        : view === "settings"
                          ? "Dein persönlicher Platz"
                          : areaLabels[view]}
                </span>
                <h1>{names[view].title}</h1>
                <p>{names[view].intro}</p>
              </div>
              {view === "habits" && settings?.habitsInitialized && (
                <button className="button secondary" onClick={() => setRecurrenceOpen(true)}>
                  <Plus size={16} />
                  Habit hinzufügen
                </button>
              )}
            </div>
            {(view === "priority" || areaView) && (
              <Capture
                key={`capture-${settings?.defaultArea}`}
                inputRef={captureRef}
                defaultArea={areaView ? (view as Area) : (settings?.defaultArea ?? "me")}
                disabled={!connected || pending.has("capture")}
                onCreate={async (title, area, isAi) =>
                  Boolean(
                    await run(
                      "capture",
                      async () => {
                        await create({ title, area, isAi });
                        return true;
                      },
                      `In ${area} festgehalten.`,
                    ),
                  )
                }
              />
            )}
            {view === "history" ? (
              <HistoryView today={today} />
            ) : view === "settings" ? (
              <SettingsView />
            ) : view === "habits" && settings && !settings.habitsInitialized ? (
              <HabitSetup />
            ) : (
              <>
                <div className="list-toolbar">
                  {areaView ? (
                    <div className="list-tabs" role="tablist" aria-label="Aufgabenliste">
                      <button
                        role="tab"
                        aria-selected={list === "active"}
                        onClick={() => setList("active")}
                        className={list === "active" ? "active" : ""}
                      >
                        Aktiv{list === "active" && <span>{openCount}</span>}
                      </button>
                      <button
                        role="tab"
                        aria-selected={list === "backlog"}
                        onClick={() => setList("backlog")}
                        className={list === "backlog" ? "active" : ""}
                      >
                        Backlog{list === "backlog" && <span>{openCount}</span>}
                      </button>
                    </div>
                  ) : (
                    <h2>
                      {view === "priority" ? "Unbedingt anstehend" : "Heute"}
                      <span className="count-pill">
                        {view === "habits" ? `${doneCount}/${parents.length}` : openCount}
                      </span>
                    </h2>
                  )}
                  <span className="list-toolbar-hint">
                    {doneCount > 0 ? (
                      <>
                        <CircleCheck size={14} />
                        {doneCount} geschafft
                      </>
                    ) : (
                      <>
                        {view === "priority" ? <Star size={13} /> : <Circle size={12} />}
                        {view === "priority" ? "Alle drei Bereiche" : "Deine Reihenfolge"}
                      </>
                    )}
                  </span>
                </div>
                {view === "habits" && parents.length > 0 && (
                  <div className="habit-progress">
                    <div style={{ width: `${(doneCount / parents.length) * 100}%` }} />
                  </div>
                )}
                {tasks === undefined ? (
                  <Spinner label="Aufgaben werden geladen …" />
                ) : (
                  <TaskList
                    tasks={tasks}
                    showArea={view === "priority"}
                    sortable={view !== "priority"}
                    emptyTitle={
                      view === "priority"
                        ? "Gerade drängt sich nichts vor."
                        : view === "habits"
                          ? "Heute ist alles abgehakt."
                          : list === "backlog"
                            ? "Platz für später."
                            : "Ein freier Kopf beginnt hier."
                    }
                    emptyText={
                      view === "priority"
                        ? "Markiere eine Aufgabe mit dem Stern. Auch verbindliche Termine erscheinen hier, sobald sie anstehen."
                        : view === "habits"
                          ? "Deine Habits sind morgen wieder für dich da."
                          : list === "backlog"
                            ? "Verschiebe Aufgaben hierher, die gerade nicht anstehen."
                            : "Was möchtest du angehen? Halte deinen ersten Gedanken oben fest."
                    }
                  />
                )}
                {areaView && (
                  <div className="list-bottom">
                    <button className="text-button" onClick={() => setRecurrenceOpen(true)}>
                      <Repeat2 size={14} />
                      Wiederkehrende Aufgabe
                    </button>
                    <span>Umsortieren mit Alt + ↑ ↓</span>
                  </div>
                )}
                {areaView && deferred && deferred.length > 0 && (
                  <details className="deferred-section">
                    <summary>
                      <Clock3 size={16} />
                      Für später eingeplant
                      <span>{deferred.filter((task) => !task.parentId).length}</span>
                      <ChevronDown size={15} />
                    </summary>
                    <TaskList tasks={deferred} sortable={false} />
                  </details>
                )}
              </>
            )}
          </main>
          <footer className="workspace-footer">
            <span>Ein Schritt nach dem anderen.</span>
            <span>
              Neue Aufgabe <kbd>⌘ K</kbd>
            </span>
          </footer>
        </div>
        {selected && (
          <TaskDetail
            key={selected._id}
            task={
              tasks?.find((task) => task._id === selected._id) ??
              deferred?.find((task) => task._id === selected._id) ??
              selected
            }
            onClose={() => setSelected(null)}
          />
        )}
        {recurrenceOpen && (
          <RecurrenceModal
            kind={view === "habits" ? "habit" : "task"}
            defaultArea={areaView ? (view as Area) : (settings?.defaultArea ?? "me")}
            onClose={() => setRecurrenceOpen(false)}
          />
        )}
        {toast && (
          <div
            className={`toast ${toast.error ? "toast-error" : ""}`}
            role={toast.error ? "alert" : "status"}
          >
            {toast.error ? <WifiOff size={17} /> : <Check size={17} />}
            <span>{toast.message}</span>
            <button
              className="icon-button small"
              onClick={() => setToast(null)}
              aria-label="Meldung schließen"
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </TaskActionsProvider>
  );
}

function NavItem({
  icon,
  label,
  subtitle,
  selected,
  onClick,
  count,
}: {
  icon: ReactNode;
  label: string;
  subtitle?: string;
  selected: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      className={`nav-item ${selected ? "selected" : ""}`}
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
    >
      {icon}
      <span>
        {label}
        {subtitle && <small>{subtitle}</small>}
      </span>
      {typeof count === "number" && count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );
}

function Capture({
  defaultArea,
  disabled,
  onCreate,
  inputRef,
}: {
  defaultArea: Area;
  disabled: boolean;
  onCreate: (title: string, area: Area, isAi: boolean) => Promise<boolean>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState(defaultArea);
  const [isAi, setAi] = useState(false);
  useEffect(() => setArea(defaultArea), [defaultArea]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() && (await onCreate(title.trim(), area, isAi))) {
      setTitle("");
      setAi(false);
      inputRef.current?.focus();
    }
  }
  return (
    <form className="capture" onSubmit={(event) => void submit(event)}>
      <div className="capture-input">
        <Plus size={20} />
        <input
          ref={inputRef}
          aria-label="Neue Aufgabe"
          placeholder="Was geht dir durch den Kopf?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={disabled}
          maxLength={500}
          required
          autoComplete="off"
        />
      </div>
      <div className="capture-options">
        <label className="capture-area">
          <span className={`area-dot ${area}`} />
          <select
            aria-label="Bereich für neue Aufgabe"
            value={area}
            onChange={(event) => setArea(event.target.value as Area)}
            disabled={disabled}
          >
            {areas.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <ChevronDown size={12} />
        </label>
        <button
          type="button"
          className={`capture-ai ${isAi ? "selected" : ""}`}
          aria-label="Mit KI bearbeitbar"
          aria-pressed={isAi}
          disabled={disabled}
          onClick={() => setAi(!isAi)}
        >
          <Sparkles size={14} />
          <span>KI</span>
        </button>
        <button
          type="submit"
          className="capture-submit"
          disabled={disabled || !title.trim()}
          aria-label="Aufgabe erfassen"
        >
          <ArrowRight size={18} />
        </button>
      </div>
    </form>
  );
}
