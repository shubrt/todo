import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { localDate, startOfDate, occurrenceOnOrAfter, latestOccurrence } from "../convex/time";

const modules = import.meta.glob("../convex/**/*.ts");
const ownerId = "owner";
const day = (value: string) => vi.setSystemTime(new Date(value));

/** Signs in a device; unless `bootstrap` is false, seeds the lists and returns their ids. */
async function setup({ bootstrap = true } = {}) {
  const t = convexTest(schema, modules);
  const keyId = await t.run((ctx) =>
    ctx.db.insert("apiKeys", {
      ownerId,
      name: "Test device",
      prefix: "todo_test",
      tokenHash: "test-key",
      createdAt: Date.now(),
    }),
  );
  const user = t.withIdentity({ subject: ownerId, apiKeyId: keyId });
  if (bootstrap) await user.mutation(api.lists.bootstrap, {});
  const lists = await user.query(api.lists.list, {});
  const id = (name: string) => lists.find((list) => list.name === name)?._id as Id<"lists">;
  return {
    t,
    user,
    me: id("me"),
    agency: id("agency"),
    work: id("work"),
    habits: id("Habits"),
    important: id("Wichtig"),
  };
}

type User = Awaited<ReturnType<typeof setup>>["user"];

async function createHabits(user: User, titles: string[]) {
  for (const title of titles)
    await user.mutation(api.recurrences.create, {
      title,
      kind: "habit",
      rule: { frequency: "daily" },
    });
}

beforeEach(() => {
  vi.useFakeTimers();
  day("2026-09-05T10:00:00Z");
  vi.stubEnv("TODO_OWNER_ID", ownerId);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("capture, hierarchy and manual ordering", () => {
  it("V01/V02 captures in the chosen default list and clearing inbox preserves a manually moved position", async () => {
    const { user, agency } = await setup();
    await user.mutation(api.settings.update, { defaultListId: agency });
    const a = await user.mutation(api.tasks.create, { title: "First" });
    const b = await user.mutation(api.tasks.create, { title: "Second" });
    const c = await user.mutation(api.tasks.create, { title: "Third" });
    expect(
      (await user.query(api.tasks.list, { view: "list", listId: agency, section: "active" })).map(
        (task) => task._id,
      ),
    ).toEqual([c, b, a]);
    await user.mutation(api.tasks.reorder, { taskIds: [a, c, b] });
    const before = await user.query(api.tasks.get, { taskId: c });
    await user.mutation(api.tasks.markSeen, { taskId: c });
    const after = await user.query(api.tasks.get, { taskId: c });
    expect(after).toMatchObject({
      listId: agency,
      section: "active",
      isInbox: false,
      position: before.position,
    });
    day("2026-09-05T10:05:00Z");
    await user.mutation(api.tasks.markSeen, { taskId: c });
    expect((await user.query(api.tasks.get, { taskId: c })).updatedAt).toBe(after.updatedAt);
    expect((await user.query(api.tasks.list, { view: "list" })).map((task) => task._id)).toEqual([
      a,
      c,
      b,
    ]);
  });

  it("V03/V04/V05 inherits the moved root context and rejects third levels and child priority", async () => {
    const { user, me, work } = await setup();
    const parent = await user.mutation(api.tasks.create, {
      title: "Migration",
      subtasks: [{ title: "Database" }],
    });
    const initial = await user.query(api.tasks.get, { taskId: parent });
    const child = initial.subtasks[0]!._id;
    await user.mutation(api.tasks.move, { taskId: parent, listId: work, section: "backlog" });
    expect(await user.query(api.tasks.get, { taskId: child })).toMatchObject({
      listId: work,
      section: "backlog",
    });
    expect(
      (await user.query(api.tasks.list, { view: "list", listId: work })).map((task) => task._id),
    ).toEqual([parent, child]);
    await expect(
      user.mutation(api.tasks.addSubtask, { taskId: child, title: "Third level" }),
    ).rejects.toThrow(/Unteraufgaben/);
    await expect(
      user.mutation(api.tasks.update, { taskId: child, highPriority: true }),
    ).rejects.toThrow(/Priorität/);
    await expect(user.mutation(api.tasks.move, { taskId: child, listId: me })).rejects.toThrow(
      /Hauptaufgaben/,
    );
  });

  it("V06/V07/V08 persists sibling order and completion never moves or completes the parent", async () => {
    const { user } = await setup();
    const parent = await user.mutation(api.tasks.create, {
      title: "Move services",
      subtasks: [{ title: "One" }, { title: "Two" }, { title: "Three" }],
    });
    const initial = await user.query(api.tasks.get, { taskId: parent });
    const [one, two, three] = initial.subtasks.map((task) => task._id);
    await user.mutation(api.tasks.reorder, { parentId: parent, taskIds: [three!, one!, two!] });
    expect(
      (await user.query(api.tasks.get, { taskId: parent })).subtasks.map((task) => task._id),
    ).toEqual([three, one, two]);
    await user.mutation(api.tasks.complete, { taskId: one! });
    const partial = await user.query(api.tasks.get, { taskId: parent });
    expect(partial.subtasks.map((task) => task._id)).toEqual([one, three, two]);
    expect(partial).toMatchObject({ state: "open", position: initial.position });
    await user.mutation(api.tasks.complete, { taskId: two! });
    await user.mutation(api.tasks.complete, { taskId: three! });
    await user.mutation(api.tasks.reorder, { parentId: parent, taskIds: [one!, three!, two!] });
    const allDone = await user.query(api.tasks.get, { taskId: parent });
    expect(allDone.state).toBe("open");
    expect(allDone.subtasks.map((task) => task._id)).toEqual([one, three, two]);
    expect((await user.query(api.completions.list, {})).items).toHaveLength(3);
  });

  it("rejects invalid dates, empty tasks, cross-list sorting and forged owner input atomically", async () => {
    const { user, t, me, work } = await setup();
    await expect(user.mutation(api.tasks.create, { title: "  " })).rejects.toThrow();
    await expect(
      user.mutation(api.tasks.create, { title: "Impossible", dueOn: "2026-02-30" }),
    ).rejects.toThrow();
    const a = await user.mutation(api.tasks.create, { title: "A", listId: me });
    const b = await user.mutation(api.tasks.create, { title: "B", listId: work });
    await expect(user.mutation(api.tasks.reorder, { taskIds: [a, b] })).rejects.toThrow(
      /derselben Liste/,
    );
    await expect(user.mutation(api.tasks.reorder, { taskIds: [a, a] })).rejects.toThrow(/einmal/);
    await expect(user.mutation(api.tasks.reorder, { taskIds: [a], listId: work })).rejects.toThrow(
      /angegebenen Liste/,
    );
    const foreign = await t.run((ctx) =>
      ctx.db.insert("tasks", {
        ownerId: "foreign",
        title: "Private",
        kind: "task",
        section: "active",
        position: 0,
        isInbox: true,
        isAi: false,
        highPriority: false,
        state: "open",
        scheduleVersion: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await expect(user.query(api.tasks.get, { taskId: foreign })).rejects.toThrow(/nicht gefunden/);
    await expect(user.mutation(api.tasks.discard, { taskId: foreign })).rejects.toThrow(
      /nicht gefunden/,
    );
    expect((await user.query(api.tasks.list, { view: "all" })).map((task) => task.title)).toEqual([
      "A",
      "B",
    ]);
  });

  it("indents a root under the nearest open root above it and outdents it right after its parent", async () => {
    const { t, user, me } = await setup();
    const create = (title: string, extra = {}) =>
      user.mutation(api.tasks.create, { title, listId: me, ...extra });
    await create("D");
    await create("C");
    const b = await create("B", { highPriority: true, dueOn: "2026-09-06" });
    const a = await create("A");
    const roots = async () =>
      (await user.query(api.tasks.list, { view: "list", listId: me }))
        .filter((task) => !task.parentId)
        .map((task) => task.title);
    expect(await roots()).toEqual(["A", "B", "C", "D"]);
    await expect(user.mutation(api.tasks.indent, { taskId: a })).rejects.toThrow(
      /keine offene Aufgabe/,
    );
    const before = await user.query(api.tasks.get, { taskId: b });
    expect(before.wakeAt).toBe(Date.parse("2026-09-05T22:00:00Z"));
    await user.mutation(api.tasks.indent, { taskId: b });
    expect((await user.query(api.tasks.get, { taskId: a })).subtasks).toMatchObject([
      { _id: b, listId: me, section: "active", highPriority: false, isInbox: false, isDue: false },
    ]);
    const indented = await t.run((ctx) => ctx.db.get(b));
    expect(indented).toMatchObject({ parentId: a, scheduleVersion: before.scheduleVersion + 1 });
    for (const field of ["listId", "section", "dueOn", "wakeAt"])
      expect(indented).not.toHaveProperty(field);
    expect(await roots()).toEqual(["A", "C", "D"]);
    day("2026-09-05T22:00:00Z");
    await t.mutation(internal.scheduling.wake, { taskId: b, version: before.scheduleVersion });
    expect(await t.run((ctx) => ctx.db.get(b))).toMatchObject({ parentId: a, position: 1 });
    await expect(user.mutation(api.tasks.indent, { taskId: a })).rejects.toThrow(
      /mit Unteraufgaben/,
    );
    await expect(user.mutation(api.tasks.indent, { taskId: b })).rejects.toThrow(/Unteraufgaben/);
    await expect(user.mutation(api.tasks.outdent, { taskId: a })).rejects.toThrow(
      /Nur Unteraufgaben/,
    );
    await user.mutation(api.tasks.outdent, { taskId: b });
    expect(await roots()).toEqual(["A", "B", "C", "D"]);
    expect(await user.query(api.tasks.get, { taskId: b })).toMatchObject({
      listId: me,
      section: "active",
    });
    // Outdented below a deferred, important parent, a subtask stays in Für später and Wichtig.
    const parent = await create("Taxes", {
      plannedFor: "2026-09-20",
      dueOn: "2026-09-25",
      highPriority: true,
      subtasks: [{ title: "Receipts" }],
    });
    const [receipts] = (await user.query(api.tasks.get, { taskId: parent })).subtasks;
    await user.mutation(api.tasks.outdent, { taskId: receipts!._id });
    expect(
      (await user.query(api.tasks.deferred, { listId: me })).map((task) => task.title),
    ).toEqual(["Taxes", "Receipts"]);
    expect(await user.query(api.tasks.get, { taskId: receipts!._id })).toMatchObject({
      plannedFor: "2026-09-20",
      dueOn: "2026-09-25",
      highPriority: true,
      wakeAt: startOfDate("2026-09-20", "Europe/Berlin"),
    });
    // Deferred roots are shown apart, and done roots cannot take subtasks.
    await create("Later", { plannedFor: "2026-09-09" });
    await expect(user.mutation(api.tasks.indent, { taskId: a })).rejects.toThrow(
      /keine offene Aufgabe/,
    );
    await user.mutation(api.tasks.complete, { taskId: a });
    await expect(user.mutation(api.tasks.indent, { taskId: b })).rejects.toThrow(
      /keine offene Aufgabe/,
    );
    await createHabits(user, ["Walk", "Read"]);
    const walk = (await user.query(api.tasks.list, { view: "habits" })).at(-1)!;
    await expect(user.mutation(api.tasks.indent, { taskId: walk._id })).rejects.toThrow(/Habits/);
  });
});

describe("completion evidence and nightly cleanup", () => {
  it("V09/V10 keeps completed roots first even after new capture and writes one completion snapshot", async () => {
    const { user, work } = await setup();
    const completed = await user.mutation(api.tasks.create, { title: "Deliver", listId: work });
    await user.mutation(api.tasks.complete, { taskId: completed });
    await user.mutation(api.tasks.complete, { taskId: completed });
    await user.mutation(api.tasks.create, { title: "New work", listId: work });
    const tasks = await user.query(api.tasks.list, { view: "list", listId: work });
    expect(tasks[0]).toMatchObject({ _id: completed, state: "done" });
    await user.mutation(api.tasks.update, { taskId: completed, title: "Renamed" });
    await user.mutation(api.lists.update, { listId: work, name: "Arbeit", emoji: "🧰" });
    const history = await user.query(api.completions.list, {});
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({
      titleSnapshot: "Deliver",
      listId: work,
      listNameSnapshot: "work",
      listEmojiSnapshot: "💻",
      kind: "task",
    });
  });

  it("V11/V12/V13 discards remaining work while preserving genuine child completion snapshots", async () => {
    const { user, t, agency } = await setup();
    const root = await user.mutation(api.tasks.create, {
      title: "Original parent",
      listId: agency,
      subtasks: [{ title: "Finished child" }, { title: "Remaining child" }],
    });
    const child = (await user.query(api.tasks.get, { taskId: root })).subtasks[0]!._id;
    await user.mutation(api.tasks.complete, { taskId: child });
    day("2026-09-06T05:00:00Z");
    await t.mutation(internal.scheduling.processOwner, { ownerId });
    expect(await user.query(api.tasks.get, { taskId: root })).toMatchObject({
      state: "open",
      subtasks: [{ title: "Remaining child" }],
    });
    await user.mutation(api.tasks.update, { taskId: root, title: "New parent" });
    await user.mutation(api.lists.update, { listId: agency, name: "Agentur" });
    await user.mutation(api.tasks.discard, { taskId: root });
    expect(await user.query(api.tasks.list, { view: "all" })).toHaveLength(0);
    const history = (await user.query(api.completions.list, {})).items;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      titleSnapshot: "Finished child",
      parentTitleSnapshot: "Original parent",
      listId: agency,
      listNameSnapshot: "agency",
      kind: "subtask",
      completedLocalDate: "2026-09-05",
    });
  });

  it("V16/V20 completing a parent leaves open children uncompleted and daily cleanup is repeatable", async () => {
    const { user, t } = await setup();
    const root = await user.mutation(api.tasks.create, {
      title: "Parent",
      subtasks: [{ title: "Not completed" }],
    });
    const persistent = await user.mutation(api.tasks.create, { title: "Keep open" });
    await user.mutation(api.tasks.complete, { taskId: root });
    expect((await user.query(api.tasks.get, { taskId: root })).subtasks[0]!.state).toBe("open");
    day("2026-09-06T00:30:00Z");
    await t.mutation(internal.scheduling.tick, {});
    await t.mutation(internal.scheduling.tick, {});
    expect((await user.query(api.tasks.list, { view: "all" })).map((task) => task._id)).toEqual([
      persistent,
    ]);
    expect((await user.query(api.completions.list, {})).items).toHaveLength(1);
    expect(
      (await t.run((ctx) => ctx.db.query("tasks").collect())).find(
        (task) => task.title === "Not completed",
      ),
    ).toMatchObject({ state: "open", archivedAt: expect.any(Number) });
  });

  it("V21 assigns the local completion date and preserves its timezone after settings changes", async () => {
    const { user } = await setup();
    day("2026-09-05T22:30:00Z");
    const taskId = await user.mutation(api.tasks.create, { title: "Late task" });
    await user.mutation(api.tasks.complete, { taskId });
    await user.mutation(api.settings.update, { timeZone: "America/New_York" });
    expect(
      (await user.query(api.completions.list, { from: "2026-09-06", to: "2026-09-06" })).items[0],
    ).toMatchObject({
      completedLocalDate: "2026-09-06",
      timeZoneSnapshot: "Europe/Berlin",
      completedAt: Date.parse("2026-09-05T22:30:00Z"),
    });
  });

  it("paginates daily completion history without repeating or dropping entries", async () => {
    const { user } = await setup();
    for (let index = 0; index < 5; index++) {
      const taskId = await user.mutation(api.tasks.create, { title: `Task ${index}` });
      await user.mutation(api.tasks.complete, { taskId });
    }
    const first = await user.query(api.completions.list, { limit: 2 });
    const second = await user.query(api.completions.list, { limit: 2, cursor: first.nextCursor! });
    const third = await user.query(api.completions.list, { limit: 2, cursor: second.nextCursor! });
    expect(
      new Set([...first.items, ...second.items, ...third.items].map((item) => item._id)).size,
    ).toBe(5);
    expect(third.nextCursor).toBeNull();
    await expect(user.query(api.completions.list, { cursor: "invalid-cursor" })).rejects.toThrow(
      /INVALID_INPUT/,
    );
    await expect(
      user.query(api.completions.list, { from: "2026-09-06", to: "2026-09-05" }),
    ).rejects.toThrow();
  });

  it("reopens a task completed today on top of the open block and refuses earlier days", async () => {
    const { user, t, me } = await setup();
    const a = await user.mutation(api.tasks.create, { title: "A", dueOn: "2026-09-06" });
    const b = await user.mutation(api.tasks.create, { title: "B" });
    const c = await user.mutation(api.tasks.create, { title: "C" });
    const order = async () =>
      (await user.query(api.tasks.list, { view: "list", listId: me })).map((task) => task.title);
    const completions = async () => (await user.query(api.completions.list, {})).items;
    await user.mutation(api.tasks.complete, { taskId: a });
    expect(await order()).toEqual(["A", "C", "B"]);
    expect((await user.query(api.tasks.get, { taskId: a })).wakeAt).toBeUndefined();
    await user.mutation(api.tasks.reopen, { taskId: a });
    const reopened = await user.query(api.tasks.get, { taskId: a });
    expect(reopened).toMatchObject({ state: "open", wakeAt: Date.parse("2026-09-05T22:00:00Z") });
    expect(reopened).not.toHaveProperty("completedLocalDate");
    expect(await completions()).toHaveLength(0);
    await user.mutation(api.tasks.complete, { taskId: c });
    await user.mutation(api.tasks.reopen, { taskId: c });
    expect(await order()).toEqual(["C", "A", "B"]);
    await user.mutation(api.tasks.reopen, { taskId: c });
    await user.mutation(api.tasks.complete, { taskId: c });
    expect(await completions()).toMatchObject([{ taskId: c }]);
    await user.mutation(api.tasks.complete, { taskId: b });
    day("2026-09-05T22:30:00Z");
    await expect(user.mutation(api.tasks.reopen, { taskId: b })).rejects.toThrow(/heute erledigte/);
    await t.mutation(internal.scheduling.tick, {});
    await expect(user.mutation(api.tasks.reopen, { taskId: b })).rejects.toThrow(/archiviert/);
    expect(await completions()).toHaveLength(2);
  });

  it("reopens today's habit and a subtask without touching the parent", async () => {
    const { user, t, habits } = await setup();
    await createHabits(user, ["Walk"]);
    const [walk] = await user.query(api.tasks.list, { view: "list", listId: habits });
    await user.mutation(api.tasks.complete, { taskId: walk!._id });
    await user.mutation(api.tasks.reopen, { taskId: walk!._id });
    expect(await user.query(api.tasks.get, { taskId: walk!._id })).toMatchObject({
      state: "open",
    });
    expect(
      (await user.query(api.lists.list, {})).find((list) => list._id === habits),
    ).toMatchObject({ openCount: 1 });
    const parent = await user.mutation(api.tasks.create, {
      title: "Parent",
      subtasks: [{ title: "One" }, { title: "Two" }],
    });
    const [one, two] = (await user.query(api.tasks.get, { taskId: parent })).subtasks;
    await user.mutation(api.tasks.complete, { taskId: two!._id });
    await user.mutation(api.tasks.reopen, { taskId: two!._id });
    expect(await user.query(api.tasks.get, { taskId: parent })).toMatchObject({
      state: "open",
      subtasks: [
        { _id: two!._id, state: "open" },
        { _id: one!._id, state: "open" },
      ],
    });
    expect((await user.query(api.completions.list, {})).items).toHaveLength(0);
    await user.mutation(api.tasks.complete, { taskId: walk!._id });
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    await expect(user.mutation(api.tasks.reopen, { taskId: walk!._id })).rejects.toThrow(
      /archiviert/,
    );
  });
});

describe("calendar planning, snooze and recurrence processing", () => {
  it("V14/V19 activates a planned backlog task without clients and without making it globally urgent", async () => {
    const { user, t, me } = await setup();
    const taskId = await user.mutation(api.tasks.create, {
      title: "Tomorrow",
      section: "backlog",
      plannedFor: "2026-09-06",
    });
    await user.mutation(api.tasks.create, { title: "Existing active" });
    expect(await user.query(api.tasks.deferred, { listId: me })).toHaveLength(1);
    day("2026-09-05T22:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    const active = { view: "list", listId: me, section: "active" } as const;
    const tasks = await user.query(api.tasks.list, active);
    expect(tasks[0]).toMatchObject({
      _id: taskId,
      section: "active",
      isDeferred: false,
      isDue: false,
    });
    expect(await user.query(api.tasks.list, { view: "important" })).toHaveLength(0);
    await user.mutation(api.tasks.reorder, { taskIds: [tasks[1]!._id, taskId] });
    await t.mutation(internal.scheduling.tick, {});
    expect((await user.query(api.tasks.list, active))[1]!._id).toBe(taskId);
  });

  it("V15/V17 keeps hard deadlines visible through snooze and permanently normalizes overdue tasks", async () => {
    const { user, t } = await setup();
    const taskId = await user.mutation(api.tasks.create, {
      title: "Must finish",
      dueOn: "2026-09-05",
      section: "backlog",
      highPriority: true,
    });
    await user.mutation(api.tasks.snooze, {
      taskId,
      snoozedUntil: Date.parse("2026-09-07T12:00:00Z"),
    });
    expect((await user.query(api.tasks.list, { view: "important" }))[0]).toMatchObject({
      _id: taskId,
      isDue: true,
      isOverdue: false,
      section: "active",
    });
    day("2026-09-06T01:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect((await user.query(api.tasks.list, { view: "important" }))[0]!.isOverdue).toBe(true);
    await user.mutation(api.tasks.normalizeUrgency, { taskId });
    day("2026-09-08T01:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await user.query(api.tasks.list, { view: "important" })).toHaveLength(0);
    expect(await user.query(api.tasks.get, { taskId })).toMatchObject({
      state: "open",
      highPriority: false,
      isOverdue: false,
    });
  });

  it("V18 ignores an old wake job after the user changes snooze", async () => {
    const { user, t, me } = await setup();
    const taskId = await user.mutation(api.tasks.create, { title: "Later" });
    await user.mutation(api.tasks.snooze, {
      taskId,
      snoozedUntil: Date.parse("2026-09-05T12:00:00Z"),
    });
    const old = await user.query(api.tasks.get, { taskId });
    await user.mutation(api.tasks.snooze, {
      taskId,
      snoozedUntil: Date.parse("2026-09-06T12:00:00Z"),
    });
    const updated = await user.query(api.tasks.get, { taskId });
    day("2026-09-05T12:01:00Z");
    await t.mutation(internal.scheduling.wake, { taskId, version: old.scheduleVersion });
    expect(await user.query(api.tasks.get, { taskId })).toMatchObject({
      snoozedUntil: updated.snoozedUntil,
      scheduleVersion: updated.scheduleVersion,
      position: updated.position,
    });
    expect(await user.query(api.tasks.list, { view: "list", listId: me })).toHaveLength(0);
    day("2026-09-06T12:00:00Z");
    await t.mutation(internal.scheduling.wake, { taskId, version: updated.scheduleVersion });
    expect(await user.query(api.tasks.get, { taskId })).toMatchObject({ isDeferred: false });
  });

  it("marks a task woken when its snooze ends, until the app has seen it", async () => {
    const { user, t, me } = await setup();
    const get = (taskId: Id<"tasks">) => user.query(api.tasks.get, { taskId });
    const create = (title: string) =>
      user.mutation(api.tasks.create, { title, listId: me, isInbox: false });
    const taskId = await create("Snoozed");
    const planned = await create("Planned");
    // Snoozed until today, then planned for tomorrow: the planned day brings it back.
    await user.mutation(api.tasks.snooze, {
      taskId: planned,
      snoozedUntil: Date.parse("2026-09-05T12:00:00Z"),
    });
    await user.mutation(api.tasks.plan, { taskId: planned, plannedFor: "2026-09-06" });
    const snooze = (at: string) =>
      user.mutation(api.tasks.snooze, { taskId, snoozedUntil: Date.parse(at) });
    await snooze("2026-09-05T12:00:00Z");
    day("2026-09-05T12:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await get(taskId)).toMatchObject({ isWoken: true, isDeferred: false });
    // A new snooze drops the mark until that one ends.
    await snooze("2026-09-06T08:00:00Z");
    expect(await get(taskId)).not.toHaveProperty("isWoken");
    day("2026-09-06T08:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await get(taskId)).toMatchObject({ isWoken: true });
    // A planned day brings its task back without the mark, even after its snooze lapsed.
    expect(await get(planned)).toMatchObject({ isDeferred: false });
    expect(await get(planned)).not.toHaveProperty("isWoken");
    // Selecting the task in the app clears the mark.
    await user.mutation(api.tasks.markSeen, { taskId });
    expect(await get(taskId)).not.toHaveProperty("isWoken");
  });

  it("reschedules calendar wake-ups on timezone changes and ignores the old timezone job", async () => {
    const { user, t } = await setup();
    const taskId = await user.mutation(api.tasks.create, {
      title: "Tomorrow in local time",
      plannedFor: "2026-09-06",
      section: "backlog",
    });
    const berlin = await user.query(api.tasks.get, { taskId });
    expect(berlin.wakeAt).toBe(Date.parse("2026-09-05T22:00:00Z"));
    await user.mutation(api.settings.update, { timeZone: "UTC" });
    const utc = await user.query(api.tasks.get, { taskId });
    expect(utc.wakeAt).toBe(Date.parse("2026-09-06T00:00:00Z"));
    day("2026-09-05T22:00:00Z");
    await t.mutation(internal.scheduling.wake, { taskId, version: berlin.scheduleVersion });
    expect((await user.query(api.tasks.get, { taskId })).section).toBe("backlog");
    day("2026-09-06T00:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await user.query(api.tasks.get, { taskId })).toMatchObject({
      section: "active",
      isDeferred: false,
    });
  });

  it("can pause and resume today's habit without losing or duplicating its current instance", async () => {
    const { user, t, habits } = await setup();
    const recurrenceId = await user.mutation(api.recurrences.create, {
      title: "Daily walk",
      kind: "habit",
      rule: { frequency: "daily" },
    });
    const today = () => user.query(api.tasks.list, { view: "list", listId: habits });
    const original = (await today())[0]!;
    expect(original).toMatchObject({ listId: habits, section: "active", recurrenceId });
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: false });
    expect(await today()).toHaveLength(0);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: true });
    expect((await today()).map((task) => task._id)).toEqual([original._id]);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: false });
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await today()).toHaveLength(0);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: true });
    const next = await today();
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ occurrenceKey: "2026-09-06", state: "open" });
    expect(next[0]!._id).not.toBe(original._id);
  });

  it("V23/V24 consumes each recurrence period even when an old instance is still open", async () => {
    const { user, t, work } = await setup();
    await user.mutation(api.recurrences.create, {
      title: "Check reports",
      kind: "task",
      listId: work,
      rule: { frequency: "daily" },
    });
    const first = (await user.query(api.tasks.list, { view: "all" }))[0]!;
    expect(first).toMatchObject({ listId: work, section: "active", dueOn: "2026-09-05" });
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect((await user.query(api.tasks.list, { view: "all" })).map((task) => task._id)).toEqual([
      first._id,
    ]);
    expect((await user.query(api.recurrences.list, {}))[0]).toMatchObject({
      listId: work,
      lastProcessedDate: "2026-09-06",
    });
    await user.mutation(api.tasks.complete, { taskId: first._id });
    await t.mutation(internal.scheduling.tick, {});
    expect(
      (await user.query(api.tasks.list, { view: "all" })).filter((task) => task.state === "open"),
    ).toHaveLength(0);
    day("2026-09-07T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    const next = await user.query(api.tasks.list, { view: "all" });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ state: "open", occurrenceKey: "2026-09-07" });
    expect(next[0]!._id).not.toBe(first._id);
  });

  it("V25/V39 starts exactly five current habits after a day boundary and rejects stale completion", async () => {
    const { user, t, habits } = await setup();
    await createHabits(user, ["One", "Two", "Three", "Four", "Five"]);
    const today = () => user.query(api.tasks.list, { view: "list", listId: habits });
    const before = await today();
    for (const habit of before.slice(0, 3))
      await user.mutation(api.tasks.complete, {
        taskId: habit._id,
        occurrenceKey: habit.occurrenceKey,
      });
    const oldOpen = before[4]!;
    day("2026-09-06T00:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    await t.mutation(internal.scheduling.tick, {});
    const after = await today();
    expect(after).toHaveLength(5);
    expect(
      after.every((task) => task.state === "open" && task.occurrenceKey === "2026-09-06"),
    ).toBe(true);
    await expect(
      user.mutation(api.tasks.complete, {
        taskId: oldOpen._id,
        occurrenceKey: oldOpen.occurrenceKey,
      }),
    ).rejects.toThrow();
    expect((await user.query(api.completions.list, {})).items).toHaveLength(3);
    await createHabits(user, ["Sixth"]);
    expect(await today()).toHaveLength(6);
  });

  it("V26/V40 catches up several missed days without historical copies or fabricated completions", async () => {
    const { user, t } = await setup();
    await createHabits(user, ["One", "Two", "Three", "Four", "Five"]);
    await user.mutation(api.recurrences.create, {
      title: "Open recurring task",
      kind: "task",
      rule: { frequency: "daily" },
    });
    const task = (await user.query(api.tasks.list, { view: "all" })).find(
      (row) => row.kind === "task",
    )!;
    const wake = await user.mutation(api.tasks.create, {
      title: "Wake after outage",
      plannedFor: "2026-09-07",
      section: "backlog",
    });
    day("2026-09-15T14:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    const current = await user.query(api.tasks.list, { view: "all" });
    expect(current).toHaveLength(7);
    expect(current.find((row) => row._id === task._id)).toMatchObject({
      dueOn: "2026-09-05",
      state: "open",
    });
    expect(current.find((row) => row._id === wake)).toMatchObject({
      section: "active",
      isDeferred: false,
    });
    expect(
      current
        .filter((row) => row.kind === "habit")
        .every((row) => row.occurrenceKey === "2026-09-15"),
    ).toBe(true);
    expect((await user.query(api.completions.list, {})).items).toHaveLength(0);
    await t.mutation(internal.scheduling.tick, {});
    expect(await user.query(api.tasks.list, { view: "all" })).toHaveLength(7);
  });

  it("keeps the manual habit order across the daily renewal", async () => {
    const { user, t, habits } = await setup();
    await createHabits(user, ["One", "Two", "Three"]);
    const today = () => user.query(api.tasks.list, { view: "list", listId: habits });
    const initial = await today();
    expect(initial.map((task) => task.title)).toEqual(["Three", "Two", "One"]);
    const byTitle = (title: string) => initial.find((task) => task.title === title)!._id;
    await user.mutation(api.tasks.reorder, {
      taskIds: [byTitle("Two"), byTitle("One"), byTitle("Three")],
      listId: habits,
    });
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    const next = await today();
    expect(next.map((task) => [task.title, task.occurrenceKey])).toEqual([
      ["Two", "2026-09-06"],
      ["One", "2026-09-06"],
      ["Three", "2026-09-06"],
    ]);
    await createHabits(user, ["Four"]);
    expect((await today()).map((task) => task.title)).toEqual(["Four", "Two", "One", "Three"]);
  });

  it("stores only the order among open and among done habits, not today's done-first view", async () => {
    const { user, t, habits } = await setup();
    await createHabits(user, ["A", "B", "C", "D", "E"]);
    const today = () => user.query(api.tasks.list, { view: "list", listId: habits });
    const titles = async () => (await today()).map((task) => task.title);
    const id = async (title: string) => (await today()).find((task) => task.title === title)!._id;
    await user.mutation(api.tasks.complete, { taskId: await id("B") });
    await user.mutation(api.tasks.complete, { taskId: await id("A") });
    // Done habits sort first and keep their manual order among themselves.
    expect(await titles()).toEqual(["B", "A", "E", "D", "C"]);
    await user.mutation(api.tasks.reopen, { taskId: await id("A") });
    await user.mutation(api.tasks.complete, { taskId: await id("A") });
    // The desktop swaps C above D and sends the whole section, done habits first.
    const swapped = ["B", "A", "E", "C", "D"];
    await user.mutation(api.tasks.reorder, {
      taskIds: await Promise.all(swapped.map(id)),
      listId: habits,
    });
    expect(await titles()).toEqual(swapped);
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await titles()).toEqual(["E", "C", "D", "B", "A"]);
  });

  it("hides a reopened habit that was paused after it was done, so it never goes stale", async () => {
    const { user, t, habits } = await setup();
    const recurrenceId = await user.mutation(api.recurrences.create, {
      title: "Walk",
      kind: "habit",
      rule: { frequency: "daily" },
    });
    const today = () => user.query(api.tasks.list, { view: "list", listId: habits });
    const [walk] = await today();
    await user.mutation(api.tasks.complete, { taskId: walk!._id });
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: false });
    expect(await today()).toMatchObject([{ _id: walk!._id, state: "done" }]);
    await user.mutation(api.tasks.reopen, { taskId: walk!._id });
    expect(await today()).toEqual([]);
    expect((await user.query(api.completions.list, {})).items).toEqual([]);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: true });
    expect(await today()).toMatchObject([{ _id: walk!._id, state: "open" }]);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: false });
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await today()).toEqual([]);
    expect(
      (await user.query(api.lists.list, {})).find((list) => list._id === habits),
    ).toMatchObject({ openCount: 0 });
  });

  it("renames the recurrence together with a habit or recurring instance", async () => {
    const { user, t, habits } = await setup();
    await createHabits(user, ["Walk"]);
    await user.mutation(api.recurrences.create, {
      title: "Report",
      kind: "task",
      rule: { frequency: "daily" },
    });
    const instances = await user.query(api.tasks.list, { view: "all" });
    for (const task of instances)
      await user.mutation(api.tasks.update, { taskId: task._id, title: `${task.title} renamed` });
    expect((await user.query(api.recurrences.list, {})).map((item) => item.title).sort()).toEqual([
      "Report renamed",
      "Walk renamed",
    ]);
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect((await user.query(api.tasks.list, { view: "list", listId: habits }))[0]).toMatchObject({
      title: "Walk renamed",
      occurrenceKey: "2026-09-06",
    });
  });

  it("reports the previous days per habit from completions, oldest first", async () => {
    const { user, t, habits } = await setup();
    await createHabits(user, ["Walk", "Read"]);
    const recurrences = await user.query(api.recurrences.list, {});
    const walk = recurrences.find((item) => item.title === "Walk")!._id;
    const read = recurrences.find((item) => item.title === "Read")!._id;
    const completeHabit = async (title: string) => {
      const task = (await user.query(api.tasks.list, { view: "list", listId: habits })).find(
        (row) => row.title === title,
      )!;
      await user.mutation(api.tasks.complete, { taskId: task._id });
      return task._id;
    };
    await completeHabit("Walk");
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    await completeHabit("Read");
    await user.mutation(api.tasks.reopen, { taskId: await completeHabit("Walk") });
    // A completion from before completions stored the recurrence.
    await t.run(async (ctx) => {
      const taskId = await ctx.db.insert("tasks", {
        ownerId,
        title: "Walk",
        kind: "habit",
        position: 0,
        isInbox: false,
        isAi: false,
        highPriority: false,
        state: "done",
        scheduleVersion: 0,
        recurrenceId: walk,
        occurrenceKey: "2026-09-02",
        archivedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("completions", {
        ownerId,
        taskId,
        titleSnapshot: "Walk",
        completedAt: Date.parse("2026-09-02T07:00:00Z"),
        completedLocalDate: "2026-09-02",
        timeZoneSnapshot: "Europe/Berlin",
        kind: "habit",
        occurrenceKey: "2026-09-02",
      });
    });
    day("2026-09-07T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    await completeHabit("Walk");
    expect(await user.query(api.recurrences.history, {})).toEqual({
      [walk]: [false, true, false, false, true, false],
      [read]: [false, false, false, false, false, true],
    });
    expect(await user.query(api.recurrences.history, { days: 2 })).toEqual({
      [walk]: [true, false],
      [read]: [false, true],
    });
    await expect(user.query(api.recurrences.history, { days: 0 })).rejects.toThrow(/Tagen/);
  });
});

describe("lists", () => {
  it("migrates legacy area data into seeded lists on the first write and stays idempotent", async () => {
    const { t, user } = await setup({ bootstrap: false });
    const now = Date.now();
    const timeZone = "Europe/Berlin";
    const base = {
      ownerId,
      isInbox: false,
      isAi: false,
      highPriority: false,
      state: "open" as const,
      scheduleVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    const legacy = await t.run(async (ctx) => {
      await ctx.db.insert("settings", {
        ownerId,
        defaultArea: "work",
        timeZone,
        currentLocalDate: "2026-09-05",
        habitsInitialized: true,
      });
      const root = await ctx.db.insert("tasks", {
        ...base,
        title: "Agency root",
        kind: "task",
        area: "agency",
        list: "backlog",
        projectName: "Old project",
        position: -1,
      });
      const child = await ctx.db.insert("tasks", {
        ...base,
        title: "Child",
        kind: "task",
        parentId: root,
        position: 1,
      });
      const plain = await ctx.db.insert("tasks", {
        ...base,
        title: "Plain",
        kind: "task",
        position: -2,
      });
      const walk = await ctx.db.insert("recurrences", {
        ownerId,
        title: "Walk",
        kind: "habit",
        isAi: false,
        highPriority: false,
        rule: { frequency: "daily" },
        timeZone,
        enabled: true,
        nextDate: "2026-09-06",
        nextRunAt: startOfDate("2026-09-06", timeZone),
        lastProcessedDate: "2026-09-05",
        createdAt: now,
      });
      const habit = await ctx.db.insert("tasks", {
        ...base,
        title: "Walk",
        kind: "habit",
        recurrenceId: walk,
        occurrenceKey: "2026-09-05",
        position: -1,
      });
      await ctx.db.patch(walk, { currentTaskId: habit });
      const report = await ctx.db.insert("recurrences", {
        ownerId,
        title: "Report",
        kind: "task",
        area: "work",
        projectName: "Ops",
        isAi: false,
        highPriority: false,
        rule: { frequency: "weekly", weekday: 1 },
        timeZone,
        enabled: true,
        nextDate: "2026-09-07",
        nextRunAt: startOfDate("2026-09-07", timeZone),
        createdAt: now,
      });
      // The old app put the newest habit on top of each day.
      const read = await ctx.db.insert("recurrences", {
        ownerId,
        title: "Read",
        kind: "habit",
        isAi: false,
        highPriority: false,
        rule: { frequency: "daily" },
        timeZone,
        enabled: true,
        nextDate: "2026-09-06",
        nextRunAt: startOfDate("2026-09-06", timeZone),
        lastProcessedDate: "2026-09-05",
        createdAt: now,
      });
      const reading = await ctx.db.insert("tasks", {
        ...base,
        title: "Read",
        kind: "habit",
        recurrenceId: read,
        occurrenceKey: "2026-09-05",
        position: -2,
      });
      await ctx.db.patch(read, { currentTaskId: reading });
      const archived = await ctx.db.insert("tasks", {
        ...base,
        title: "Old work",
        kind: "task",
        area: "agency",
        state: "done",
        completedAt: now - 86_400_000,
        completedLocalDate: "2026-09-04",
        archivedAt: now,
        position: 0,
      });
      await ctx.db.insert("completions", {
        ownerId,
        taskId: archived,
        titleSnapshot: "Old work",
        areaSnapshot: "agency",
        projectNameSnapshot: "Old project",
        completedAt: now - 86_400_000,
        completedLocalDate: "2026-09-04",
        timeZoneSnapshot: timeZone,
        kind: "task",
      });
      return { root, child, plain, habit, walk, report, read, archived };
    });
    // Reads tolerate an owner that has not been migrated yet.
    expect(await user.query(api.lists.list, {})).toEqual([]);
    const unmigrated = await user.query(api.tasks.get, { taskId: legacy.root });
    expect(unmigrated).toMatchObject({ section: "backlog" });
    expect(unmigrated.listId).toBeUndefined();
    expect(await user.query(api.tasks.list, { view: "all" })).toHaveLength(5);
    const created = await user.mutation(api.tasks.create, { title: "After migration" });
    const lists = await user.query(api.lists.list, {});
    expect(lists.map((list) => list.name)).toEqual([
      "Wichtig",
      "me",
      "agency",
      "work",
      "Habits",
      "Verlauf",
      "Wiederholungen",
    ]);
    const id = (name: string) => lists.find((list) => list.name === name)!._id;
    expect(await user.query(api.settings.get, {})).toMatchObject({ defaultListId: id("work") });
    const root = await user.query(api.tasks.get, { taskId: legacy.root });
    expect(root).toMatchObject({
      listId: id("agency"),
      section: "backlog",
      subtasks: [{ _id: legacy.child, listId: id("agency"), section: "backlog" }],
    });
    expect(root).not.toHaveProperty("projectName");
    expect(await user.query(api.tasks.get, { taskId: legacy.plain })).toMatchObject({
      listId: id("me"),
      section: "active",
    });
    expect(await user.query(api.tasks.get, { taskId: legacy.habit })).toMatchObject({
      listId: id("Habits"),
      section: "active",
    });
    expect(await user.query(api.tasks.get, { taskId: created })).toMatchObject({
      listId: id("work"),
    });
    const recurrences = await user.query(api.recurrences.list, {});
    const recurrence = (recurrenceId: Id<"recurrences">) =>
      recurrences.find((item) => item._id === recurrenceId);
    expect(recurrence(legacy.walk)).toMatchObject({ listId: id("Habits") });
    expect(recurrence(legacy.read)).toMatchObject({ listId: id("Habits") });
    expect(recurrence(legacy.report)).toMatchObject({ listId: id("work") });
    expect(await t.run((ctx) => ctx.db.get(legacy.root))).toMatchObject({
      projectName: "Old project",
    });
    expect(await t.run((ctx) => ctx.db.get(legacy.child))).not.toHaveProperty("listId");
    // Archived history keeps its legacy fields and still reads through its own snapshot.
    expect(await t.run((ctx) => ctx.db.get(legacy.archived))).not.toHaveProperty("listId");
    expect((await user.query(api.completions.list, { listId: id("agency") })).items).toMatchObject([
      { titleSnapshot: "Old work", listId: id("agency") },
    ]);
    await user.mutation(api.lists.bootstrap, {});
    await t.mutation(internal.scheduling.tick, {});
    expect(await t.run((ctx) => ctx.db.query("lists").collect())).toHaveLength(7);
    const habits = async () =>
      (await user.query(api.tasks.list, { view: "list", listId: id("Habits") })).map(
        (task) => task.title,
      );
    expect(await habits()).toEqual(["Read", "Walk"]);
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await habits()).toEqual(["Read", "Walk"]);
  });

  it("seeds the default lists and creates, edits and orders lists", async () => {
    const { user, me, habits, important } = await setup();
    expect(
      (await user.query(api.lists.list, {})).map(({ name, emoji, color, kind, favorite }) => ({
        name,
        emoji,
        color,
        kind,
        favorite,
      })),
    ).toEqual([
      { name: "Wichtig", emoji: "‼️", color: "#8e8e93", kind: "important", favorite: true },
      { name: "me", emoji: "💌", color: "#64d2ff", kind: "tasks", favorite: true },
      { name: "agency", emoji: "🪴", color: "#bf5af2", kind: "tasks", favorite: true },
      { name: "work", emoji: "💻", color: "#ff453a", kind: "tasks", favorite: true },
      { name: "Habits", emoji: "🔁", color: "#30d158", kind: "habits", favorite: true },
      { name: "Verlauf", emoji: "🕘", color: "#8e8e93", kind: "history", favorite: false },
      {
        name: "Wiederholungen",
        emoji: "🗓️",
        color: "#8e8e93",
        kind: "recurrences",
        favorite: false,
      },
    ]);
    const trip = await user.mutation(api.lists.create, { name: "  Urlaub  ", emoji: "🏖️" });
    const later = await user.mutation(api.lists.create, { name: "Zukunft" });
    const lists = async () => user.query(api.lists.list, {});
    const find = async (listId: Id<"lists">) => (await lists()).find((list) => list._id === listId);
    expect((await lists()).slice(-2)).toMatchObject([
      { _id: trip, name: "Urlaub", emoji: "🏖️", color: "#ff453a", favorite: false, openCount: 0 },
      { _id: later, name: "Zukunft", color: "#ff9f0a", kind: "tasks", favorite: false },
    ]);
    expect(await find(later)).not.toHaveProperty("emoji");
    await user.mutation(api.lists.update, {
      listId: trip,
      name: "Reise",
      color: "#0A84FF",
      emoji: null,
      favorite: true,
    });
    expect(await find(trip)).toMatchObject({ name: "Reise", color: "#0a84ff", favorite: true });
    expect(await find(trip)).not.toHaveProperty("emoji");
    await expect(user.mutation(api.lists.update, { listId: trip, name: " " })).rejects.toThrow(
      /Namen/,
    );
    await expect(user.mutation(api.lists.create, { name: "x".repeat(81) })).rejects.toThrow(
      /höchstens 80 Zeichen/,
    );
    await expect(user.mutation(api.lists.update, { listId: trip, color: "blue" })).rejects.toThrow(
      /Farbe/,
    );
    await expect(
      user.mutation(api.lists.update, { listId: habits, name: "Gewohnheiten" }),
    ).rejects.toThrow(/Favorit/);
    await user.mutation(api.lists.update, { listId: important, favorite: false });
    expect(await find(important)).toMatchObject({ name: "Wichtig", favorite: false });
    await user.mutation(api.lists.reorder, { listIds: [trip, me] });
    expect((await lists()).map((list) => list.name)).toEqual([
      "Reise",
      "me",
      "Wichtig",
      "agency",
      "work",
      "Habits",
      "Verlauf",
      "Wiederholungen",
      "Zukunft",
    ]);
    await expect(
      user.mutation(api.tasks.create, { title: "Not a habit", listId: habits }),
    ).rejects.toThrow(/normale Listen/);
    const taskId = await user.mutation(api.tasks.create, { title: "Move me", listId: trip });
    await expect(user.mutation(api.tasks.move, { taskId, listId: important })).rejects.toThrow(
      /normale Listen/,
    );
    await expect(user.mutation(api.settings.update, { defaultListId: habits })).rejects.toThrow(
      /Standardliste/,
    );
  });

  it("deletes a list only when no current task or recurrence uses it", async () => {
    const { user, t, me, habits } = await setup();
    const trip = await user.mutation(api.lists.create, { name: "Urlaub", emoji: "🏖️" });
    const taskId = await user.mutation(api.tasks.create, {
      title: "Packen",
      listId: trip,
      subtasks: [{ title: "Socken" }],
    });
    const remove = (listId: Id<"lists">) => user.mutation(api.lists.remove, { listId });
    await expect(remove(trip)).rejects.toThrow(/nicht leer/);
    await user.mutation(api.tasks.complete, { taskId });
    await expect(remove(trip)).rejects.toThrow(/nicht leer/);
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    await remove(trip);
    expect((await user.query(api.lists.list, {})).some((list) => list._id === trip)).toBe(false);
    expect((await user.query(api.completions.list, {})).items[0]).toMatchObject({
      listId: trip,
      listNameSnapshot: "Urlaub",
      listEmojiSnapshot: "🏖️",
    });
    const chores = await user.mutation(api.lists.create, { name: "Haushalt" });
    const recurrenceId = await user.mutation(api.recurrences.create, {
      title: "Filter wechseln",
      kind: "task",
      listId: chores,
      rule: { frequency: "monthly", dayOfMonth: 1 },
    });
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: false });
    await expect(remove(chores)).rejects.toThrow(/Wiederholung „Filter wechseln“/);
    await user.mutation(api.recurrences.remove, { recurrenceId });
    await remove(chores);
    await expect(remove(me)).rejects.toThrow(/Standardliste/);
    await expect(remove(habits)).rejects.toThrow(/nicht löschen/);
  });

  it("removes a recurrence, discards its open instance and keeps its history", async () => {
    const { user, t, habits } = await setup();
    const ops = await user.mutation(api.lists.create, { name: "Ops" });
    const report = await user.mutation(api.recurrences.create, {
      title: "Report",
      kind: "task",
      listId: ops,
      rule: { frequency: "daily" },
    });
    const walk = await user.mutation(api.recurrences.create, {
      title: "Walk",
      kind: "habit",
      rule: { frequency: "daily" },
    });
    const [first] = await user.query(api.tasks.list, { view: "list", listId: ops });
    await user.mutation(api.tasks.complete, { taskId: first!._id });
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    const [open] = await user.query(api.tasks.list, { view: "list", listId: ops });
    expect(open).toMatchObject({ recurrenceId: report, occurrenceKey: "2026-09-06" });
    const [walking] = await user.query(api.tasks.list, { view: "list", listId: habits });
    await user.mutation(api.tasks.complete, { taskId: walking!._id });
    await user.mutation(api.recurrences.remove, { recurrenceId: report });
    await user.mutation(api.recurrences.remove, { recurrenceId: walk });
    expect(await user.query(api.recurrences.list, {})).toEqual([]);
    expect(await user.query(api.tasks.list, { view: "list", listId: ops })).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(open!._id))).toMatchObject({ state: "discarded" });
    expect(
      (await user.query(api.completions.list, {})).items.map((row) => row.titleSnapshot),
    ).toEqual(["Walk", "Report"]);
    // Today's done habit stays; renaming it no longer reaches a recurrence, reopening hides it.
    await user.mutation(api.tasks.update, { taskId: walking!._id, title: "Spaziergang" });
    await user.mutation(api.tasks.reopen, { taskId: walking!._id });
    expect(await user.query(api.tasks.list, { view: "list", listId: habits })).toEqual([]);
    await user.mutation(api.lists.remove, { listId: ops });
    await expect(user.mutation(api.recurrences.remove, { recurrenceId: walk })).rejects.toThrow(
      /nicht gefunden/,
    );
  });

  it("keeps lists owner-scoped", async () => {
    const { user, t, me } = await setup();
    const foreign = await t.run((ctx) =>
      ctx.db.insert("lists", {
        ownerId: "foreign",
        name: "Privat",
        color: "#ff453a",
        kind: "tasks",
        favorite: true,
        position: 0,
        createdAt: Date.now(),
      }),
    );
    const taskId = await user.mutation(api.tasks.create, { title: "Mine", listId: me });
    expect((await user.query(api.lists.list, {})).some((list) => list._id === foreign)).toBe(false);
    expect(await user.query(api.tasks.list, { view: "list", listId: foreign })).toEqual([]);
    for (const attempt of [
      user.mutation(api.tasks.create, { title: "Leak", listId: foreign }),
      user.mutation(api.tasks.move, { taskId, listId: foreign }),
      user.mutation(api.lists.update, { listId: foreign, favorite: false }),
      user.mutation(api.lists.remove, { listId: foreign }),
      user.mutation(api.lists.reorder, { listIds: [foreign] }),
      user.mutation(api.settings.update, { defaultListId: foreign }),
      user.mutation(api.recurrences.create, {
        title: "Leak",
        kind: "task",
        listId: foreign,
        rule: { frequency: "daily" },
      }),
    ])
      await expect(attempt).rejects.toThrow(/nicht gefunden/);
    expect(await t.run((ctx) => ctx.db.get(foreign))).toMatchObject({ favorite: true });
  });

  it("collects Wichtig across lists without habits and counts open tasks per list", async () => {
    const { user, me, work, habits, important } = await setup();
    const urgent = await user.mutation(api.tasks.create, {
      title: "Urgent",
      listId: me,
      highPriority: true,
    });
    await user.mutation(api.tasks.create, {
      title: "Due",
      listId: work,
      dueOn: "2026-09-05",
      section: "backlog",
    });
    await user.mutation(api.tasks.create, {
      title: "Backlog urgent",
      listId: work,
      section: "backlog",
      highPriority: true,
    });
    await user.mutation(api.tasks.create, {
      title: "Later",
      listId: work,
      highPriority: true,
      plannedFor: "2026-09-07",
    });
    await user.mutation(api.tasks.create, { title: "Plain", listId: me });
    await createHabits(user, ["Walk"]);
    const [walk] = await user.query(api.tasks.list, { view: "list", listId: habits });
    await user.mutation(api.tasks.update, { taskId: walk!._id, highPriority: true });
    const titles = async () =>
      (await user.query(api.tasks.list, { view: "important" })).map((task) => task.title).sort();
    expect(await titles()).toEqual(["Backlog urgent", "Due", "Urgent"]);
    expect(
      (await user.query(api.tasks.list, { view: "important" })).find(
        (task) => task.title === "Due",
      ),
    ).toMatchObject({ listId: work, section: "active", isDue: true });
    await user.mutation(api.tasks.complete, { taskId: urgent });
    expect((await user.query(api.tasks.list, { view: "important" }))[0]).toMatchObject({
      _id: urgent,
      state: "done",
    });
    const counts = Object.fromEntries(
      (await user.query(api.lists.list, {})).map((list) => [list._id, list.openCount]),
    );
    expect([counts[important], counts[me], counts[work], counts[habits]]).toEqual([2, 1, 1, 1]);
  });

  it("accepts the deprecated area, list and projectName fields and view aliases", async () => {
    const { t, user, agency, work, habits } = await setup();
    const write = (key: string, command: unknown) =>
      t.mutation(internal.apiCommands.write, {
        tokenHash: "test-key",
        idempotencyKey: key,
        payloadHash: key,
        command,
      });
    const read = (resource: "tasks" | "completions", filters: unknown) =>
      t.query(internal.apiCommands.read, { tokenHash: "test-key", resource, filters });
    const { id } = await write("create", {
      type: "create",
      input: { title: "Legacy", area: "work", list: "backlog", projectName: "Ignored" },
    });
    expect(await user.query(api.tasks.get, { taskId: id })).toMatchObject({
      listId: work,
      section: "backlog",
    });
    expect(await t.run((ctx) => ctx.db.get(id))).not.toHaveProperty("projectName");
    await write("move", { type: "move", taskId: id, area: "agency", list: "active" });
    await write("update", {
      type: "update",
      taskId: id,
      input: { projectName: "Still ignored", highPriority: true },
    });
    expect(await user.query(api.tasks.list, { view: "priority" })).toMatchObject([
      { _id: id, listId: agency, section: "active" },
    ]);
    expect(await read("tasks", { area: "agency", list: "active" })).toMatchObject({
      items: [{ _id: id }],
    });
    expect(await read("tasks", { view: "area", area: "work" })).toMatchObject({ items: [] });
    await createHabits(user, ["Walk"]);
    expect(await user.query(api.tasks.list, { view: "habits" })).toMatchObject([
      { title: "Walk", listId: habits },
    ]);
    await write("complete", { type: "complete", taskId: id });
    expect(await read("completions", { area: "agency" })).toMatchObject({
      items: [{ titleSnapshot: "Legacy", listId: agency }],
    });
    expect(await read("completions", { area: "work" })).toMatchObject({ items: [] });
  });
});

describe("local calendar arithmetic", () => {
  it("V22 follows 23-hour and 25-hour days at the 2026 Berlin DST boundaries", () => {
    const zone = "Europe/Berlin";
    expect(startOfDate("2026-03-30", zone) - startOfDate("2026-03-29", zone)).toBe(23 * 3600_000);
    expect(startOfDate("2026-10-26", zone) - startOfDate("2026-10-25", zone)).toBe(25 * 3600_000);
    for (const date of ["2026-03-29", "2026-10-25"]) {
      const boundary = startOfDate(date, zone);
      expect(localDate(boundary, zone)).toBe(date);
      expect(localDate(boundary - 1, zone)).not.toBe(date);
    }
  });

  it("uses calendar weekdays and clamps missing month days without drifting into the next month", () => {
    expect(occurrenceOnOrAfter("2026-09-05", { frequency: "weekly", weekday: 1 })).toBe(
      "2026-09-07",
    );
    expect(latestOccurrence("2026-09-05", { frequency: "weekly", weekday: 1 })).toBe("2026-08-31");
    expect(occurrenceOnOrAfter("2026-02-01", { frequency: "monthly", dayOfMonth: 31 })).toBe(
      "2026-02-28",
    );
    expect(occurrenceOnOrAfter("2026-03-01", { frequency: "monthly", dayOfMonth: 31 })).toBe(
      "2026-03-31",
    );
    expect(latestOccurrence("2026-03-01", { frequency: "monthly", dayOfMonth: 31 })).toBe(
      "2026-02-28",
    );
  });
});
