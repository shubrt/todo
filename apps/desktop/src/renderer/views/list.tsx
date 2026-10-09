import { api } from "@todo/backend/api";
import { useQuery } from "convex/react";
import { Fragment, useMemo } from "react";
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
import { isSectionOpen, useApp, type Selectable } from "../store";
import "./views.css";

const sectionLabels = { active: "Tasks", backlog: "Backlog", later: "Für später" } as const;

/**
 * A normal list: Tasks (open by default), Backlog and, while something is planned or snoozed,
 * Für später. Each section remembers whether it is open. Today's done tasks lead Tasks and the
 * ⌘N editor sits right under them.
 */
export function ListView({ list }: { list: List }) {
  const tasks = useQuery(api.tasks.list, { view: "list", listId: list._id });
  const deferred = useQuery(api.tasks.deferred, { listId: list._id });
  const day = useDay();
  const sections = useApp((state) => state.sections);
  const expanded = useApp((state) => state.expanded);
  const creating = useApp((state) => state.editing?.type === "create" && !state.editing.parentId);

  const model = useMemo(() => {
    if (!tasks || !deferred) return undefined;
    const current = groupTasks(tasks);
    const later = groupTasks(deferred);
    const subtasks = new Map([...current.subtasks, ...later.subtasks]);
    const groups: { key: keyof typeof sectionLabels; roots: Task[] }[] = [
      { key: "active", roots: current.roots.filter((task) => task.section === "active") },
      { key: "backlog", roots: current.roots.filter((task) => task.section === "backlog") },
      ...(later.roots.length ? [{ key: "later" as const, roots: later.roots }] : []),
    ];
    return {
      subtasks,
      groups: groups.map((group) => ({
        ...group,
        id: `section:${list._id}:${group.key}`,
        open: isSectionOpen(sections, list._id, group.key),
      })),
    };
  }, [tasks, deferred, sections, list._id]);

  const items = useMemo(
    () =>
      model?.groups.flatMap((group): Selectable[] => [
        { type: "section", id: group.id, scope: list._id, section: group.key, open: group.open },
        ...(group.open ? taskSelectables(group.roots, model.subtasks, expanded) : []),
      ]) ?? [],
    [model, expanded, list._id],
  );
  useSelectables(items);

  if (!model || !day) return null;
  const toggle = (key: string, open: boolean) =>
    useApp.getState().setSectionOpen(list._id, key, !open);
  return model.groups.map((group) => {
    const open = group.roots.filter((task) => task.state === "open");
    const tree = (roots: Task[]) => (
      <TaskTree roots={roots} subtasks={model.subtasks} color={list.color} day={day} />
    );
    return (
      <Fragment key={group.key}>
        <SectionHeader
          id={group.id}
          label={sectionLabels[group.key]}
          count={open.length}
          open={group.open}
          onToggle={() => toggle(group.key, group.open)}
        />
        {group.open &&
          (group.key === "active" ? (
            <>
              {tree(group.roots.filter((task) => task.state === "done"))}
              {creating && <EditRow color={list.color} target={{ list }} />}
              {tree(open)}
              {!open.length && !creating && (
                <EmptyLine>
                  Nichts offen. <kbd>⌘N</kbd> legt eine Aufgabe an.
                </EmptyLine>
              )}
            </>
          ) : (
            tree(group.roots)
          ))}
      </Fragment>
    );
  });
}
