export {};

declare module "react" {
  interface CSSProperties {
    /** Accent of a row or section: the color of its list (checkbox, habit dots, ↻). */
    "--acc"?: string;
    /** Width of a panel on the Mac (panels.css); touch drawers span the window instead. */
    "--pal-w"?: string;
  }
}
