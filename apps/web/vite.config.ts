import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";
import tsConfigPaths from "vite-tsconfig-paths";
import { existsSync } from "node:fs";

const environmentFile = new URL("../../.env", import.meta.url);
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

export default defineConfig({
  envDir: "../..",
  server: {
    host: "127.0.0.1",
    allowedHosts: ["todo.localhost"],
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
    nitro({ preset: "node-server" }),
  ],
});
