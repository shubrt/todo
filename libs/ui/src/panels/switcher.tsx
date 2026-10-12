import { api } from "@todo/backend/api";
import { useMutation } from "convex/react";
import { Plus, Star } from "lucide-react";
import { useState } from "react";
import { useCurrentList, useLists, useWrite, type List } from "../data";
import { hasModifier, matches } from "../keymap";
import { useApp } from "../store";
import { ListMark } from "../ui";
import { useListActions, useMoveFavorite } from "./list-actions";
import { Panel, type PanelItem, type PanelSection } from "./panel";

/** Favorites in sidebar order, a line, then the other lists by name (⌘P, Verschieben, Standardliste). */
export function listSections(lists: List[], row: (list: List) => PanelItem): PanelSection[] {
  const others = lists
    .filter((list) => !list.favorite)
    .sort((a, b) => a.name.localeCompare(b.name, "de-DE"));
  return [
    { id: "favorites", items: lists.filter((list) => list.favorite).map(row) },
    { id: "others", items: others.map(row) },
  ];
}

const fold = (text: string) => text.toLocaleLowerCase("de-DE").trim();

/**
 * ⌘P: find and open any list. The highlighted list shows a star (⇧⌘P toggles the favorite),
 * ⌥↑/⌥↓ move a favorite, ⌘K opens its actions and their shortcuts (⌘R, ⌃⌘␣, ⇧⌘C, ⌘⌫) work
 * right here. A name that no list carries exactly offers to create that list below the matches.
 */
export function SwitcherPanel() {
  const lists = useLists();
  const current = useCurrentList();
  const create = useMutation(api.lists.create);
  const update = useMutation(api.lists.update);
  const write = useWrite();
  const actionsOf = useListActions();
  const moveFavorite = useMoveFavorite();
  const [query, setQuery] = useState("");
  if (!lists) return null;

  const toggleFavorite = (list: List) =>
    void write(list._id, () => update({ listId: list._id, favorite: !list.favorite }));
  const name = query.trim();
  const exists = !name || lists.some((list) => fold(list.name) === fold(name));
  const createList = async () => {
    const created = await write("create-list", () => create({ name }));
    if (created.ok) useApp.getState().open({ id: created.value });
  };
  const sections: PanelSection[] = [
    ...listSections(lists, (list) => {
      const open = list.openCount || null;
      const count = list._id === current?._id ? (open ? `aktuell · ${open}` : "aktuell") : open;
      return {
        id: list._id,
        icon: <ListMark list={list} />,
        label: list.name,
        value: (highlighted) => (
          <>
            {count}
            {highlighted && (
              <span
                className="fav"
                role="button"
                aria-label={list.favorite ? "Kein Favorit" : "Als Favorit"}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(list);
                }}
              >
                <Star size={13} fill={list.favorite ? "currentColor" : "none"} />
              </span>
            )}
          </>
        ),
        run: () => useApp.getState().open({ id: list._id }),
      };
    }),
    ...(exists
      ? []
      : [
          {
            id: "create",
            items: [
              {
                id: "create",
                icon: <Plus size={15} />,
                label: `${name} als neue Liste anlegen`,
                keys: "enter" as const,
                run: () => void createList(),
              },
            ],
          },
        ]),
  ];

  return (
    <Panel
      placeholder="Liste suchen …"
      width={330}
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      onKeyDown={(event, highlighted) => {
        const list = lists.find((entry) => entry._id === highlighted?.id);
        if (!list) return false;
        // Unlike the ⌘K rows, ⇧⌘P and ⌥↑/⌥↓ keep the switcher open to show the change.
        if (matches(event, "shift+mod+p")) toggleFavorite(list);
        else if (matches(event, "alt+up") || matches(event, "alt+down")) {
          if (!list.favorite) return false;
          moveFavorite(list, matches(event, "alt+up") ? -1 : 1);
        } else if (matches(event, "mod+k"))
          useApp.getState().openPanel({ type: "listActions", listId: list._id });
        else {
          const action = actionsOf(list)
            .flatMap((section) => section.items)
            .find((item) => item.keys && hasModifier(item.keys) && matches(event, item.keys));
          if (!action?.run) return false;
          action.run();
        }
        return true;
      }}
    />
  );
}
