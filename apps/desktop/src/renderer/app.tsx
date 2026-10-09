import { useConvexAuth } from "convex/react";
import { Settings2 } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  favoritesOf,
  resolveList,
  Session,
  syncLabels,
  useLists,
  useSettings,
  useSyncStatus,
  type List,
  type SyncStatus,
} from "./data";
import { useGlobalKeys, useWorkspaceKeys } from "./keymap";
import { LoadFailedView, LoginView, OfflineView, PlatformError } from "./login";
import { PanelHost } from "./panels";
import { ConnectedProvider, PlatformProvider, usePlatform, useTokenRejected } from "./platform";
import { selectedTask, useApp } from "./store";
import { TaskActionsProvider, useTaskActions } from "./task-actions";
import { Toast } from "./toast";
import { cx, ListMark } from "./ui";
import { HabitsView } from "./views/habits";
import { HistoryView } from "./views/history";
import { ImportantView } from "./views/important";
import { ListView } from "./views/list";
import { RecurrencesView } from "./views/recurrences";

export function DesktopApp() {
  return (
    <PlatformProvider>
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
  useGlobalKeys();
  let content: ReactNode;
  if (error)
    content = (
      <Frame title="todo">
        <PlatformError message={error} />
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
    <div className="app">
      {content}
      <Toast />
    </div>
  );
}

/**
 * Title bar (drag region; room on the left for the native traffic lights), sidebar and
 * content. `account` lets the panel host open Convex-backed panels.
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
  return (
    <>
      <header className="tb">
        <span className="ttl">
          {title}
          {variant && <span className="variant">{variant}</span>}
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

/** Sync dot with its tooltip; `force` overrides the live status (e.g. offline while signed out). */
function StatusDot({ force }: { force?: SyncStatus }) {
  const live = useSyncStatus();
  const status = force ?? live;
  return (
    <span className={cx("st", status)} role="status" aria-label={syncLabels[status]}>
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
        {/* A refused device key needs a new login (the main process explains why); anything
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
  const current = useApp((state) => state.current);
  const list = lists && resolveList(lists, current);
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
      sidebar={lists && <Sidebar lists={lists} current={list} />}
      account
    >
      {list && (
        <div className="list" key={list._id} role="listbox" aria-label={list.name}>
          <ListContent list={list} />
        </div>
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

/** Selecting a task from the inbox clears its blue dot on the server. */
function useInboxClear() {
  const actions = useTaskActions();
  const taskId = useApp((state) => {
    const item = selectedTask(state);
    return item?.task.isInbox ? item.id : undefined;
  });
  useEffect(() => {
    if (taskId) void actions.clearInbox(taskId);
  }, [taskId, actions]);
}

/**
 * Places the hovered item's tooltip next to it. Tooltips are fixed, so the scrolling favorites
 * do not clip them.
 */
function placeTip(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--tip-x", `${rect.right + 10}px`);
  event.currentTarget.style.setProperty("--tip-y", `${rect.top + rect.height / 2}px`);
}

/**
 * Favorites in order (⌘1..⌘9), the open list below a line when it is not a favorite, and the
 * settings button at the bottom. The lists scroll when the window is too short for them; the
 * settings button always stays visible.
 */
function Sidebar({ lists, current }: { lists: List[]; current: List | undefined }) {
  // Also while one of its pickers (Zeitzone, Standardliste, …) is on top.
  const settingsOpen = useApp((state) => state.panels.some((panel) => panel.type === "settings"));
  return (
    <nav className="side">
      <div className="favs">
        {favoritesOf(lists).map((list, index) => (
          <SidebarItem
            key={list._id}
            list={list}
            active={list._id === current?._id}
            shortcut={index < 9 ? `⌘${index + 1}` : undefined}
          />
        ))}
        {current && !current.favorite && (
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
        onMouseEnter={placeTip}
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
      onMouseEnter={placeTip}
      onMouseDown={(event) => event.preventDefault()}
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
