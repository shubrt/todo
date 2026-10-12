import { useConvexAuth } from "convex/react";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  favoritesOf,
  resolveList,
  Session,
  startList,
  syncLabels,
  useLists,
  useSettings,
  useSyncStatus,
  type List,
  type Settings,
  type SyncStatus,
} from "./data";
import { startNewTask, useGlobalKeys, useWorkspaceKeys } from "./keymap";
import { LoadFailedView, LoginView, OfflineView, PlatformErrorView } from "./login";
import { PanelHost } from "./panels";
import { ConnectedProvider, PlatformProvider, usePlatform, useTokenRejected } from "./connection";
import type { Platform } from "./platform";
import { selectedTask, useApp } from "./store";
import { TaskActionsProvider, useTaskActions } from "./task-actions";
import { Toast } from "./toast";
import { holdKeyboard, isTouch, longPress } from "./touch";
import { useTouchLayer } from "./touch-layer";
import { cx, ListMark } from "./ui";
import { HabitsView } from "./views/habits";
import { HistoryView } from "./views/history";
import { ImportantView } from "./views/important";
import { ListView } from "./views/list";
import { RecurrencesView } from "./views/recurrences";

/** The whole app on top of the shell's Platform; `renderApp` mounts it. */
export function App({ platform }: { platform: Platform }) {
  return (
    <PlatformProvider platform={platform}>
      <AppFrame />
    </PlatformProvider>
  );
}

/**
 * Connection state machine: platform error, opening (empty), login, then the Convex client.
 * `retry` replaces the client after a login or "Erneut verbinden". Until data arrives the
 * title bar stays empty, so the title changes once, straight to the list.
 */
function AppFrame() {
  const { state, error } = usePlatform();
  const [retry, setRetry] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const reconnect = () => setRetry((value) => value + 1);
  const app = useRef<HTMLDivElement>(null);
  useGlobalKeys();
  useTouchLayer(app);
  let content: ReactNode;
  if (error)
    content = (
      <Frame title="todo">
        <PlatformErrorView message={error} />
      </Frame>
    );
  else if (!state) content = <Frame />;
  else if (!state.configured || !state.cloudUrl || connecting)
    content = (
      <Frame title="todo">
        <LoginView
          onConnected={() => {
            setConnecting(false);
            reconnect();
          }}
        />
      </Frame>
    );
  else
    content = (
      <ConnectedProvider key={`${state.cloudUrl}-${retry}`} cloudUrl={state.cloudUrl}>
        <Authenticated reconnect={reconnect} login={() => setConnecting(true)} />
      </ConnectedProvider>
    );
  return (
    <div className="app" ref={app}>
      {content}
      <Toast />
    </div>
  );
}

/**
 * Title bar (drag region; room on the left for the native traffic lights), sidebar and
 * content. `account` lets the panel host open Convex-backed panels; on touch a tap on the
 * title then opens the list switcher, which ⌘P opens on the Mac.
 */
function Frame({
  title,
  status,
  sidebar,
  account = false,
  children,
}: {
  title?: ReactNode;
  status?: ReactNode;
  sidebar?: ReactNode;
  account?: boolean;
  children?: ReactNode;
}) {
  const variant = usePlatform().state?.variant;
  const switcher = account && Boolean(title) && isTouch();
  return (
    <>
      <header className="tb">
        <span
          className="ttl"
          role={switcher ? "button" : undefined}
          aria-label={switcher ? "Liste wechseln" : undefined}
          onClick={switcher ? () => useApp.getState().openPanel({ type: "switcher" }) : undefined}
        >
          {title}
          {variant && <span className="variant">{variant}</span>}
          {switcher && <ChevronDown size={12} />}
        </span>
        {status}
      </header>
      <div className="body">
        {sidebar}
        <main className="main">{children}</main>
      </div>
      <PanelHost account={account} />
    </>
  );
}

/**
 * Sync dot with its tooltip (on touch, a tap shows it for 2 s); `force` overrides the live
 * status (e.g. offline while signed out).
 */
function StatusDot({ force }: { force?: SyncStatus }) {
  const live = useSyncStatus();
  const status = force ?? live;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), 2000);
    return () => clearTimeout(timer);
  }, [shown]);
  return (
    <span
      className={cx("st", status, shown && "show")}
      role="status"
      aria-label={syncLabels[status]}
      onClick={isTouch() ? () => setShown(true) : undefined}
    >
      <i />
      <span className="sttip">{syncLabels[status]}</span>
    </span>
  );
}

function Authenticated({ reconnect, login }: { reconnect: () => void; login: () => void }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const rejected = useTokenRejected();
  if (isLoading) return <Frame status={<StatusDot />} />;
  if (!isAuthenticated)
    return (
      <Frame title="todo" status={<StatusDot force="off" />}>
        {/* A refused device key needs a new login (the shell explains why); anything
            else, like no network, may pass with a new client. */}
        {rejected ? (
          <LoginView onConnected={reconnect} />
        ) : (
          <OfflineView onRetry={reconnect} onLogin={login} />
        )}
      </Frame>
    );
  return (
    <Session
      loading={<Frame status={<StatusDot />} />}
      failed={(message, retry) => (
        <Frame title="todo" status={<StatusDot />}>
          <LoadFailedView message={message} onRetry={retry} />
        </Frame>
      )}
    >
      <TaskActionsProvider>
        <Workspace />
      </TaskActionsProvider>
    </Session>
  );
}

/** The signed-in window: sidebar, the open list's view and the workspace keymap. */
function Workspace() {
  const lists = useLists();
  const settings = useSettings();
  const actions = useTaskActions();
  const current = useApp((state) => state.current);
  const list = lists && resolveList(lists, current);
  useStartList(lists, settings);
  useWorkspaceKeys({ lists, list, settings });
  useInboxClear();
  return (
    <Frame
      title={
        list && (
          <>
            {list.emoji && <span className="emo">{list.emoji}</span>}
            <span className="nm">{list.name}</span>
          </>
        )
      }
      status={<StatusDot />}
      sidebar={lists && list && <Sidebar lists={lists} current={list} />}
      account
    >
      {list && (
        <div className="list" key={list._id} role="listbox" aria-label={list.name}>
          <ListContent list={list} />
        </div>
      )}
      {isTouch() && (
        <NewTaskButton onNew={() => startNewTask({ lists, list, settings, actions })} />
      )}
    </Frame>
  );
}

function ListContent({ list }: { list: List }) {
  switch (list.kind) {
    case "tasks":
      return <ListView list={list} />;
    case "habits":
      return <HabitsView list={list} />;
    case "important":
      return <ImportantView list={list} />;
    case "history":
      return <HistoryView list={list} />;
    case "recurrences":
      return <RecurrencesView list={list} />;
  }
}

/**
 * Opens the start list (see startList) once its data is loaded, unless a list was opened
 * before, e.g. from the tray. Until then the workspace looks as while loading. Only once per
 * launch or page load: a new session in the same window keeps its list.
 */
function useStartList(lists: List[] | undefined, settings: Settings | undefined) {
  useLayoutEffect(() => {
    if (useApp.getState().current) return;
    const start = startList(lists, settings);
    // Not open(): a panel opened meanwhile stays, and the first row still gets the selection.
    if (start) useApp.setState({ current: start });
  }, [lists, settings]);
}

/**
 * Selecting a task from the inbox clears its blue dot on the server. The automatic selection
 * when a list opens does not count, so the newest task keeps its dot until you select it.
 */
function useInboxClear() {
  const actions = useTaskActions();
  const taskId = useApp((state) => {
    const item = selectedTask(state);
    return item?.task.isInbox && !state.autoSelected ? item.id : undefined;
  });
  useEffect(() => {
    if (taskId) void actions.clearInbox(taskId);
  }, [taskId, actions]);
}

/**
 * Places the hovered item's tooltip next to it. Tooltips are fixed, so the scrolling favorites
 * do not clip them. Mac only: touch has no tooltips, and iOS sends a mouseenter before a tap.
 */
function placeTip(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--tip-x", `${rect.right + 10}px`);
  event.currentTarget.style.setProperty("--tip-y", `${rect.top + rect.height / 2}px`);
}

/**
 * Touch: the round "+" over the bottom right of the list, ⌘N's stand-in. Hidden while a title
 * is being edited (the keyboard is up) and while a panel is open. The new row mounts and its
 * field takes the focus inside the tap, or iOS would not open the keyboard. A list it switches
 * to may still be loading; then a hidden field holds the keyboard until the row is there.
 */
function NewTaskButton({ onNew }: { onNew: () => void }) {
  const hidden = useApp((state) => Boolean(state.editing) || state.panels.length > 0);
  if (hidden) return null;
  const tap = () => {
    flushSync(onNew);
    const creating = useApp.getState().editing?.type === "create";
    if (creating && !(document.activeElement instanceof HTMLInputElement)) holdKeyboard();
  };
  return (
    <button className="fab" aria-label="Neue Aufgabe" tabIndex={-1} onClick={tap}>
      <Plus size={24} />
    </button>
  );
}

/**
 * Favorites in order (⌘1..⌘9), the open list below a line when it is not a favorite, and the
 * settings button at the bottom. The lists scroll when the window is too short for them; the
 * settings button always stays visible.
 */
function Sidebar({ lists, current }: { lists: List[]; current: List }) {
  // Also while one of its pickers (Zeitzone, Standardliste, …) is on top.
  const settingsOpen = useApp((state) => state.panels.some((panel) => panel.type === "settings"));
  return (
    <nav className="side">
      <div className="favs">
        {favoritesOf(lists).map((list, index) => (
          <SidebarItem
            key={list._id}
            list={list}
            active={list._id === current._id}
            shortcut={index < 9 ? `⌘${index + 1}` : undefined}
          />
        ))}
        {!current.favorite && (
          <>
            <span className="sl" />
            <SidebarItem list={current} active />
          </>
        )}
      </div>
      <span className="grow" />
      <button
        className={cx("ri", "sm", settingsOpen && "on")}
        aria-label="Einstellungen"
        tabIndex={-1}
        onMouseEnter={isTouch() ? undefined : placeTip}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const state = useApp.getState();
          if (settingsOpen) state.closePanels();
          else state.openPanel({ type: "settings" });
        }}
      >
        <Settings2 size={15} />
        <span className="tip">
          Einstellungen<kbd>⌘,</kbd>
        </span>
      </button>
    </nav>
  );
}

/** A list in the rail: a tap opens it; on touch a long press opens its actions instead. */
function SidebarItem({
  list,
  active,
  shortcut,
}: {
  list: List;
  active: boolean;
  shortcut?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return (
    <button
      ref={ref}
      className={cx("ri", active && "on")}
      aria-label={list.name}
      aria-current={active}
      tabIndex={-1}
      onMouseEnter={isTouch() ? undefined : placeTip}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={longPress(() => {
        // In place of any open panel, in one change: the history stays one entry deep.
        useApp.setState({ panels: [{ type: "listActions", listId: list._id }] });
        return true;
      })}
      onClick={() => useApp.getState().open({ id: list._id })}
    >
      <ListMark list={list} />
      <span className="tip">
        {list.name}
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </button>
  );
}
