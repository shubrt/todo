import { api } from "@todo/backend/api";
import { useMutation, useQuery } from "convex/react";
import { Check, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { areas, areaSymbols, useTasks, type Area } from "./task-context";

// Intl lists ICU's canonical names: no "UTC", and old spellings of renamed cities. The list
// shows the current IANA names instead; Intl and the backend accept both.
const renamed: Record<string, string> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Godthab": "America/Nuuk",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};
const currentName = (zone: string) => renamed[zone] ?? zone;
// A Set, in case a later ICU lists "UTC" itself.
const timeZones = [...new Set(["UTC", ...Intl.supportedValuesOf("timeZone").map(currentName)])];
const normalize = (text: string) => text.toLowerCase().replaceAll("_", " ");

// Konto tab: settings stored in Convex, so they apply to every device and integration.
export function AccountTab() {
  const settings = useQuery(api.settings.get, {});
  const update = useMutation(api.settings.update);
  const { run, connected } = useTasks();
  const [error, setError] = useState<string | null>(null);
  const label = useId();
  const disabled = !connected || !settings;
  // Keyed by the chosen value, so a second choice during a slow save (a zone change rewrites
  // every schedule) still goes through. Convex runs one client's mutations in order.
  function save(patch: { defaultArea: Area } | { timeZone: string }) {
    setError(null);
    const value = "defaultArea" in patch ? patch.defaultArea : patch.timeZone;
    void run(`settings:${value}`, () => update(patch), undefined, setError);
  }
  return (
    <>
      <div className="field">
        <span id={label}>Standardbereich</span>
        <div className="toggle-row" role="group" aria-labelledby={label}>
          {areas.map((area) => (
            <button
              key={area}
              className={`toggle ${settings?.defaultArea === area ? "selected" : ""}`}
              aria-pressed={settings?.defaultArea === area}
              disabled={disabled}
              onClick={() => {
                if (settings?.defaultArea !== area) save({ defaultArea: area });
              }}
            >
              <span className={`glyph ${area}`} aria-hidden="true">
                {areaSymbols[area]}
              </span>
              {area}
            </button>
          ))}
        </div>
      </div>
      <TimeZoneField
        value={settings?.timeZone}
        disabled={disabled}
        onSelect={(timeZone) => save({ timeZone })}
      />
      <p className="hint">Gilt für alle Geräte und Integrationen.</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

// Combobox over the IANA time zones. Focus starts an empty search with the saved zone as
// placeholder; typing filters, ↑ ↓ pick, Enter selects, Escape clears the search.
function TimeZoneField({
  value,
  disabled,
  onSelect,
}: {
  value: string | undefined;
  disabled: boolean;
  onSelect: (timeZone: string) => void;
}) {
  const id = useId();
  // null while the field is not focused and shows the saved zone.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // An old name like Europe/Kiev shows as Europe/Kyiv. Any other saved zone missing from the
  // list, e.g. Etc/GMT-2 set through the API, stays findable.
  const saved = value && currentName(value);
  const matches = useMemo(
    () => (query?.trim() ? searchTimeZones(query, saved) : []),
    [query, saved],
  );
  const open = matches.length > 0;
  function choose(zone: string) {
    setQuery("");
    if (zone !== saved) onSelect(zone);
  }
  return (
    <div className="field">
      <span id={`${id}-label`}>Zeitzone</span>
      <div className="search-input">
        <Search size={14} />
        <input
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-${active}` : undefined}
          value={query ?? saved ?? ""}
          placeholder={saved}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setQuery("")}
          onBlur={() => setQuery(null)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((index) => (index + step + matches.length) % matches.length);
            } else if (open && event.key === "Enter") {
              event.preventDefault();
              const zone = matches[active];
              if (zone) choose(zone);
            } else if (event.key === "Escape" && query) {
              // Clears the search instead of closing the sheet.
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
            }
          }}
        />
        {!query && saved && <small>{utcOffset(saved)}</small>}
      </div>
      {open && (
        <div className="zone-list" role="listbox" id={`${id}-list`} aria-labelledby={`${id}-label`}>
          {matches.map((zone, index) => (
            <div
              key={zone}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(zone)}
            >
              <span className="zone-check">{zone === saved && <Check size={12} />}</span>
              <span>{highlight(zone, query ?? "")}</span>
              <small>{utcOffset(zone)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Zones containing the query, cities that start with it first. "new york" finds America/New_York.
function searchTimeZones(query: string, saved: string | undefined) {
  const needle = normalize(query.trim());
  return (saved && !timeZones.includes(saved) ? [...timeZones, saved] : timeZones)
    .filter((zone) => normalize(zone).includes(needle))
    .map((zone) => ({ zone, city: normalize(zone.slice(zone.lastIndexOf("/") + 1)) }))
    .sort(
      (a, b) =>
        Number(!a.city.startsWith(needle)) - Number(!b.city.startsWith(needle)) ||
        a.city.localeCompare(b.city),
    )
    .slice(0, 8)
    .map(({ zone }) => zone);
}

function highlight(zone: string, query: string) {
  const needle = normalize(query.trim());
  const start = normalize(zone).indexOf(needle);
  if (!needle || start < 0) return zone;
  const end = start + needle.length;
  return (
    <>
      {zone.slice(0, start)}
      <b>{zone.slice(start, end)}</b>
      {zone.slice(end)}
    </>
  );
}

// Today's offset of a zone, e.g. "UTC+2" or "UTC-3:30".
function utcOffset(timeZone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  return name?.replace("GMT", "UTC") ?? "";
}
