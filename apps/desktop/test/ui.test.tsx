// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DesktopApp } from "../src/renderer/workspace";
import type { Task } from "../src/renderer/task-context";
import type { Doc } from "@todo/backend/dataModel";
import type { CreatedIntegrationKey } from "../src/shared/contracts";

type Recurrence = Doc<"recurrences">;

const state = vi.hoisted(() => ({
  connected: true,
  tasks: [] as unknown[],
  keys: [] as unknown[],
  recurrences: [] as Recurrence[],
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
    if (name === "settings:get")
      return { defaultArea: "me", habitsInitialized: true, timeZone: "Europe/Berlin" };
    if (name === "auth:listApiKeys") return state.keys;
    if (name === "recurrences:list") return state.recurrences;
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
function recurrence(id: string, title: string, patch: Partial<Recurrence> = {}): Recurrence {
  return {
    _id: id as Recurrence["_id"],
    _creationTime: 1,
    ownerId: "owner",
    title,
    kind: "task",
    area: "work",
    isAi: false,
    highPriority: false,
    rule: { frequency: "weekly", weekday: 1 },
    timeZone: "Europe/Berlin",
    enabled: true,
    nextDate: "2026-10-05",
    nextRunAt: 1,
    createdAt: 1,
    ...patch,
  };
}
function apiKey(id: string, name: string, kind: "device" | "integration" | null, current = false) {
  return { id, name, prefix: `todo_${id}`, kind, createdAt: 1, lastUsedAt: null, current };
}
// Element whose text starts with `text`, e.g. a tab followed by its count.
function find(text: string, selector = "button") {
  const element = [...container.querySelectorAll<HTMLElement>(selector)].find((item) =>
    item.textContent?.trim().startsWith(text),
  );
  if (!element) throw new Error(`Missing: ${selector} ${text}`);
  return element;
}
async function press(element: Element, key: string) {
  await act(async () =>
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })),
  );
}
async function openSettings(tab: string) {
  await act(async () => root.render(<DesktopApp />));
  await click('[aria-label="Einstellungen"]');
  await act(async () => find(tab, '[role="tab"]').click());
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
  state.keys = [];
  state.recurrences = [];
  state.mutations.clear();
  Object.assign(window, {
    desktop: {
      onNavigate: () => () => {},
      setPreferences: vi.fn(),
      hide: vi.fn(),
      login: vi.fn().mockResolvedValue({ configured: true, preferences: {} }),
      cancelLogin: vi.fn().mockResolvedValue(undefined),
      createIntegrationKey: vi.fn(),
      copyText: vi.fn().mockResolvedValue(undefined),
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
  it("zeigt den Einrichtungshinweis des Backends ohne Electron-Präfix", async () => {
    state.configured = false;
    const hint = 'Trage {"https://test.convex.site":"sub-123"} in SHOO_OWNER_SUBJECTS ein.';
    vi.mocked(window.desktop.login).mockRejectedValueOnce(
      new Error(`Error invoking remote method 'desktop:login': Error: ${hint}`),
    );
    await act(async () => root.render(<DesktopApp />));
    await click(".connection-form .button.primary");
    expect(window.desktop.login).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(hint);
  });
  it("bricht eine wartende Anmeldung ohne Fehlermeldung ab", async () => {
    state.configured = false;
    let fail: (error: Error) => void = () => {};
    vi.mocked(window.desktop.login).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    await act(async () => root.render(<DesktopApp />));
    await click(".connection-form .button.primary");
    expect(container.textContent).toContain("Warte auf die Anmeldung im Browser");
    await click(".connection-form .text-button");
    expect(window.desktop.cancelLogin).toHaveBeenCalledTimes(1);
    await act(async () =>
      fail(new Error("Error invoking remote method 'desktop:login': Error: abgebrochen")),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Mit Shoo anmelden");
  });
});

describe("Einstellungen", () => {
  it("zeigt einen neuen Integrationsschlüssel einmal und vergisst ihn nach Fertig", async () => {
    const secret = "todo_N3wPq8LsYk2RmT7vXc0bJ4eHfU9aD1gQz6WoS5iEx7r";
    let finish: (key: CreatedIntegrationKey) => void = () => {};
    vi.mocked(window.desktop.createIntegrationKey).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    // The mocked query is not reactive, so the list holds the new key from the start.
    state.keys = [apiKey("new", "task-capture Claude", "integration")];
    await openSettings("Schlüssel");
    expect(container.querySelector(".key-new")).toBeNull();
    await act(async () => find("Neuer Integrationsschlüssel").click());
    const name = container.querySelector<HTMLInputElement>(
      'input[placeholder="z. B. task-capture"]',
    )!;
    await inputValue(name, "task-capture Claude");
    await act(async () => find("Mit Shoo bestätigen").click());
    expect(window.desktop.createIntegrationKey).toHaveBeenCalledWith("task-capture Claude");
    expect(container.textContent).toContain("Warte auf die Anmeldung im Browser");
    await act(async () =>
      finish({ id: "new", name: "task-capture Claude", prefix: "todo_N3wPq8Ls", key: secret }),
    );
    expect(container.textContent).toContain(secret);
    await act(async () => find("Kopieren").click());
    expect(window.desktop.copyText).toHaveBeenCalledWith(secret);
    await act(async () => find("Fertig").click());
    expect(container.textContent).not.toContain(secret);
    expect(container.querySelector(".key-new")?.textContent).toBe("neu");
    // The mark lasts until the sheet closes, not just while the tab is open.
    await act(async () => find("Konto", '[role="tab"]').click());
    await act(async () => find("Schlüssel", '[role="tab"]').click());
    expect(container.querySelector(".key-new")?.textContent).toBe("neu");
  });
  it("bricht das Warten auf den Browser ab und behält den Namen", async () => {
    let fail: (error: Error) => void = () => {};
    vi.mocked(window.desktop.createIntegrationKey).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    await openSettings("Schlüssel");
    await act(async () => find("Neuer Integrationsschlüssel").click());
    await inputValue(
      container.querySelector<HTMLInputElement>('input[placeholder="z. B. task-capture"]')!,
      "Raycast",
    );
    await act(async () => find("Mit Shoo bestätigen").click());
    await act(async () => find("Abbrechen").click());
    expect(window.desktop.cancelLogin).toHaveBeenCalledTimes(1);
    await act(async () =>
      fail(new Error("Error invoking remote method 'desktop:create-key': Error: abgebrochen")),
    );
    expect(
      container.querySelector<HTMLInputElement>('input[placeholder="z. B. task-capture"]')?.value,
    ).toBe("Raycast");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(find("Mit Shoo bestätigen")).toBeTruthy();
  });
  it("widerruft fremde Schlüssel, aber nicht den dieses Macs", async () => {
    const revoke = vi.fn().mockResolvedValue(null);
    state.mutations.set("auth:revokeApiKey", revoke);
    state.keys = [
      apiKey("mac", "todo auf shubrt-mbp", "device", true),
      apiKey("mini", "todo auf studio-mini", "device"),
      apiKey("old", "Kurzbefehle iPhone", null),
    ];
    await openSettings("Schlüssel");
    expect(container.querySelector('[aria-label="todo auf shubrt-mbp widerrufen"]')).toBeNull();
    expect(container.textContent).toContain("Dieser Mac");
    expect(container.textContent).toContain("Ohne Typ");
    expect(container.textContent).toContain("3 von 30 aktiv");
    await click('[aria-label="todo auf studio-mini widerrufen"]');
    expect(revoke).toHaveBeenCalledWith({ id: "mini" });
  });
  it("speichert Standardbereich und Zeitzone für alle Geräte", async () => {
    const update = vi.fn().mockResolvedValue(null);
    state.mutations.set("settings:update", update);
    await openSettings("Konto");
    await act(async () => find("❋agency").click());
    expect(update).toHaveBeenCalledWith({ defaultArea: "agency" });
    const zone = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(zone.value).toBe("Europe/Berlin");
    await act(async () => zone.focus());
    expect(zone.value).toBe("");
    expect(zone.placeholder).toBe("Europe/Berlin");
    await inputValue(zone, "kyiv");
    expect(container.querySelector('[role="option"]')?.textContent).toContain("Europe/Kyiv");
    await inputValue(zone, "utc");
    expect(container.querySelector('[role="option"]')?.textContent).toContain("UTC");
    await inputValue(zone, "tokyo");
    expect(container.querySelector('[role="option"]')?.textContent).toContain("Asia/Tokyo");
    await press(zone, "Enter");
    expect(update).toHaveBeenLastCalledWith({ timeZone: "Asia/Tokyo" });
    expect(container.querySelector('[role="option"]')).toBeNull();
  });
});

describe("Wiederholungen", () => {
  async function openRecurrences() {
    await act(async () => root.render(<DesktopApp />));
    const picker = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Bereich wechseln"]',
    )!;
    await act(async () => {
      picker.value = "recurrences";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  beforeEach(() => {
    state.recurrences = [
      recurrence("habit", "Tagebuch schreiben", { kind: "habit", rule: { frequency: "daily" } }),
      recurrence("sprint", "Sprint-Planung vorbereiten"),
      recurrence("backup", "Backups prüfen", { rule: { frequency: "monthly", dayOfMonth: 31 } }),
      recurrence("letter", "Newsletter-Entwurf", { enabled: false, area: "agency" }),
    ];
    // Applies writes to the list like the reactive query would.
    state.mutations.set(
      "recurrences:update",
      vi.fn(async ({ recurrenceId, ...patch }: { recurrenceId: string }) => {
        state.recurrences = state.recurrences.map((item) =>
          item._id === recurrenceId ? { ...item, ...patch } : item,
        );
        return recurrenceId;
      }),
    );
  });
  it("zeigt Regeln nur bei Aufgaben und Pausiertes gesammelt", async () => {
    await openRecurrences();
    const [habits, tasks] = container.querySelectorAll(".task-section");
    expect(habits?.textContent).toContain("Tagebuch schreiben");
    expect(habits?.textContent).not.toContain("täglich");
    expect(tasks?.textContent).toContain("jeden Montag");
    expect(tasks?.textContent).toContain("monatlich am 31.");
    expect(container.querySelector(".deferred")?.textContent).toContain("Newsletter-Entwurf");
  });
  it("pausiert, setzt fort und benennt um", async () => {
    const update = state.mutations.get("recurrences:update")!;
    await openRecurrences();
    await click('[aria-label="Sprint-Planung vorbereiten pausieren"]');
    expect(update).toHaveBeenCalledWith({ recurrenceId: "sprint", enabled: false });
    expect(container.querySelector(".deferred")?.textContent).toContain("Sprint-Planung");
    await click('[aria-label="Newsletter-Entwurf fortsetzen"]');
    expect(update).toHaveBeenCalledWith({ recurrenceId: "letter", enabled: true });
    expect(container.querySelector(".deferred")?.textContent).not.toContain("Newsletter");
    await act(async () => find("Backups prüfen").click());
    const title = container.querySelector<HTMLTextAreaElement>(".inline-title")!;
    await inputValue(title, "Backups wiederherstellen");
    await press(title, "Enter");
    expect(update).toHaveBeenLastCalledWith({
      recurrenceId: "backup",
      title: "Backups wiederherstellen",
    });
  });
});
