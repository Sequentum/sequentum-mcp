import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

// dist/ is built by vitest.global-setup.ts before this runs.
//
// The malformed-issuer guard lives in index.ts, which calls main() at module top
// level and so cannot be imported without starting a server. Shelling out is the
// only way to observe that the process actually exits rather than booting with a
// poisoned issuer concatenated into every Location header.
describe("startup configuration guards", () => {
  const distEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

  it("exits non-zero when SEQUENTUM_OAUTH_ISSUER is not https", () => {
    const result = spawnSync(process.execPath, [distEntry], {
      env: {
        ...process.env,
        TRANSPORT_MODE: "http",
        SEQUENTUM_OAUTH_ISSUER: "http://issuer.example.test",
        PORT: "0",
      },
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SEQUENTUM_OAUTH_ISSUER must be an absolute https URL");
  });

  it("exits non-zero when SEQUENTUM_OAUTH_ISSUER carries a fragment", () => {
    const result = spawnSync(process.execPath, [distEntry], {
      env: {
        ...process.env,
        TRANSPORT_MODE: "http",
        SEQUENTUM_OAUTH_ISSUER: "https://issuer.example.test/#frag",
        PORT: "0",
      },
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.status).toBe(1);
  });
});

// The unit tests prove resolveIssuer strips trailing slashes, and the integration
// tests prove startHttpServer advertises whatever issuer it is handed. Neither covers
// the link between them: that main() passes the RESOLVED value through. This boots the
// real entrypoint and reads the real document, so a regression that bypassed
// resolveIssuer — passing process.env.SEQUENTUM_API_URL straight to startHttpServer,
// say — is caught here and nowhere else.
describe("issuer normalisation reaches the served document", () => {
  const distEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
  // A fixed port is needed because index.ts logs the configured port, not the bound
  // one, so PORT=0 would leave the test unable to find the server.
  const PORT = 39117;

  it("serves an issuer with no trailing slash when the env var has one", async () => {
    const child = spawn(process.execPath, [distEntry], {
      env: {
        ...process.env,
        TRANSPORT_MODE: "http",
        SEQUENTUM_OAUTH_ISSUER: "https://issuer.example.test///",
        REQUIRE_AUTH: "false",
        PORT: String(PORT),
        HOST: "127.0.0.1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("server did not start in 15s")), 15_000);
        child.stderr.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("running on HTTP")) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`server exited early with code ${code}`));
        });
      });

      const res = await fetch(`http://127.0.0.1:${PORT}/.well-known/oauth-protected-resource`);
      const body = (await res.json()) as { authorization_servers: string[] };
      expect(body.authorization_servers).toEqual(["https://issuer.example.test"]);

      const redirect = await fetch(`http://127.0.0.1:${PORT}/.well-known/oauth-authorization-server`, {
        redirect: "manual",
      });
      expect(redirect.headers.get("location")).toBe(
        "https://issuer.example.test/.well-known/oauth-authorization-server"
      );
    } finally {
      child.kill("SIGKILL");
    }
  });
});
