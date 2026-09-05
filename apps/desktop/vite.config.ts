import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [
    react(),
    {
      name: "desktop-development-csp",
      apply: "serve",
      transformIndexHtml(html) {
        return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
      },
    },
  ],
  build: { outDir: "../../dist/renderer", emptyOutDir: true },
  server: { host: "127.0.0.1", strictPort: false },
});
