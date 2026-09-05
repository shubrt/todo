// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DesktopApp } from "../src/renderer/workspace";
import type { Task } from "../src/renderer/task-context";

const state = vi.hoisted(() => ({
  connected: true,
  tasks: [] as unknown[],
  mutations: new Map<string, ReturnType<typeof vi.fn>>(),
  configured: true,
}));
vi.mock("../src/renderer/platform", () => ({
  PlatformProvider: ({ children }: { children: ReactNode }) => children,
  ConnectedProvider: ({ children }: { children: ReactNode }) => children,
  usePlatform: () => ({
    state: {
      configured: state.configured,
      cloudUrl: "https://test.convex.cloud",
      preferences: {
        alwaysOnTop: true,
        allSpaces: true,
        shortcut: "CommandOrControl+Shift+Space",
        tint: "graphite",
        launchAtLogin: false,
      },
    },
    update: vi.fn(),
    error: null,
  }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useConvexConnectionState: () => ({ isWebSocketConnected: state.connected }),
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    state.mutations.get(getFunctionName(reference)) ?? vi.fn().mockResolvedValue(null),
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(reference);
    if (name === "tasks:list") return state.tasks;
    if (name === "tasks:deferred") return [];
    if (name === "settings:get") return { defaultArea: "me", habitsInitialized: true };
    if (name === "tasks:summary") return { todayCompleted: 0 };
    if (name === "completions:list") return { items: [], nextCursor: null };
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
    isDeferred: false,
    isDue: false,
    isOverdue: false,
    ...patch,
  };
}
async function click(selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing: ${selector}`);
  await act(async () => button.click());
}
async function inputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.connected = true;
  state.configured = true;
  state.tasks = [];
  state.mutations.clear();
  Object.assign(window, {
    desktop: {
      onNavigate: () => () => {},
      setPreferences: vi.fn(),
      hide: vi.fn(),
      connect: vi.fn().mockResolvedValue({ configured: true, preferences: {} }),
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Schwebende Aufgabenliste", () => {
  it("behält bei gescheiterter Erfassung den eingegebenen Gedanken", async () => {
    const create = vi.fn().mockRejectedValue(new Error("write failed"));
    state.mutations.set("tasks:create", create);
    await act(async () => root.render(<DesktopApp />));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Neue Aufgabe"]')!;
    await inputValue(input, "Angebot besprechen");
    await act(async () =>
      input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(create).toHaveBeenCalledWith({ title: "Angebot besprechen", area: "me", isAi: false });
    expect(input.value).toBe("Angebot besprechen");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nicht gespeichert");
  });
  it("zeigt bei fehlgeschlagenem Abschluss keinen gespeicherten Haken", async () => {
    state.tasks = [task("task-a", "Aufgabe prüfen")];
    state.mutations.set("tasks:complete", vi.fn().mockRejectedValue(new Error("write failed")));
    await act(async () => root.render(<DesktopApp />));
    await click('[role="checkbox"]');
    expect(container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(container.querySelector(".task-row.done")).toBeNull();
  });
  it("blockiert Schreibaktionen während einer unterbrochenen Verbindung", async () => {
    state.connected = false;
    state.tasks = [task("task-a", "Aufgabe prüfen")];
    const complete = vi.fn();
    state.mutations.set("tasks:complete", complete);
    await act(async () => root.render(<DesktopApp />));
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Neue Aufgabe"]')?.disabled,
    ).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[role="checkbox"]')?.disabled).toBe(true);
    await click('[role="checkbox"]');
    expect(complete).not.toHaveBeenCalled();
  });
  it("lässt nach dem Abschluss der letzten Unteraufgabe ihren Parent offen", async () => {
    state.tasks = [
      task("parent", "Umzug"),
      task("child", "Schlüssel holen", { parentId: "parent" as Task["_id"] }),
    ];
    const complete = vi.fn().mockResolvedValue(null);
    state.mutations.set("tasks:complete", complete);
    await act(async () => root.render(<DesktopApp />));
    await click('[aria-label="Unteraufgaben von Umzug öffnen"]');
    await click('[aria-label="Schlüssel holen erledigen"]');
    expect(complete).toHaveBeenCalledWith({ taskId: "child" });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[aria-label="Umzug erledigen"]')?.getAttribute("aria-checked"),
    ).toBe("false");
  });
  it("entfernt einen einmalig eingegebenen Schlüssel nach erfolgreicher Übergabe aus dem Formular", async () => {
    state.configured = false;
    await act(async () => root.render(<DesktopApp />));
    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const connection = '{"siteUrl":"https://test.convex.site","apiKey":"a-secret"}';
    await inputValue(input, connection);
    await act(async () =>
      input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(window.desktop.connect).toHaveBeenCalledWith(connection);
    expect(input.value).toBe("");
    expect(container.textContent).not.toContain("a-secret");
  });
});
