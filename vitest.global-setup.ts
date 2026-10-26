import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// Vitest runs source through Vite's transform and cannot observe native-ESM
// temporal-dead-zone crashes (see src/smoke.test.ts). That smoke test validates
// the BUILT output under real Node, which requires dist/ to exist and be
// current. Building here — once, before any vitest invocation (test,
// test:coverage, test:watch) — guarantees that, rather than relying on a
// per-script `pretest` hook that test:coverage and test:watch silently skip.
// This runs the same `tsc` as the build script, through Node, so it works
// without a package manager on PATH (Jenkins runs pnpm as `corepack pnpm`).
export default function setup() {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  execFileSync(process.execPath, [tsc], { stdio: "inherit" });
}
