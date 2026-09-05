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

export function fail(
  code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN",
  message: string,
): never {
  throw new ConvexError({ code, message });
}

function parse<T>(
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

export async function ensureSettings(ctx: MutationCtx, ownerId: string) {
  const existing = await readSettings(ctx, ownerId);
  if (existing) return existing;
  const id = await ctx.db.insert("settings", {
    ownerId,
    defaultArea: "me",
    timeZone: "Europe/Berlin",
    currentLocalDate: localDate(Date.now(), "Europe/Berlin"),
    habitsInitialized: false,
  });
  return (await ctx.db.get(id))!;
}

export async function ownedTask(ctx: ReadCtx, ownerId: string, taskId: string): Promise<Task> {
  const id = ctx.db.normalizeId("tasks", taskId);
  const task = id ? await ctx.db.get(id) : null;
  if (!task || task.ownerId !== ownerId) fail("NOT_FOUND", "Aufgabe nicht gefunden.");
  return task;
}

async function allTasks(ctx: ReadCtx, ownerId: string) {
  return ctx.db
    .query("tasks")
    .withIndex("by_owner_archived", (q) => q.eq("ownerId", ownerId).eq("archivedAt", undefined))
    .collect();
}

function isCurrent(task: Task) {
  return task.archivedAt === undefined && task.state !== "discarded";
}
function sameGroup(left: Task, right: Task) {
  if (left.parentId || right.parentId) return left.parentId === right.parentId;
  return left.kind === right.kind && left.area === right.area && left.list === right.list;
}
function comparePosition(a: Task, b: Task) {
  return (
    Number(b.state === "done") - Number(a.state === "done") ||
    a.position - b.position ||
    a.createdAt - b.createdAt ||
    a._id.localeCompare(b._id)
  );
}

async function topPosition(
  ctx: ReadCtx,
  ownerId: string,
  group: Pick<Task, "parentId" | "kind" | "area" | "list">,
) {
  const tasks = await allTasks(ctx, ownerId);
  const positions = tasks
    .filter(
      (task) =>
        isCurrent(task) &&
        (group.parentId
          ? task.parentId === group.parentId
          : !task.parentId &&
            task.kind === group.kind &&
            task.area === group.area &&
            task.list === group.list),
    )
    .map((task) => task.position);
  return Math.min(0, ...positions) - 1;
}

function decorate(task: Task, parent: Task | undefined, today: string, now: number) {
  const root = parent ?? task;
  return {
    ...task,
    area: root.area,
    list: root.list,
    projectName: root.projectName,
    isDue: root.dueOn !== undefined && root.dueOn <= today,
    isOverdue: root.dueOn !== undefined && root.dueOn < today,
    isDeferred: Boolean(
      (root.snoozedUntil && root.snoozedUntil > now) ||
      (root.plannedFor && root.plannedFor > today),
    ),
  };
}

export async function listTasks(ctx: ReadCtx, ownerId: string, input: TaskFilters = {}) {
  const filters = parse(taskFiltersSchema, input);
  const settings = await readSettings(ctx, ownerId);
  const now = Date.now();
  const today = settings?.currentLocalDate ?? localDate(now, "Europe/Berlin");
  const tasks = (await allTasks(ctx, ownerId)).filter(isCurrent);
  const roots = tasks
    .filter((task) => !task.parentId)
    .filter((task) => {
      const view = decorate(task, undefined, today, now);
      if (filters.area && task.area !== filters.area) return false;
      if (filters.list && task.list !== filters.list) return false;
      if (
        filters.isAi !== undefined &&
        task.isAi !== filters.isAi &&
        !tasks.some((child) => child.parentId === task._id && child.isAi === filters.isAi)
      )
        return false;
      if (filters.view === "habits" && task.kind !== "habit") return false;
      if (filters.view !== "habits" && filters.view !== "all" && task.kind !== "task") return false;
      if (filters.view === "priority" && !(task.highPriority || view.isDue)) return false;
      if (filters.view !== "all" && view.isDeferred && !view.isDue) return false;
      if (filters.search) {
        const query = filters.search.toLocaleLowerCase();
        const matchingChild = tasks.some(
          (child) => child.parentId === task._id && child.title.toLocaleLowerCase().includes(query),
        );
        if (
          !`${task.title} ${task.projectName ?? ""}`.toLocaleLowerCase().includes(query) &&
          !matchingChild
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
  const today = settings?.currentLocalDate ?? localDate(Date.now(), "Europe/Berlin");
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

export async function listCompletions(
  ctx: ReadCtx,
  ownerId: string,
  input: CompletionFilters = {},
) {
  const filters = parse(completionFiltersSchema, input);
  const limit = filters.limit ?? 100;
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
  const filtered = filters.area
    ? rows.filter((q) => q.eq(q.field("areaSnapshot"), filters.area))
    : rows;
  try {
    const page = await filtered.paginate({ numItems: limit, cursor: filters.cursor ?? null });
    return { items: page.page, nextCursor: page.isDone ? null : page.continueCursor };
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

export async function applySchedule(ctx: MutationCtx, task: Task) {
  const settings = await ensureSettings(ctx, task.ownerId);
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
  const settings = await ensureSettings(ctx, task.ownerId);
  const today = localDate(Date.now(), settings.timeZone);
  if (today !== settings.currentLocalDate)
    await ctx.db.patch(settings._id, { currentLocalDate: today });
  const snoozedUntil =
    task.snoozedUntil && task.snoozedUntil <= Date.now() ? undefined : task.snoozedUntil;
  const position = await topPosition(ctx, task.ownerId, { ...task, list: "active" });
  await ctx.db.patch(task._id, {
    list: "active",
    snoozedUntil,
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
  const siblings = await ctx.db
    .query("tasks")
    .withIndex("by_owner_parent", (q) => q.eq("ownerId", ownerId).eq("parentId", parent._id))
    .collect();
  return ctx.db.insert("tasks", {
    ownerId,
    parentId: parent._id,
    kind: "task",
    title,
    isAi,
    isInbox: false,
    highPriority: false,
    position: Math.max(0, ...siblings.map((child) => child.position)) + 1,
    state: "open",
    scheduleVersion: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function executeCommand(ctx: MutationCtx, ownerId: string, rawCommand: Command) {
  const command = parse(commandSchema, rawCommand);
  const settings = await ensureSettings(ctx, ownerId);
  const now = Date.now();
  if (command.type === "create") {
    const { subtasks, ...input } = command.input;
    const today = localDate(now, settings.timeZone);
    const dueNow = input.dueOn !== undefined && input.dueOn <= today;
    const group = {
      kind: "task" as const,
      area: input.area ?? settings.defaultArea,
      list: dueNow ? ("active" as const) : (input.list ?? ("active" as const)),
    };
    const taskId = await ctx.db.insert("tasks", {
      ...input,
      ...group,
      ownerId,
      title: input.title,
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
    if (selected.some((task) => !isCurrent(task) || !sameGroup(task, first)))
      fail("INVALID_INPUT", "Nur Aufgaben derselben Liste können gemeinsam sortiert werden.");
    if (
      (command.parentId && first.parentId !== command.parentId) ||
      (command.area && first.area !== command.area) ||
      (command.list && first.list !== command.list) ||
      (command.kind && first.kind !== command.kind)
    )
      fail("INVALID_INPUT", "Die Reihenfolge gehört nicht zur angegebenen Liste.");
    const rest = (await allTasks(ctx, ownerId))
      .filter((task) => isCurrent(task) && sameGroup(task, first) && !taskIds.has(task._id))
      .sort(comparePosition);
    for (const [index, task] of [...selected, ...rest].entries())
      await ctx.db.patch(task._id, { position: index, updatedAt: now });
    return null;
  }
  const task = await ownedTask(ctx, ownerId, command.taskId);
  if (command.type === "complete" && task.state === "done") return task._id;
  if (command.type === "discard" && task.state === "discarded") return task._id;
  if (!isCurrent(task)) fail("CONFLICT", "Diese Aufgabe ist bereits archiviert oder entfernt.");
  if (command.type === "addSubtask")
    return addChild(ctx, ownerId, task._id, command.title, command.isAi);
  if (command.type === "clearInbox")
    await ctx.db.patch(task._id, { isInbox: false, updatedAt: now });
  if (command.type === "update") {
    if (
      task.parentId &&
      (command.input.highPriority !== undefined || command.input.projectName !== undefined)
    )
      fail("INVALID_INPUT", "Priorität und Projekt gehören zur Hauptaufgabe.");
    const { projectName, ...patch } = command.input;
    await ctx.db.patch(task._id, {
      ...patch,
      ...(projectName !== undefined ? { projectName: projectName ?? undefined } : {}),
      updatedAt: now,
    });
  }
  if (command.type === "move") {
    if (task.parentId || task.kind === "habit")
      fail("INVALID_INPUT", "Nur Hauptaufgaben können den Bereich oder die Liste wechseln.");
    const next = { ...task, area: command.area ?? task.area, list: command.list ?? task.list };
    await ctx.db.patch(task._id, {
      area: next.area,
      list: next.list,
      position: await topPosition(ctx, ownerId, next),
      updatedAt: now,
    });
  }
  if (command.type === "complete") {
    if (task.kind === "habit" && task.occurrenceKey !== localDate(now, settings.timeZone))
      fail("CONFLICT", "Dieser Habit gehört zu einem vergangenen Tag. Bitte aktualisieren.");
    if (command.occurrenceKey && task.occurrenceKey !== command.occurrenceKey)
      fail("CONFLICT", "Diese Wiederholung gehört zu einem anderen Zeitraum.");
    const parent = task.parentId ? await ownedTask(ctx, ownerId, task.parentId) : undefined;
    if (parent && !isCurrent(parent))
      fail("CONFLICT", "Die Hauptaufgabe wurde bereits archiviert.");
    const completedLocalDate = localDate(now, settings.timeZone);
    await ctx.db.insert("completions", {
      ownerId,
      taskId: task._id,
      parentTaskId: task.parentId,
      titleSnapshot: task.title,
      parentTitleSnapshot: parent?.title,
      areaSnapshot: (parent ?? task).area,
      projectNameSnapshot: (parent ?? task).projectName,
      completedAt: now,
      completedLocalDate,
      timeZoneSnapshot: settings.timeZone,
      kind: task.parentId ? "subtask" : task.kind,
      occurrenceKey: task.occurrenceKey,
    });
    await ctx.db.patch(task._id, {
      state: "done",
      completedAt: now,
      completedLocalDate,
      position: await topPosition(ctx, ownerId, task),
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
  if (["plan", "snooze", "normalizeUrgency"].includes(command.type)) {
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
      const today = localDate(now, settings.timeZone);
      if (
        (command.plannedFor && command.plannedFor <= today) ||
        (command.dueOn && command.dueOn <= today)
      )
        await ctx.db.patch(task._id, {
          list: "active",
          position: await topPosition(ctx, ownerId, { ...next, list: "active" }),
        });
    }
    if (command.type === "snooze") {
      if (command.snoozedUntil !== null && command.snoozedUntil <= now)
        fail("INVALID_INPUT", "Der Zeitpunkt muss in der Zukunft liegen.");
      await ctx.db.patch(task._id, {
        snoozedUntil: command.snoozedUntil ?? undefined,
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

export async function createRecurrence(ctx: MutationCtx, ownerId: string, input: RecurrenceInput) {
  const parsed = parse(recurrenceInputSchema, input);
  if (parsed.kind === "habit" && parsed.rule.frequency !== "daily")
    fail("INVALID_INPUT", "Habits wiederholen sich täglich.");
  const settings = await ensureSettings(ctx, ownerId);
  const today = localDate(Date.now(), settings.timeZone);
  const nextDate = occurrenceOnOrAfter(parsed.startOn ?? today, parsed.rule);
  const recurrenceId = await ctx.db.insert("recurrences", {
    ownerId,
    title: parsed.title,
    kind: parsed.kind,
    area: parsed.kind === "task" ? (parsed.area ?? settings.defaultArea) : undefined,
    projectName: parsed.kind === "task" ? parsed.projectName : undefined,
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
    const group = {
      kind: recurrence.kind,
      area: recurrence.area,
      list: recurrence.kind === "task" ? ("active" as const) : undefined,
    };
    currentTaskId = await ctx.db.insert("tasks", {
      ownerId: recurrence.ownerId,
      title: recurrence.title,
      ...group,
      projectName: recurrence.projectName,
      isAi: recurrence.isAi,
      highPriority: recurrence.highPriority,
      isInbox: false,
      state: "open",
      position: await topPosition(ctx, recurrence.ownerId, group),
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
  const settings = await ensureSettings(ctx, ownerId);
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
  const recurrences = await ctx.db
    .query("recurrences")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  for (const recurrence of recurrences) await materializeRecurrence(ctx, recurrence);
  for (const task of tasks)
    if (task.wakeAt !== undefined && task.wakeAt <= Date.now())
      await wakeTask(ctx, task._id, task.scheduleVersion);
  if (settings.currentLocalDate !== today || settings.lastProcessedDate !== today)
    await ctx.db.patch(settings._id, { currentLocalDate: today, lastProcessedDate: today });
}

export async function projectNames(ctx: ReadCtx, ownerId: string): Promise<string[]> {
  return [
    ...new Set(
      (await allTasks(ctx, ownerId))
        .filter((task) => !task.parentId && task.projectName)
        .map((task) => task.projectName!),
    ),
  ].sort();
}

export type { Area };
