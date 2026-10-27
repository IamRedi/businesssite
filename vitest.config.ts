import { defineConfig } from "vitest/config";

// Verification must only ever run the canonical tree. Preserved worktrees
// under .worktrees/ carry historical fixtures and expectations; if vitest's
// CLI file filters match them, they poison shared-database suites with
// duplicate fixture inserts and stale catalog counts.
export default defineConfig({
  test: {
    exclude: [
      "**/.worktrees/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
