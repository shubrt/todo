import { ConvexError } from "convex/values";
import {
  commandSchema,
  completionFiltersSchema,
  taskFiltersSchema,
  recurrenceInputSchema,
  type Area,
  type Command,
  type CompletionFilters,
  type TaskFilters,
  type RecurrenceInput,
} from "@todo/contracts";
import { logEvent } from "@todo/logging";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { addDays, latestOccurrence, localDate, occurrenceOnOrAfter, startOfDate } from "./time";

type ReadCtx = Pick<QueryCtx, "db">;
type Task = Doc<"tasks">;
type List = Doc<"lists">;
type OwnerSettings = Doc<"settings"> & { defaultListId: Id<"lists"> };

export const defaultTimeZone = "Europe/Berlin";

const specialColor = "#8e8e93";
/** Lists every owner starts with, in sidebar order; the index is the initial position. */
const listSeeds: Pick<List, "name" | "color" | "emoji" | "kind" | "favorite" | "legacyArea">[] = [
  { name: "Wichtig", emoji: "‼️", color: specialColor, kind: "important", favorite: true },
  { name: "me", emoji: "💌", color: "#64d2ff", kind: "tasks", favorite: true, legacyArea: "me" },
  {
    name: "agency",
    emoji: "🪴",
    color: "#bf5af2",
    kind: "tasks",
    favorite: true,
    legacyArea: "agency",
  },
  {
    name: "work",
    emoji: "💻",
    color: "#ff453a",
    kind: "tasks",
    favorite: true,
    legacyArea: "work",
  },
  { name: "Habits", emoji: "🔁", color: "#30d158", kind: "habits", favorite: true },
  { name: "Verlauf", emoji: "🕘", color: specialColor, kind: "history", favorite: false },
  {
    name: "Wiederholungen",
    emoji: "🗓️",
    color: specialColor,
    kind: "recurrences",
    favorite: false,
  },
];

export function fail(
  code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN",
  message: string,
): never {
  throw new ConvexError({ code, message });
}

/** Validates with a zod schema and maps the first issue to a German INVALID_INPUT error. */
export function parse<T>(
  schema: {
    safeParse(
      value: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    fail("INVALID_INPUT", result.error.issues[0]?.message ?? "Ungültige Eingabe.");
  return result.data;
}

export async function readSettings(ctx: ReadCtx, ownerId: string) {
  return ctx.db
    .query("settings")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}

async function ensureSettings(ctx: MutationCtx, ownerId: string) {
  const existing = await readSettings(ctx, ownerId);
  if (existing) return existing;
  const id = await ctx.db.insert("settings", {
    ownerId,
    timeZone: defaultTimeZone,
    currentLocalDate: localDate(Date.now(), defaultTimeZone),
  });
  return (await ctx.db.get(id))!;
}

/**
 * Settings of the owner with seeded lists. The first call migrates area-based data: current
 * roots and all recurrences get a list (habits: Habits, others: the list of their legacy
 * area, default me) and a section, `defaultArea` becomes `defaultListId`. Archived tasks keep
 * their legacy fields: lists never show them and completions carry their own snapshots.
 * Idempotent and a single read once migrated, so every write path calls it first.
 */
export async function ensureOwner(ctx: MutationCtx, ownerId: string): Promise<OwnerSettings> {
  const settings = await ensureSettings(ctx, ownerId);
  if (settings.listsMigratedAt !== undefined && settings.defaultListId !== undefined)
    return { ...settings, defaultListId: settings.defaultListId };
  const now = Date.now();
  const existing = await ownerLists(ctx, ownerId);
  const seeded = new Map<string, Id<"lists">>();
  for (const [position, seed] of listSeeds.entries()) {
    const key = seed.legacyArea ?? seed.kind;
    const match = existing.find((list) => (list.legacyArea ?? list.kind) === key);
    seeded.set(
      key,
      match?._id ?? (await ctx.db.insert("lists", { ...seed, ownerId, position, createdAt: now })),
    );
  }
  const listFor = (kind: Task["kind"], area: Area | undefined) =>
    seeded.get(kind === "habit" ? "habits" : (area ?? "me"))!;
  for (const task of await allTasks(ctx, ownerId))
    if (!task.parentId && !task.listId)
      await ctx.db.patch(task._id, {
        listId: listFor(task.kind, task.area),
        section: task.list ?? "active",
      });
  // `by_owner` is creation order. The old app put each day's newest habit on top, so legacy
  // habits keep that order (descending positions); other recurrences keep creation order.
  const recurrences = await ownerRecurrences(ctx, ownerId);
  for (const [index, recurrence] of recurrences.entries())
    if (!recurrence.listId)
      await ctx.db.patch(recurrence._id, {
        listId: listFor(recurrence.kind, recurrence.area),
        position:
          recurrence.position ?? (recurrence.kind === "habit" ? recurrences.length - index : index),
      });
  const defaultListId = settings.defaultListId ?? listFor("task", settings.defaultArea);
  await ctx.db.patch(settings._id, { defaultListId, listsMigratedAt: now });
  logEvent({ service: "todo-convex", operation: "owner.migrateLists", outcome: "ok" });
  return { ...settings, defaultListId, listsMigratedAt: now };
}

/** The owner's lists in sidebar order. */
export async function ownerLists(ctx: ReadCtx, ownerId: string) {
  const lists = await ctx.db
    .query("lists")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  return lists.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

export async function ownedList(ctx: ReadCtx, ownerId: string, listId: string): Promise<List> {
  const id = ctx.db.normalizeId("lists", listId);
  const list = id ? await ctx.db.get(id) : null;
  if (!list || list.ownerId !== ownerId) fail("NOT_FOUND", "Liste nicht gefunden.");
  return list;
}

/**
 * The normal list a task is created in or moved to: `listId`, else the list of the legacy
 * `area`, else undefined (the caller's fallback applies).
 */
async function targetList(ctx: ReadCtx, ownerId: string, ref: { listId?: string; area?: Area }) {
  const list = ref.listId
    ? await ownedList(ctx, ownerId, ref.listId)
    : ref.area
      ? ((await ownerLists(ctx, ownerId)).find((item) => item.legacyArea === ref.area) ??
        fail("NOT_FOUND", "Liste nicht gefunden."))
      : undefined;
  if (list && list.kind !== "tasks")
    fail("INVALID_INPUT", "Nur normale Listen nehmen Aufgaben auf.");
  return list;
}

async function ownerRecurrences(ctx: ReadCtx, ownerId: string) {
  return ctx.db
    .query("recurrences")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
}

export async function ownedTask(ctx: ReadCtx, ownerId: string, taskId: string): Promise<Task> {
  const id = ctx.db.normalizeId("tasks", taskId);
  const task = id ? await ctx.db.get(id) : null;
  if (!task || task.ownerId !== ownerId) fail("NOT_FOUND", "Aufgabe nicht gefunden.");
  return task;
}

/** Every task of the owner that is not archived (discarded ones included). */
export async function allTasks(ctx: ReadCtx, ownerId: string) {
  return ctx.db
    .query("tasks")
    .withIndex("by_owner_archived", (q) => q.eq("ownerId", ownerId).eq("archivedAt", undefined))
    .collect();
}

export function isCurrent(task: Task) {
  return task.archivedAt === undefined && task.state !== "discarded";
}
/** Ordering group: subtasks among their siblings, roots within their list section. */
function groupKey(task: Pick<Task, "parentId" | "listId" | "section">) {
  return task.parentId
    ? `parent:${task.parentId}`
    : `list:${task.listId}:${task.section ?? "active"}`;
}
function comparePosition(a: Task, b: Task) {
  return (
    Number(b.state === "done") - Number(a.state === "done") ||
    a.position - b.position ||
    a.createdAt - b.createdAt ||
    a._id.localeCompare(b._id)
  );
}

/**
 * Position at the top of the group's open block, right under today's done items. Habits use
 * their manual order (`recurrence.position`) instead.
 */
async function topPosition(
  ctx: ReadCtx,
  ownerId: string,
  group: Pick<Task, "parentId" | "listId" | "section">,
) {
  const key = groupKey(group);
  const positions = (await allTasks(ctx, ownerId))
    .filter((task) => isCurrent(task) && groupKey(task) === key)
    .map((task) => task.position);
  return Math.min(0, ...positions) - 1;
}

/**
 * Read shape of a task: the root's list and section (subtasks inherit them) plus urgency
 * flags for `today`. Legacy area/list/projectName fields are dropped.
 */
function decorate(task: Task, parent: Task | undefined, today: string, now: number) {
  const root = parent ?? task;
  const { area: _area, list: _list, projectName: _projectName, ...fields } = task;
  return {
    ...fields,
    listId: root.listId,
    section: root.section ?? root.list ?? "active",
    isDue: root.dueOn !== undefined && root.dueOn <= today,
    isOverdue: root.dueOn !== undefined && root.dueOn < today,
    isDeferred: Boolean(
      (root.snoozedUntil && root.snoozedUntil > now) ||
      (root.plannedFor && root.plannedFor > today),
    ),
  };
}
type TaskRow = ReturnType<typeof decorate>;

/** Deferred tasks stay out of working views until a binding due date is reached. */
function isVisible(row: TaskRow) {
  return !row.isDeferred || row.isDue;
}
/** The Wichtig rule: high priority or due today/overdue; habits never count. */
function isImportant(row: TaskRow) {
  return row.kind === "task" && (row.highPriority || row.isDue);
}

/**
 * Current roots matching the filters plus all their current children, sorted for display.
 * `list` shows one list (default: the default list) without deferred roots; for the Habits
 * list these are today's habit instances. `important` is Wichtig across all lists, `all`
 * everything current. Unknown lists yield no rows.
 */
export async function listTasks(ctx: ReadCtx, ownerId: string, input: TaskFilters = {}) {
  const filters = parse(taskFiltersSchema, input);
  const settings = await readSettings(ctx, ownerId);
  const now = Date.now();
  const today = settings?.currentLocalDate ?? localDate(now, defaultTimeZone);
  const view =
    filters.view === "priority"
      ? "important"
      : filters.view === "area" || filters.view === "habits"
        ? "list"
        : (filters.view ?? (filters.listId || filters.area ? "list" : "all"));
  const lists = filters.view === "habits" || filters.area ? await ownerLists(ctx, ownerId) : [];
  const listId =
    filters.view === "habits"
      ? lists.find((list) => list.kind === "habits")?._id
      : filters.area
        ? lists.find((list) => list.legacyArea === filters.area)?._id
        : (filters.listId ?? (view === "list" ? settings?.defaultListId : undefined));
  if ((view === "list" || filters.area) && !listId) return [];
  const section = filters.section ?? filters.list;
  const tasks = (await allTasks(ctx, ownerId)).filter(isCurrent);
  const roots = tasks
    .filter((task) => {
      if (task.parentId) return false;
      const row = decorate(task, undefined, today, now);
      if (listId && row.listId !== listId) return false;
      if (section && row.section !== section) return false;
      if (
        filters.isAi !== undefined &&
        task.isAi !== filters.isAi &&
        !tasks.some((child) => child.parentId === task._id && child.isAi === filters.isAi)
      )
        return false;
      if (view === "important" && !isImportant(row)) return false;
      if (view !== "all" && !isVisible(row)) return false;
      if (filters.search) {
        const query = filters.search.toLocaleLowerCase();
        const matches = (title: string) => title.toLocaleLowerCase().includes(query);
        if (
          !matches(task.title) &&
          !tasks.some((child) => child.parentId === task._id && matches(child.title))
        )
          return false;
      }
      return true;
    })
    .sort(comparePosition);
  const rootMap = new Map(roots.map((task) => [task._id, task]));
  return tasks
    .filter((task) => (task.parentId ? rootMap.has(task.parentId) : rootMap.has(task._id)))
    .sort(comparePosition)
    .map((task) =>
      decorate(task, task.parentId ? rootMap.get(task.parentId) : undefined, today, now),
    );
}

export async function getTask(ctx: ReadCtx, ownerId: string, taskId: string) {
  const task = await ownedTask(ctx, ownerId, taskId);
  const parent = task.parentId ? await ownedTask(ctx, ownerId, task.parentId) : undefined;
  const settings = await readSettings(ctx, ownerId);
  const today = settings?.currentLocalDate ?? localDate(Date.now(), defaultTimeZone);
  const subtasks = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_parent", (q) => q.eq("ownerId", ownerId).eq("parentId", task._id))
      .collect()
  )
    .filter(isCurrent)
    .sort(comparePosition);
  return {
    ...decorate(task, parent, today, Date.now()),
    subtasks: subtasks.map((child) => decorate(child, task, today, Date.now())),
  };
}

/**
 * The owner's lists in sidebar order, each with the count shown in the switcher: open
 * visible roots in Tasks for normal lists, today's open habits, open Wichtig tasks.
 */
export async function listOverview(ctx: ReadCtx, ownerId: string) {
  const lists = await ownerLists(ctx, ownerId);
  const settings = await readSettings(ctx, ownerId);
  const now = Date.now();
  const today = settings?.currentLocalDate ?? localDate(now, defaultTimeZone);
  const open = (await allTasks(ctx, ownerId))
    .filter((task) => !task.parentId && task.state === "open")
    .map((task) => decorate(task, undefined, today, now))
    .filter(isVisible);
  return lists.map((list) => ({
    ...list,
    openCount:
      list.kind === "important"
        ? open.filter(isImportant).length
        : list.kind === "tasks"
          ? open.filter((task) => task.listId === list._id && task.section === "active").length
          : list.kind === "habits"
            ? open.filter((task) => task.listId === list._id).length
            : 0,
  }));
}

/**
 * Completion history, newest day first. A list filter (or the legacy `area`) also matches
 * rows written before lists existed, and those rows get the matching `listId` in the result.
 */
export async function listCompletions(
  ctx: ReadCtx,
  ownerId: string,
  input: CompletionFilters = {},
) {
  const filters = parse(completionFiltersSchema, input);
  const limit = filters.limit ?? 100;
  const lists = await ownerLists(ctx, ownerId);
  const habitsListId = lists.find((list) => list.kind === "habits")?._id;
  const list = filters.listId
    ? lists.find((item) => item._id === filters.listId)
    : lists.find((item) => filters.area !== undefined && item.legacyArea === filters.area);
  const listId = filters.listId ?? list?._id;
  const legacyArea = list ? list.legacyArea : filters.area;
  const rows = ctx.db
    .query("completions")
    .withIndex("by_owner_date", (q) => {
      const owned = q.eq("ownerId", ownerId);
      if (filters.from && filters.to)
        return owned.gte("completedLocalDate", filters.from).lte("completedLocalDate", filters.to);
      if (filters.from) return owned.gte("completedLocalDate", filters.from);
      if (filters.to) return owned.lte("completedLocalDate", filters.to);
      return owned;
    })
    .order("desc");
  const filtered =
    filters.listId || filters.area
      ? rows.filter((q) => {
          const legacy = q.eq(q.field("listId"), undefined);
          return q.or(
            listId ? q.eq(q.field("listId"), listId) : false,
            legacyArea ? q.and(legacy, q.eq(q.field("areaSnapshot"), legacyArea)) : false,
            list && list._id === habitsListId
              ? q.and(legacy, q.eq(q.field("kind"), "habit"))
              : false,
          );
        })
      : rows;
  try {
    const page = await filtered.paginate({ numItems: limit, cursor: filters.cursor ?? null });
    return {
      items: page.page.map((row) => ({
        ...row,
        listId:
          row.listId ??
          (row.kind === "habit"
            ? habitsListId
            : lists.find((item) => row.areaSnapshot && item.legacyArea === row.areaSnapshot)?._id),
      })),
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  } catch (error) {
    if (
      filters.cursor &&
      error instanceof Error &&
      /cursor|JSON|Unexpected token/i.test(error.message)
    )
      fail("INVALID_INPUT", "Ungültiger Cursor. Bitte den Verlauf neu laden.");
    throw error;
  }
}

/**
 * For every habit: whether it was completed on each of the `days` local days before today,
 * oldest first. Rows from before completions stored `recurrenceId` resolve it through the
 * archived instance.
 */
export async function habitHistory(ctx: ReadCtx, ownerId: string, days: number) {
  const settings = await readSettings(ctx, ownerId);
  const today = settings?.currentLocalDate ?? localDate(Date.now(), defaultTimeZone);
  const dates = Array.from({ length: days }, (_, index) => addDays(today, index - days));
  const history: Record<Id<"recurrences">, boolean[]> = {};
  for (const recurrence of await ownerRecurrences(ctx, ownerId))
    if (recurrence.kind === "habit") history[recurrence._id] = dates.map(() => false);
  const completions = await ctx.db
    .query("completions")
    .withIndex("by_owner_date", (q) =>
      q
        .eq("ownerId", ownerId)
        .gte("completedLocalDate", addDays(today, -days))
        .lte("completedLocalDate", addDays(today, -1)),
    )
    .collect();
  for (const completion of completions) {
    if (completion.kind !== "habit") continue;
    const recurrenceId =
      completion.recurrenceId ?? (await ctx.db.get(completion.taskId))?.recurrenceId;
    const row = recurrenceId ? history[recurrenceId] : undefined;
    const index = dates.indexOf(completion.completedLocalDate);
    if (row && index >= 0) row[index] = true;
  }
  return history;
}

export async function applySchedule(ctx: MutationCtx, task: Task) {
  const settings = await ensureOwner(ctx, task.ownerId);
  const now = Date.now();
  const plannedAt = task.plannedFor ? startOfDate(task.plannedFor, settings.timeZone) : undefined;
  const deferredUntil = Math.max(task.snoozedUntil ?? 0, plannedAt ?? 0);
  // A binding due date must become visible even if snooze extends beyond it.
  const dueAt = task.dueOn ? startOfDate(task.dueOn, settings.timeZone) : undefined;
  const future = [
    deferredUntil > now ? deferredUntil : undefined,
    dueAt && dueAt > now ? dueAt : undefined,
  ].filter((value): value is number => value !== undefined);
  const wakeAt = future.length ? Math.min(...future) : undefined;
  const scheduleVersion = task.scheduleVersion + 1;
  await ctx.db.patch(task._id, { scheduleVersion, wakeAt });
  if (wakeAt !== undefined)
    await ctx.scheduler.runAt(wakeAt, internal.scheduling.wake, {
      taskId: task._id,
      version: scheduleVersion,
    });
}

export async function wakeTask(ctx: MutationCtx, taskId: Id<"tasks">, version: number) {
  const task = await ctx.db.get(taskId);
  if (
    !task ||
    task.scheduleVersion !== version ||
    !task.wakeAt ||
    task.wakeAt > Date.now() ||
    task.state !== "open" ||
    !isCurrent(task)
  )
    return;
  const settings = await ensureOwner(ctx, task.ownerId);
  const today = localDate(Date.now(), settings.timeZone);
  if (today !== settings.currentLocalDate)
    await ctx.db.patch(settings._id, { currentLocalDate: today });
  const snoozeEnded = task.snoozedUntil !== undefined && task.snoozedUntil <= Date.now();
  // Only a wake the snooze scheduled marks the task (applySchedule sets wakeAt to snoozedUntil
  // exactly then). A planned day or due date does not, even after a snooze that lapsed unseen.
  const woken = snoozeEnded && task.wakeAt === task.snoozedUntil;
  const position = await topPosition(ctx, task.ownerId, { ...task, section: "active" });
  await ctx.db.patch(task._id, {
    section: "active",
    snoozedUntil: snoozeEnded ? undefined : task.snoozedUntil,
    ...(woken ? { isWoken: true } : {}),
    position,
    wakeAt: undefined,
    updatedAt: Date.now(),
  });
  await applySchedule(ctx, (await ctx.db.get(task._id))!);
}

async function addChild(
  ctx: MutationCtx,
  ownerId: string,
  taskId: string,
  title: string,
  isAi = false,
) {
  const parent = await ownedTask(ctx, ownerId, taskId);
  if (parent.parentId || parent.kind === "habit")
    fail("INVALID_INPUT", "Unteraufgaben sind nur direkt unter einer Hauptaufgabe erlaubt.");
  if (parent.state !== "open" || !isCurrent(parent))
    fail("CONFLICT", "Diese Hauptaufgabe ist bereits abgeschlossen oder entfernt.");
  return ctx.db.insert("tasks", {
    ownerId,
    parentId: parent._id,
    kind: "task",
    title,
    isAi,
    isInbox: false,
    highPriority: false,
    position: await lastChildPosition(ctx, ownerId, parent._id),
    state: "open",
    scheduleVersion: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/** Position after every subtask of the parent, archived ones included. */
async function lastChildPosition(ctx: ReadCtx, ownerId: string, parentId: Id<"tasks">) {
  const siblings = await ctx.db
    .query("tasks")
    .withIndex("by_owner_parent", (q) => q.eq("ownerId", ownerId).eq("parentId", parentId))
    .collect();
  return Math.max(0, ...siblings.map((child) => child.position)) + 1;
}

/**
 * Reopens a task completed today: deletes its completion, puts it on top of the open block
 * and restores its schedule. Earlier days are archived history and stay closed. A habit
 * returns to its manual place; when it is paused or removed, its open instance is hidden as
 * pausing does, so it never outlives the day.
 */
async function reopenTask(ctx: MutationCtx, task: Task, today: string, now: number) {
  if (task.completedLocalDate !== today || (task.kind === "habit" && task.occurrenceKey !== today))
    fail("CONFLICT", "Nur heute erledigte Aufgaben lassen sich wieder öffnen.");
  const completions = await ctx.db
    .query("completions")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  for (const completion of completions)
    if (completion.completedLocalDate === task.completedLocalDate)
      await ctx.db.delete(completion._id);
  const recurrence = task.recurrenceId ? await ctx.db.get(task.recurrenceId) : null;
  await ctx.db.patch(task._id, {
    state: "open",
    completedAt: undefined,
    completedLocalDate: undefined,
    ...(task.kind === "habit"
      ? recurrence?.enabled
        ? {}
        : { archivedAt: now }
      : { position: await topPosition(ctx, task.ownerId, task) }),
    updatedAt: now,
  });
  await applySchedule(ctx, (await ctx.db.get(task._id))!);
}

/**
 * Makes an open root without subtasks the last subtask of the nearest open root above it in
 * the same visible section (deferred tasks are shown apart, under "Für später"). The task
 * drops the fields only roots carry.
 */
async function indentTask(ctx: MutationCtx, task: Task, today: string, now: number) {
  if (task.parentId)
    fail("INVALID_INPUT", "Unteraufgaben sind nur direkt unter einer Hauptaufgabe erlaubt.");
  if (task.kind === "habit" || task.recurrenceId)
    fail("INVALID_INPUT", "Habits und Wiederholungen lassen sich nicht einrücken.");
  if (task.state !== "open") fail("CONFLICT", "Nur offene Aufgaben lassen sich einrücken.");
  const tasks = (await allTasks(ctx, task.ownerId)).filter(isCurrent);
  if (tasks.some((child) => child.parentId === task._id))
    fail("INVALID_INPUT", "Aufgaben mit Unteraufgaben lassen sich nicht einrücken.");
  const hidden = (row: Task) => !isVisible(decorate(row, undefined, today, now));
  const sameSection = (row: Task) =>
    row.listId === task.listId &&
    hidden(row) === hidden(task) &&
    (hidden(task) || row.section === task.section);
  const roots = tasks.filter((row) => !row.parentId && sameSection(row)).sort(comparePosition);
  const parent = roots
    .slice(
      0,
      roots.findIndex((row) => row._id === task._id),
    )
    .findLast((row) => row.state === "open");
  if (!parent) fail("INVALID_INPUT", "Darüber steht keine offene Aufgabe.");
  await ctx.db.patch(task._id, {
    parentId: parent._id,
    listId: undefined,
    section: undefined,
    position: await lastChildPosition(ctx, task.ownerId, parent._id),
    plannedFor: undefined,
    dueOn: undefined,
    snoozedUntil: undefined,
    wakeAt: undefined,
    highPriority: false,
    isInbox: false,
    isWoken: undefined,
    scheduleVersion: task.scheduleVersion + 1,
    updatedAt: now,
  });
}

/**
 * Makes a subtask a root in its parent's list section, directly after the parent. It keeps
 * the schedule and priority it inherited, so it stays where the parent is shown (Für später,
 * Wichtig).
 */
async function outdentTask(ctx: MutationCtx, task: Task, now: number) {
  if (!task.parentId) fail("INVALID_INPUT", "Nur Unteraufgaben lassen sich ausrücken.");
  const parent = await ownedTask(ctx, task.ownerId, task.parentId);
  const group = { listId: parent.listId, section: parent.section ?? "active" };
  const key = groupKey(group);
  const roots = (await allTasks(ctx, task.ownerId))
    .filter((row) => isCurrent(row) && groupKey(row) === key)
    .sort(comparePosition);
  const order = roots.flatMap((row) => (row._id === parent._id ? [row, task] : [row]));
  for (const [position, row] of order.entries())
    if (row._id === task._id)
      await ctx.db.patch(task._id, {
        parentId: undefined,
        ...group,
        position,
        plannedFor: parent.plannedFor,
        dueOn: parent.dueOn,
        snoozedUntil: parent.snoozedUntil,
        highPriority: parent.highPriority,
        updatedAt: now,
      });
    else if (row.position !== position) await ctx.db.patch(row._id, { position });
  await applySchedule(ctx, (await ctx.db.get(task._id))!);
}

/**
 * Stores a new order of today's habits on their recurrences, where it outlives the day. The
 * display puts done habits first, so only the order among the open and among the done habits
 * counts: each group fills the places it already holds in the manual order, and paused habits
 * keep theirs. Instances take the same positions.
 */
async function reorderHabits(ctx: MutationCtx, ownerId: string, order: Task[], now: number) {
  const recurrences = (await ownerRecurrences(ctx, ownerId))
    .filter((recurrence) => recurrence.kind === "habit")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt);
  // One instance per habit; a stray second one keeps its position.
  const unseen = new Set(recurrences.map((recurrence) => recurrence._id));
  const instances = order.flatMap(({ _id, state, recurrenceId }) =>
    recurrenceId && unseen.delete(recurrenceId) ? [{ _id, state, recurrenceId }] : [],
  );
  const stateOf = new Map(instances.map((task) => [task.recurrenceId, task.state]));
  const manual = recurrences.map((recurrence) => recurrence._id);
  for (const state of ["open", "done"] as const) {
    const moved = instances.filter((task) => task.state === state);
    const places = manual.flatMap((id, index) => (stateOf.get(id) === state ? [index] : []));
    for (const [index, place] of places.entries()) manual[place] = moved[index]!.recurrenceId;
  }
  const previous = new Map(recurrences.map((recurrence) => [recurrence._id, recurrence.position]));
  for (const [position, id] of manual.entries())
    if (previous.get(id) !== position) await ctx.db.patch(id, { position });
  for (const task of instances)
    await ctx.db.patch(task._id, { position: manual.indexOf(task.recurrenceId), updatedAt: now });
}

export async function executeCommand(ctx: MutationCtx, ownerId: string, rawCommand: Command) {
  const command = parse(commandSchema, rawCommand);
  const settings = await ensureOwner(ctx, ownerId);
  const now = Date.now();
  const today = localDate(now, settings.timeZone);
  if (command.type === "create") {
    const {
      subtasks,
      listId,
      section,
      area,
      list,
      projectName: _ignored,
      ...input
    } = command.input;
    const group = {
      listId: (await targetList(ctx, ownerId, { listId, area }))?._id ?? settings.defaultListId,
      section:
        input.dueOn !== undefined && input.dueOn <= today
          ? ("active" as const)
          : (section ?? list ?? ("active" as const)),
    };
    const taskId = await ctx.db.insert("tasks", {
      ...input,
      ...group,
      ownerId,
      kind: "task",
      isInbox: input.isInbox ?? true,
      isAi: input.isAi ?? false,
      highPriority: input.highPriority ?? false,
      state: "open",
      position: await topPosition(ctx, ownerId, group),
      scheduleVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    for (const child of subtasks ?? [])
      await addChild(ctx, ownerId, taskId, child.title, child.isAi);
    await applySchedule(ctx, (await ctx.db.get(taskId))!);
    logEvent({ service: "todo-convex", operation: "task.create", outcome: "ok", taskId });
    return taskId;
  }
  if (command.type === "reorder") {
    const taskIds = new Set(command.taskIds);
    if (taskIds.size !== command.taskIds.length)
      fail("INVALID_INPUT", "Eine Aufgabe darf nur einmal in der Reihenfolge stehen.");
    const selected = await Promise.all(command.taskIds.map((id) => ownedTask(ctx, ownerId, id)));
    const first = selected[0]!;
    const key = groupKey(first);
    if (selected.some((task) => !isCurrent(task) || groupKey(task) !== key))
      fail("INVALID_INPUT", "Nur Aufgaben derselben Liste können gemeinsam sortiert werden.");
    const section = command.section ?? command.list;
    const areaListId = command.area
      ? (await ownerLists(ctx, ownerId)).find((list) => list.legacyArea === command.area)?._id
      : undefined;
    if (
      (command.parentId && first.parentId !== command.parentId) ||
      (command.listId && first.listId !== command.listId) ||
      (command.area && first.listId !== areaListId) ||
      (section && first.section !== section) ||
      (command.kind && first.kind !== command.kind)
    )
      fail("INVALID_INPUT", "Die Reihenfolge gehört nicht zur angegebenen Liste.");
    const rest = (await allTasks(ctx, ownerId))
      .filter((task) => isCurrent(task) && groupKey(task) === key && !taskIds.has(task._id))
      .sort(comparePosition);
    const order = [...selected, ...rest];
    // Each day gets new habit instances, so their order lives on the recurrences.
    if (first.kind === "habit") await reorderHabits(ctx, ownerId, order, now);
    else
      for (const [index, task] of order.entries())
        await ctx.db.patch(task._id, { position: index, updatedAt: now });
    return null;
  }
  const task = await ownedTask(ctx, ownerId, command.taskId);
  if (command.type === "complete" && task.state === "done") return task._id;
  if (command.type === "discard" && task.state === "discarded") return task._id;
  if (!isCurrent(task)) fail("CONFLICT", "Diese Aufgabe ist bereits archiviert oder entfernt.");
  if (command.type === "addSubtask")
    return addChild(ctx, ownerId, task._id, command.title, command.isAi);
  if (command.type === "clearInbox" && task.isInbox)
    await ctx.db.patch(task._id, { isInbox: false, updatedAt: now });
  if (command.type === "markSeen" && (task.isInbox || task.isWoken))
    await ctx.db.patch(task._id, { isInbox: false, isWoken: undefined, updatedAt: now });
  if (command.type === "update") {
    if (task.parentId && command.input.highPriority !== undefined)
      fail("INVALID_INPUT", "Priorität gehört zur Hauptaufgabe.");
    const { projectName: _ignored, ...patch } = command.input;
    await ctx.db.patch(task._id, { ...patch, updatedAt: now });
    // A habit or recurring instance is renamed for good, not only until the next period. A
    // removed recurrence leaves its instance behind.
    if (patch.title !== undefined && task.recurrenceId && (await ctx.db.get(task.recurrenceId)))
      await ctx.db.patch(task.recurrenceId, { title: patch.title });
  }
  if (command.type === "move") {
    if (task.parentId || task.kind === "habit")
      fail("INVALID_INPUT", "Nur Hauptaufgaben können die Liste wechseln.");
    const next = {
      listId: (await targetList(ctx, ownerId, command))?._id ?? task.listId,
      section: command.section ?? command.list ?? task.section ?? "active",
    };
    if (groupKey(next) !== groupKey(task))
      await ctx.db.patch(task._id, {
        ...next,
        position: await topPosition(ctx, ownerId, next),
        updatedAt: now,
      });
  }
  if (command.type === "complete") {
    if (task.kind === "habit" && task.occurrenceKey !== today)
      fail("CONFLICT", "Dieser Habit gehört zu einem vergangenen Tag. Bitte aktualisieren.");
    if (command.occurrenceKey && task.occurrenceKey !== command.occurrenceKey)
      fail("CONFLICT", "Diese Wiederholung gehört zu einem anderen Zeitraum.");
    const parent = task.parentId ? await ownedTask(ctx, ownerId, task.parentId) : undefined;
    if (parent && !isCurrent(parent))
      fail("CONFLICT", "Die Hauptaufgabe wurde bereits archiviert.");
    const root = parent ?? task;
    const list = root.listId ? await ctx.db.get(root.listId) : null;
    await ctx.db.insert("completions", {
      ownerId,
      taskId: task._id,
      parentTaskId: task.parentId,
      titleSnapshot: task.title,
      parentTitleSnapshot: parent?.title,
      listId: root.listId,
      listNameSnapshot: list?.name,
      listEmojiSnapshot: list?.emoji,
      recurrenceId: task.recurrenceId,
      completedAt: now,
      completedLocalDate: today,
      timeZoneSnapshot: settings.timeZone,
      kind: task.parentId ? "subtask" : task.kind,
      occurrenceKey: task.occurrenceKey,
    });
    await ctx.db.patch(task._id, {
      state: "done",
      completedAt: now,
      completedLocalDate: today,
      // Done rows sort first anyway; habits keep their manual place within them.
      ...(task.kind === "habit" ? {} : { position: await topPosition(ctx, ownerId, task) }),
      wakeAt: undefined,
      scheduleVersion: task.scheduleVersion + 1,
      updatedAt: now,
    });
    logEvent({
      service: "todo-convex",
      operation: "task.complete",
      outcome: "ok",
      taskId: task._id,
    });
  }
  if (command.type === "reopen" && task.state === "done") await reopenTask(ctx, task, today, now);
  if (command.type === "indent") await indentTask(ctx, task, today, now);
  if (command.type === "outdent") await outdentTask(ctx, task, now);
  if (command.type === "discard") {
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_owner_parent", (q) => q.eq("ownerId", ownerId).eq("parentId", task._id))
      .collect();
    for (const child of children.filter(isCurrent))
      await ctx.db.patch(child._id, {
        ...(child.state === "open" ? { state: "discarded" as const } : {}),
        archivedAt: now,
        wakeAt: undefined,
        updatedAt: now,
      });
    await ctx.db.patch(task._id, {
      ...(task.state === "open" ? { state: "discarded" as const } : {}),
      archivedAt: now,
      wakeAt: undefined,
      scheduleVersion: task.scheduleVersion + 1,
      updatedAt: now,
    });
  }
  if (command.type === "plan" || command.type === "snooze" || command.type === "normalizeUrgency") {
    if (task.parentId || task.kind === "habit")
      fail("INVALID_INPUT", "Termine und Priorität gehören zur Hauptaufgabe.");
    if (task.state !== "open")
      fail("CONFLICT", "Abgeschlossene Aufgaben können nicht neu geplant werden.");
    if (command.type === "plan") {
      await ctx.db.patch(task._id, {
        ...(command.plannedFor !== undefined
          ? { plannedFor: command.plannedFor ?? undefined }
          : {}),
        ...(command.dueOn !== undefined ? { dueOn: command.dueOn ?? undefined } : {}),
        updatedAt: now,
      });
      const next = (await ctx.db.get(task._id))!;
      if (
        (command.plannedFor && command.plannedFor <= today) ||
        (command.dueOn && command.dueOn <= today)
      )
        await ctx.db.patch(task._id, {
          section: "active",
          position: await topPosition(ctx, ownerId, { ...next, section: "active" }),
        });
    }
    if (command.type === "snooze") {
      if (command.snoozedUntil !== null && command.snoozedUntil <= now)
        fail("INVALID_INPUT", "Der Zeitpunkt muss in der Zukunft liegen.");
      // Any change of the snooze drops the alarm clock of an earlier one.
      await ctx.db.patch(task._id, {
        snoozedUntil: command.snoozedUntil ?? undefined,
        isWoken: undefined,
        updatedAt: now,
      });
    }
    if (command.type === "normalizeUrgency")
      await ctx.db.patch(task._id, {
        dueOn: undefined,
        plannedFor: undefined,
        highPriority: false,
        updatedAt: now,
      });
    await applySchedule(ctx, (await ctx.db.get(task._id))!);
  }
  return task._id;
}

/** Creates a recurrence and its current instance. Habits go to the Habits list, on top. */
export async function createRecurrence(ctx: MutationCtx, ownerId: string, input: RecurrenceInput) {
  const parsed = parse(recurrenceInputSchema, input);
  if (parsed.kind === "habit" && parsed.rule.frequency !== "daily")
    fail("INVALID_INPUT", "Habits wiederholen sich täglich.");
  const settings = await ensureOwner(ctx, ownerId);
  const listId =
    parsed.kind === "habit"
      ? (
          (await ownerLists(ctx, ownerId)).find((list) => list.kind === "habits") ??
          fail("NOT_FOUND", "Liste nicht gefunden.")
        )._id
      : ((await targetList(ctx, ownerId, parsed))?._id ?? settings.defaultListId);
  const siblings = (await ownerRecurrences(ctx, ownerId)).filter(
    (recurrence) => recurrence.kind === parsed.kind,
  );
  const today = localDate(Date.now(), settings.timeZone);
  const nextDate = occurrenceOnOrAfter(parsed.startOn ?? today, parsed.rule);
  const recurrenceId = await ctx.db.insert("recurrences", {
    ownerId,
    title: parsed.title,
    kind: parsed.kind,
    listId,
    position: Math.min(0, ...siblings.map((recurrence) => recurrence.position ?? 0)) - 1,
    isAi: parsed.isAi ?? false,
    highPriority: parsed.kind === "task" ? (parsed.highPriority ?? false) : false,
    rule: parsed.rule,
    timeZone: settings.timeZone,
    enabled: true,
    nextDate,
    nextRunAt: startOfDate(nextDate, settings.timeZone),
    createdAt: Date.now(),
  });
  await materializeRecurrence(ctx, (await ctx.db.get(recurrenceId))!);
  return recurrenceId;
}

export async function materializeRecurrence(ctx: MutationCtx, recurrence: Doc<"recurrences">) {
  if (!recurrence.enabled || recurrence.nextRunAt > Date.now()) return;
  const today = localDate(Date.now(), recurrence.timeZone);
  const period = latestOccurrence(today, recurrence.rule);
  if (period < recurrence.nextDate) return;
  let current = recurrence.currentTaskId ? await ctx.db.get(recurrence.currentTaskId) : null;
  if (
    recurrence.kind === "habit" &&
    current &&
    current.occurrenceKey !== period &&
    isCurrent(current)
  ) {
    await ctx.db.patch(current._id, { archivedAt: Date.now(), updatedAt: Date.now() });
    current = null;
  }
  let currentTaskId = current?._id;
  if (!current || current.state !== "open" || !isCurrent(current)) {
    const group = { listId: recurrence.listId, section: "active" as const };
    currentTaskId = await ctx.db.insert("tasks", {
      ownerId: recurrence.ownerId,
      title: recurrence.title,
      kind: recurrence.kind,
      ...group,
      isAi: recurrence.isAi,
      highPriority: recurrence.highPriority,
      isInbox: false,
      state: "open",
      // Habits keep their manual order from one day to the next.
      position:
        recurrence.kind === "habit" && recurrence.position !== undefined
          ? recurrence.position
          : await topPosition(ctx, recurrence.ownerId, group),
      scheduleVersion: 0,
      recurrenceId: recurrence._id,
      occurrenceKey: period,
      dueOn: recurrence.kind === "task" ? period : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  const nextDate = occurrenceOnOrAfter(addDays(period, 1), recurrence.rule);
  await ctx.db.patch(recurrence._id, {
    currentTaskId,
    lastProcessedDate: period,
    nextDate,
    nextRunAt: startOfDate(nextDate, recurrence.timeZone),
  });
}

export async function processOwnerDay(ctx: MutationCtx, ownerId: string) {
  const settings = await ensureOwner(ctx, ownerId);
  const today = localDate(Date.now(), settings.timeZone);
  const tasks = await allTasks(ctx, ownerId);
  const archivedRoots = new Set<Id<"tasks">>();
  for (const task of tasks) {
    if (
      isCurrent(task) &&
      task.state === "done" &&
      task.completedLocalDate &&
      task.completedLocalDate < today
    ) {
      await ctx.db.patch(task._id, { archivedAt: Date.now(), updatedAt: Date.now() });
      if (!task.parentId) archivedRoots.add(task._id);
    }
  }
  for (const task of tasks) {
    if (task.parentId && archivedRoots.has(task.parentId) && isCurrent(task))
      await ctx.db.patch(task._id, { archivedAt: Date.now(), updatedAt: Date.now() });
  }
  for (const recurrence of await ownerRecurrences(ctx, ownerId))
    await materializeRecurrence(ctx, recurrence);
  for (const task of tasks)
    if (task.wakeAt !== undefined && task.wakeAt <= Date.now())
      await wakeTask(ctx, task._id, task.scheduleVersion);
  if (settings.currentLocalDate !== today || settings.lastProcessedDate !== today)
    await ctx.db.patch(settings._id, { currentLocalDate: today, lastProcessedDate: today });
}
