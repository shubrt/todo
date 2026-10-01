import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { localDate, startOfDate, occurrenceOnOrAfter, latestOccurrence } from "../convex/time";

const modules = import.meta.glob("../convex/**/*.ts");
const ownerId = "owner";
const day = (value: string) => vi.setSystemTime(new Date(value));

async function setup() {
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
  return { t, user };
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
  it("V01/V02 captures in the chosen default area and clearing inbox preserves a manually moved position", async () => {
    const { user } = await setup();
    await user.mutation(api.settings.update, { defaultArea: "agency" });
    const a = await user.mutation(api.tasks.create, { title: "First" });
    const b = await user.mutation(api.tasks.create, { title: "Second" });
    const c = await user.mutation(api.tasks.create, { title: "Third" });
    expect(
      (await user.query(api.tasks.list, { view: "area", area: "agency", list: "active" })).map(
        (task) => task._id,
      ),
    ).toEqual([c, b, a]);
    await user.mutation(api.tasks.reorder, { taskIds: [a, c, b] });
    const before = await user.query(api.tasks.get, { taskId: c });
    await user.mutation(api.tasks.clearInbox, { taskId: c });
    const after = await user.query(api.tasks.get, { taskId: c });
    expect(after).toMatchObject({
      area: "agency",
      list: "active",
      isInbox: false,
      position: before.position,
    });
    expect(
      (await user.query(api.tasks.list, { view: "area", area: "agency" })).map((task) => task._id),
    ).toEqual([a, c, b]);
  });

  it("V03/V04/V05 inherits the moved root context and rejects third levels and child priority", async () => {
    const { user } = await setup();
    const parent = await user.mutation(api.tasks.create, {
      title: "Migration",
      projectName: "old",
      subtasks: [{ title: "Database" }],
    });
    const initial = await user.query(api.tasks.get, { taskId: parent });
    const child = initial.subtasks[0]!._id;
    await user.mutation(api.tasks.move, { taskId: parent, area: "work", list: "backlog" });
    await user.mutation(api.tasks.update, { taskId: parent, projectName: "neo" });
    expect(await user.query(api.tasks.get, { taskId: child })).toMatchObject({
      area: "work",
      list: "backlog",
      projectName: "neo",
    });
    await expect(
      user.mutation(api.tasks.addSubtask, { taskId: child, title: "Third level" }),
    ).rejects.toThrow(/Unteraufgaben/);
    await expect(
      user.mutation(api.tasks.update, { taskId: child, highPriority: true }),
    ).rejects.toThrow(/Priorität/);
    await expect(user.mutation(api.tasks.move, { taskId: child, area: "me" })).rejects.toThrow(
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
    const { user, t } = await setup();
    await expect(user.mutation(api.tasks.create, { title: "  " })).rejects.toThrow();
    await expect(
      user.mutation(api.tasks.create, { title: "Impossible", dueOn: "2026-02-30" }),
    ).rejects.toThrow();
    const a = await user.mutation(api.tasks.create, { title: "A", area: "me" });
    const b = await user.mutation(api.tasks.create, { title: "B", area: "work" });
    await expect(user.mutation(api.tasks.reorder, { taskIds: [a, b] })).rejects.toThrow(
      /derselben Liste/,
    );
    await expect(user.mutation(api.tasks.reorder, { taskIds: [a, a] })).rejects.toThrow(/einmal/);
    const foreign = await t.run((ctx) =>
      ctx.db.insert("tasks", {
        ownerId: "foreign",
        title: "Private",
        kind: "task",
        area: "me",
        list: "active",
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
});

describe("completion evidence and nightly cleanup", () => {
  it("V09/V10 keeps completed roots first even after new capture and writes one immutable event", async () => {
    const { user } = await setup();
    const completed = await user.mutation(api.tasks.create, {
      title: "Deliver",
      area: "work",
      projectName: "neo",
    });
    await user.mutation(api.tasks.complete, { taskId: completed });
    await user.mutation(api.tasks.complete, { taskId: completed });
    await user.mutation(api.tasks.create, { title: "New work", area: "work" });
    const tasks = await user.query(api.tasks.list, { view: "area", area: "work" });
    expect(tasks[0]).toMatchObject({ _id: completed, state: "done" });
    await user.mutation(api.tasks.update, {
      taskId: completed,
      title: "Renamed",
      projectName: "changed",
    });
    const history = await user.query(api.completions.list, {});
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({
      titleSnapshot: "Deliver",
      projectNameSnapshot: "neo",
      areaSnapshot: "work",
    });
  });

  it("V11/V12/V13 discards remaining work while preserving genuine child completion snapshots", async () => {
    const { user, t } = await setup();
    const root = await user.mutation(api.tasks.create, {
      title: "Original parent",
      area: "agency",
      projectName: "Original project",
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
    await user.mutation(api.tasks.update, {
      taskId: root,
      title: "New parent",
      projectName: "New project",
    });
    await user.mutation(api.tasks.discard, { taskId: root });
    expect(await user.query(api.tasks.list, { view: "all" })).toHaveLength(0);
    const history = (await user.query(api.completions.list, {})).items;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      titleSnapshot: "Finished child",
      parentTitleSnapshot: "Original parent",
      projectNameSnapshot: "Original project",
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
});

describe("calendar planning, snooze and recurrence processing", () => {
  it("V14/V19 activates a planned backlog task without clients and without making it globally urgent", async () => {
    const { user, t } = await setup();
    const taskId = await user.mutation(api.tasks.create, {
      title: "Tomorrow",
      list: "backlog",
      plannedFor: "2026-09-06",
    });
    await user.mutation(api.tasks.create, { title: "Existing active" });
    expect(await user.query(api.tasks.deferred, { area: "me" })).toHaveLength(1);
    day("2026-09-05T22:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    const tasks = await user.query(api.tasks.list, { view: "area", area: "me", list: "active" });
    expect(tasks[0]).toMatchObject({
      _id: taskId,
      list: "active",
      isDeferred: false,
      isDue: false,
    });
    expect(await user.query(api.tasks.list, { view: "priority" })).toHaveLength(0);
    await user.mutation(api.tasks.reorder, { taskIds: [tasks[1]!._id, taskId] });
    await t.mutation(internal.scheduling.tick, {});
    expect(
      (await user.query(api.tasks.list, { view: "area", area: "me", list: "active" }))[1]!._id,
    ).toBe(taskId);
  });

  it("V15/V17 keeps hard deadlines visible through snooze and permanently normalizes overdue tasks", async () => {
    const { user, t } = await setup();
    const taskId = await user.mutation(api.tasks.create, {
      title: "Must finish",
      dueOn: "2026-09-05",
      list: "backlog",
      highPriority: true,
    });
    await user.mutation(api.tasks.snooze, {
      taskId,
      snoozedUntil: Date.parse("2026-09-07T12:00:00Z"),
    });
    expect((await user.query(api.tasks.list, { view: "priority" }))[0]).toMatchObject({
      _id: taskId,
      isDue: true,
      isOverdue: false,
      list: "active",
    });
    day("2026-09-06T01:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect((await user.query(api.tasks.list, { view: "priority" }))[0]!.isOverdue).toBe(true);
    await user.mutation(api.tasks.normalizeUrgency, { taskId });
    day("2026-09-08T01:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await user.query(api.tasks.list, { view: "priority" })).toHaveLength(0);
    expect(await user.query(api.tasks.get, { taskId })).toMatchObject({
      state: "open",
      highPriority: false,
      isOverdue: false,
    });
  });

  it("V18 ignores an old wake job after the user changes snooze", async () => {
    const { user, t } = await setup();
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
    expect(await user.query(api.tasks.list, { view: "area", area: "me" })).toHaveLength(0);
    day("2026-09-06T12:00:00Z");
    await t.mutation(internal.scheduling.wake, { taskId, version: updated.scheduleVersion });
    expect(await user.query(api.tasks.get, { taskId })).toMatchObject({ isDeferred: false });
  });

  it("reschedules calendar wake-ups on timezone changes and ignores the old timezone job", async () => {
    const { user, t } = await setup();
    const taskId = await user.mutation(api.tasks.create, {
      title: "Tomorrow in local time",
      plannedFor: "2026-09-06",
      list: "backlog",
    });
    const berlin = await user.query(api.tasks.get, { taskId });
    expect(berlin.wakeAt).toBe(Date.parse("2026-09-05T22:00:00Z"));
    await user.mutation(api.settings.update, { timeZone: "UTC" });
    const utc = await user.query(api.tasks.get, { taskId });
    expect(utc.wakeAt).toBe(Date.parse("2026-09-06T00:00:00Z"));
    day("2026-09-05T22:00:00Z");
    await t.mutation(internal.scheduling.wake, { taskId, version: berlin.scheduleVersion });
    expect((await user.query(api.tasks.get, { taskId })).list).toBe("backlog");
    day("2026-09-06T00:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await user.query(api.tasks.get, { taskId })).toMatchObject({
      list: "active",
      isDeferred: false,
    });
  });

  it("can pause and resume today's habit without losing or duplicating its current instance", async () => {
    const { user, t } = await setup();
    const recurrenceId = await user.mutation(api.recurrences.create, {
      title: "Daily walk",
      kind: "habit",
      rule: { frequency: "daily" },
    });
    const original = (await user.query(api.tasks.list, { view: "habits" }))[0]!;
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: false });
    expect(await user.query(api.tasks.list, { view: "habits" })).toHaveLength(0);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: true });
    expect((await user.query(api.tasks.list, { view: "habits" })).map((task) => task._id)).toEqual([
      original._id,
    ]);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: false });
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect(await user.query(api.tasks.list, { view: "habits" })).toHaveLength(0);
    await user.mutation(api.recurrences.update, { recurrenceId, enabled: true });
    const next = await user.query(api.tasks.list, { view: "habits" });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ occurrenceKey: "2026-09-06", state: "open" });
    expect(next[0]!._id).not.toBe(original._id);
  });

  it("V23/V24 consumes each recurrence period even when an old instance is still open", async () => {
    const { user, t } = await setup();
    await user.mutation(api.recurrences.create, {
      title: "Check reports",
      kind: "task",
      area: "work",
      rule: { frequency: "daily" },
    });
    const first = (await user.query(api.tasks.list, { view: "all" }))[0]!;
    day("2026-09-06T06:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    expect((await user.query(api.tasks.list, { view: "all" })).map((task) => task._id)).toEqual([
      first._id,
    ]);
    expect((await user.query(api.recurrences.list, {}))[0]).toMatchObject({
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
    const { user, t } = await setup();
    await user.mutation(api.settings.initializeHabits, {
      titles: ["One", "Two", "Three", "Four", "Five"],
    });
    const before = await user.query(api.tasks.list, { view: "habits" });
    for (const habit of before.slice(0, 3))
      await user.mutation(api.tasks.complete, {
        taskId: habit._id,
        occurrenceKey: habit.occurrenceKey,
      });
    const oldOpen = before[4]!;
    day("2026-09-06T00:00:00Z");
    await t.mutation(internal.scheduling.tick, {});
    await t.mutation(internal.scheduling.tick, {});
    const after = await user.query(api.tasks.list, { view: "habits" });
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
    await user.mutation(api.recurrences.create, {
      title: "Sixth",
      kind: "habit",
      rule: { frequency: "daily" },
    });
    expect(await user.query(api.tasks.list, { view: "habits" })).toHaveLength(6);
  });

  it("V26/V40 catches up several missed days without historical copies or fabricated completions", async () => {
    const { user, t } = await setup();
    await user.mutation(api.settings.initializeHabits, {
      titles: ["One", "Two", "Three", "Four", "Five"],
    });
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
      list: "backlog",
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
      list: "active",
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
