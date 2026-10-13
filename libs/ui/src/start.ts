import { api } from "@todo/backend/api";
import type { Id } from "@todo/backend/dataModel";
import type { FunctionArgs, FunctionReference } from "convex/server";
import type { List, ListKind } from "./data";

/** A query and its args, as useQuery and ConvexReactClient.prewarmQuery take them. */
export type QueryOptions<Query extends FunctionReference<"query"> = FunctionReference<"query">> = {
  query: Query;
  args: FunctionArgs<Query>;
};

const options = <Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
): QueryOptions<Query> => ({ query, args });

/**
 * Per list kind, the queries of its view besides lists.list and settings.get. The views
 * subscribe to exactly these and the start prewarms them, because Convex shares a
 * subscription only for the same function and args. Verlauf's queries depend on today's date
 * from the settings, so it prewarms none.
 */
export const viewQueries = {
  tasks: (listId: Id<"lists">) => ({
    tasks: options(api.tasks.list, { view: "list", listId }),
    deferred: options(api.tasks.deferred, { listId }),
  }),
  habits: (listId: Id<"lists">) => ({
    tasks: options(api.tasks.list, { view: "list", listId }),
    history: options(api.recurrences.history, {}),
  }),
  important: () => ({ tasks: options(api.tasks.list, { view: "important" }) }),
  recurrences: () => ({ recurrences: options(api.recurrences.list, {}) }),
  history: () => ({}),
} satisfies Record<ListKind, (listId: Id<"lists">) => Record<string, QueryOptions>>;

/** The list the last start opened. Signing out clears it with the rest of the storage. */
const startKey = "todo.start";

/** Remembers the list the app started on for the next start's prewarm (see startQueries). */
export function rememberStart(list: List) {
  localStorage.setItem(startKey, JSON.stringify({ id: list._id, kind: list.kind }));
}

/**
 * The queries of the first screen: lists.list, settings.get and the view of the list the
 * last start opened. ConnectedProvider prewarms them on a new client.
 */
export function startQueries(): QueryOptions[] {
  const start = rememberedStart();
  const view: Record<string, QueryOptions> = start ? viewQueries[start.kind](start.id) : {};
  return [options(api.lists.list, {}), options(api.settings.get, {}), ...Object.values(view)];
}

function rememberedStart() {
  try {
    const { id, kind } = JSON.parse(localStorage.getItem(startKey) ?? "") as {
      id: Id<"lists">;
      kind: ListKind;
    };
    return typeof id === "string" && Object.hasOwn(viewQueries, kind) ? { id, kind } : undefined;
  } catch {
    // Nothing remembered yet, or not JSON.
    return undefined;
  }
}
