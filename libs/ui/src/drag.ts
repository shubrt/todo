import type { Id } from "@todo/backend/dataModel";
import type { Task } from "./data";
import { findTask, useApp, type TaskItem } from "./store";
import type { TaskActions } from "./task-actions";
import { gesture, longPress } from "./touch";

/** Px from the list's top or bottom edge in which a lifted row scrolls the list. */
const edge = 48;
/** Scroll speed in px per ms at the very edge. */
const speed = 0.8;

/**
 * The rows a task can be dragged among: the unbroken run around it of rows with its state and
 * section. Roots stay in their section, subtasks under their parent, open rows among open ones
 * and today's done among done, as with ⌥↑/⌥↓. Für später mixes sections, so its runs may be
 * short. Empty where the view shows only part of a list (Wichtig).
 */
export function dragRun({ task, siblings, sortable }: TaskItem) {
  const index = siblings.findIndex((sibling) => sibling._id === task._id);
  if (!sortable || index < 0) return [];
  const peer = (sibling: Task | undefined) =>
    sibling?.state === task.state && sibling.section === task.section;
  let start = index;
  let end = index + 1;
  while (peer(siblings[start - 1])) start--;
  while (peer(siblings[end])) end++;
  return siblings.slice(start, end);
}

/**
 * Touch: a long press lifts the task row, the finger moves it within its run (dragRun) and
 * letting go saves the new place through actions.drop. Nothing lifts while editing, with a
 * panel open or in a run of one; the press then stays a tap. Returns the row's pointer-down
 * handler, which ignores a mouse.
 */
export function rowDrag(taskId: Id<"tasks">, actions: TaskActions) {
  return longPress(({ target, y, pointerId }) => {
    const state = useApp.getState();
    const item = findTask(state.items, taskId);
    const list = target.closest<HTMLElement>(".list");
    if (!item || !list || state.editing || state.panels.length) return false;
    const run = dragRun(item);
    const blocks = run.flatMap((task) => block(list, task._id));
    if (run.length < 2 || blocks.length < run.length) return false;
    const from = run.findIndex((task) => task._id === taskId);
    lift(list, blocks, from, y, pointerId, (steps) => {
      // A live update may have changed the run meanwhile; then the row just goes back.
      const now = findTask(useApp.getState().items, taskId);
      if (now && idsOf(dragRun(now)) === idsOf(run)) void actions.drop(taskId, steps);
    });
    return true;
  });
}

const idsOf = (tasks: Task[]) => tasks.map((task) => task._id).join();

type Block = { elements: HTMLElement[]; top: number; bottom: number };

/**
 * A task's row where it is laid out now, none if it is not shown. A root's expanded subtasks
 * travel with it.
 */
function block(list: HTMLElement, taskId: string): Block[] {
  const row = list.querySelector<HTMLElement>(`[data-task="${taskId}"]`);
  if (!row) return [];
  const next = row.nextElementSibling;
  const subs = next instanceof HTMLElement && next.matches(".subs") ? next : undefined;
  return [
    {
      elements: subs ? [row, subs] : [row],
      top: row.getBoundingClientRect().top,
      bottom: (subs ?? row).getBoundingClientRect().bottom,
    },
  ];
}

/**
 * Follows the finger with the lifted block (`from`) until it lets go. The block stays inside
 * the run, the blocks it passes slide by its height, and near the list's edges the list
 * scrolls (one frame at a time, only while the finger is there). `drop` gets the places moved
 * on release; a cancel (the system took the touch) only puts everything back.
 */
function lift(
  list: HTMLElement,
  blocks: Block[],
  from: number,
  y0: number,
  pointerId: number,
  drop: (steps: number) => void,
) {
  const lifted = blocks[from]!;
  const height = lifted.bottom - lifted.top;
  const middles = blocks.map((block) => (block.top + block.bottom) / 2);
  // How far the lifted block may go up and down: to the run's first and last place.
  const up = Math.min(...blocks.map((block) => block.top)) - lifted.top;
  const down = Math.max(...blocks.map((block) => block.bottom)) - lifted.bottom;
  const scroll0 = list.scrollTop;
  let y = y0;
  let to = from;
  let frame = 0;
  let last = 0;

  const layout = () => {
    const dy = Math.max(up, Math.min(down, y - y0 + list.scrollTop - scroll0));
    const center = middles[from]! + dy;
    // It takes a neighbor's place once its center passes the neighbor's middle.
    to = from;
    while (center > (middles[to + 1] ?? Infinity)) to++;
    while (center < (middles[to - 1] ?? -Infinity)) to--;
    blocks.forEach((block, index) => {
      const shift =
        index === from
          ? dy
          : from < index && index <= to
            ? -height
            : to <= index && index < from
              ? height
              : 0;
      for (const element of block.elements)
        element.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };
  /** -1 to 1 by how deep the finger is in the top or bottom zone, else 0. */
  const zone = () => {
    const { top, bottom } = list.getBoundingClientRect();
    const depth = y < top + edge ? y - top - edge : y > bottom - edge ? y - bottom + edge : 0;
    return Math.max(-1, Math.min(1, depth / edge));
  };
  const scroll = (time: number) => {
    const ratio = zone();
    if (!ratio) {
      frame = 0;
      return;
    }
    list.scrollTop += ratio * speed * (last ? time - last : 16);
    last = time;
    layout();
    frame = requestAnimationFrame(scroll);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    y = event.clientY;
    layout();
    if (!frame && zone()) {
      last = 0;
      frame = requestAnimationFrame(scroll);
    }
  };
  const end = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    gesture.lock = false;
    // Off first, so the rows jump to their places instead of sliding back.
    delete list.dataset.dragging;
    for (const block of blocks)
      for (const element of block.elements) {
        element.style.transform = "";
        delete element.dataset.lift;
      }
    if (event.type === "pointerup" && to !== from) drop(to - from);
  };

  gesture.lock = true;
  list.dataset.dragging = "";
  for (const element of lifted.elements) element.dataset.lift = "";
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}
