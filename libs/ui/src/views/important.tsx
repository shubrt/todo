import { useQuery } from "convex/react";
import { Fragment, useMemo } from "react";
import { useDay, useLists, type List } from "../data";
import {
  EmptyLine,
  groupTasks,
  SectionHeader,
  taskSelectables,
  TaskTree,
  useSelectables,
} from "../rows";
import { viewQueries } from "../start";
import { useApp } from "../store";
import { ListMark } from "../ui";
import { byList } from "./by-list";
import "./views.css";

/**
 * Wichtig: open tasks with high priority or due today or earlier (deferred ones only when
 * due), plus those completed today, in one section per source list. Today's done tasks lead
 * their section, checkboxes take the source list's color. Rows cannot be reordered here:
 * each section shows only part of its list.
 */
export function ImportantView(_props: { list: List }) {
  const queries = viewQueries.important();
  const tasks = useQuery(queries.tasks.query, queries.tasks.args);
  const lists = useLists();
  const day = useDay();
  const expanded = useApp((state) => state.expanded);

  const model = useMemo(() => {
    if (!tasks || !lists) return undefined;
    const { roots, subtasks } = groupTasks(tasks);
    const sections = byList(lists, roots, (task) => task.listId).map(({ list, items }) => {
      const open = items.filter((task) => task.state === "open");
      return {
        list,
        open: open.length,
        roots: [...items.filter((task) => task.state === "done"), ...open],
      };
    });
    return { sections, subtasks };
  }, [tasks, lists]);

  const items = useMemo(
    () =>
      model?.sections.flatMap((section) =>
        taskSelectables(section.roots, model.subtasks, expanded, false),
      ) ?? [],
    [model, expanded],
  );
  useSelectables(items);

  if (!model || !day) return null;
  if (!model.sections.length) return <EmptyLine>Nichts Wichtiges offen.</EmptyLine>;
  return model.sections.map((section) => (
    <Fragment key={section.list._id}>
      <SectionHeader
        label={section.list.name}
        count={section.open}
        mark={<ListMark list={section.list} />}
      />
      <TaskTree
        roots={section.roots}
        subtasks={model.subtasks}
        color={section.list.color}
        day={day}
      />
    </Fragment>
  ));
}
