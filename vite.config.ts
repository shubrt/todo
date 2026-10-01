import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "backend",
          environment: "edge-runtime",
          include: ["libs/backend/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "apps/*/test/**/*.test.{ts,tsx}",
            "libs/logging/test/**/*.test.ts",
            "libs/native-client/test/**/*.test.ts",
          ],
        },
      },
    ],
  },

  lint: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.cache/**",
      "**/.vite/**",
      "**/.example/**",
      "**/.claude/**",
      "**/.gemini/**",
      "**/.cursor/**",
      "**/_generated/**",
    ],
    options: { typeAware: true, typeCheck: true },
  },

  fmt: {
    ignorePatterns: [
      "AGENT_HANDOFF.md",
      "**/node_modules/**",
      "**/dist/**",
      "**/.cache/**",
      "**/.vite/**",
      "**/.example/**",
      "**/.claude/**",
      "**/.gemini/**",
      "**/.cursor/**",
      "**/_generated/**",
    ],
  },

  staged: {
    "*.{js,jsx,ts,tsx,json,jsonc,css,md,mdx}": "vp check --fix",
  },
});
