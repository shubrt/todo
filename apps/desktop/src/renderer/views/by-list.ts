import type { List } from "../data";

/**
 * One section per list that has items: the sidebar's lists in their order first, then the
 * other lists in theirs. Items keep their order; items of an unknown list are left out.
 * Wichtig and Wiederholungen group their rows with it.
 */
export function byList<T>(lists: List[], items: T[], listOf: (item: T) => string | undefined) {
  const ordered = [
    ...lists.filter((list) => list.favorite),
    ...lists.filter((list) => !list.favorite),
  ];
  return ordered
    .map((list) => ({ list, items: items.filter((item) => listOf(item) === list._id) }))
    .filter((section) => section.items.length > 0);
}
