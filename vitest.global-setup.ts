import { execSync } from "node:child_process";

// Vitest runs source through Vite's transform and cannot observe native-ESM
// temporal-dead-zone crashes (see src/smoke.test.ts). That smoke test validates
// the BUILT output under real Node, which requires dist/ to exist and be
// current. Building here — once, before any vitest invocation (test,
// test:coverage, test:watch) — guarantees that, rather than relying on a
// per-script `pretest` hook that test:coverage and test:watch silently skip.
export default function setup() {
  execSync("npm run build", { stdio: "inherit" });
}
