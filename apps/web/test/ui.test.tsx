// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Task } from "../src/features/task-context";
import { TodoApp } from "../src/features/todo-app";

const state = vi.hoisted(() => ({
  authenticated: true,
  connected: true,
  tasks: [] as unknown[],
  mutations: new Map<string, ReturnType<typeof vi.fn>>(),
}));
vi.mock("../src/providers", () => ({ backendConfigured: true }));
vi.mock("../src/auth", () => ({
  useSessionAuth: () => ({
    isLoading: false,
    isAuthenticated: state.authenticated,
    configured: true,
    error: null,
    logout: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: state.authenticated }),
  useConvexConnectionState: () => ({ isWebSocketConnected: state.connected }),
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    state.mutations.get(getFunctionName(reference)) ?? vi.fn().mockResolvedValue(null),
  useAction: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(reference);
    if (name === "tasks:list") return state.tasks;
    if (name === "tasks:deferred") return [];
    if (name === "tasks:summary")
      return { priority: 1, me: 1, agency: 0, work: 0, habits: 0, todayCompleted: 0 };
    if (name === "settings:get")
      return {
        defaultArea: "me",
        timeZone: "Europe/Berlin",
        currentLocalDate: "2026-09-05",
        habitsInitialized: true,
      };
    return [];
  },
}));

let container: HTMLDivElement;
let root: Root;

function task(id: string, title: string, patch: Partial<Task> = {}): Task {
  return {
    _id: id as Task["_id"],
    _creationTime: 1,
    ownerId: "owner",
    title,
    kind: "task",
    area: "me",
    list: "active",
    position: 1,
    isInbox: true,
    isAi: false,
    highPriority: true,
    state: "open",
    scheduleVersion: 0,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

async function click(selector: string) {
  const element = container.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Element fehlt: ${selector}`);
  await act(async () => element.click());
}

async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.authenticated = true;
  state.connected = true;
  state.tasks = [];
  state.mutations.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.history.replaceState({}, "", "/");
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("Aufgabenoberfläche", () => {
  it("behält den Entwurf bei fehlgeschlagener Erfassung und meldet keinen Erfolg", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Verbindung unterbrochen"));
    state.mutations.set("tasks:create", create);
    await act(async () => root.render(<TodoApp />));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Neue Aufgabe"]')!;
    await setInput(input, "Das Angebot besprechen");
    await act(async () =>
      input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(create).toHaveBeenCalledWith({
      title: "Das Angebot besprechen",
      area: "me",
      isAi: false,
    });
    expect(input.value).toBe("Das Angebot besprechen");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nicht gespeichert");
    expect(container.textContent).not.toContain("In me festgehalten.");
  });

  it("zeigt bei fehlgeschlagenem Abschluss keinen Haken", async () => {
    state.tasks = [task("task-a", "Angebot prüfen")];
    const complete = vi.fn().mockRejectedValue(new Error("Schreiben abgelehnt"));
    state.mutations.set("tasks:complete", complete);
    await act(async () => root.render(<TodoApp />));
    await click('[role="checkbox"]');
    expect(complete).toHaveBeenCalledWith({ taskId: "task-a" });
    expect(container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(container.querySelector(".task-done")).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("blockiert Erfassen und Abschließen bei unterbrochener Verbindung", async () => {
    state.connected = false;
    state.tasks = [task("task-a", "Angebot prüfen")];
    const complete = vi.fn();
    state.mutations.set("tasks:complete", complete);
    await act(async () => root.render(<TodoApp />));
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Neue Aufgabe"]')?.disabled,
    ).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[role="checkbox"]')?.disabled).toBe(true);
    await click('[role="checkbox"]');
    expect(complete).not.toHaveBeenCalled();
    expect(container.querySelector(".connection-banner")?.textContent).toContain(
      "wiederhergestellt",
    );
  });

  it("entfernt eine Inbox-Markierung mit genau einem Befehl und ohne Umsortieren", async () => {
    state.tasks = [task("task-a", "Erste Aufgabe"), task("task-b", "Zweite Aufgabe")];
    const clear = vi.fn().mockResolvedValue(null);
    const reorder = vi.fn();
    state.mutations.set("tasks:clearInbox", clear);
    state.mutations.set("tasks:reorder", reorder);
    await act(async () => root.render(<TodoApp />));
    await click('[aria-label="Inbox-Markierung von Zweite Aufgabe entfernen"]');
    expect(clear).toHaveBeenCalledWith({ taskId: "task-b" });
    expect(reorder).not.toHaveBeenCalled();
    expect(
      [...container.querySelectorAll(".task-title")].map((element) => element.textContent),
    ).toEqual(["Erste Aufgabe", "Zweite Aufgabe"]);
  });

  it("schließt bei einer Unteraufgabe nur diese ab und nicht ihren Parent", async () => {
    state.tasks = [
      task("parent", "Umzug"),
      task("child", "Schlüssel abholen", { parentId: "parent" as Task["_id"] }),
    ];
    const complete = vi.fn().mockResolvedValue(null);
    state.mutations.set("tasks:complete", complete);
    await act(async () => root.render(<TodoApp />));
    await click('[aria-label="Unteraufgaben öffnen"]');
    await click('[aria-label="Schlüssel abholen als erledigt markieren"]');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith({ taskId: "child" });
    expect(
      container
        .querySelector('[aria-label="Umzug als erledigt markieren"]')
        ?.getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("erklärt die Ablehnung eines nicht freigegebenen Shoo-Kontos", async () => {
    state.authenticated = false;
    window.history.replaceState({}, "", "/?authError=account_not_allowed");
    await act(async () => root.render(<TodoApp />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("freigegebene Konto");
    expect(container.querySelector('a[href="/api/auth/login"]')).not.toBeNull();
  });

  it("fängt einen unvollständigen Zeitraum ab, ohne die Verlaufsansicht zu verlieren", async () => {
    await act(async () => root.render(<TodoApp />));
    const history = [...container.querySelectorAll<HTMLButtonElement>(".nav-item")].find(
      (button) => button.textContent === "Verlauf",
    )!;
    await act(async () => history.click());
    const from = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    await setInput(from, "");
    expect(container.querySelector(".form-error")?.textContent).toContain("gültigen Zeitraum");
    expect(container.querySelector<HTMLButtonElement>(".history-filters>.button")?.disabled).toBe(
      true,
    );
    await setInput(from, "2026-09-01");
    expect(container.querySelector(".form-error")).toBeNull();
    expect(container.querySelector(".history-view")).not.toBeNull();
  });
});
