import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Calendar,
  Check,
  Clock,
  Flag,
  ListIndentDecrease,
  ListIndentIncrease,
  ListPlus,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Trash,
} from "lucide-react";
import { useWrite } from "../data";
import { findTask, useApp } from "../store";
import { abilities, useTaskActions } from "../task-actions";
import { applicable, closeThen, Panel, useCloseWhenGone, type PanelSection } from "./panel";
import type { DateField } from "./types";

const icon = 15;
const emoji = (char: string) => <span className="emo-s">{char}</span>;

/**
 * ⌘K and right click on a task: every action that applies to it, each with the shortcut that
 * also works without the panel (see keymap.ts). Date and move rows open their panel on top,
 * so esc comes back here; all other rows close the stack and run.
 */
export function ActionsPanel({ taskId }: { taskId: Id<"tasks"> }) {
  const item = useApp((state) => findTask(state.items, taskId));
  const actions = useTaskActions();
  useCloseWhenGone(!item);
  if (!item) return null;
  const { task } = item;
  const can = abilities(item);
  const open = (field: DateField) => () =>
    useApp.getState().openPanel({ type: "date", taskId, field });

  const sections: PanelSection[] = [
    {
      id: "special",
      items: applicable([
        can.important && {
          id: "important",
          icon: emoji("‼️"),
          label: task.highPriority ? "Nicht mehr wichtig" : "Wichtig",
          keys: "mod+i",
          run: closeThen(() => actions.toggleImportant(task)),
        },
        can.ai && {
          id: "ai",
          icon: emoji("⚡️"),
          label: task.isAi ? "Keine KI-Aufgabe" : "KI-Aufgabe",
          keys: "shift+mod+k",
          run: closeThen(() => actions.toggleAi(task)),
        },
        can.schedule && {
          id: "plan",
          icon: <Calendar size={icon} />,
          label: "Einplanen …",
          keys: "mod+e",
          run: open("plannedFor"),
        },
        can.schedule && {
          id: "due",
          icon: <Flag size={icon} />,
          label: "Fällig am …",
          keys: "shift+mod+e",
          run: open("dueOn"),
        },
        can.schedule && {
          id: "snooze",
          icon: <Clock size={icon} />,
          label: "Zurückstellen …",
          keys: "mod+l",
          run: open("snoozedUntil"),
        },
        can.move && {
          id: "move",
          icon: <ArrowRight size={icon} />,
          label: "Verschieben …",
          keys: "shift+mod+m",
          run: () => useApp.getState().openPanel({ type: "move", taskId }),
        },
        can.section && {
          id: "section",
          icon: <Archive size={icon} />,
          label: task.section === "backlog" ? "Nach Tasks" : "In den Backlog",
          keys: "mod+b",
          run: closeThen(() => actions.toggleSection(task)),
        },
        can.normalize && {
          id: "normalize",
          icon: <RotateCcw size={icon} />,
          label: "Normal einordnen",
          keys: "shift+mod+i",
          run: closeThen(() => actions.normalize(task)),
        },
      ]),
    },
    {
      id: "task",
      items: applicable([
        {
          id: "done",
          icon: <Check size={icon} />,
          label: task.state === "done" ? "Wieder öffnen" : "Erledigen",
          keys: "mod+enter",
          run: closeThen(() => actions.toggleDone(task)),
        },
        {
          id: "rename",
          icon: <Pencil size={icon} />,
          label: "Titel bearbeiten",
          keys: "enter",
          run: closeThen(() => actions.rename(task._id)),
        },
        can.subtask && {
          id: "subtask",
          icon: <ListPlus size={icon} />,
          label: "Unteraufgabe",
          keys: "shift+mod+n",
          run: closeThen(() => actions.startCreate(task.parentId ?? task._id)),
        },
        can.indent && {
          id: "indent",
          icon: <ListIndentIncrease size={icon} />,
          label: "Einrücken",
          keys: "tab",
          run: closeThen(() => actions.indent(task)),
        },
        can.outdent && {
          id: "outdent",
          icon: <ListIndentDecrease size={icon} />,
          label: "Ausrücken",
          keys: "shift+tab",
          run: closeThen(() => actions.outdent(task)),
        },
        can.reorder && {
          id: "up",
          icon: <ArrowUp size={icon} />,
          label: "Nach oben",
          keys: "alt+up",
          run: closeThen(() => actions.reorder(task._id, -1)),
        },
        can.reorder && {
          id: "down",
          icon: <ArrowDown size={icon} />,
          label: "Nach unten",
          keys: "alt+down",
          run: closeThen(() => actions.reorder(task._id, 1)),
        },
      ]),
    },
    {
      id: "discard",
      items: [
        {
          id: "discard",
          icon: <Trash size={icon} />,
          label: "Verwerfen",
          keys: "mod+backspace",
          tone: "danger",
          run: closeThen(() => actions.discard(task)),
        },
      ],
    },
  ];
  return <Panel placeholder="Aktion suchen …" sections={sections} />;
}

/**
 * ⌘K on a Wiederholungen row: Pausieren/Fortsetzen, Umbenennen and, on its own, Löschen (⌘⌫).
 * Deleting discards its open tasks; history stays.
 */
export function RecurrenceActionsPanel({ recurrenceId }: { recurrenceId: Id<"recurrences"> }) {
  const recurrences = useQuery(api.recurrences.list, {});
  const recurrence = recurrences?.find((item) => item._id === recurrenceId);
  const update = useMutation(api.recurrences.update);
  const remove = useMutation(api.recurrences.remove);
  const write = useWrite();
  const actions = useTaskActions();
  useCloseWhenGone(Boolean(recurrences && !recurrence));
  if (!recurrence) return null;
  const { enabled } = recurrence;
  return (
    <Panel
      placeholder="Aktion suchen …"
      sections={[
        {
          id: "recurrence",
          items: [
            {
              id: "enabled",
              icon: enabled ? <Pause size={icon} /> : <Play size={icon} />,
              label: enabled ? "Pausieren" : "Fortsetzen",
              run: closeThen(() =>
                write(recurrenceId, () => update({ recurrenceId, enabled: !enabled })),
              ),
            },
            {
              id: "rename",
              icon: <Pencil size={icon} />,
              label: "Umbenennen",
              keys: "enter",
              run: closeThen(() => actions.rename(recurrenceId)),
            },
          ],
        },
        {
          id: "remove",
          items: [
            {
              id: "remove",
              icon: <Trash size={icon} />,
              label: "Löschen",
              keys: "mod+backspace",
              tone: "danger",
              run: closeThen(() => write(recurrenceId, () => remove({ recurrenceId }))),
            },
          ],
        },
      ]}
    />
  );
}
