import { api } from "@todo/backend/api";
import type { Doc } from "@todo/backend/dataModel";
import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Minus,
  Pin,
  Plus,
  Settings2,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { DesktopView } from "../shared/contracts";
import { ConnectedProvider, PlatformProvider, usePlatform } from "./platform";
import { ConnectionForm, WindowSettings } from "./settings";
import { TaskContext, useTasks, type Area, type Task } from "./task-context";
import { TaskSection } from "./task-list";
import { TaskDetail } from "./task-detail";
import { dayLabel, safeError } from "./ui";

const views: { id: DesktopView; label: string; symbol: string }[] = [
  { id: "priority", label: "Priorität", symbol: "✦" },
  { id: "me", label: "me", symbol: "◌" },
  { id: "agency", label: "agency", symbol: "❋" },
  { id: "work", label: "work", symbol: "▧" },
  { id: "habits", label: "Habits", symbol: "↻" },
  { id: "history", label: "Verlauf", symbol: "◷" },
];

export function DesktopApp() {
  return (
    <PlatformProvider>
      <AppFrame />
    </PlatformProvider>
  );
}

function AppFrame() {
  const { state, error } = usePlatform();
  const [view, setView] = useState<DesktopView>("priority");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    const stop = window.desktop?.onNavigate((next) => {
      setView(next);
      setSettingsOpen(false);
    });
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if ((event.metaKey || event.ctrlKey) && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        setView(views[Number(event.key) - 1]!.id);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
      if (
        event.key === "Escape" ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w")
      ) {
        event.preventDefault();
        void window.desktop?.hide();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      stop?.();
      document.removeEventListener("keydown", keyboard);
    };
  }, []);
  const selected = views.find((item) => item.id === view)!;
  return (
    <div className={`note-window tint-${state?.preferences.tint ?? "graphite"}`}>
      <header className="titlebar">
        <button
          className="icon hide-window"
          title="Fenster ausblenden · Esc"
          aria-label="Fenster ausblenden"
          onClick={() => void window.desktop?.hide()}
        >
          <Minus size={15} />
        </button>
        <span className="window-title">
          {selected.symbol} <span>{selected.label}</span>
        </span>
        <div className="titlebar-actions">
          <button
            className={`icon ${state?.preferences.alwaysOnTop ? "pinned" : ""}`}
            title={
              state?.preferences.alwaysOnTop ? "Immer im Vordergrund" : "Vordergrund aktivieren"
            }
            aria-label="Immer im Vordergrund umschalten"
            onClick={() => {
              if (state)
                void window.desktop.setPreferences({ alwaysOnTop: !state.preferences.alwaysOnTop });
            }}
          >
            <Pin size={12} />
          </button>
          <button
            className="icon"
            title="Fenstereinstellungen · ⌘,"
            aria-label="Fenstereinstellungen"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={14} />
          </button>
        </div>
      </header>
      <div className="note-content">
        {error ? (
          <div className="connection-form">
            <h1>Das Fenster braucht einen neuen Anlauf.</h1>
            <p>{error}</p>
          </div>
        ) : !state ? (
          <div className="loading">
            <LoaderCircle size={18} className="spin" />
            Wird geöffnet …
          </div>
        ) : !state.configured || !state.cloudUrl || connecting ? (
          <ConnectionForm
            onConnected={() => {
              setConnecting(false);
              setRetry((value) => value + 1);
            }}
          />
        ) : (
          <ConnectedProvider key={`${state.cloudUrl}-${retry}`} cloudUrl={state.cloudUrl}>
            <Authenticated
              view={view}
              setView={setView}
              reconnect={() => setRetry((value) => value + 1)}
              connect={() => setConnecting(true)}
            />
          </ConnectedProvider>
        )}
      </div>
      {settingsOpen && <WindowSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function Authenticated({
  view,
  setView,
  reconnect,
  connect,
}: {
  view: DesktopView;
  setView: (view: DesktopView) => void;
  reconnect: () => void;
  connect: () => void;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const platform = usePlatform();
  if (isLoading)
    return (
      <div className="loading">
        <LoaderCircle size={18} className="spin" />
        Aufgaben werden verbunden …
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="connection-form">
        <div className="connect-symbol">
          <WifiOff size={22} />
        </div>
        <h1>Noch keine Verbindung.</h1>
        <p>{platform.state?.error ?? "Deine Aufgaben sind gerade nicht erreichbar."}</p>
        <button className="button primary" onClick={reconnect}>
          Erneut verbinden
        </button>
        <button className="text-button" onClick={connect}>
          Neuen Geräteschlüssel verwenden
        </button>
      </div>
    );
  return <Workspace view={view} setView={setView} />;
}

function Workspace({ view, setView }: { view: DesktopView; setView: (view: DesktopView) => void }) {
  const connected = useConvexConnectionState().isWebSocketConnected;
  const settings = useQuery(api.settings.get, {});
  const summary = useQuery(api.tasks.summary, {});
  const isArea = view === "me" || view === "agency" || view === "work";
  const tasks = useQuery(
    api.tasks.list,
    view === "history" ? "skip" : isArea ? { view: "area", area: view } : { view },
  );
  const deferred = useQuery(api.tasks.deferred, isArea ? { area: view } : "skip");
  const complete = useMutation(api.tasks.complete);
  const reorder = useMutation(api.tasks.reorder);
  const create = useMutation(api.tasks.create);
  const createRecurrence = useMutation(api.recurrences.create);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [pending, setPending] = useState(new Set<string>());
  const pendingRef = useRef(new Set<string>());
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [title, setTitle] = useState("");
  const [isAi, setAi] = useState(false);
  const [captureArea, setCaptureArea] = useState<Area>("me");
  const input = useRef<HTMLInputElement>(null);
  const focusedTask = useRef<{ task: Task; siblings: Task[] } | null>(null);
  const selected = views.find((item) => item.id === view)!;
  useEffect(() => {
    setCaptureArea(isArea ? (view as Area) : (settings?.defaultArea ?? "me"));
  }, [view, isArea, settings?.defaultArea]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), message.error ? 9000 : 3000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "n" &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        if (view === "history") {
          setView(settings?.defaultArea ?? "me");
          setTimeout(() => input.current?.focus(), 0);
        } else input.current?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [view, setView, settings?.defaultArea]);
  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, success?: string) => {
      if (pendingRef.current.has(key)) return false;
      if (!connected) {
        setMessage({ text: "Warte kurz, bis die Verbindung wieder steht.", error: true });
        return false;
      }
      pendingRef.current.add(key);
      setPending(new Set(pendingRef.current));
      try {
        await action();
        if (success) setMessage({ text: success, error: false });
        return true;
      } catch (cause) {
        setMessage({ text: safeError(cause), error: true });
        return false;
      } finally {
        pendingRef.current.delete(key);
        setPending(new Set(pendingRef.current));
      }
    },
    [connected],
  );
  async function capture(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const saved = await run(
      "capture",
      () =>
        view === "habits"
          ? createRecurrence({ title: title.trim(), kind: "habit", rule: { frequency: "daily" } })
          : create({ title: title.trim(), area: captureArea, isAi }),
      view === "habits" ? "Habit hinzugefügt." : `In ${captureArea} festgehalten.`,
    );
    if (saved) {
      setTitle("");
      setAi(false);
      input.current?.focus();
    }
  }
  const actions = {
    connected,
    pending,
    run,
    edit: setSelectedTask,
    focus: (task: Task, siblings: Task[]) => {
      focusedTask.current = { task, siblings };
    },
    complete: (task: Task) => {
      void run(
        task._id,
        () =>
          complete({
            taskId: task._id,
            ...(task.occurrenceKey ? { occurrenceKey: task.occurrenceKey } : {}),
          }),
        "Erledigt.",
      );
    },
    reorder: (siblings: Task[], task: Task, direction: -1 | 1) => {
      const group = siblings.filter((item) => item.state === task.state);
      const index = group.findIndex((item) => item._id === task._id);
      if (index < 0 || index + direction < 0 || index + direction >= group.length) return;
      const taskIds = group.map((item) => item._id);
      [taskIds[index], taskIds[index + direction]] = [taskIds[index + direction]!, taskIds[index]!];
      void run(task._id, () =>
        reorder({
          taskIds,
          ...(task.parentId
            ? { parentId: task.parentId }
            : task.kind === "habit"
              ? { kind: "habit" as const }
              : { area: task.area, list: task.list, kind: "task" as const }),
        }),
      );
    },
  };
  const currentTask = selectedTask
    ? (tasks?.find((task) => task._id === selectedTask._id) ??
      deferred?.find((task) => task._id === selectedTask._id) ??
      selectedTask)
    : null;
  return (
    <TaskContext.Provider value={actions}>
      <div className="workspace">
        <div className="note-heading">
          <h1>
            <span className={`section-symbol ${view}`}>{selected.symbol}</span>
            {selected.label}
          </h1>
          <label className="view-picker">
            <select
              aria-label="Bereich wechseln"
              value={view}
              onChange={(event) => setView(event.target.value as DesktopView)}
            >
              {views.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {index < 5 ? ` · ⌘${index + 1}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
        {!connected && (
          <p className="network-message" role="status">
            <WifiOff size={13} />
            Verbindung wird wiederhergestellt …
          </p>
        )}
        {view === "history" ? (
          <HistoryView />
        ) : view === "habits" && settings && !settings.habitsInitialized ? (
          <HabitSetup />
        ) : (
          <>
            {tasks === undefined ? (
              <div className="loading">
                <LoaderCircle size={17} className="spin" />
                Aufgaben laden …
              </div>
            ) : isArea ? (
              <>
                <TaskSection title="Tasks" tasks={tasks.filter((task) => task.list === "active")}>
                  Was möchtest du als Nächstes angehen?
                </TaskSection>
                <TaskSection
                  title="Backlog"
                  tasks={tasks.filter((task) => task.list === "backlog")}
                >
                  Platz für Gedanken, die noch warten können.
                </TaskSection>
              </>
            ) : (
              <TaskSection
                title={view === "priority" ? "Das Wichtigste" : "Heute"}
                tasks={tasks}
                showArea={view === "priority"}
                sortable={view !== "priority"}
              >
                {view === "priority"
                  ? "Markiere wichtige Aufgaben mit einem Stern. Fällige Termine erscheinen hier ebenfalls."
                  : "Deine täglichen Habits erscheinen hier."}
              </TaskSection>
            )}
            {isArea && deferred && deferred.length > 0 && (
              <details className="deferred">
                <summary>
                  <Clock3 size={12} />
                  Für später<span>{deferred.filter((task) => !task.parentId).length}</span>
                  <ChevronDown size={12} />
                </summary>
                <TaskSection title="Eingeplant" tasks={deferred} sortable={false} />
              </details>
            )}
            <form className="quick-capture" onSubmit={(event) => void capture(event)}>
              <div>
                <Plus size={15} />
                <input
                  ref={input}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={view === "habits" ? "Habit hinzufügen …" : "Gedanken festhalten …"}
                  aria-label="Neue Aufgabe"
                  maxLength={500}
                  disabled={!connected || pending.has("capture")}
                  autoComplete="off"
                />
              </div>
              <div className="capture-bottom">
                {view !== "habits" && (
                  <>
                    <select
                      aria-label="Bereich der neuen Aufgabe"
                      value={captureArea}
                      onChange={(event) => setCaptureArea(event.target.value as Area)}
                      disabled={!connected}
                    >
                      <option>me</option>
                      <option>agency</option>
                      <option>work</option>
                    </select>
                    <button
                      type="button"
                      className={`capture-ai ${isAi ? "selected" : ""}`}
                      title="Mit KI bearbeitbar"
                      aria-pressed={isAi}
                      onClick={() => setAi(!isAi)}
                    >
                      <Sparkles size={12} />
                      KI
                    </button>
                  </>
                )}
                <button
                  className="capture-submit"
                  disabled={!title.trim() || !connected || pending.has("capture")}
                >
                  {pending.has("capture") ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : (
                    <>
                      <span>Hinzufügen</span>
                      <kbd>↵</kbd>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
      <footer className="note-footer">
        <span className={`footer-status ${!connected ? "offline" : ""}`}>
          <span className="status-dot" />
          {pending.size ? "Speichert …" : connected ? "Synchronisiert" : "Verbinde …"}
        </span>
        <span>
          <Check size={10} />
          {summary?.todayCompleted ?? 0} heute erledigt
        </span>
      </footer>
      {message && (
        <div
          className={`feedback ${message.error ? "error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </div>
      )}
      {currentTask && (
        <TaskDetail
          key={currentTask._id}
          task={currentTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </TaskContext.Provider>
  );
}

function HabitSetup() {
  const initialize = useMutation(api.settings.initializeHabits);
  const [titles, setTitles] = useState(["", "", "", "", ""]);
  const { run, pending, connected } = useTasks();
  return (
    <form
      className="habit-setup"
      onSubmit={(event) => {
        event.preventDefault();
        void run("habit-setup", () => initialize({ titles: titles.map((title) => title.trim()) }));
      }}
    >
      <h2>Was gehört zu deinem Tag?</h2>
      <p>Beginne mit fünf Habits. Du bestimmst, welche das sind.</p>
      {titles.map((title, index) => (
        <label className="habit-field" key={index}>
          <span>{index + 1}</span>
          <input
            aria-label={`Habit ${index + 1}`}
            placeholder={`Dein ${index + 1}. Habit`}
            value={title}
            onChange={(event) =>
              setTitles((values) =>
                values.map((value, current) => (current === index ? event.target.value : value)),
              )
            }
            required
            maxLength={500}
          />
        </label>
      ))}
      <button
        className="button primary"
        disabled={!connected || pending.has("habit-setup") || titles.some((title) => !title.trim())}
      >
        Habits einrichten
      </button>
    </form>
  );
}

function HistoryView() {
  const [cursor, setCursor] = useState<string | undefined>();
  const [previous, setPrevious] = useState<Doc<"completions">[]>([]);
  const result = useQuery(api.completions.list, { limit: 50, cursor });
  const items = [...previous, ...(result?.items ?? [])];
  let lastDay = "";
  return (
    <div className="history-list">
      {!result ? (
        <div className="loading">
          <LoaderCircle size={17} className="spin" />
          Verlauf laden …
        </div>
      ) : !items.length ? (
        <p className="empty-section">Dein Rückblick beginnt mit dem ersten Haken.</p>
      ) : (
        items.map((item) => {
          const heading = lastDay !== item.completedLocalDate;
          lastDay = item.completedLocalDate;
          return (
            <div key={item._id}>
              {heading && <h2 className="history-date">{dayLabel(item.completedLocalDate)}</h2>}
              <div className="history-item">
                <Check size={12} />
                <div>
                  <span>{item.titleSnapshot}</span>
                  <small>
                    {[
                      item.areaSnapshot ?? "Habits",
                      item.projectNameSnapshot,
                      item.parentTitleSnapshot,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
              </div>
            </div>
          );
        })
      )}
      {result?.nextCursor && (
        <button
          className="button secondary"
          onClick={() => {
            setPrevious(items);
            setCursor(result.nextCursor ?? undefined);
          }}
        >
          Weitere laden
        </button>
      )}
    </div>
  );
}
