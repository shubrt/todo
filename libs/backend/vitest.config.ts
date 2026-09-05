import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { environment: "edge-runtime", include: ["test/**/*.test.ts"] },
});
