import { useEffect } from "react";
import { useApp } from "../store";
import { isTouch } from "../touch";
import { ActionsPanel, RecurrenceActionsPanel } from "./actions";
import { DatePanel } from "./date";
import { ListActionsPanel, ListColorPanel, ListEmojiPanel, ListRenamePanel } from "./list-actions";
import { MovePanel } from "./move";
import { NewKeyPanel } from "./new-key";
import { DefaultListPanel, SettingsPanel, TimeZonePanel } from "./settings";
import { SwitcherPanel } from "./switcher";
import type { Panel } from "./types";

/**
 * Renders the topmost panel of the stack over the window (on touch a drawer over a scrim); a
 * click outside closes the stack.
 * Without `account` (signed out, connecting, offline) only Settings can open, without the
 * Convex parts; with it, panels may use Convex hooks and useTaskActions.
 */
export function PanelHost({ account }: { account: boolean }) {
  const panel = useApp((state) => state.panels.at(-1));
  const depth = useApp((state) => state.panels.length);
  const closePanels = useApp((state) => state.closePanels);
  const visible = panel && (account || panel.type === "settings") ? panel : undefined;
  useEffect(() => {
    if (panel && !visible) closePanels();
  }, [panel, visible, closePanels]);
  if (!visible) return null;
  return (
    <div
      className="pal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isTouch()) closePanels();
      }}
      // Touch closes on the click instead: closing on iOS's mousedown would let the rest of
      // the tap land on the row below. The handler also makes iOS deliver taps here at all.
      onClick={(event) => {
        if (event.target === event.currentTarget && isTouch()) closePanels();
      }}
    >
      {/* Keyed by depth: a panel opened on top, or uncovered again, starts fresh. */}
      <PanelContent key={depth} panel={visible} account={account} />
    </div>
  );
}

function PanelContent({ panel, account }: { panel: Panel; account: boolean }) {
  switch (panel.type) {
    case "actions":
      return <ActionsPanel taskId={panel.taskId} />;
    case "recurrenceActions":
      return <RecurrenceActionsPanel recurrenceId={panel.recurrenceId} />;
    case "date":
      return <DatePanel taskId={panel.taskId} field={panel.field} />;
    case "move":
      return <MovePanel taskId={panel.taskId} />;
    case "switcher":
      return <SwitcherPanel />;
    case "listActions":
      return <ListActionsPanel listId={panel.listId} />;
    case "listRename":
      return <ListRenamePanel listId={panel.listId} />;
    case "listEmoji":
      return <ListEmojiPanel listId={panel.listId} />;
    case "listColor":
      return <ListColorPanel listId={panel.listId} />;
    case "settings":
      return <SettingsPanel account={account} />;
    case "defaultList":
      return <DefaultListPanel />;
    case "timeZone":
      return <TimeZonePanel />;
    case "newKey":
      return <NewKeyPanel />;
  }
}
