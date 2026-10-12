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

/** The current IANA name of a zone, e.g. Europe/Kiev → Europe/Kyiv. */
export const currentName = (zone: string) => renamed[zone] ?? zone;

let zones: string[] | undefined;
/** All zones by their current name, UTC first. A Set, in case a later ICU lists "UTC" itself. */
function timeZones() {
  zones ??= [...new Set(["UTC", ...Intl.supportedValuesOf("timeZone").map(currentName)])];
  return zones;
}

const normalize = (text: string) => text.toLocaleLowerCase("de-DE").replaceAll("_", " ").trim();

/**
 * Zones containing the query, cities that start with it first: "new york" finds
 * America/New_York, "kyiv" Europe/Kyiv. A saved zone missing from the list (e.g. Etc/GMT-2
 * set through the API) stays findable.
 */
export function searchTimeZones(query: string, saved?: string, limit = 50) {
  const needle = normalize(query);
  const all = saved && !timeZones().includes(saved) ? [...timeZones(), saved] : timeZones();
  return all
    .filter((zone) => normalize(zone).includes(needle))
    .map((zone) => ({ zone, city: normalize(zone.slice(zone.lastIndexOf("/") + 1)) }))
    .sort(
      (a, b) =>
        Number(!a.city.startsWith(needle)) - Number(!b.city.startsWith(needle)) ||
        a.city.localeCompare(b.city, "de-DE"),
    )
    .slice(0, limit)
    .map(({ zone }) => zone);
}

/** Today's offset of a zone, e.g. "UTC+2", "UTC-3:30" or "UTC". */
export function utcOffset(timeZone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  return name?.replace("GMT", "UTC") ?? "";
}

/** This device's zone, by its current name. */
export const systemTimeZone = () => currentName(Intl.DateTimeFormat().resolvedOptions().timeZone);
