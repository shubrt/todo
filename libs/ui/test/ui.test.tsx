// @vitest-environment happy-dom
import type { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
  type Mock,
} from "vite-plus/test";
import { App } from "../src/app";
import type { Completion, List, Recurrence, Settings, Task } from "../src/data";
import {
  PlatformError,
  type CreatedIntegrationKey,
  type DesktopNavigation,
  type Platform,
  type PlatformState,
} from "../src/platform";
import { startQueries } from "../src/start";
import { useApp } from "../src/store";

type Args = Record<string, unknown>;
type ApiKey = FunctionReturnType<typeof api.auth.listApiKeys>[number];

// An in-memory Convex: queries read the fixtures below by function name, `change` re-renders
// every subscriber like a live query update, mutations are vi.fn per name.
const backend = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const cache = new Map<string, unknown>();
  const backend = {
    version: 0,
    queries: {} as Record<string, (args: Args) => unknown>,
    mutations: new Map<string, Mock>(),
    connection: {
      isWebSocketConnected: true,
      timeOfOldestInflightRequest: null as Date | null,
      connectionCount: 1,
    },
    auth: { isLoading: false, isAuthenticated: true },
    /** Whether the last token fetch came back empty (device key refused). */
    tokenRejected: false,
    platform: null as PlatformState | null,
    /** The Platform `render` mounted the app on. */
    shell: null as Platform | null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => backend.version,
    /** Applies a server-side change and pushes fresh results to every subscriber. */
    change(apply: () => void = () => {}) {
      apply();
      cache.clear();
      backend.version++;
      for (const listener of listeners) listener();
    },
    /** An optimistic update: edits the loaded results, which keep the edit until the next change. */
    edit(apply: (results: Map<string, unknown>) => void) {
      apply(cache);
      backend.version++;
      for (const listener of listeners) listener();
    },
    /** Stable results per function and args until the next change, like Convex. */
    query(name: string, args: Args) {
      const key = `${name}:${JSON.stringify(args)}`;
      if (!cache.has(key)) {
        const run = backend.queries[name];
        if (!run) throw new Error(`Unmocked query ${name}`);
        cache.set(key, run(args));
      }
      return cache.get(key);
    },
    mutation(name: string) {
      let mutation = backend.mutations.get(name);
      if (!mutation) {
        mutation = vi.fn().mockResolvedValue(null);
        backend.mutations.set(name, mutation);
      }
      return mutation;
    },
  };
  return backend;
});

const useBackend = () => useSyncExternalStore(backend.subscribe, backend.snapshot);
const nameOf = (reference: FunctionReference<"query" | "mutation">) => getFunctionName(reference);

/** Convex's local store for optimistic updates, over the loaded results of backend.query. */
function localStore(results: Map<string, unknown>) {
  const prefix = (query: FunctionReference<"query">) => `${nameOf(query)}:`;
  const store = {
    getAllQueries: (query: FunctionReference<"query">) =>
      [...results]
        .filter(([key]) => key.startsWith(prefix(query)))
        .map(([key, value]) => ({
          args: JSON.parse(key.slice(prefix(query).length)) as Args,
          value,
        })),
    setQuery: (query: FunctionReference<"query">, args: Args, value: unknown) =>
      void results.set(prefix(query) + JSON.stringify(args), value),
  };
  return store as OptimisticLocalStore;
}
/** A mutation mock that also offers Convex's optimistic variant, which edits before it calls. */
function withOptimisticUpdate(mutation: Mock) {
  return Object.assign(mutation, {
    withOptimisticUpdate:
      (update: (store: OptimisticLocalStore, args: Args) => void) => (args: Args) => {
        backend.edit((results) => update(localStore(results), args));
        return mutation(args);
      },
  });
}

vi.mock("convex/react", () => ({
  useConvexAuth: () => {
    useBackend();
    return backend.auth;
  },
  useConvexConnectionState: () => {
    useBackend();
    return backend.connection;
  },
  useMutation: (reference: FunctionReference<"mutation">) =>
    withOptimisticUpdate(backend.mutation(nameOf(reference))),
  useQuery: (reference: FunctionReference<"query">, args: Args) => {
    useBackend();
    return backend.query(nameOf(reference), args);
  },
  useQueries: (requests: Record<string, { query: FunctionReference<"query">; args: Args }>) => {
    useBackend();
    return Object.fromEntries(
      Object.entries(requests).map(([key, { query, args }]) => [
        key,
        backend.query(nameOf(query), args),
      ]),
    );
  },
}));
vi.mock("../src/connection", () => ({
  PlatformProvider: ({ children }: { children: ReactNode }) => children,
  ConnectedProvider: ({ children }: { children: ReactNode }) => children,
  usePlatform: () => {
    useBackend();
    return {
      platform: backend.shell,
      state: backend.platform,
      error: null,
      update: (next: PlatformState) => backend.change(() => (backend.platform = next)),
      reconnect: () => {},
    };
  },
  useTokenRejected: () => {
    useBackend();
    return backend.tokenRejected;
  },
}));

// Thursday, 8 October 2026, 10:00 in Berlin.
const today = "2026-10-08";
const now = Date.parse("2026-10-08T08:00:00Z");
const listIds = {
  important: "l-imp" as Id<"lists">,
  me: "l-me" as Id<"lists">,
  agency: "l-agency" as Id<"lists">,
  work: "l-work" as Id<"lists">,
  habits: "l-hab" as Id<"lists">,
  history: "l-hist" as Id<"lists">,
  recurrences: "l-rec" as Id<"lists">,
  urlaub: "l-urlaub" as Id<"lists">,
};

function list(id: Id<"lists">, name: string, kind: List["kind"], fields: Partial<List>): List {
  return {
    _id: id,
    _creationTime: 0,
    ownerId: "owner",
    name,
    kind,
    color: "#8e8e93",
    favorite: false,
    position: Object.values(listIds).indexOf(id),
    createdAt: 0,
    openCount: 0,
    ...fields,
  };
}
function task(id: string, title: string, listId: Id<"lists">, fields: Partial<Task> = {}): Task {
  const dueOn = fields.dueOn;
  return {
    _id: id as Id<"tasks">,
    _creationTime: 0,
    ownerId: "owner",
    title,
    kind: "task",
    listId,
    section: "active",
    position: 0,
    isInbox: false,
    isAi: false,
    highPriority: false,
    state: "open",
    scheduleVersion: 0,
    createdAt: 0,
    updatedAt: 0,
    isDue: dueOn !== undefined && dueOn <= today,
    isOverdue: dueOn !== undefined && dueOn < today,
    isDeferred: false,
    ...fields,
  };
}
/** Subtasks carry their root's list and section, as the backend decorates them. */
const subtask = (id: string, title: string, parent: Task, fields: Partial<Task> = {}) =>
  task(id, title, parent.listId!, { parentId: parent._id, section: parent.section, ...fields });
const done = { state: "done", completedLocalDate: today } as const;
function recurrence(
  id: string,
  title: string,
  listId: Id<"lists">,
  rule: Recurrence["rule"],
  fields: Partial<Recurrence> = {},
): Recurrence {
  return {
    _id: id as Id<"recurrences">,
    _creationTime: 0,
    ownerId: "owner",
    title,
    kind: "task",
    listId,
    isAi: false,
    highPriority: false,
    rule,
    timeZone: "Europe/Berlin",
    enabled: true,
    nextDate: today,
    nextRunAt: 0,
    createdAt: 0,
    ...fields,
  };
}
function completion(
  id: string,
  title: string,
  at: string,
  listId: string,
  fields: Partial<Completion> = {},
): Completion {
  const completedAt = Date.parse(at);
  return {
    _id: id as Id<"completions">,
    _creationTime: completedAt,
    ownerId: "owner",
    taskId: `task-${id}` as Id<"tasks">,
    titleSnapshot: title,
    listId: listId as Id<"lists">,
    completedAt,
    completedLocalDate: at.slice(0, 10),
    timeZoneSnapshot: "Europe/Berlin",
    kind: "task",
    ...fields,
  };
}
const apiKey = (id: string, name: string, createdAt: string, current = false): ApiKey => ({
  id: id as Id<"apiKeys">,
  name,
  prefix: `todo_${id}`,
  kind: "device",
  createdAt: Date.parse(createdAt),
  lastUsedAt: null,
  current,
});

function fixtures() {
  const neo = task("neo", "Neo Basis", listIds.work);
  return {
    lists: [
      list(listIds.important, "Wichtig", "important", { emoji: "‼️", favorite: true }),
      list(listIds.me, "me", "tasks", {
        emoji: "💌",
        color: "#64d2ff",
        favorite: true,
        legacyArea: "me",
      }),
      list(listIds.agency, "agency", "tasks", { emoji: "🪴", color: "#bf5af2", favorite: true }),
      list(listIds.work, "work", "tasks", {
        emoji: "💻",
        color: "#ff453a",
        favorite: true,
        openCount: 4,
      }),
      list(listIds.habits, "Habits", "habits", { emoji: "🔁", color: "#30d158", favorite: true }),
      list(listIds.history, "Verlauf", "history", { emoji: "🕘" }),
      list(listIds.recurrences, "Wiederholungen", "recurrences", { emoji: "🗓️" }),
      list(listIds.urlaub, "Urlaub", "tasks", { color: "#ffd60a" }),
    ],
    // Display order of the backend: done first, then position.
    tasks: [
      task("servoy", "Servoy API Scripts", listIds.work, done),
      task("umbau", "Umbau auf Todo App", listIds.work, { highPriority: true }),
      task("reise", "Reise DB", listIds.work, { dueOn: "2026-10-09", isInbox: true }),
      neo,
      subtask("bridge", "Bridge bauen", neo, done),
      subtask("db", "DB Migration", neo),
      task("release", "Release prüfen", listIds.work, {
        isAi: true,
        recurrenceId: "r-week" as Id<"recurrences">,
        dueOn: "2026-10-07",
        plannedFor: today,
      }),
      task("steuer", "Steuer", listIds.work, { section: "backlog" }),
      task("mama", "Mama anrufen", listIds.me, { highPriority: true }),
      task("praes", "Präsentation schicken", listIds.agency, { ...done, dueOn: today }),
      task("rechnung", "Rechnung schreiben", listIds.agency, { dueOn: today }),
      task("pass", "Pass verlängern", listIds.urlaub, { highPriority: true }),
      task("sport", "Sport", listIds.habits, {
        ...done,
        kind: "habit",
        recurrenceId: "r-sport" as Id<"recurrences">,
      }),
      task("wasser", "Wasser trinken", listIds.habits, {
        kind: "habit",
        recurrenceId: "r-wasser" as Id<"recurrences">,
      }),
      task("journal", "Journal", listIds.habits, {
        kind: "habit",
        recurrenceId: "r-journal" as Id<"recurrences">,
      }),
    ],
    deferred: [
      task("konferenz", "Konferenz planen", listIds.work, {
        plannedFor: "2026-10-16",
        isDeferred: true,
      }),
    ],
    history: { "r-sport": [true, true, false, true, true, true], "r-wasser": [false, true] },
    recurrences: [
      recurrence("r-miete", "Miete überweisen", listIds.me, {
        frequency: "monthly",
        dayOfMonth: 1,
      }),
      recurrence("r-week", "Wochenbericht", listIds.work, { frequency: "weekly", weekday: 5 }),
      recurrence(
        "r-sport",
        "Sport",
        listIds.habits,
        { frequency: "daily" },
        {
          kind: "habit",
        },
      ),
      recurrence(
        "r-joggen",
        "Joggen",
        listIds.habits,
        { frequency: "daily" },
        {
          kind: "habit",
          enabled: false,
        },
      ),
    ],
    // Newest first, like the by_owner_date index.
    completions: [
      completion("c-db", "DB Migration", "2026-10-08T12:20:00Z", listIds.work, {
        kind: "subtask",
        parentTitleSnapshot: "Neo Basis",
      }),
      completion("c-sport", "Sport", "2026-10-08T07:12:00Z", listIds.habits, { kind: "habit" }),
      completion("c-alt", "Logo abgestimmt", "2026-10-07T16:20:00Z", "l-gone", {
        listNameSnapshot: "Altprojekt",
      }),
      completion("c-hand", "Handwerker anrufen", "2026-10-06T15:30:00Z", listIds.urlaub),
      completion("c-konzept", "Bridge Konzept", "2026-10-05T08:05:00Z", listIds.work),
    ],
    settings: { defaultListId: listIds.me, timeZone: "Europe/Berlin", currentLocalDate: today },
    keys: [
      apiKey("k-mac", "todo auf MacBook Pro", "2026-10-01T10:00:00Z", true),
      apiKey("k-capture", "task-capture Claude", "2026-10-02T10:00:00Z"),
      apiKey("k-imac", "todo auf iMac", "2026-09-28T10:00:00Z"),
    ],
  } satisfies {
    lists: List[];
    tasks: Task[];
    deferred: Task[];
    history: Record<string, boolean[]>;
    recurrences: Recurrence[];
    completions: Completion[];
    settings: Settings;
    keys: ApiKey[];
  };
}
let data: ReturnType<typeof fixtures>;

/** A root that matches and all its subtasks, in fixture (display) order. */
function tree(match: (task: Task) => boolean) {
  const roots = new Set(
    data.tasks.filter((row) => !row.parentId && match(row)).map((row) => row._id),
  );
  return data.tasks.filter((row) => roots.has(row.parentId ?? row._id));
}
/** Pages of two rows, so a few fixtures exercise "Weitere laden". */
function completions({ from, to, cursor }: Args) {
  const rows = data.completions.filter(
    (row) =>
      (typeof from !== "string" || row.completedLocalDate >= from) &&
      (typeof to !== "string" || row.completedLocalDate <= to),
  );
  const start = Number(cursor ?? 0);
  const end = start + 2;
  return { items: rows.slice(start, end), nextCursor: end < rows.length ? String(end) : null };
}
backend.queries = {
  "lists:list": () => data.lists,
  "settings:get": () => data.settings,
  "tasks:list": ({ view, listId }) =>
    tree(
      view === "important"
        ? (row) => row.kind === "task" && (row.highPriority || row.isDue)
        : (row) => row.listId === listId,
    ),
  "tasks:deferred": ({ listId }) => data.deferred.filter((row) => row.listId === listId),
  "recurrences:list": () => data.recurrences,
  "recurrences:history": () => data.history,
  "completions:list": completions,
  "auth:listApiKeys": () => data.keys,
};
const mutation = (name: string) => backend.mutation(name);

const platformState = (fields: Partial<PlatformState> = {}): PlatformState => ({
  configured: true,
  version: "0.2.0",
  cloudUrl: "https://test.convex.cloud",
  siteUrl: "https://test.convex.site",
  preferences: {
    alwaysOnTop: true,
    allSpaces: true,
    launchAtLogin: false,
    shortcut: "CommandOrControl+Shift+Space",
  },
  ...fields,
});
let navigate: (target: DesktopNavigation) => void = () => {};
/** The Mac's Platform: every capability, as mocks. */
function macPlatform(): Required<Platform> {
  return {
    kind: "mac",
    getState: vi.fn(async () => platformState()),
    login: vi.fn(() => new Promise<PlatformState>(() => {})),
    cancelLogin: vi.fn(async () => {}),
    createIntegrationKey: vi.fn(() => new Promise<CreatedIntegrationKey>(() => {})),
    copyText: vi.fn(async () => {}),
    disconnect: vi.fn(async () => platformState({ configured: false })),
    fetchAccessToken: vi.fn(async () => "token"),
    setPreferences: vi.fn(async () => platformState()),
    hide: vi.fn(async () => {}),
    showEmojiPanel: vi.fn(async () => {}),
    onState: vi.fn(() => () => {}),
    onNavigate: vi.fn((callback: (target: DesktopNavigation) => void) => {
      navigate = callback;
      return () => {};
    }),
  };
}

let bridge: Required<Platform>;
let container: HTMLDivElement;
let root: Root;

/** Renders the app on `platform`, the Mac's by default. */
async function render(platform: Platform = bridge) {
  backend.shell = platform;
  await act(async () => root.render(<App platform={platform} />));
  // Lets lists.bootstrap settle; a rejection replaces the workspace with the failure.
  await act(async () => {});
}
const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)];
const texts = (selector: string) => $$(selector).map((element) => element.textContent);
const title = () => $(".ttl")?.textContent;
const rowOf = (text: string) =>
  $$(".row").find((row) => row.querySelector(".t")?.textContent === text);
const panelRows = () => texts(".pal .pi .pt");
const panelValue = (label: string) =>
  $$(".pal .pi")
    .find((row) => row.querySelector(".pt")?.textContent === label)
    ?.querySelector(".pacc, .keys")?.textContent;
const app = () => useApp.getState();
const run = (action: () => void) => act(async () => action());

const keyNames: Record<string, string> = {
  enter: "Enter",
  escape: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  space: " ",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};
/** Presses a combo like "shift+mod+k" on the focused element, as macOS reports it. */
async function press(combo: string) {
  const parts = combo.split("+");
  const name = parts.pop()!;
  const has = (modifier: string) => parts.includes(modifier);
  const key = keyNames[name] ?? (has("shift") ? name.toUpperCase() : name);
  const code = /^[a-z]$/.test(name)
    ? `Key${name.toUpperCase()}`
    : /^\d$/.test(name)
      ? `Digit${name}`
      : name === "space"
        ? "Space"
        : key;
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        code,
        metaKey: has("mod"),
        ctrlKey: has("ctrl"),
        altKey: has("alt"),
        shiftKey: has("shift"),
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}
/** Replaces the text of the focused field, like typing it. */
async function type(text: string) {
  const input = document.activeElement;
  if (!(input instanceof HTMLInputElement)) throw new Error("No text field has focus.");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(element: Element | null | undefined) {
  if (!element) throw new Error("Missing element.");
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
const convexError = (message: string) => Object.assign(new Error(message), { data: { message } });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  data = fixtures();
  backend.mutations.clear();
  backend.mutation("tasks:create").mockResolvedValue("new-task");
  backend.connection = {
    isWebSocketConnected: true,
    timeOfOldestInflightRequest: null,
    connectionCount: 1,
  };
  backend.auth = { isLoading: false, isAuthenticated: true };
  backend.tokenRejected = false;
  backend.platform = platformState();
  backend.change();
  localStorage.clear();
  useApp.setState({
    current: { id: listIds.work },
    selection: null,
    // Tests start without a selection; opening another list selects its first row.
    autoSelected: false,
    focusOnLoad: false,
    items: [],
    editing: null,
    panels: [],
    expanded: {},
    sections: {},
    toast: null,
  });
  bridge = macPlatform();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Anmeldung und Verbindung", () => {
  it("meldet mit ↵ an, bricht mit esc ohne Fehler ab und zeigt Fehler rot", async () => {
    backend.platform = platformState({ configured: false });
    const first = Promise.withResolvers<PlatformState>();
    vi.mocked(bridge.login).mockReturnValueOnce(first.promise);
    await render();
    expect(title()).toBe("todo");
    expect($(".side")).toBeNull();
    expect($(".st")).toBeNull();
    expect($(".login p")?.textContent).toBe("Melde dich im Browser mit Shoo an.");

    await press("enter");
    expect(bridge.login).toHaveBeenCalledTimes(1);
    expect($(".login .act")?.textContent).toBe("Warte auf den Browser …");
    expect($(".login small")?.textContent).toBe("esc bricht ab");
    await press("escape");
    expect(bridge.cancelLogin).toHaveBeenCalledTimes(1);
    expect(bridge.hide).not.toHaveBeenCalled();
    await act(async () => first.reject(new PlatformError("abgebrochen")));
    expect($(".login .err")).toBeNull();
    expect($(".login .act")?.textContent).toBe("Mit Shoo anmelden↵");

    vi.mocked(bridge.login).mockRejectedValueOnce(
      new PlatformError("Die Anmeldung ist abgelaufen."),
    );
    await press("enter");
    expect($(".login .err")?.textContent).toBe("Die Anmeldung ist abgelaufen.");

    vi.mocked(bridge.login).mockResolvedValueOnce(platformState());
    await press("enter");
    await act(async () => {});
    expect(title()).toBe("💻work");
    expect($(".side")).not.toBeNull();
  });

  it("zeigt bei abgelehntem Geräteschlüssel die Anmeldung mit Grund, sonst Offline", async () => {
    backend.auth = { isLoading: false, isAuthenticated: false };
    backend.tokenRejected = true;
    backend.platform = platformState({
      error: "Der Geräteschlüssel wurde widerrufen. Melde dich erneut an.",
    });
    await render();
    expect($(".login .err")?.textContent).toContain("widerrufen");
    expect($(".st")?.className).toBe("st off");

    // Offline with an unrelated error from the main process (a taken shortcut): reconnect.
    await act(async () =>
      backend.change(() => {
        backend.tokenRejected = false;
        backend.platform = platformState({
          error: "Der globale Kurzbefehl ist bereits belegt.",
        });
      }),
    );
    expect($(".login p")?.textContent).toBe("Deine Aufgaben sind gerade nicht erreichbar.");
    expect(texts(".login button")).toEqual(["Erneut verbinden↵", "Neu anmelden"]);
    expect($(".st")?.className).toBe("st off");
  });

  it("zeigt beim Verbinden keinen Titel und danach die Liste, ohne auf lists.bootstrap zu warten", async () => {
    mutation("lists:bootstrap").mockReturnValueOnce(new Promise(() => {}));
    backend.auth = { isLoading: true, isAuthenticated: false };
    await render();
    expect(title()).toBe("");
    expect($(".side")).toBeNull();
    await act(async () =>
      backend.change(() => (backend.auth = { isLoading: false, isAuthenticated: true })),
    );
    expect(title()).toBe("💻work");
    expect($(".side")).not.toBeNull();
  });

  it("zeigt einen fehlgeschlagenen Start mit Grund und versucht es mit ↵ erneut", async () => {
    mutation("lists:bootstrap").mockRejectedValueOnce(new Error("Server Error"));
    await render();
    expect($(".login p")?.textContent).toBe("Deine Listen konnten nicht geladen werden.");
    expect($(".login .act")?.textContent).toBe("Erneut versuchen↵");
    expect($(".side")).toBeNull();
    await press("enter");
    await act(async () => {});
    expect(mutation("lists:bootstrap")).toHaveBeenCalledTimes(2);
    expect(title()).toBe("💻work");
  });

  it("versucht einen fehlgeschlagenen Start nach einer neuen Verbindung von selbst erneut", async () => {
    mutation("lists:bootstrap").mockRejectedValueOnce(new Error("Server Error"));
    await render();
    expect($(".login p")?.textContent).toBe("Deine Listen konnten nicht geladen werden.");
    await act(async () => backend.change(() => backend.connection.connectionCount++));
    await act(async () => {});
    expect(mutation("lists:bootstrap")).toHaveBeenCalledTimes(2);
    expect(title()).toBe("💻work");
  });

  it("vergisst hängende Schreibvorgänge mit der alten Verbindung", async () => {
    mutation("tasks:complete").mockReturnValueOnce(new Promise(() => {}));
    await render();
    await run(() => app().select("umbau"));
    await press("mod+enter");
    await press("mod+enter");
    expect(mutation("tasks:complete")).toHaveBeenCalledTimes(1);

    // Signed out and back in: a new session whose client never sent that write.
    await act(async () =>
      backend.change(() => (backend.auth = { isLoading: false, isAuthenticated: false })),
    );
    await act(async () =>
      backend.change(() => (backend.auth = { isLoading: false, isAuthenticated: true })),
    );
    await act(async () => {});
    await run(() => app().select("umbau"));
    await press("mod+enter");
    expect(mutation("tasks:complete")).toHaveBeenCalledTimes(2);
  });

  it("färbt den Statuspunkt gelb bei langsamen Schreibvorgängen, rot nach 3s offline", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(now);
    await render();
    expect($(".st")?.className).toBe("st ok");
    expect($(".sttip")?.textContent).toBe("Synchronisiert");

    await act(async () =>
      backend.change(() => (backend.connection.timeOfOldestInflightRequest = new Date())),
    );
    expect($(".st")?.className).toBe("st ok");
    await act(async () => vi.advanceTimersByTime(1100));
    expect($(".st")?.className).toBe("st wait");
    expect($(".sttip")?.textContent).toBe("Wird gespeichert …");

    await act(async () =>
      backend.change(() => {
        backend.connection.timeOfOldestInflightRequest = null;
        backend.connection.isWebSocketConnected = false;
      }),
    );
    expect($(".st")?.className).toBe("st wait");
    await act(async () => vi.advanceTimersByTime(3100));
    expect($(".st")?.className).toBe("st off");
    expect($(".sttip")?.textContent).toBe("Offline");
  });

  it("sperrt Schreibaktionen ohne Verbindung mit einer Fehlermeldung", async () => {
    backend.connection.isWebSocketConnected = false;
    await render();
    await run(() => app().select("umbau"));
    await press("mod+enter");
    await click(rowOf("Reise DB")?.querySelector(".cb"));
    expect(mutation("tasks:complete")).not.toHaveBeenCalled();
    expect($(".toast")?.textContent).toBe("Keine Verbindung. Warte kurz, bis sie wieder steht.");
  });
});

describe("Fenster und Navigation", () => {
  it("zeigt Favoriten in der Seitenleiste und öffnet sie mit ⌘1 bis ⌘9", async () => {
    await render();
    expect(title()).toBe("💻work");
    expect($$(".side .ri").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Wichtig",
      "me",
      "agency",
      "work",
      "Habits",
      "Einstellungen",
    ]);
    expect($(".side .ri.on")?.getAttribute("aria-label")).toBe("work");
    expect(texts(".side .tip")).toContain("work⌘4");

    await press("mod+1");
    expect(title()).toBe("‼️Wichtig");
    await press("mod+5");
    expect(title()).toBe("🔁Habits");
    await press("mod+9");
    expect(title()).toBe("🔁Habits");
    await click($(".side [aria-label='me']"));
    expect(title()).toBe("💌me");
  });

  it("wechselt mit ⌘P die Liste und zeigt eine Nicht-Favoritin unter dem Strich", async () => {
    await render();
    await press("mod+p");
    expect(panelRows()).toEqual([
      "Wichtig",
      "me",
      "agency",
      "work",
      "Habits",
      "Urlaub",
      "Verlauf",
      "Wiederholungen",
    ]);
    expect($$(".pal .sep")).toHaveLength(1);
    expect(panelValue("work")).toBe("aktuell · 4");
    // The highlighted row carries the favorite star.
    expect($(".pal .pi.sel .fav")).not.toBeNull();

    // Matches stay first and highlighted; the create row for the typed text sits below them.
    await type("url");
    expect(panelRows()).toEqual(["Urlaub", "url als neue Liste anlegen"]);
    await press("enter");
    expect($(".pal")).toBeNull();
    expect(title()).toBe("Urlaub");
    expect($(".side .sl + .ri.on")?.getAttribute("aria-label")).toBe("Urlaub");
    // Lists without emoji show their initial in a tile.
    expect($(".side .ri.on .lg")?.textContent).toBe("U");

    await press("mod+3");
    expect(title()).toBe("🪴agency");
    expect($(".side .sl")).toBeNull();

    await act(async () => navigate("switcher"));
    expect(panelRows()).toContain("Urlaub");
  });

  it("legt in ⌘P eine neue Liste an und verwaltet Listen per Kurzbefehl", async () => {
    mutation("lists:create").mockImplementation(async ({ name }: { name: string }) => {
      const id = "l-garten" as Id<"lists">;
      backend.change(() =>
        data.lists.push(list(id, name, "tasks", { color: "#ff9f0a", position: 8 })),
      );
      return id;
    });
    mutation("lists:remove").mockRejectedValue(convexError("Die Liste ist nicht leer."));
    await render();
    await press("mod+p");
    await type("Garten");
    expect(panelRows()).toEqual(["Garten als neue Liste anlegen"]);
    expect(panelValue("Garten als neue Liste anlegen")).toBe("↵");
    await press("enter");
    expect(mutation("lists:create")).toHaveBeenCalledWith({ name: "Garten" });
    expect(title()).toBe("Garten");

    // A name that only partly matches an existing list can still be created below the matches.
    await press("mod+p");
    await type("Gar");
    expect(panelRows()).toEqual(["Garten", "Gar als neue Liste anlegen"]);
    await type("garten");
    expect(panelRows()).toEqual(["Garten"]);
    await press("escape");

    await press("mod+p");
    await type("url");
    await press("shift+mod+p");
    expect(mutation("lists:update")).toHaveBeenCalledWith({
      listId: listIds.urlaub,
      favorite: true,
    });
    expect(app().panels).toEqual([{ type: "switcher" }]);

    await press("mod+k");
    expect($(".pal .crumb")?.textContent).toBe("Urlaub");
    expect(panelRows()).toEqual([
      "Als Favorit",
      "Umbenennen",
      "Emoji wählen",
      "Farbe ändern …",
      "Liste löschen",
    ]);
    await press("escape");
    expect(app().panels).toEqual([{ type: "switcher" }]);

    // The list shortcuts work right in ⌘P on the highlighted list.
    await type("url");
    await press("mod+r");
    expect($(".pal .crumb")?.textContent).toBe("Umbenennen");
    expect((document.activeElement as HTMLInputElement).value).toBe("Urlaub");
    await type("Ferien");
    await press("enter");
    expect(mutation("lists:update")).toHaveBeenLastCalledWith({
      listId: listIds.urlaub,
      name: "Ferien",
    });
    expect($(".pal")).toBeNull();

    // ⌘⌫ first clears the search like in any text field and keeps the list highlighted.
    await press("mod+p");
    await type("url");
    await press("mod+backspace");
    expect(mutation("lists:remove")).not.toHaveBeenCalled();
    expect((document.activeElement as HTMLInputElement).value).toBe("");
    expect($(".pal .pi.sel .pt")?.textContent).toBe("Urlaub");
    await press("mod+backspace");
    expect(mutation("lists:remove")).toHaveBeenCalledWith({ listId: listIds.urlaub });
    expect($(".toast")?.textContent).toBe("Die Liste ist nicht leer.");

    // ⌃⌘Space and ⇧⌘C open the emoji and color pickers for the highlighted list.
    await press("mod+p");
    await type("url");
    await press("ctrl+mod+space");
    expect($(".pal .crumb")?.textContent).toBe("Emoji");
    expect(bridge.showEmojiPanel).toHaveBeenCalledTimes(1);
    await type("🏖️");
    expect(mutation("lists:update")).toHaveBeenLastCalledWith({
      listId: listIds.urlaub,
      emoji: "🏖️",
    });
    expect($(".pal")).toBeNull();
    await press("mod+p");
    await type("url");
    await press("shift+mod+c");
    expect($(".pal .crumb")?.textContent).toBe("Farbe");
    await type("grün");
    await press("enter");
    expect(mutation("lists:update")).toHaveBeenLastCalledWith({
      listId: listIds.urlaub,
      color: "#30d158",
    });

    // Special lists only take the favorite.
    await press("mod+p");
    await type("verlauf");
    await press("mod+k");
    expect(panelRows()).toEqual(["Als Favorit"]);
  });

  it("ordnet Favoriten in ⌘P mit ⌥↑/⌥↓ und über die Listenaktionen", async () => {
    mutation("lists:reorder").mockImplementation(
      async ({ listIds: order }: { listIds: string[] }) => {
        backend.change(() => {
          const rest = data.lists.filter((entry) => !order.includes(entry._id));
          data.lists = [
            ...order.map((id) => data.lists.find((entry) => entry._id === id)!),
            ...rest,
          ].map((entry, position) => ({ ...entry, position }));
        });
        return null;
      },
    );
    const favorites = [listIds.important, listIds.me, listIds.agency, listIds.work, listIds.habits];
    await render();
    await press("mod+p");
    await press("down");
    expect($(".pal .pi.sel .pt")?.textContent).toBe("me");
    await press("alt+up");
    expect(mutation("lists:reorder")).toHaveBeenLastCalledWith({
      listIds: [listIds.me, listIds.important, listIds.agency, listIds.work, listIds.habits],
    });
    // The switcher stays open on the moved list.
    expect(panelRows().slice(0, 2)).toEqual(["me", "Wichtig"]);
    expect($(".pal .pi.sel .pt")?.textContent).toBe("me");
    await press("alt+up");
    expect(mutation("lists:reorder")).toHaveBeenCalledTimes(1);
    await press("alt+down");
    expect(mutation("lists:reorder")).toHaveBeenLastCalledWith({ listIds: favorites });
    expect($$(".side .ri").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Wichtig",
      "me",
      "agency",
      "work",
      "Habits",
      "Einstellungen",
    ]);

    // The list actions offer the order for favorites only.
    await press("mod+k");
    expect(panelRows()).toEqual([
      "Kein Favorit",
      "Umbenennen",
      "Emoji wählen",
      "Farbe ändern …",
      "Nach oben",
      "Nach unten",
      "Liste löschen",
    ]);
    expect(panelValue("Nach oben")).toBe("⌥↑");
    expect(panelValue("Nach unten")).toBe("⌥↓");
    await type("unten");
    await press("enter");
    expect(mutation("lists:reorder")).toHaveBeenLastCalledWith({
      listIds: [listIds.important, listIds.agency, listIds.me, listIds.work, listIds.habits],
    });
    expect($(".pal")).toBeNull();

    await press("mod+p");
    await type("url");
    await press("alt+up");
    await press("mod+k");
    expect(panelRows()).not.toContain("Nach oben");
    expect(mutation("lists:reorder")).toHaveBeenCalledTimes(3);
  });

  it("schließt mit esc erst das Bearbeiten, dann das oberste Panel, dann das Fenster", async () => {
    await render();
    await run(() => app().select("umbau"));
    await press("enter");
    expect(app().editing).toEqual({ type: "rename", id: "umbau" });
    await press("escape");
    expect(app().editing).toBeNull();

    await press("mod+k");
    await type("einpl");
    await press("enter");
    expect(app().panels.map((panel) => panel.type)).toEqual(["actions", "date"]);
    await press("escape");
    expect(app().panels.map((panel) => panel.type)).toEqual(["actions"]);
    await press("escape");
    expect($(".pal")).toBeNull();
    expect(bridge.hide).not.toHaveBeenCalled();
    await press("escape");
    expect(bridge.hide).toHaveBeenCalledTimes(1);
    await press("mod+w");
    expect(bridge.hide).toHaveBeenCalledTimes(2);
  });
});

describe("Start", () => {
  // As at launch: no list open yet, and the Mac selects the first row of the list that opens.
  beforeEach(() => useApp.setState({ current: null, focusOnLoad: true }));
  /** Holds back a query's results, as while loading; returns the call that delivers them. */
  function loading(name: string) {
    const results = backend.queries[name]!;
    backend.queries[name] = () => undefined;
    onTestFinished(() => void (backend.queries[name] = results));
    return () => act(async () => backend.change(() => (backend.queries[name] = results)));
  }
  const unfavoriteAll = () => data.lists.forEach((entry) => (entry.favorite = false));

  it("startet auf dem ersten Favoriten und wählt seine erste Aufgabe aus", async () => {
    // Wichtig, the first favorite of the fixtures.
    data.lists[0]!.favorite = false;
    await render();
    expect(title()).toBe("💌me");
    expect(app().selection).toBe("mama");
  });

  it("startet ohne Favoriten in der Standardliste, sobald die Einstellungen da sind", async () => {
    unfavoriteAll();
    data.settings.defaultListId = listIds.work;
    const settings = loading("settings:get");
    await render();
    expect(title()).toBe("");
    expect($(".side")).toBeNull();
    await settings();
    expect(title()).toBe("💻work");
  });

  it("startet ohne Favoriten und ohne Standardliste in Wichtig", async () => {
    unfavoriteAll();
    data.settings.defaultListId = "l-gone" as Id<"lists">;
    await render();
    expect(title()).toBe("‼️Wichtig");
  });

  it("wartet beim ersten Anmelden auf die angelegten Listen, statt in Wichtig zu starten", async () => {
    // Wichtig, the first favorite of the fixtures.
    data.lists[0]!.favorite = false;
    const seeded = data.lists;
    data.lists = [];
    const bootstrap = Promise.withResolvers<null>();
    mutation("lists:bootstrap").mockReturnValueOnce(bootstrap.promise);
    await render();
    expect(title()).toBe("");
    expect($(".side")).toBeNull();
    await act(async () => {
      backend.change(() => (data.lists = seeded));
      bootstrap.resolve(null);
    });
    expect(title()).toBe("💌me");
  });

  it.each([
    ["work", listIds.work, "tasks"],
    ["Habits", listIds.habits, "habits"],
    ["Wichtig", listIds.important, "important"],
    ["Wiederholungen", listIds.recurrences, "recurrences"],
  ] as const)(
    "merkt sich %s als Start und wärmt beim nächsten Start genau dessen Abfragen vor",
    async (_name, id, kind) => {
      data.lists.forEach((entry) => (entry.favorite = entry._id === id));
      const queried = vi.spyOn(backend, "query");
      onTestFinished(() => queried.mockRestore());
      await render();
      expect(JSON.parse(localStorage.getItem("todo.start")!)).toEqual({ id, kind });
      const key = (name: string, args: unknown) => `${name}:${JSON.stringify(args)}`;
      const subscribed = new Set(queried.mock.calls.map(([name, args]) => key(name, args)));
      const prewarmed = startQueries().map(({ query, args }) => key(nameOf(query), args));
      expect(prewarmed.toSorted()).toEqual([...subscribed].toSorted());
    },
  );

  it("behält eine Liste, die vor dem Laden der Listen geöffnet wurde", async () => {
    const lists = loading("lists:list");
    await render();
    expect(title()).toBe("");
    await act(async () => navigate("history"));
    await lists();
    expect(title()).toBe("🕘Verlauf");
  });
});

describe("Normale Liste", () => {
  it("zeigt Abschnitte, Erledigtes zuerst und Angaben in fester Reihenfolge", async () => {
    await render();
    expect(texts(".sec")).toEqual(["Tasks4", "Backlog1", "Für später1"]);
    expect(texts(".row .t")).toEqual([
      "Servoy API Scripts",
      "Umbau auf Todo App",
      "Reise DB",
      "Neo Basis",
      "Release prüfen",
    ]);
    expect(rowOf("Servoy API Scripts")?.className).toContain("done");
    expect(rowOf("Servoy API Scripts")?.querySelector(".acc")).toBeNull();
    expect(rowOf("Umbau auf Todo App")?.style.getPropertyValue("--acc")).toBe("#ff453a");
    expect(rowOf("Umbau auf Todo App")?.querySelector(".acc")?.textContent).toBe("‼️");
    expect(rowOf("Reise DB")?.querySelector(".acc")?.textContent).toBe("morgen");
    expect(rowOf("Neo Basis")?.querySelector(".acc")?.textContent).toBe("1/2");
    // ⚡️, ↻, overdue flag, planned day.
    const release = rowOf("Release prüfen")?.querySelector(".acc");
    expect(release?.textContent).toBe("⚡️gesternheute");
    expect(release?.querySelector(".late")?.textContent).toBe("gestern");
  });

  it("bewegt die Auswahl über Abschnitte und Unteraufgaben und klappt mit ←/→", async () => {
    await render();
    await press("up");
    expect(app().selection).toBe(`section:${listIds.work}:later`);
    await press("up");
    await press("right");
    expect(texts(".row .t")).toContain("Steuer");
    expect(JSON.parse(localStorage.getItem("todo.sections")!).state.sections).toEqual({
      [listIds.work]: { backlog: true },
    });
    await press("up");
    await press("up");
    expect(app().selection).toBe("neo");
    await press("right");
    expect(texts(".subs .t")).toEqual(["Bridge bauen", "DB Migration"]);
    expect(rowOf("Neo Basis")?.querySelector(".acc .lucide-chevron-down")).not.toBeNull();
    await press("down");
    await press("down");
    expect(app().selection).toBe("db");
    expect(rowOf("DB Migration")?.className).toContain("sel");
    await press("left");
    expect(app().selection).toBe("neo");
    expect($(".subs")).toBeNull();
    await press("down");
    expect(app().selection).toBe("release");
  });

  it("wählt beim Öffnen einer Liste die oberste Aufgabe, in einer leeren Liste Tasks", async () => {
    await render();
    await press("mod+2");
    expect(title()).toBe("💌me");
    expect(app().selection).toBe("mama");
    expect(rowOf("Mama anrufen")?.className).toContain("sel");
    // Today's done tasks lead the list, so the first row may be a done one.
    await press("mod+3");
    expect(app().selection).toBe("praes");
    await press("down");
    expect(app().selection).toBe("rechnung");

    const zukunft = "l-zukunft" as Id<"lists">;
    backend.change(() => data.lists.push(list(zukunft, "Zukunft", "tasks", { position: 9 })));
    await run(() => app().open({ id: zukunft }));
    expect(app().selection).toBe(`section:${zukunft}:active`);
  });

  it("lässt den Inbox-Punkt stehen, bis du die Aufgabe selbst auswählst", async () => {
    backend.change(() => {
      const mama = data.tasks.find((task) => task._id === "mama")!;
      mama.isInbox = true;
    });
    await render();
    await press("mod+2");
    expect(app().selection).toBe("mama");
    expect(rowOf("Mama anrufen")?.querySelector(".inb")).not.toBeNull();
    expect(mutation("tasks:markSeen")).not.toHaveBeenCalled();
    await click(rowOf("Mama anrufen"));
    expect(mutation("tasks:markSeen")).toHaveBeenCalledWith({ taskId: "mama" });
  });

  it("löscht den Inbox-Punkt beim Auswählen still auf dem Server", async () => {
    await render();
    expect(rowOf("Reise DB")?.querySelector(".inb")).not.toBeNull();
    await click(rowOf("Reise DB"));
    expect(app().selection).toBe("reise");
    expect(rowOf("Reise DB")?.querySelector(".inb")).toBeNull();
    expect(mutation("tasks:markSeen")).toHaveBeenCalledWith({ taskId: "reise" });
    expect(mutation("tasks:markSeen")).toHaveBeenCalledTimes(1);
  });

  it("zeigt nach einem Snooze den Wecker, bis du die Aufgabe selbst auswählst", async () => {
    backend.change(() => {
      for (const task of data.tasks)
        if (task._id === "umbau" || task._id === "mama") task.isWoken = true;
    });
    await render();
    const alarm = (title: string) => rowOf(title)?.querySelector(".acc .woke");
    // In the snooze's place, before ‼️.
    expect(alarm("Umbau auf Todo App")?.getAttribute("aria-label")).toBe("Geweckt");
    expect(alarm("Umbau auf Todo App")?.nextElementSibling?.textContent).toBe("‼️");
    await click(rowOf("Servoy API Scripts"));
    await press("down");
    expect(app().selection).toBe("umbau");
    expect(alarm("Umbau auf Todo App")).toBeNull();
    expect(mutation("tasks:markSeen")).toHaveBeenCalledExactlyOnceWith({ taskId: "umbau" });

    // Opening a list selects its top task, which keeps the alarm clock.
    await press("mod+2");
    expect(app().selection).toBe("mama");
    expect(alarm("Mama anrufen")).not.toBeNull();
    expect(mutation("tasks:markSeen")).toHaveBeenCalledTimes(1);
  });

  it("benennt mit ↵ um, speichert mit ↵, verwirft mit esc und erledigt mit ⌘↵", async () => {
    await render();
    await run(() => app().select("umbau"));
    await press("enter");
    expect((document.activeElement as HTMLInputElement).value).toBe("Umbau auf Todo App");
    await type("Umbau auf Listen");
    await press("enter");
    expect(mutation("tasks:update")).toHaveBeenCalledWith({
      taskId: "umbau",
      title: "Umbau auf Listen",
    });
    expect($(".row.edit")).toBeNull();

    await press("enter");
    await type("Verworfen");
    await press("escape");
    expect(mutation("tasks:update")).toHaveBeenCalledTimes(1);
    expect(rowOf("Umbau auf Todo App")).toBeDefined();

    await press("enter");
    await type("Umbau fertig");
    await press("mod+enter");
    expect(mutation("tasks:update")).toHaveBeenLastCalledWith({
      taskId: "umbau",
      title: "Umbau fertig",
    });
    expect(mutation("tasks:complete")).toHaveBeenCalledWith({ taskId: "umbau" });
    expect(mutation("tasks:update").mock.invocationCallOrder.at(-1)).toBeLessThan(
      mutation("tasks:complete").mock.invocationCallOrder[0]!,
    );
  });

  it("behält beim Doppelklick ins Titelfeld das Umbenennen, das ↵ und esc beenden", async () => {
    const doubleClick = (element: Element | null | undefined) =>
      act(async () => {
        element?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      });
    await render();
    await doubleClick(rowOf("Umbau auf Todo App")?.querySelector(".t"));
    expect(app().editing).toEqual({ type: "rename", id: "umbau" });
    // Selecting a word in the field is a double click too.
    await doubleClick(document.activeElement);
    await type("Umbau auf Listen");
    await press("enter");
    expect(mutation("tasks:update")).toHaveBeenCalledWith({
      taskId: "umbau",
      title: "Umbau auf Listen",
    });
    expect(app().editing).toBeNull();

    await press("enter");
    await doubleClick(document.activeElement);
    await press("escape");
    expect(app().editing).toBeNull();

    // A double click on the checkbox toggles, it does not rename.
    await doubleClick(rowOf("Reise DB")?.querySelector(".cb"));
    expect(app().editing).toBeNull();
  });

  it("beschreibt Zeilen, Abschnitte und Punkte für VoiceOver", async () => {
    await render();
    expect($(".list")?.getAttribute("role")).toBe("listbox");
    expect(rowOf("Servoy API Scripts")?.querySelector(".cb")?.getAttribute("aria-label")).toBe(
      "Servoy API Scripts wieder öffnen",
    );
    expect($$(".sec").map((header) => header.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    await run(() => app().select("umbau"));
    expect(rowOf("Umbau auf Todo App")?.getAttribute("aria-selected")).toBe("true");
    expect(rowOf("Reise DB")?.getAttribute("aria-selected")).toBe("false");
    await press("mod+5");
    expect(rowOf("Sport")?.querySelector(".wk")?.getAttribute("aria-label")).toBe("5 von 6 Tagen");
  });

  it("legt mit ⌘N unter dem Erledigten an, ohne Inbox, und behält bei Fehlern den Entwurf", async () => {
    await render();
    await press("mod+n");
    expect($(".row.done + .row.edit")).not.toBeNull();
    expect((document.activeElement as HTMLInputElement).placeholder).toBe("Neue Aufgabe");
    await type("Angebot schreiben");
    await press("enter");
    expect(mutation("tasks:create")).toHaveBeenCalledWith({
      title: "Angebot schreiben",
      listId: listIds.work,
      section: "active",
      isInbox: false,
    });
    expect(app().editing).toBeNull();
    expect(app().selection).toBe("new-task");

    mutation("tasks:create").mockRejectedValueOnce(new Error("write failed"));
    await press("mod+n");
    await type("Idee");
    await press("enter");
    expect((document.activeElement as HTMLInputElement).value).toBe("Idee");
    expect($(".toast")?.textContent).toBe(
      "Die Änderung konnte nicht gespeichert werden. Bitte versuche es erneut.",
    );
    await press("escape");

    await run(() => app().select("neo"));
    await press("shift+mod+n");
    await type("Tests schreiben");
    await press("enter");
    expect(mutation("tasks:addSubtask")).toHaveBeenCalledWith({
      taskId: "neo",
      title: "Tests schreiben",
    });
  });

  it("erledigt mit ⌘↵, öffnet heute Erledigtes wieder und zeigt Fehler ohne Haken", async () => {
    mutation("tasks:complete").mockRejectedValueOnce(
      convexError("Die Aufgabe ist schon erledigt."),
    );
    await render();
    await click(rowOf("Umbau auf Todo App")?.querySelector(".cb"));
    expect($(".toast")?.textContent).toBe("Die Aufgabe ist schon erledigt.");
    expect(rowOf("Umbau auf Todo App")?.querySelector(".cb")?.getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(rowOf("Umbau auf Todo App")?.className).not.toContain("done");

    await press("mod+enter");
    expect(mutation("tasks:complete")).toHaveBeenLastCalledWith({ taskId: "umbau" });
    await run(() => app().select("servoy"));
    await press("mod+enter");
    expect(mutation("tasks:reopen")).toHaveBeenCalledWith({ taskId: "servoy" });

    // A subtask completes alone, its parent stays open.
    await run(() => app().setExpanded("neo", true));
    await click(rowOf("DB Migration")?.querySelector(".cb"));
    expect(mutation("tasks:complete")).toHaveBeenLastCalledWith({ taskId: "db" });
    expect(rowOf("Neo Basis")?.querySelector(".cb")?.getAttribute("aria-checked")).toBe("false");
  });

  it("rückt mit ⇥ ein und mit ⇧⇥ aus, aber nicht in Wichtig", async () => {
    await render();
    await run(() => app().select("reise"));
    await press("tab");
    expect(mutation("tasks:indent")).toHaveBeenCalledWith({ taskId: "reise" });
    // The open root above becomes the parent and shows its subtasks.
    expect(app().expanded.umbau).toBe(true);
    // Tasks with subtasks stay roots.
    await run(() => app().select("neo"));
    await press("tab");
    expect(mutation("tasks:indent")).toHaveBeenCalledTimes(1);

    await run(() => app().setExpanded("neo", true));
    await run(() => app().select("db"));
    await press("shift+tab");
    expect(mutation("tasks:outdent")).toHaveBeenCalledWith({ taskId: "db" });

    await press("mod+1");
    await run(() => app().select("mama"));
    await press("tab");
    await press("alt+down");
    expect(mutation("tasks:indent")).toHaveBeenCalledTimes(1);
    expect(mutation("tasks:reorder")).not.toHaveBeenCalled();
  });
});

describe("Panels", () => {
  it("zeigt in ⌘K die passenden Aktionen in fester Reihenfolge und führt sie aus", async () => {
    await render();
    await run(() => app().select("reise"));
    await press("mod+k");
    expect(panelRows()).toEqual([
      "Wichtig",
      "KI-Aufgabe",
      "Einplanen …",
      "Fällig am …",
      "Zurückstellen …",
      "Verschieben …",
      "In den Backlog",
      "Erledigen",
      "Titel bearbeiten",
      "Unteraufgabe",
      "Einrücken",
      "Nach oben",
      "Nach unten",
      "Verwerfen",
    ]);
    expect($$(".pal .sep")).toHaveLength(2);
    expect(panelValue("Wichtig")).toBe("⌘I");
    expect(panelValue("Einrücken")).toBe("⇥");
    expect($(".pal .pi.danger .pt")?.textContent).toBe("Verwerfen");
    await type("backlog");
    await press("enter");
    expect(mutation("tasks:move")).toHaveBeenCalledWith({ taskId: "reise", section: "backlog" });
    expect($(".pal")).toBeNull();

    // Shortcuts of the rows also run while the panel is open.
    await press("mod+k");
    await press("mod+i");
    expect(mutation("tasks:update")).toHaveBeenCalledWith({ taskId: "reise", highPriority: true });
    expect($(".pal")).toBeNull();

    // Overdue: Normal einordnen; recurring: no Einrücken.
    await run(() => app().select("release"));
    await press("mod+k");
    expect(panelRows().slice(0, 9)).toEqual([
      "Wichtig",
      "Keine KI-Aufgabe",
      "Einplanen …",
      "Fällig am …",
      "Zurückstellen …",
      "Verschieben …",
      "In den Backlog",
      "Normal einordnen",
      "Erledigen",
    ]);
    expect(panelRows()).not.toContain("Einrücken");
    await press("escape");

    // Subtasks only get what applies to them.
    await run(() => app().setExpanded("neo", true));
    await run(() => app().select("db"));
    await press("mod+k");
    expect(panelRows()).toEqual([
      "KI-Aufgabe",
      "Erledigen",
      "Titel bearbeiten",
      "Unteraufgabe",
      "Ausrücken",
      "Nach oben",
      "Nach unten",
      "Verwerfen",
    ]);
    await press("escape");

    // Right click opens the same panel.
    await act(async () => {
      rowOf("Umbau auf Todo App")!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    expect(app().selection).toBe("umbau");
    expect(panelRows()[0]).toBe("Nicht mehr wichtig");
  });

  it("bietet Unteraufgaben nur unter offenen Aufgaben an", async () => {
    await render();
    await run(() => app().select("servoy"));
    await press("mod+k");
    expect(panelRows()).not.toContain("Unteraufgabe");
    await press("escape");
    await press("shift+mod+n");
    expect(app().editing).toBeNull();

    // A done subtask of an open task still adds to that task.
    await run(() => app().setExpanded("neo", true));
    await run(() => app().select("bridge"));
    await press("mod+k");
    expect(panelRows()).toContain("Unteraufgabe");
    await press("escape");
    await press("shift+mod+n");
    expect(app().editing).toEqual({ type: "create", parentId: "neo" });
  });

  it("leert die Suche mit ⌘⌫, bevor ⌘⌫ verwirft", async () => {
    await render();
    await run(() => app().select("umbau"));
    await press("mod+k");
    await type("erl");
    await press("mod+backspace");
    expect(mutation("tasks:discard")).not.toHaveBeenCalled();
    expect((document.activeElement as HTMLInputElement).value).toBe("");
    expect(app().panels).toEqual([{ type: "actions", taskId: "umbau" }]);
    await press("mod+backspace");
    expect(mutation("tasks:discard")).toHaveBeenCalledWith({ taskId: "umbau" });
    expect($(".pal")).toBeNull();
  });

  it("schließt Panels, deren Aufgabe anderswo verschwindet", async () => {
    await render();
    await run(() => app().select("umbau"));
    await press("mod+k");
    await type("einpl");
    await press("enter");
    expect(app().panels.map((panel) => panel.type)).toEqual(["actions", "date"]);
    // Moved away on another device: both panels on it close, the keys work again.
    await act(async () =>
      backend.change(() => (data.tasks = data.tasks.filter((row) => row._id !== "umbau"))),
    );
    expect(app().panels).toEqual([]);
    expect($(".pal-layer")).toBeNull();
    await press("down");
    expect(app().selection).toBe("neo");
  });

  it("erkennt im Datumspanel getippte Tage und Uhrzeiten", async () => {
    await render();
    await run(() => app().select("umbau"));
    await press("mod+e");
    expect($(".pal .crumb")?.textContent).toBe("Einplanen");
    expect($(".pal input")?.getAttribute("placeholder")).toBe("Tag oder Datum …");
    expect(panelRows()).toEqual([
      "Heute",
      "Morgen",
      "Am Wochenende",
      "Nächste Woche",
      "In zwei Wochen",
      "Kein Datum",
    ]);
    expect(texts(".pal .pacc")).toEqual([
      "Do., 8. Okt.",
      "Fr., 9. Okt.",
      "Sa., 10. Okt.",
      "Mo., 12. Okt.",
      "Do., 22. Okt.",
    ]);
    await type("15.10.");
    expect(panelRows()).toEqual(["Do., 15. Okt."]);
    expect(panelValue("Do., 15. Okt.")).toBe("in 7 Tagen");
    await press("enter");
    expect(mutation("tasks:plan")).toHaveBeenCalledWith({
      taskId: "umbau",
      plannedFor: "2026-10-15",
    });

    await press("shift+mod+e");
    expect($(".pal .crumb")?.textContent).toBe("Fällig am");
    await type("übermorgen");
    await press("enter");
    expect(mutation("tasks:plan")).toHaveBeenLastCalledWith({
      taskId: "umbau",
      dueOn: "2026-10-10",
    });

    await press("mod+e");
    await press("backspace");
    expect(mutation("tasks:plan")).toHaveBeenLastCalledWith({ taskId: "umbau", plannedFor: null });

    await press("mod+l");
    expect(panelRows()[0]).toBe("Heute 18:00");
    await type("morgen 14");
    expect(panelRows()[0]).toBe("Fr., 9. Okt., 14:00");
    await press("enter");
    expect(mutation("tasks:snooze")).toHaveBeenCalledWith({
      taskId: "umbau",
      snoozedUntil: Date.parse("2026-10-09T12:00:00Z"),
    });
  });

  it("verschiebt in eine andere normale Liste", async () => {
    await render();
    await run(() => app().select("umbau"));
    await press("shift+mod+m");
    expect($(".pal .crumb")?.textContent).toBe("Verschieben");
    expect(panelRows()).toEqual(["me", "agency", "work", "Urlaub"]);
    expect(panelValue("work")).toBe("aktuell");
    await type("url");
    await press("enter");
    expect(mutation("tasks:move")).toHaveBeenCalledWith({
      taskId: "umbau",
      listId: listIds.urlaub,
      section: "active",
    });
  });
});

describe("Einstellungen", () => {
  it("zeigt Abschnitte und schaltet Fenstereinstellungen und den Kurzbefehl", async () => {
    await render();
    await press("mod+,");
    expect(texts(".pal .ps")).toEqual(["Fenster", "Konto", "Schlüssel", "Info"]);
    expect(panelRows()).toEqual([
      "Immer im Vordergrund",
      "Auf allen Schreibtischen",
      "Beim Anmelden starten",
      "Kurzbefehl",
      "Standardliste",
      "Zeitzone",
      "Neuer Integrationsschlüssel",
      "task-capture Claude",
      "todo auf iMac",
      "Version",
      "Server",
      "Dieser Mac",
      "Schlüssel aktiv",
      "Abmelden",
    ]);
    expect(panelValue("Kurzbefehl")).toBe("⇧⌘Leertaste");
    expect(panelValue("Standardliste")).toBe("💌me");
    expect(panelValue("Zeitzone")).toBe("Europe/Berlin");
    expect(panelValue("task-capture Claude")).toBe("seit 2. Okt.");
    expect(panelValue("Version")).toBe("0.2.0");
    expect(panelValue("Server")).toBe("test.convex.site");
    expect(panelValue("Dieser Mac")).toBe("todo auf MacBook Pro");
    expect(panelValue("Schlüssel aktiv")).toBe("3 von 30");
    expect($$(".pal .pi.info").every((row) => row.getAttribute("aria-disabled") === "true")).toBe(
      true,
    );
    expect($(".pal .pi.danger .pt")?.textContent).toBe("Abmelden");

    await press("enter");
    expect(bridge.setPreferences).toHaveBeenCalledWith({ alwaysOnTop: false });
    await type("kurz");
    await press("enter");
    expect(panelValue("Kurzbefehl")).toBe("Tasten drücken …");
    // ⇧ alone is not enough for a global shortcut: keep listening.
    await press("shift+a");
    expect(panelValue("Kurzbefehl")).toBe("Tasten drücken …");
    expect(bridge.setPreferences).toHaveBeenCalledTimes(1);
    await press("alt+mod+k");
    expect(bridge.setPreferences).toHaveBeenLastCalledWith({
      shortcut: "CommandOrControl+Alt+K",
    });

    await type("abmelden");
    await press("enter");
    expect(bridge.disconnect).toHaveBeenCalledTimes(1);
  });

  it("zeigt vor der Anmeldung nur Fenster und Info", async () => {
    backend.platform = platformState({ configured: false });
    await render();
    await press("mod+,");
    expect(texts(".pal .ps")).toEqual(["Fenster", "Info"]);
    expect(panelRows()).not.toContain("Abmelden");
  });

  it("zeigt im Browser nur, was die Plattform kann", async () => {
    // No window preferences, integration keys or emoji picker.
    const web: Platform = {
      kind: "web",
      getState: bridge.getState,
      onState: bridge.onState,
      login: bridge.login,
      cancelLogin: bridge.cancelLogin,
      disconnect: bridge.disconnect,
      fetchAccessToken: bridge.fetchAccessToken,
    };
    backend.platform = platformState({ preferences: undefined });
    await render(web);
    await press("mod+,");
    expect(texts(".pal .ps")).toEqual(["Konto", "Schlüssel", "Info"]);
    expect(panelRows()).not.toContain("Neuer Integrationsschlüssel");
    expect(panelValue("Dieses Gerät")).toBe("todo auf MacBook Pro");

    await run(() => app().closePanels());
    await run(() => app().openPanel({ type: "listEmoji", listId: listIds.urlaub }));
    expect(panelRows()).toContain("Emoji über die Tastatur eingeben");
    expect(panelRows()).not.toContain("Emoji-Auswahl öffnen");
  });

  it("zeigt einen neuen Integrationsschlüssel genau einmal und kopiert ihn", async () => {
    const secret = "todo_N3wPq8LsYk2RmT7vXc0bJ4eHfU9aD1gQz6WoS5iEx7r";
    const creation = Promise.withResolvers<CreatedIntegrationKey>();
    vi.mocked(bridge.createIntegrationKey).mockReturnValueOnce(creation.promise);
    await render();
    await press("mod+,");
    await type("neuer");
    await press("enter");
    expect($(".pal .crumb")?.textContent).toBe("Neuer Schlüssel");
    await type("task-capture");
    await press("enter");
    expect(bridge.createIntegrationKey).toHaveBeenCalledWith("task-capture");
    expect(panelRows()).toEqual(["Warte auf den Browser …", "Abbrechen"]);
    await act(async () =>
      creation.resolve({ id: "k-new", name: "task-capture", prefix: "todo_N3wPq8Ls", key: secret }),
    );
    expect($(".pal .secret")?.textContent).toBe(secret);
    await press("mod+c");
    expect(bridge.copyText).toHaveBeenCalledWith(secret);
    expect(panelRows()).toEqual(["Kopiert", "Fertig"]);
    await press("escape");
    expect(app().panels).toEqual([{ type: "settings" }]);
    expect(container.textContent).not.toContain(secret);
  });

  it("widerruft einen Schlüssel, der zu spät nach dem Abbrechen kommt", async () => {
    const creation = Promise.withResolvers<CreatedIntegrationKey>();
    vi.mocked(bridge.createIntegrationKey).mockReturnValueOnce(creation.promise);
    await render();
    await press("mod+,");
    await type("neuer");
    await press("enter");
    await type("Raycast");
    await press("enter");
    await press("escape");
    expect(bridge.cancelLogin).toHaveBeenCalledTimes(1);
    expect(app().panels).toEqual([{ type: "settings" }]);
    await act(async () =>
      creation.resolve({ id: "k-late", name: "Raycast", prefix: "todo_late", key: "todo_late" }),
    );
    expect(mutation("auth:revokeApiKey")).toHaveBeenCalledWith({ id: "k-late" });
  });

  it("widerruft markierte Schlüssel mit ⌘⌫, nie den dieses Macs, und sperrt bei 30", async () => {
    await render();
    await press("mod+,");
    expect(panelRows()).not.toContain("todo auf MacBook Pro");
    await type("imac");
    expect(panelRows()).toEqual(["todo auf iMac"]);
    expect(panelValue("todo auf iMac")).toBe("⌘⌫");
    // The first ⌘⌫ only clears the search; the key stays highlighted for the second.
    await press("mod+backspace");
    expect(mutation("auth:revokeApiKey")).not.toHaveBeenCalled();
    expect(panelValue("todo auf iMac")).toBe("⌘⌫");
    await press("mod+backspace");
    expect(mutation("auth:revokeApiKey")).toHaveBeenCalledWith({ id: "k-imac" });
    await press("escape");

    await act(async () =>
      backend.change(() =>
        data.keys.push(
          ...Array.from({ length: 27 }, (_, index) =>
            apiKey(`k-${index}`, `Schlüssel ${index}`, "2026-10-03T10:00:00Z"),
          ),
        ),
      ),
    );
    await press("mod+,");
    const newKey = $$(".pal .pi").find((row) => row.textContent === "Neuer Integrationsschlüssel");
    expect(newKey?.getAttribute("aria-disabled")).toBe("true");
    expect(panelValue("Schlüssel aktiv")).toBe("30 von 30");
  });

  it("speichert Standardliste und Zeitzone für alle Geräte", async () => {
    await render();
    await press("mod+,");
    await type("standard");
    await press("enter");
    expect($(".pal .crumb")?.textContent).toBe("Standardliste");
    expect(panelRows()).toEqual(["me", "agency", "work", "Urlaub"]);
    expect(panelValue("me")).toBe("aktuell");
    await type("agency");
    await press("enter");
    expect(mutation("settings:update")).toHaveBeenCalledWith({ defaultListId: listIds.agency });
    expect(app().panels).toEqual([{ type: "settings" }]);

    await type("zeit");
    await press("enter");
    expect($(".pal .crumb")?.textContent).toBe("Zeitzone");
    // ⌘, keeps Settings and its open picker.
    await press("mod+,");
    expect(app().panels).toEqual([{ type: "settings" }, { type: "timeZone" }]);
    await type("kyiv");
    expect(panelRows()[0]).toBe("Europe/Kyiv");
    await press("enter");
    expect(mutation("settings:update")).toHaveBeenLastCalledWith({ timeZone: "Europe/Kyiv" });
    expect(app().panels).toEqual([{ type: "settings" }]);
  });
});

describe("Sonderlisten", () => {
  it("gruppiert Wichtig nach Liste in Reihenfolge der Seitenleiste", async () => {
    await render();
    await press("mod+1");
    expect(texts(".sec")).toEqual(["💌me1", "🪴agency1", "💻work2", "UUrlaub1"]);
    expect(texts(".row .t")).toEqual([
      "Mama anrufen",
      "Präsentation schicken",
      "Rechnung schreiben",
      "Umbau auf Todo App",
      "Release prüfen",
      "Pass verlängern",
    ]);
    expect(rowOf("Präsentation schicken")?.className).toContain("done");
    // Checkboxes take the color of the source list.
    expect(rowOf("Mama anrufen")?.style.getPropertyValue("--acc")).toBe("#64d2ff");
    expect(rowOf("Pass verlängern")?.style.getPropertyValue("--acc")).toBe("#ffd60a");
  });

  it("zeigt Habits mit Heute-Zähler und sechs Punkten und legt mit ⌘N einen an", async () => {
    await render();
    await press("mod+5");
    expect(texts(".sec")).toEqual(["Heute1/3"]);
    expect(texts(".row .t")).toEqual(["Sport", "Wasser trinken", "Journal"]);
    const dots = (name: string) =>
      [...rowOf(name)!.querySelectorAll(".wk i")].map((dot) => dot.className === "on");
    expect(dots("Sport")).toEqual([true, true, false, true, true, true]);
    expect(dots("Wasser trinken")).toEqual([false, true]);
    expect(dots("Journal")).toEqual([false, false, false, false, false, false]);
    expect(rowOf("Sport")?.style.getPropertyValue("--acc")).toBe("#30d158");

    await press("mod+n");
    expect((document.activeElement as HTMLInputElement).placeholder).toBe("Neuer Habit");
    await type("Dehnen");
    await press("enter");
    expect(mutation("recurrences:create")).toHaveBeenCalledWith({
      title: "Dehnen",
      kind: "habit",
      rule: { frequency: "daily" },
    });
  });

  it("zeigt den Verlauf nach Tagen mit Uhrzeit und lädt weitere Tage", async () => {
    await render();
    await act(async () => navigate("history"));
    expect(title()).toBe("🕘Verlauf");
    expect(texts(".sec")).toEqual(["Heute2", "Gestern1"]);
    expect(texts(".row .time")).toEqual(["09:12", "14:20", "18:20", ""]);
    const subtask = rowOf("DB Migration");
    expect(subtask?.querySelector(".pre")?.textContent).toBe("Neo Basis");
    expect(subtask?.querySelector(".acc [title]")?.getAttribute("title")).toBe("work");
    expect(subtask?.querySelector(".acc")?.textContent).toBe("💻");
    // A deleted list keeps its name from the snapshot.
    expect(rowOf("Logo abgestimmt")?.querySelector(".acc .lg")?.textContent).toBe("A");
    expect(rowOf("Weitere laden")).toBeDefined();

    // Opening the list selects its first entry; three rows down is "Weitere laden".
    await press("down");
    await press("down");
    await press("down");
    await press("enter");
    expect(texts(".sec")).toEqual(["Heute2", "Gestern1", "Di., 6. Okt.1", "Mo., 5. Okt.1"]);
    expect(rowOf("Weitere laden")).toBeUndefined();
  });

  it("pausiert, setzt fort und benennt Wiederholungen um", async () => {
    mutation("recurrences:update").mockImplementation(
      async ({ recurrenceId, ...patch }: { recurrenceId: string }) => {
        backend.change(() => {
          data.recurrences = data.recurrences.map((item) =>
            item._id === recurrenceId ? { ...item, ...patch } : item,
          );
        });
        return recurrenceId;
      },
    );
    await render();
    await act(async () => navigate("recurrences"));
    expect(texts(".sec")).toEqual(["me1", "work1", "Habits2"]);
    expect(texts(".row .t")).toEqual(["Miete überweisen", "Wochenbericht", "Sport", "Joggen"]);
    expect(rowOf("Miete überweisen")?.querySelector(".acc")?.textContent).toBe("monatlich am 1.");
    expect(rowOf("Wochenbericht")?.querySelector(".acc")?.textContent).toBe("jeden Fr.");
    expect(rowOf("Sport")?.querySelector(".acc")).toBeNull();
    expect(rowOf("Joggen")?.className).toContain("dim");
    expect(rowOf("Joggen")?.querySelector(".acc")?.textContent).toBe("pausiert");
    expect(rowOf("Wochenbericht")?.style.getPropertyValue("--acc")).toBe("#ff453a");

    // Opening the list already selected its first row.
    await press("mod+k");
    expect(panelRows()).toEqual(["Pausieren", "Umbenennen", "Löschen"]);
    expect($(".pal .pi.danger .pt")?.textContent).toBe("Löschen");
    expect(panelValue("Löschen")).toBe("⌘⌫");
    await press("enter");
    expect(mutation("recurrences:update")).toHaveBeenCalledWith({
      recurrenceId: "r-miete",
      enabled: false,
    });
    expect(rowOf("Miete überweisen")?.className).toContain("dim");

    await run(() => app().select("r-joggen"));
    await press("mod+k");
    expect(panelRows()[0]).toBe("Fortsetzen");
    await press("enter");
    expect(mutation("recurrences:update")).toHaveBeenLastCalledWith({
      recurrenceId: "r-joggen",
      enabled: true,
    });
    expect(rowOf("Joggen")?.className).not.toContain("dim");

    await run(() => app().select("r-week"));
    await press("enter");
    expect((document.activeElement as HTMLInputElement).value).toBe("Wochenbericht");
    await type("Wochenbericht schreiben");
    await press("enter");
    expect(mutation("recurrences:update")).toHaveBeenLastCalledWith({
      recurrenceId: "r-week",
      title: "Wochenbericht schreiben",
    });
    expect(rowOf("Wochenbericht schreiben")).toBeDefined();

    // Löschen also works on paused ones.
    await run(() => app().select("r-miete"));
    await press("mod+k");
    await press("mod+backspace");
    expect(mutation("recurrences:remove")).toHaveBeenCalledWith({ recurrenceId: "r-miete" });
    expect($(".pal")).toBeNull();
  });
});

describe("Touch", () => {
  // happy-dom answers (pointer: coarse) and (hover: hover) from maxTouchPoints.
  beforeEach(() => {
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 5 });
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(now);
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, "maxTouchPoints");
  });
  /** Sets a native picker's value, like the system picker does. */
  async function pick(input: HTMLElement | null | undefined, value: string, event: string) {
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing picker.");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event(event, { bubbles: true }));
    });
  }
  const panelRow = (label: string) =>
    $$(".pal .pi").find((row) => row.querySelector(".pt")?.textContent === label);
  /** Labels of the drawer's tiles, and the tile with that label. */
  const tiles = () => texts(".pal .tile .tl");
  const tile = (label: string) =>
    $$(".pal .tile").find((element) => element.querySelector(".tl")?.textContent === label);
  /** One finger on `element` at height `y`, as iOS reports it. */
  async function finger(type: string, element: Element | null | undefined, y: number) {
    if (!element) throw new Error("Missing element.");
    await act(async () => {
      element.dispatchEvent(
        new PointerEvent(type, { pointerType: "touch", pointerId: 1, clientY: y, bubbles: true }),
      );
    });
  }
  /** Lets a resting finger turn into a long press. */
  const wait = () => act(async () => vi.advanceTimersByTime(450));
  /** A tap: the finger down and up, then the mouse events iOS sends for it. */
  async function tap(element: Element | null | undefined) {
    await finger("pointerdown", element, 100);
    await finger("pointerup", element, 100);
    await click(element);
  }
  /** A long press let go in place, then the click iOS may send after it. */
  async function hold(element: Element | null | undefined) {
    await finger("pointerdown", element, 100);
    await wait();
    await finger("pointerup", element, 100);
    await click(element);
  }
  const field = () => document.activeElement as HTMLInputElement;

  it("benennt mit einem Tipp auf die Zeile um, Checkbox und 0/5 behalten ihren Tipp", async () => {
    await render();
    await tap(rowOf("Reise DB")?.querySelector(".cb"));
    expect(mutation("tasks:complete")).toHaveBeenCalledWith({ taskId: "reise" });
    await tap(rowOf("Neo Basis")?.querySelector("[aria-expanded]"));
    expect(app().expanded.neo).toBe(true);
    expect(app().editing).toBeNull();

    await tap(rowOf("Umbau auf Todo App")?.querySelector(".t"));
    expect(app().selection).toBe("umbau");
    expect(app().editing).toEqual({ type: "rename", id: "umbau" });
    expect(field().value).toBe("Umbau auf Todo App");
    expect(app().panels).toEqual([]);
  });

  it("nimmt den Wecker mit einem Tipp weg, die Schublade eines langen Drucks zeigt ihn nicht", async () => {
    backend.change(() => {
      for (const task of data.tasks)
        if (task._id === "umbau" || task._id === "reise") task.isWoken = true;
    });
    await render();
    // The edited row shows a field instead of its title, so rows are found by id here.
    const alarm = (id: string) => $(`[data-task="${id}"] .woke`);
    expect(alarm("umbau")).not.toBeNull();
    await tap(rowOf("Umbau auf Todo App")?.querySelector(".t"));
    expect(app().editing).toEqual({ type: "rename", id: "umbau" });
    expect(alarm("umbau")).toBeNull();
    expect(mutation("tasks:markSeen")).toHaveBeenCalledWith({ taskId: "umbau" });

    await hold(rowOf("Reise DB"));
    expect(app().panels).toEqual([{ type: "actions", taskId: "reise" }]);
    expect(alarm("reise")).toBeNull();
    expect($(".pal .hd .woke")).toBeNull();
    expect(mutation("tasks:markSeen")).toHaveBeenCalledWith({ taskId: "reise" });
  });

  it("wechselt mit einem Tipp auf eine andere Zeile das Bearbeiten und speichert die erste", async () => {
    await render();
    await tap(rowOf("Umbau auf Todo App")?.querySelector(".t"));
    await type("Umbau auf Listen");
    await tap(rowOf("Reise DB")?.querySelector(".t"));
    expect(mutation("tasks:update")).toHaveBeenCalledExactlyOnceWith({
      taskId: "umbau",
      title: "Umbau auf Listen",
    });
    expect(app().editing).toEqual({ type: "rename", id: "reise" });
    const reise = field();
    expect(reise.value).toBe("Reise DB");

    // A tap on the row being edited leaves the edit alone.
    await tap($(".row.edit"));
    expect(app().editing).toEqual({ type: "rename", id: "reise" });
    expect(field()).toBe(reise);
  });

  it("lässt eine neue Bearbeitung offen, wenn der Save der vorigen derselben Zeile spät endet", async () => {
    await render();
    const save = Promise.withResolvers<null>();
    mutation("tasks:update").mockReturnValueOnce(save.promise);
    await tap(rowOf("Umbau auf Todo App")?.querySelector(".t"));
    await type("Umbau auf Listen");
    await tap(rowOf("Reise DB")?.querySelector(".t"));
    // Straight back before the server answers.
    await tap(rowOf("Umbau auf Todo App")?.querySelector(".t"));
    const umbau = field();
    await act(async () => save.resolve(null));
    expect(app().editing).toEqual({ type: "rename", id: "umbau" });
    expect(field()).toBe(umbau);
  });

  it("öffnet mit langem Druck beim Loslassen die Aktionen als Schublade und schluckt den Klick", async () => {
    await render();
    const reise = rowOf("Reise DB");
    // A finger that moves before the hold is scrolling: nothing lifts, opens or edits.
    await finger("pointerdown", reise, 100);
    await finger("pointermove", reise, 109);
    await wait();
    await finger("pointerup", reise, 109);
    expect(reise?.dataset.lift).toBeUndefined();
    expect(app().panels).toEqual([]);

    // The hold only lifts the row; letting go opens the drawer under its title.
    await finger("pointerdown", reise, 100);
    await wait();
    expect(reise?.dataset.lift).toBe("");
    expect(app().panels).toEqual([]);
    await finger("pointerup", reise, 104);
    expect(reise?.dataset.lift).toBeUndefined();
    expect(app().selection).toBe("reise");
    expect(app().panels).toEqual([{ type: "actions", taskId: "reise" }]);
    expect($(".pal .hd .ht")?.textContent).toBe("Reise DB");
    expect($(".pal input")).toBeNull();
    expect($(".pal .pi.sel")).toBeNull();
    // The click iOS may send on release lands on the layer and closes nothing.
    await click($(".pal-layer"));
    expect(app().panels).toEqual([{ type: "actions", taskId: "reise" }]);
    expect(app().editing).toBeNull();
    await click($(".pal-layer"));
    expect($(".pal")).toBeNull();

    // A cancel after the hold opens nothing.
    await finger("pointerdown", reise, 100);
    await wait();
    await finger("pointercancel", reise, 100);
    expect(reise?.dataset.lift).toBeUndefined();
    expect(app().panels).toEqual([]);
  });

  it("hebt auch Zeilen, die sich nicht ziehen lassen, und öffnet nur beim Loslassen", async () => {
    await render();
    // Nothing drags while editing; letting go saves the edit and opens the sheet.
    await tap(rowOf("Umbau auf Todo App")?.querySelector(".t"));
    await type("Umbau auf Listen");
    const reise = rowOf("Reise DB");
    await finger("pointerdown", reise, 100);
    await wait();
    expect(reise?.dataset.lift).toBe("");
    await finger("pointerup", reise, 100);
    await click(reise);
    expect(mutation("tasks:update")).toHaveBeenCalledWith({
      taskId: "umbau",
      title: "Umbau auf Listen",
    });
    expect(app().editing).toBeNull();
    expect(app().panels).toEqual([{ type: "actions", taskId: "reise" }]);
    await click($(".pal-layer"));

    // In Wichtig a finger that moves after the hold puts the row back and opens nothing.
    await click($(".side [aria-label='Wichtig']"));
    const mama = rowOf("Mama anrufen");
    await finger("pointerdown", mama, 100);
    await wait();
    await finger("pointermove", mama, 140);
    expect(mama?.dataset.lift).toBeUndefined();
    expect(mama?.style.transform).toBe("");
    await finger("pointerup", mama, 140);
    expect(app().panels).toEqual([]);
    expect(mutation("tasks:reorder")).not.toHaveBeenCalled();
    await hold(mama);
    expect(app().panels).toEqual([{ type: "actions", taskId: "mama" }]);
  });

  it("benennt Wiederholungen mit einem Tipp um und öffnet mit langem Druck ihre Aktionen", async () => {
    await render();
    await act(async () => navigate("recurrences"));
    await tap(rowOf("Wochenbericht")?.querySelector(".t"));
    expect(app().editing).toEqual({ type: "rename", id: "r-week" });
    expect(field().value).toBe("Wochenbericht");
    await press("escape");

    await hold(rowOf("Miete überweisen"));
    expect(app().selection).toBe("r-miete");
    expect(app().panels).toEqual([{ type: "recurrenceActions", recurrenceId: "r-miete" }]);
    expect(app().editing).toBeNull();
  });

  it("wählt beim Öffnen nichts aus und markiert erst mit einer Suche die erste Zeile", async () => {
    await render();
    await click($(".side [aria-label='me']"));
    expect(title()).toBe("💌me");
    expect(app().selection).toBeNull();

    await hold(rowOf("Mama anrufen"));
    await click(tile("Einplanen"));
    const search = $(".pal input");
    expect(document.activeElement).not.toBe(search);
    expect($(".pal .pi.sel")).toBeNull();
    await act(async () => search?.focus());
    await type("mo");
    expect($(".pal .pi.sel .pt")?.textContent).toBe("Mo., 12. Okt.");
  });

  it("öffnet mit dem Titel die Listensuche und zeigt die Blase des Punkts 2 s lang", async () => {
    await render();
    await click($(".ttl"));
    expect(app().panels).toEqual([{ type: "switcher" }]);
    expect(document.activeElement).not.toBe($(".pal input"));
    await click($(".pal-layer"));

    await click($(".st"));
    expect($(".st")?.className).toBe("st ok show");
    await act(async () => vi.advanceTimersByTime(2000));
    expect($(".st")?.className).toBe("st ok");
  });

  it("legt mit dem runden + in der Standardliste an und blendet es beim Bearbeiten aus", async () => {
    await render();
    expect($(".side [aria-label='Neue Aufgabe']")).toBeNull();
    expect($$(".side .ri").at(-1)?.getAttribute("aria-label")).toBe("Einstellungen");
    await click($(".side [aria-label='Wichtig']"));
    await click($(".fab"));
    expect(title()).toBe("💌me");
    expect(app().editing).toEqual({ type: "create" });
    expect(field().placeholder).toBe("Neue Aufgabe");
    expect($(".fab")).toBeNull();
    await press("escape");
    expect($(".fab")?.getAttribute("aria-label")).toBe("Neue Aufgabe");
    // Hidden under a panel too.
    await hold(rowOf("Mama anrufen"));
    expect($(".fab")).toBeNull();
  });

  it("hält mit dem runden + die Tastatur, bis die Standardliste geladen ist", async () => {
    await render();
    await click($(".side [aria-label='Wichtig']"));
    const deferred = backend.queries["tasks:deferred"]!;
    await run(() => backend.change(() => (backend.queries["tasks:deferred"] = () => undefined)));
    onTestFinished(() => void (backend.queries["tasks:deferred"] = deferred));
    await click($(".fab"));
    expect(title()).toBe("💌me");
    expect(document.activeElement?.className).toBe("kb-hold");
    await run(() => backend.change(() => (backend.queries["tasks:deferred"] = deferred)));
    expect(field().placeholder).toBe("Neue Aufgabe");
    expect(document.querySelector(".kb-hold")).toBeNull();
  });

  it("hat auf dem Mac kein Touch-Verhalten, ein Klick auf die Zeile wählt nur aus", async () => {
    Reflect.deleteProperty(navigator, "maxTouchPoints");
    await render();
    await click($(".ttl"));
    await click($(".st"));
    expect(app().panels).toEqual([]);
    expect($(".st")?.className).toBe("st ok");
    expect($(".fab")).toBeNull();
    await click(rowOf("Reise DB")?.querySelector(".t"));
    expect(app().selection).toBe("reise");
    expect(app().editing).toBeNull();
    expect(app().panels).toEqual([]);

    // ⌘K and ⌘P stay Raycast panels: a search field and rows with keycaps, no drawer.
    await press("mod+k");
    expect($(".pal .q input")?.getAttribute("placeholder")).toBe("Aktion suchen …");
    expect($(".pal .grab, .pal .hd, .pal .tile")).toBeNull();
    expect(panelRows().slice(0, 3)).toEqual(["Wichtig", "KI-Aufgabe", "Einplanen …"]);
    expect(panelValue("Einplanen …")).toBe("⌘E");
    await press("escape");
    await press("mod+p");
    expect($(".pal .tile")).toBeNull();
    expect(panelRows()).toContain("work");
  });

  it("plant und stellt über die Datumsauswahl des Systems zurück, nie in die Vergangenheit", async () => {
    await render();
    await hold(rowOf("Reise DB"));
    await click(tile("Einplanen"));
    const day = panelRow("Datum wählen …")?.querySelector<HTMLInputElement>("input.pick");
    expect(day?.type).toBe("date");
    // The row lets the press through, so the field takes focus and opens the picker.
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    day?.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(false);
    await pick(day, "2026-10-15", "change");
    expect(mutation("tasks:plan")).toHaveBeenCalledWith({
      taskId: "reise",
      plannedFor: "2026-10-15",
    });
    expect($(".pal")).toBeNull();

    await hold(rowOf("Reise DB"));
    await click(tile("Später"));
    const time = panelRow("Datum wählen …")?.querySelector<HTMLInputElement>("input.pick");
    expect(time?.type).toBe("datetime-local");
    expect(time?.min).toBe("2026-10-08T10:00");
    // A time counts once the picker closes; one already past does nothing.
    await act(async () => time?.focus());
    await pick(time, "2026-10-08T09:30", "input");
    await act(async () => time?.blur());
    expect(mutation("tasks:snooze")).not.toHaveBeenCalled();
    await act(async () => time?.focus());
    await pick(time, "2026-10-15T09:30", "input");
    expect(mutation("tasks:snooze")).not.toHaveBeenCalled();
    await act(async () => time?.blur());
    expect(mutation("tasks:snooze")).toHaveBeenCalledWith({
      taskId: "reise",
      snoozedUntil: Date.parse("2026-10-15T07:30:00Z"),
    });
  });

  it("öffnet mit langem Druck auf eine Liste ihre Aktionen, in der Leiste und in der Suche", async () => {
    await render();
    const me = $(".side [aria-label='me']");
    // A finger that moves first is scrolling.
    await finger("pointerdown", me, 100);
    await finger("pointermove", me, 109);
    await wait();
    await finger("pointerup", me, 109);
    expect(app().panels).toEqual([]);

    await finger("pointerdown", me, 100);
    await wait();
    expect(app().panels).toEqual([{ type: "listActions", listId: "l-me" }]);
    expect($(".pal .hd")?.textContent).toBe("me");
    // The release's click opens no list.
    await finger("pointerup", me, 100);
    await click(me);
    expect(title()).toBe("💻work");

    // In the switcher they open on top of it, and the click lands on the drawer without effect.
    await click($(".pal-layer"));
    await click($(".ttl"));
    const agency = tile("agency");
    await finger("pointerdown", agency, 300);
    await wait();
    await finger("pointerup", agency, 300);
    await click($(".pal-layer"));
    expect(app().panels).toEqual([
      { type: "switcher" },
      { type: "listActions", listId: "l-agency" },
    ]);
  });

  it("sortiert eine offene Aufgabe mit langem Druck und Ziehen um", async () => {
    // happy-dom lays nothing out: rows 36 px tall from y 50 in a list 600 px tall.
    const tops: Record<string, number> = {
      servoy: 50,
      umbau: 86,
      reise: 122,
      neo: 158,
      release: 194,
    };
    const rects = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const top = tops[this.dataset.task ?? ""];
        return top === undefined ? new DOMRect(0, 0, 300, 600) : new DOMRect(0, top, 300, 36);
      });
    onTestFinished(() => rects.mockRestore());
    await render();
    const umbau = rowOf("Umbau auf Todo App");
    // Without the hold the finger scrolls, and a cancel puts a lifted row back.
    await finger("pointerdown", umbau, 104);
    await finger("pointermove", umbau, 184);
    await wait();
    await finger("pointerup", umbau, 184);
    await finger("pointerdown", umbau, 104);
    await wait();
    await finger("pointermove", umbau, 184);
    await finger("pointercancel", umbau, 184);
    expect(umbau?.style.transform).toBe("");
    expect(mutation("tasks:reorder")).not.toHaveBeenCalled();

    // Two rows down: it follows the finger and the rows it passed move up.
    await finger("pointerdown", umbau, 104);
    await wait();
    await finger("pointermove", umbau, 184);
    expect($(".list")?.dataset.dragging).toBe("");
    expect(
      ["Umbau auf Todo App", "Reise DB", "Neo Basis", "Release prüfen"].map(
        (text) => rowOf(text)?.style.transform,
      ),
    ).toEqual(["translateY(80px)", "translateY(-36px)", "translateY(-36px)", ""]);
    // Shown at once, and the release opens no sheet and edits nothing.
    await finger("pointerup", umbau, 184);
    await click(umbau?.querySelector(".t"));
    expect(mutation("tasks:reorder")).toHaveBeenCalledExactlyOnceWith({
      taskIds: ["servoy", "reise", "neo", "umbau", "release"],
      listId: "l-work",
      section: "active",
    });
    expect(texts(".row .t")).toEqual([
      "Servoy API Scripts",
      "Reise DB",
      "Neo Basis",
      "Umbau auf Todo App",
      "Release prüfen",
    ]);
    expect(app().panels).toEqual([]);
    expect(app().editing).toBeNull();
    expect($(".list")?.dataset.dragging).toBeUndefined();
    expect(umbau?.style.transform).toBe("");

    // A live update that changes the run meanwhile (Reise DB done elsewhere) sends the row back
    // unsaved.
    await run(() => backend.change());
    await finger("pointerdown", umbau, 104);
    await wait();
    await finger("pointermove", umbau, 184);
    await run(() => backend.change(() => Object.assign(data.tasks[2]!, done)));
    await finger("pointerup", umbau, 184);
    await click(umbau?.querySelector(".t"));
    expect(mutation("tasks:reorder")).toHaveBeenCalledTimes(1);
  });

  it("tauscht auf dem Mac mit ⌥↓ wie bisher und wartet auf den Server", async () => {
    Reflect.deleteProperty(navigator, "maxTouchPoints");
    await render();
    await run(() => app().select("umbau"));
    await press("alt+down");
    expect(mutation("tasks:reorder")).toHaveBeenCalledWith({
      taskIds: ["servoy", "reise", "umbau", "neo", "release"],
      listId: "l-work",
      section: "active",
    });
    expect(texts(".row .t")).toEqual([
      "Servoy API Scripts",
      "Umbau auf Todo App",
      "Reise DB",
      "Neo Basis",
      "Release prüfen",
    ]);
  });

  it("schließt mit dem Wischen zurück das oberste Panel", async () => {
    await render();
    await hold(rowOf("Reise DB"));
    await click(tile("Einplanen"));
    expect(history.state).toEqual({ panel: 2 });
    await act(async () => history.back());
    expect(app().panels).toEqual([{ type: "actions", taskId: "reise" }]);
    // Closing in the app goes back too, and a swipe forward into a closed panel is undone.
    await click($(".pal-layer"));
    expect(history.state).toBeNull();
    await act(async () => history.forward());
    expect(history.state).toBeNull();
    expect(app().panels).toEqual([]);
  });

  it("zeigt die Aktionen einer Aufgabe als Kacheln und Zeilen, nach denselben Regeln wie ⌘K", async () => {
    await render();
    // An open task: its row as the head, eight tiles, the other actions and Verwerfen last.
    await hold(rowOf("Reise DB"));
    expect($(".pal .grab")).not.toBeNull();
    expect(texts(".pal .hd .ht, .pal .hd .hm")).toEqual(["Reise DB", "morgen"]);
    expect($(".pal .hd")?.style.getPropertyValue("--acc")).toBe("#ff453a");
    const all = ["Wichtig", "KI", "Einplanen", "Fällig", "Später", "Verschieben", "Backlog"];
    expect(tiles()).toEqual([...all, "Erledigen"]);
    expect($(".pal .tile.on")).toBeNull();
    expect(panelRows()).toEqual([
      "Titel bearbeiten",
      "Unteraufgabe",
      "Einrücken",
      "Nach oben",
      "Nach unten",
      "Verwerfen",
    ]);
    expect($(".pal .pi.danger .pt")?.textContent).toBe("Verwerfen");
    await click($(".pal-layer"));

    // KI is on; overdue adds Normal einordnen after the moves, recurring drops Einrücken.
    await hold(rowOf("Release prüfen"));
    expect(texts(".pal .tile.on .tl")).toEqual(["KI"]);
    expect(panelRows()).toEqual([
      "Titel bearbeiten",
      "Unteraufgabe",
      "Nach oben",
      "Nach unten",
      "Normal einordnen",
      "Verwerfen",
    ]);
    await click($(".pal-layer"));

    // In the backlog the section tile leads back to Tasks.
    await click($$(".sec").find((header) => header.textContent?.startsWith("Backlog")));
    await hold(rowOf("Steuer"));
    expect(tiles()).toEqual([...all.slice(0, -1), "Tasks", "Erledigen"]);
    await click($(".pal-layer"));

    // Done today: nothing to schedule, Öffnen reopens.
    await hold(rowOf("Servoy API Scripts"));
    expect($(".pal .hd")?.className).toBe("hd done");
    expect(tiles()).toEqual(["Wichtig", "KI", "Verschieben", "Backlog", "Öffnen"]);
    expect(panelRows()).toEqual(["Titel bearbeiten", "Nach oben", "Nach unten", "Verwerfen"]);
    await click($(".pal-layer"));

    // Wichtig shows part of each list: no indenting or moving; the checkbox takes the task's list color.
    await click($(".side [aria-label='Wichtig']"));
    await hold(rowOf("Mama anrufen"));
    expect($(".pal .hd")?.style.getPropertyValue("--acc")).toBe("#64d2ff");
    expect(tiles()).toEqual([...all, "Erledigen"]);
    expect(texts(".pal .tile.on .tl")).toEqual(["Wichtig"]);
    expect(panelRows()).toEqual(["Titel bearbeiten", "Unteraufgabe", "Verwerfen"]);
  });

  it("führt eine Kachel wie ihre Zeile aus, Verschieben öffnet sich als Schublade darüber", async () => {
    await render();
    await hold(rowOf("Reise DB"));
    await click(tile("Backlog"));
    expect(mutation("tasks:move")).toHaveBeenCalledWith({ taskId: "reise", section: "backlog" });
    expect(app().panels).toEqual([]);

    // A set toggle is named by what it does.
    await hold(rowOf("Umbau auf Todo App"));
    expect(tile("Wichtig")?.getAttribute("aria-label")).toBe("Nicht mehr wichtig");
    await click(tile("Wichtig"));
    expect(mutation("tasks:update")).toHaveBeenCalledWith({ taskId: "umbau", highPriority: false });

    await hold(rowOf("Neo Basis"));
    await click(tile("Verschieben"));
    expect(app().panels).toEqual([
      { type: "actions", taskId: "neo" },
      { type: "move", taskId: "neo" },
    ]);
    expect($(".pal .grab")).not.toBeNull();
    expect($(".pal .hd .ht")?.textContent).toBe("Neo Basis");
    expect($(".pal .crumb")?.textContent).toBe("Verschieben");
    await click(panelRow("me"));
    expect(mutation("tasks:move")).toHaveBeenCalledWith({
      taskId: "neo",
      listId: "l-me",
      section: "active",
    });
    expect(app().panels).toEqual([]);
  });

  it("zeigt die Listen als Kacheln, filtert sie beim Tippen und öffnet eine mit einem Tipp", async () => {
    await render();
    await click($(".ttl"));
    expect($(".pal input")?.getAttribute("placeholder")).toBe("Liste suchen");
    // Favorites in rail order, then after a line the others by name.
    expect(texts(".pal .tiles")).toHaveLength(2);
    expect($$(".pal .sep")).toHaveLength(1);
    expect(tiles()).toEqual([
      "Wichtig",
      "me",
      "agency",
      "work",
      "Habits",
      "Urlaub",
      "Verlauf",
      "Wiederholungen",
    ]);
    expect(texts(".pal .tile.on .tl")).toEqual(["work"]);
    expect(tile("work")?.querySelector(".tv")?.textContent).toBe("4");
    // VoiceOver hears the count and which list is open, as the rows say it on the Mac.
    expect(tile("work")?.getAttribute("aria-label")).toBe("work, aktuell, 4");
    expect(tile("me")?.getAttribute("aria-label")).toBe("me");

    await act(async () => $(".pal input")?.focus());
    await type("ur");
    expect(tiles()).toEqual(["Urlaub"]);
    expect($(".pal .tile.sel .tl")?.textContent).toBe("Urlaub");
    // The tile the return key opens is the field's active option.
    const urlaub = tile("Urlaub");
    expect(urlaub?.getAttribute("role")).toBe("option");
    expect(urlaub?.getAttribute("aria-selected")).toBe("true");
    expect($(".pal input")?.getAttribute("aria-activedescendant")).toBe(urlaub?.id);
    await type("Reisen");
    expect(tiles()).toEqual([]);
    expect(panelRows()).toEqual(["Reisen als neue Liste anlegen"]);
    await type("");
    await click(tile("me"));
    expect(title()).toBe("💌me");
    expect(app().panels).toEqual([]);
  });

  it("schließt das oberste Panel, wenn sein Kopf weit genug nach unten gezogen wird", async () => {
    await render();
    await hold(rowOf("Reise DB"));
    await click(tile("Einplanen"));
    // The drawer follows the finger, and a short pull puts it back.
    const head = $(".pal .head");
    await finger("pointerdown", head, 300);
    await finger("pointermove", head, 360);
    expect($(".pal")?.style.transform).toBe("translateY(60px)");
    await finger("pointerup", head, 360);
    expect($(".pal")?.style.transform).toBe("");
    expect(app().panels).toHaveLength(2);

    // A pull on the rows scrolls them instead.
    const row = panelRow("Morgen");
    await finger("pointerdown", row, 300);
    await finger("pointermove", row, 420);
    await finger("pointerup", row, 420);
    expect(app().panels).toHaveLength(2);

    // Past the threshold the top drawer closes, back to the one below, and history follows.
    await finger("pointerdown", $(".pal .grab"), 300);
    await finger("pointermove", $(".pal .grab"), 420);
    await finger("pointerup", $(".pal .grab"), 420);
    expect(app().panels).toEqual([{ type: "actions", taskId: "reise" }]);
    expect(history.state).toEqual({ panel: 1 });
  });
});
