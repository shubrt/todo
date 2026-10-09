export {};

declare module "react" {
  interface CSSProperties {
    /** Accent of a row or section: the color of its list (checkbox, habit dots, ↻). */
    "--acc"?: string;
  }
}
