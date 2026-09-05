import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["{apps,libs}/*/test/**/*.test.ts"],
    passWithNoTests: true,
  },

  lint: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.cache/**",
      "**/.vite/**",
      "**/.output/**",
      "**/.example/**",
      "**/.claude/**",
      "**/.gemini/**",
      "**/.cursor/**",
      "**/*.gen.ts",
    ],
    options: { typeAware: true, typeCheck: true },
  },

  fmt: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.cache/**",
      "**/.vite/**",
      "**/.output/**",
      "**/.example/**",
      "**/.claude/**",
      "**/.gemini/**",
      "**/.cursor/**",
      "**/*.gen.ts",
    ],
  },

  staged: {
    "*.{js,jsx,ts,tsx,json,jsonc,css,md,mdx}": "vp check --fix",
  },
});
