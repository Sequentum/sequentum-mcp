import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

// Native-Node ESM smoke test.
//
// Vitest runs source through Vite's transform, where circular-import bindings
// become lazy getters — so it CANNOT observe the temporal-dead-zone crash that
// killed prod (SE4-3428: `Cannot access 'AGENT_BUILD_MAX_WAIT_LABEL' before
// initialization`). This test shells out to the real `node` ESM loader against
// the built output, which enforces TDZ semantics and fails fast on any
// top-level circular-import regression.
//
// dist/ is built by vitest.global-setup.ts before this runs.
describe("native Node ESM smoke", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

  // The production entrypoint (dist/index.js) calls main() at module top level,
  // so it can't be imported without starting the server. Instead we import the
  // two server roots index.ts pulls in — handlers.js (stdio path) and
  // http-server.js (HTTP path, the deployed connector path) — which together
  // evaluate the entire production module graph (tools, prompts, resources,
  // api-client, cors, oauth-metadata) under the real loader. Neither has
  // top-level side effects: app.listen() runs only inside startHttpServer().
  const targets = [
    join(repoRoot, "dist", "server", "handlers.js"),
    join(repoRoot, "dist", "server", "http-server.js"),
  ];

  for (const target of targets) {
    it(`loads ${target.replace(repoRoot, ".")} under the native Node ESM loader`, () => {
      if (!existsSync(target)) {
        throw new Error(
          `Build artifact missing: ${target}. Run \`npm run build\` before the smoke test.`
        );
      }

      // pathToFileURL: a bare absolute path is not a valid ESM specifier on
      // Windows (the drive letter parses as a URL scheme). The explicit
      // .catch(() => exit(1)) ensures a TDZ rejection fails the run even under
      // NODE_OPTIONS=--unhandled-rejections=warn, which would otherwise exit 0.
      const url = pathToFileURL(target).href;
      try {
        execFileSync(
          process.execPath,
          [
            "-e",
            "import(process.argv[1]).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); })",
            url,
          ],
          { stdio: "pipe", timeout: 30_000 }
        );
      } catch (err) {
        // stdio:"pipe" otherwise swallows the child's stderr (the ReferenceError
        // and offending module) — re-surface it so failures are debuggable.
        const e = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
        const detail = (e.stderr?.toString() || e.stdout?.toString() || e.message || "").trim();
        throw new Error(`Native ESM load failed for ${target}:\n${detail}`);
      }
    });
  }
});
