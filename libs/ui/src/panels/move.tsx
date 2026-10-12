import type { Id } from "@todo/backend/dataModel";
import { useLists } from "../data";
import { findTask, useApp } from "../store";
import { useTaskActions } from "../task-actions";
import { ListMark } from "../ui";
import { closeThen, Panel, useCloseWhenGone } from "./panel";
import { listSections } from "./switcher";

/**
 * ⇧⌘M Verschieben: every normal list (no Wichtig, Habits, Verlauf, Wiederholungen), favorites
 * first. The current list is dimmed; the task lands in Tasks of the target.
 */
export function MovePanel({ taskId }: { taskId: Id<"tasks"> }) {
  const item = useApp((state) => findTask(state.items, taskId));
  const lists = useLists();
  const actions = useTaskActions();
  useCloseWhenGone(!item);
  if (!item || !lists) return null;
  const { task } = item;
  return (
    <Panel
      crumb="Verschieben"
      head={task}
      placeholder="Liste suchen …"
      sections={listSections(
        lists.filter((list) => list.kind === "tasks"),
        (list) => {
          const current = list._id === task.listId;
          return {
            id: list._id,
            icon: <ListMark list={list} />,
            label: list.name,
            dim: current,
            value: current ? "aktuell" : undefined,
            run: current ? undefined : closeThen(() => actions.moveTo(task, list._id)),
          };
        },
      )}
    />
  );
}
