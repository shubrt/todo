import { execFileSync } from "node:child_process";

// Turns a branch or free-form name into a short slug, e.g. `shubrt/Habit Widgets` → `habit-widgets`.
export function variantSlug(value) {
  return (value.split("/").pop() ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 32)
    .replace(/^-+|-+$/g, "");
}

// Variant for packaged builds. Only set when TODO_DESKTOP_VARIANT is given explicitly.
export function packageVariant() {
  return variantSlug(process.env.TODO_DESKTOP_VARIANT ?? "") || undefined;
}

// Dev always runs as a variant: TODO_DESKTOP_VARIANT if set, otherwise the current git branch.
export function devVariant(cwd) {
  const explicit = packageVariant();
  if (explicit) return explicit;
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  return variantSlug(branch.trim()) || "dev";
}
