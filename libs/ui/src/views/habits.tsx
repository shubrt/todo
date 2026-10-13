import { useQuery } from "convex/react";
import { useMemo } from "react";
import { useDay, type List, type Task } from "../data";
import {
  EditRow,
  EmptyLine,
  groupTasks,
  SectionHeader,
  taskSelectables,
  TaskTree,
  useSelectables,
} from "../rows";
import { viewQueries } from "../start";
import { useApp } from "../store";
import "./views.css";

/** Dots for a habit without history yet (recurrences.history covers the six days before today). */
const noHistory = Array.from({ length: 6 }, () => false);

/**
 * Habits: today's habit instances in one section "Heute" counting done/total. Done habits
 * lead, the ⌘N editor (a new habit) sits under them. Each row shows the six days before
 * today as dots in the list color. ↵ renames the habit itself (tasks.update renames the
 * recurrence), ⌥↑/⌥↓ also set the order of the coming days.
 */
export function HabitsView({ list }: { list: List }) {
  const queries = viewQueries.habits(list._id);
  const tasks = useQuery(queries.tasks.query, queries.tasks.args);
  const history = useQuery(queries.history.query, queries.history.args);
  const day = useDay();
  const creating = useApp((state) => state.editing?.type === "create" && !state.editing.parentId);

  const model = useMemo(() => {
    if (!tasks) return undefined;
    const { roots, subtasks } = groupTasks(tasks);
    return {
      done: roots.filter((task) => task.state === "done"),
      open: roots.filter((task) => task.state === "open"),
      subtasks,
    };
  }, [tasks]);
  // Habits have no subtasks, so nothing is ever expanded.
  const items = useMemo(
    () => (model ? taskSelectables([...model.done, ...model.open], model.subtasks, {}) : []),
    [model],
  );
  useSelectables(items);

  if (!model || !history || !day) return null;
  const weekOf = (task: Task) => (task.recurrenceId && history[task.recurrenceId]) || noHistory;
  const tree = (roots: Task[]) => (
    <TaskTree
      roots={roots}
      subtasks={model.subtasks}
      color={list.color}
      day={day}
      weekOf={weekOf}
    />
  );
  const total = model.done.length + model.open.length;
  return (
    <>
      <SectionHeader label="Heute" count={`${model.done.length}/${total}`} />
      {tree(model.done)}
      {creating && <EditRow color={list.color} target={{ list }} placeholder="Neuer Habit" />}
      {tree(model.open)}
      {!total && !creating && (
        <EmptyLine>
          Noch keine Habits.
          <span className="kh">
            {" "}
            <kbd>⌘N</kbd> legt einen an.
          </span>
        </EmptyLine>
      )}
    </>
  );
}
