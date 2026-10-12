import { api } from "@todo/backend/api";
import { useMutation, useQuery } from "convex/react";
import { Key, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { usePlatform } from "../connection";
import { useLists, useSettings, useWrite } from "../data";
import { localDate, shortDate } from "../dates";
import { platformErrorMessage } from "../errors";
import { matches } from "../keymap";
import type { DesktopPreferences, Platform } from "../platform";
import { useApp } from "../store";
import { Keycaps, ListMark } from "../ui";
import { applicable, backThen, closeThen, Panel, type PanelItem, type PanelSection } from "./panel";
import { listSections } from "./switcher";
import { currentName, searchTimeZones, systemTimeZone, utcOffset } from "./time-zones";
import type { Panel as PanelEntry } from "./types";

/** The backend refuses more active keys (device and integration keys together). */
const keyLimit = 30;

const push = (panel: PanelEntry) => () => useApp.getState().openPanel(panel);

/** How settings name the device the app runs on. */
const thisDevice: Record<Platform["kind"], string> = { mac: "Dieser Mac", web: "Dieses Gerät" };

/**
 * ⌘, and the sidebar icon. Signed in (`account`), it adds Konto, Schlüssel and the key info;
 * before that only Fenster (Mac), Info and Abmelden (if a key is stored), without Convex hooks.
 */
export function SettingsPanel({ account }: { account: boolean }) {
  return account ? <AccountSettings /> : <Settings />;
}

function AccountSettings() {
  const { platform } = usePlatform();
  const settings = useSettings();
  const lists = useLists();
  const keys = useQuery(api.auth.listApiKeys, {});
  const revoke = useMutation(api.auth.revokeApiKey);
  const write = useWrite();
  const defaultList = lists?.find((list) => list._id === settings?.defaultListId);
  // This device's key only goes away with Abmelden.
  const others = keys?.filter((key) => !key.current) ?? [];
  const full = (keys?.length ?? 0) >= keyLimit;
  const since = (createdAt: number) => {
    if (!settings) return undefined;
    const date = localDate(createdAt, settings.timeZone);
    const today = settings.currentLocalDate;
    return `seit ${date === today ? "heute" : shortDate(date, today)}`;
  };
  return (
    <Settings
      sections={[
        {
          id: "account",
          label: "Konto",
          items: [
            {
              id: "default-list",
              label: "Standardliste",
              value: defaultList && (
                <>
                  <ListMark list={defaultList} />
                  {defaultList.name}
                </>
              ),
              run: push({ type: "defaultList" }),
            },
            {
              id: "time-zone",
              label: "Zeitzone",
              value: settings && currentName(settings.timeZone),
              run: push({ type: "timeZone" }),
            },
          ],
        },
        {
          id: "keys",
          label: "Schlüssel",
          items: [
            ...applicable([
              platform.createIntegrationKey && {
                id: "new-key",
                icon: <Plus size={15} />,
                label: "Neuer Integrationsschlüssel",
                dim: full,
                run: full ? undefined : push({ type: "newKey" }),
              },
            ]),
            ...others.map(
              (key): PanelItem => ({
                id: `key:${key.id}`,
                icon: <Key size={15} />,
                label: key.name,
                keywords: "schlüssel",
                // Highlighted, it shows how to revoke it.
                value: (highlighted) =>
                  highlighted ? <Keycaps combo="mod+backspace" /> : since(key.createdAt),
                // Highlightable for ⌘⌫; ↵ does nothing.
                run: () => {},
              }),
            ),
          ],
        },
      ]}
      info={[
        {
          id: "device",
          label: thisDevice[platform.kind],
          value: keys?.find((key) => key.current)?.name,
          info: true,
        },
        {
          id: "active-keys",
          label: "Schlüssel aktiv",
          value: keys && `${keys.length} von ${keyLimit}`,
          info: true,
        },
      ]}
      onKeyDown={(event, highlighted) => {
        const key = others.find((entry) => `key:${entry.id}` === highlighted?.id);
        if (!key || !matches(event, "mod+backspace")) return false;
        void write(key.id, () => revoke({ id: key.id }));
        return true;
      }}
    />
  );
}

const toggles: { key: keyof Omit<DesktopPreferences, "shortcut">; label: string }[] = [
  { key: "alwaysOnTop", label: "Immer im Vordergrund" },
  { key: "allSpaces", label: "Auf allen Schreibtischen" },
  { key: "launchAtLogin", label: "Beim Anmelden starten" },
];

/**
 * The panel itself: Fenster (only with window preferences, i.e. on the Mac), then `sections`,
 * then Info (with `info` rows) and Abmelden on its own. Kurzbefehl records the next key
 * combination; esc cancels the recording.
 */
function Settings({
  sections = [],
  info = [],
  onKeyDown,
}: {
  sections?: PanelSection[];
  info?: PanelItem[];
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>, highlighted?: PanelItem) => boolean;
}) {
  const { platform, state, update } = usePlatform();
  const [recording, setRecording] = useState(false);
  if (!state) return null;
  const { preferences } = state;
  const fail = (cause: unknown) =>
    useApp
      .getState()
      .showError(platformErrorMessage(cause, "Die Einstellung konnte nicht übernommen werden."));
  const setPreferences = (patch: Partial<DesktopPreferences>) =>
    void platform.setPreferences?.(patch).then(update, fail);

  function record(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") return setRecording(false);
    const shortcut = acceleratorOf(event);
    // Lone modifiers and bare keys: keep listening for the full combination.
    if (!shortcut) return;
    setRecording(false);
    // "Shift+CommandOrControl+Space" is the saved "CommandOrControl+Shift+Space": no change.
    if (preferences && acceleratorLabel(shortcut) !== acceleratorLabel(preferences.shortcut))
      setPreferences({ shortcut });
  }

  return (
    <Panel
      compact
      // Touch shows the title instead of a search over these few rows.
      header="Einstellungen"
      placeholder="Einstellung suchen …"
      sections={[
        ...(preferences && platform.setPreferences
          ? [
              {
                id: "window",
                label: "Fenster",
                items: [
                  ...toggles.map(({ key, label }) => ({
                    id: key,
                    label,
                    value: preferences[key] ? "An" : "Aus",
                    run: () => setPreferences({ [key]: !preferences[key] }),
                  })),
                  {
                    id: "shortcut",
                    label: "Kurzbefehl",
                    keywords: "tastenkürzel global",
                    value: recording ? "Tasten drücken …" : acceleratorLabel(preferences.shortcut),
                    run: () => setRecording(true),
                  },
                ],
              },
            ]
          : []),
        ...sections,
        {
          id: "info",
          label: "Info",
          items: applicable([
            { id: "version", label: "Version", value: state.version, info: true },
            state.siteUrl && {
              id: "server",
              label: "Server",
              value: new URL(state.siteUrl).host,
              info: true,
            },
            ...info,
          ]),
        },
        {
          id: "logout",
          items: applicable([
            state.configured && {
              id: "logout",
              label: "Abmelden",
              tone: "danger",
              run: closeThen(() => platform.disconnect().then(update, fail)),
            },
          ]),
        },
      ]}
      // The shell reports here what failed at startup (a taken shortcut, an unreadable
      // connection); a refused new recording goes to the error toast through `fail`.
      hint={recording ? "esc bricht ab" : state.error && <span className="err">{state.error}</span>}
      onKeyDown={(event, highlighted) => {
        if (!recording) return onKeyDown?.(event, highlighted) ?? false;
        record(event);
        return true;
      }}
    />
  );
}

// Physical keys (event.code) as Electron accelerator keys; letters and digits are mapped below.
const codeKeys: Record<string, string> = {
  Space: "Space",
  Tab: "Tab",
  Enter: "Return",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

/**
 * The Electron accelerator of a key press, e.g. "CommandOrControl+Shift+Space". Undefined
 * without ⌘, ⌃ or ⌥ (⇧ alone would take over typing, the main process refuses it too) or for
 * keys a global shortcut cannot use.
 */
function acceleratorOf(event: KeyboardEvent<HTMLInputElement>) {
  const key =
    /^(?:Key|Digit)([A-Z0-9])$/.exec(event.code)?.[1] ??
    (/^F(?:[1-9]|1\d|2[0-4])$/.test(event.code) ? event.code : codeKeys[event.code]);
  // Electron's usual order, like the default "CommandOrControl+Shift+Space".
  const modifiers = [
    event.metaKey && "CommandOrControl",
    event.ctrlKey && "Control",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
  ].filter((modifier) => modifier !== false);
  if (!key || !modifiers.some((modifier) => modifier !== "Shift")) return undefined;
  return [...modifiers, key].join("+");
}

const acceleratorGlyphs: Record<string, string> = {
  commandorcontrol: "⌘",
  cmdorctrl: "⌘",
  command: "⌘",
  cmd: "⌘",
  super: "⌘",
  control: "⌃",
  ctrl: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  space: "Leertaste",
  return: "↵",
  enter: "↵",
  tab: "⇥",
  escape: "esc",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};
const modifierOrder = ["⌃", "⌥", "⇧", "⌘"];

/** "CommandOrControl+Shift+Space" → "⇧⌘Leertaste", modifiers in macOS order. */
function acceleratorLabel(accelerator: string) {
  const parts = accelerator
    .split("+")
    .map((part) => acceleratorGlyphs[part.toLowerCase()] ?? part.toUpperCase());
  const key = parts.pop() ?? "";
  const modifiers = parts.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));
  return [...modifiers, key].join("");
}

/** Standardliste: where captures without a list land (API, agents). Only normal lists. */
export function DefaultListPanel() {
  const lists = useLists();
  const settings = useSettings();
  const update = useMutation(api.settings.update);
  const write = useWrite();
  if (!lists || !settings) return null;
  return (
    <Panel
      crumb="Standardliste"
      placeholder="Liste suchen …"
      sections={listSections(
        lists.filter((list) => list.kind === "tasks"),
        (list) => {
          const current = list._id === settings.defaultListId;
          return {
            id: list._id,
            icon: <ListMark list={list} />,
            label: list.name,
            value: current ? "aktuell" : undefined,
            run: backThen(
              () =>
                !current &&
                write(`settings:${list._id}`, () => update({ defaultListId: list._id })),
            ),
          };
        },
      )}
    />
  );
}

/**
 * Zeitzone: the empty search shows the account's zone and this device's; typing searches all
 * IANA zones by their current names (Europe/Kyiv, not Europe/Kiev) with today's UTC offset.
 */
export function TimeZonePanel() {
  const { platform } = usePlatform();
  const settings = useSettings();
  const update = useMutation(api.settings.update);
  const write = useWrite();
  const [query, setQuery] = useState("");
  if (!settings) return null;
  const saved = currentName(settings.timeZone);
  const system = systemTimeZone();
  const zones = query.trim() ? searchTimeZones(query, saved) : [...new Set([saved, system])];
  const note = (zone: string) =>
    zone === saved ? "aktuell · " : zone === system ? `${thisDevice[platform.kind]} · ` : "";
  return (
    <Panel
      crumb="Zeitzone"
      placeholder="Zeitzone suchen …"
      typing
      query={query}
      onQueryChange={setQuery}
      filter={false}
      sections={[
        {
          id: "zones",
          items: zones.map((zone) => ({
            id: zone,
            label: zone,
            value: `${note(zone)}${utcOffset(zone)}`,
            // Keyed by zone: a second choice during a slow save (it reschedules) still goes through.
            run: backThen(
              () => zone !== saved && write(`settings:${zone}`, () => update({ timeZone: zone })),
            ),
          })),
        },
      ]}
    />
  );
}
