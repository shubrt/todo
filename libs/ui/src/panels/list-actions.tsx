import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ArrowDown, ArrowUp, Palette, Pencil, Smile, Star, Trash, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlatform } from "../connection";
import { favoritesOf, useLists, useWrite, type List } from "../data";
import { useApp } from "../store";
import { applicable, closeThen, Panel, useCloseWhenGone, type PanelSection } from "./panel";

const icon = 15;

type ListPatch = Omit<FunctionArgs<typeof api.lists.update>, "listId">;

/**
 * The list with that id (undefined while lists load or after a delete) and its update. The
 * calling panel closes once the list is gone.
 */
function useList(listId: Id<"lists">) {
  const lists = useLists();
  const list = lists?.find((item) => item._id === listId);
  const update = useMutation(api.lists.update);
  const write = useWrite();
  useCloseWhenGone(Boolean(lists && !list));
  return { list, save: (patch: ListPatch) => write(listId, () => update({ listId, ...patch })) };
}

/**
 * Moves a favorite one step up (-1) or down (1) among the favorites, the order of the sidebar
 * and ⌘1..⌘9; the other lists keep their order after them. Nothing happens at either end or
 * for a list that is not a favorite.
 */
export function useMoveFavorite() {
  const lists = useLists();
  const reorder = useMutation(api.lists.reorder);
  const write = useWrite();
  return useCallback(
    (list: List, step: 1 | -1) => {
      const favorites = favoritesOf(lists ?? []);
      const index = favorites.findIndex((entry) => entry._id === list._id);
      const neighbor = favorites[index + step];
      if (index < 0 || !neighbor) return;
      const listIds = favorites.map((entry) =>
        entry === neighbor ? list._id : entry._id === list._id ? neighbor._id : entry._id,
      );
      void write("lists:reorder", () => reorder({ listIds }));
    },
    [lists, reorder, write],
  );
}

/**
 * The actions of a list as panel sections: ⌘K inside ⌘P shows them, and ⌘P also runs them by
 * shortcut on the highlighted list. Only normal lists can be renamed, recolored or deleted;
 * Wichtig, Habits, Verlauf and Wiederholungen only toggle the favorite. Favorites also move
 * up and down.
 */
export function useListActions() {
  const update = useMutation(api.lists.update);
  const remove = useMutation(api.lists.remove);
  const write = useWrite();
  const moveFavorite = useMoveFavorite();
  return useCallback(
    (list: List): PanelSection[] => {
      const listId = list._id;
      const editable = list.kind === "tasks";
      const push = (type: "listRename" | "listEmoji" | "listColor") => () =>
        useApp.getState().openPanel({ type, listId });
      return [
        {
          id: "list",
          items: applicable([
            {
              id: "favorite",
              icon: <Star size={icon} />,
              label: list.favorite ? "Kein Favorit" : "Als Favorit",
              keys: "shift+mod+p",
              run: closeThen(() =>
                write(listId, () => update({ listId, favorite: !list.favorite })),
              ),
            },
            editable && {
              id: "rename",
              icon: <Pencil size={icon} />,
              label: "Umbenennen",
              keys: "mod+r",
              run: push("listRename"),
            },
            editable && {
              id: "emoji",
              icon: <Smile size={icon} />,
              label: "Emoji wählen",
              keys: "ctrl+mod+space",
              run: push("listEmoji"),
            },
            editable && {
              id: "color",
              icon: <Palette size={icon} />,
              label: "Farbe ändern …",
              keys: "shift+mod+c",
              run: push("listColor"),
            },
          ]),
        },
        {
          id: "order",
          items: applicable([
            list.favorite && {
              id: "up",
              icon: <ArrowUp size={icon} />,
              label: "Nach oben",
              keys: "alt+up",
              run: closeThen(() => moveFavorite(list, -1)),
            },
            list.favorite && {
              id: "down",
              icon: <ArrowDown size={icon} />,
              label: "Nach unten",
              keys: "alt+down",
              run: closeThen(() => moveFavorite(list, 1)),
            },
          ]),
        },
        {
          id: "delete",
          items: applicable([
            // The backend refuses lists that still hold tasks, with a German toast.
            editable && {
              id: "delete",
              icon: <Trash size={icon} />,
              label: "Liste löschen",
              keys: "mod+backspace",
              tone: "danger",
              run: closeThen(() => write(listId, () => remove({ listId }))),
            },
          ]),
        },
      ];
    },
    [update, remove, write, moveFavorite],
  );
}

/** ⌘K inside ⌘P on the highlighted list. */
export function ListActionsPanel({ listId }: { listId: Id<"lists"> }) {
  const { list } = useList(listId);
  const actionsOf = useListActions();
  if (!list) return null;
  return <Panel crumb={list.name} placeholder="Aktion suchen …" sections={actionsOf(list)} />;
}

/** Umbenennen: the search field holds the name, ↵ saves it. */
export function ListRenamePanel({ listId }: { listId: Id<"lists"> }) {
  const { list, save } = useList(listId);
  const [draft, setDraft] = useState<string>();
  // Stable, so it selects the name once on mount and not on every keystroke.
  const selectName = useCallback((input: HTMLInputElement | null) => {
    input?.focus();
    input?.select();
  }, []);
  if (!list) return null;
  const name = (draft ?? list.name).trim();
  return (
    <Panel
      crumb="Umbenennen"
      placeholder="Name der Liste"
      query={draft ?? list.name}
      onQueryChange={(next) => setDraft(next.slice(0, 80))}
      filter={false}
      inputRef={selectName}
      empty="Name eingeben"
      sections={[
        {
          id: "save",
          items: applicable([
            name && {
              id: "save",
              icon: <Pencil size={icon} />,
              label: `In ${name} umbenennen`,
              keys: "enter",
              run: closeThen(() => name !== list.name && save({ name })),
            },
          ]),
        },
      ]}
    />
  );
}

const graphemes = new Intl.Segmenter("de-DE", { granularity: "grapheme" });
/** The first emoji in `text`, e.g. what the macOS picker typed into the field. */
function firstEmoji(text: string) {
  for (const { segment } of graphemes.segment(text))
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)) return segment;
}

/**
 * Emoji wählen: opens the macOS emoji picker, which types into the focused search field; the
 * first emoji that arrives (picked, typed or pasted) is saved. Without a picker (the browser)
 * an info row in its place points to the keyboard's emoji keys.
 */
export function ListEmojiPanel({ listId }: { listId: Id<"lists"> }) {
  const { platform } = usePlatform();
  const { list, save } = useList(listId);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const openPicker = useCallback(() => {
    input.current?.focus();
    void platform.showEmojiPanel?.();
  }, [platform]);
  useEffect(openPicker, [openPicker]);
  if (!list) return null;
  const choose = (emoji: string | null) => {
    useApp.getState().closePanels();
    void save({ emoji });
  };
  return (
    <Panel
      crumb="Emoji"
      placeholder="Emoji wählen …"
      inputRef={input}
      query={query}
      onQueryChange={(next) => {
        const emoji = firstEmoji(next);
        if (emoji) choose(emoji);
        else setQuery(next);
      }}
      sections={[
        {
          id: "emoji",
          items: applicable([
            platform.showEmojiPanel
              ? {
                  id: "picker",
                  icon: <Smile size={icon} />,
                  label: "Emoji-Auswahl öffnen",
                  keys: "ctrl+mod+space",
                  run: openPicker,
                }
              : {
                  id: "keyboard",
                  icon: <Smile size={icon} />,
                  label: "Emoji über die Tastatur eingeben",
                  info: true,
                },
            Boolean(list.emoji) && {
              id: "remove",
              icon: <X size={icon} />,
              label: "Emoji entfernen",
              keys: "backspace",
              run: () => choose(null),
            },
          ]),
        },
      ]}
    />
  );
}

// The palette of new lists, in the order of listColors in @todo/contracts (not a ui
// dependency, it would bring zod into the bundle).
const palette = [
  { color: "#ff453a", name: "Rot" },
  { color: "#ff9f0a", name: "Orange" },
  { color: "#ffd60a", name: "Gelb" },
  { color: "#30d158", name: "Grün" },
  { color: "#64d2ff", name: "Hellblau" },
  { color: "#0a84ff", name: "Blau" },
  { color: "#5e5ce6", name: "Indigo" },
  { color: "#bf5af2", name: "Lila" },
  { color: "#ff375f", name: "Pink" },
  { color: "#ac8e68", name: "Braun" },
];

/** Farbe ändern: the list color drives checkboxes, habit dots and the ↻ of its rows. */
export function ListColorPanel({ listId }: { listId: Id<"lists"> }) {
  const { list, save } = useList(listId);
  if (!list) return null;
  return (
    <Panel
      crumb="Farbe"
      placeholder="Farbe suchen …"
      sections={[
        {
          id: "colors",
          items: palette.map(({ color, name }) => ({
            id: color,
            icon: <span className="swatch" style={{ background: color }} />,
            label: name,
            value: color === list.color ? "aktuell" : undefined,
            run: closeThen(() => color !== list.color && save({ color })),
          })),
        },
      ]}
    />
  );
}
