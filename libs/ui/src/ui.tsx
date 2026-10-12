import { keycaps } from "./keymap";

/** Joins the truthy class names. */
export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

const graphemes = new Intl.Segmenter("de-DE", { granularity: "grapheme" });

/** A list's emoji, or its initial in a small rounded tile when it has none. */
export function ListMark({ list }: { list: { name: string; emoji?: string } }) {
  if (list.emoji) return <span className="emo">{list.emoji}</span>;
  const [first] = graphemes.segment(list.name);
  return <span className="lg">{first?.segment.toLocaleUpperCase("de-DE")}</span>;
}

/** Keycaps for a combo like "shift+mod+k" (see keymap.ts). */
export function Keycaps({ combo }: { combo: string }) {
  return (
    <span className="keys">
      {keycaps(combo).map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  );
}
