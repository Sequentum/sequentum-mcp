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

  it("serves an issuer with no trailing slash when the env var has one", async () => {
    // PORT=0 lets the OS pick a free port, so this never collides with anything else
    // on the machine or the CI runner. startHttpServer resolves the bound port from
    // httpServer.address() before logging, so the startup line carries the real port
    // and we can read it back out of the line we already wait for.
    const child = spawn(process.execPath, [distEntry], {
      env: {
        ...process.env,
        TRANSPORT_MODE: "http",
        SEQUENTUM_OAUTH_ISSUER: "https://issuer.example.test///",
        REQUIRE_AUTH: "false",
        PORT: "0",
        HOST: "127.0.0.1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    try {
      const port = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("server did not start in 15s")), 15_000);
        let buffered = "";
        child.stderr.on("data", (chunk: Buffer) => {
          buffered += chunk.toString();
          const match = /running on HTTP at http:\/\/127\.0\.0\.1:(\d+)\//.exec(buffered);
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`server exited early with code ${code}`));
        });
      });

      const res = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
      const body = (await res.json()) as { authorization_servers: string[] };
      expect(body.authorization_servers).toEqual(["https://issuer.example.test"]);

      const redirect = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`, {
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

// The deprecation warning has to reach people running stdio, who by definition are not
// reading the docs site. It is emitted before server.connect(), so it lands even if the
// client tears the connection down immediately. Asserted against the built entrypoint
// because main() runs at module top level and cannot be imported without starting up.
describe("stdio deprecation warning", () => {
  const distEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

  it("warns on stderr when starting in stdio mode", async () => {
    const child = spawn(process.execPath, [distEntry], {
      env: {
        ...process.env,
        TRANSPORT_MODE: "stdio",
        SEQUENTUM_API_KEY: "sk-test-key-not-used-at-startup",
      },
      stdio: ["pipe", "ignore", "pipe"],
    });

    try {
      const stderr = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no warning within 15s")), 15_000);
        let buffered = "";
        child.stderr.on("data", (chunk: Buffer) => {
          buffered += chunk.toString();
          if (buffered.includes("running on stdio")) {
            clearTimeout(timer);
            resolve(buffered);
          }
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`server exited early with code ${code}: ${buffered}`));
        });
      });

      expect(stderr).toContain("DEPRECATION WARNING");
      expect(stderr).toContain("stdio transport and SEQUENTUM_API_KEY");
      expect(stderr).toContain("https://mcp.sequentum.com/mcp");
    } finally {
      child.kill("SIGKILL");
    }
  });
});
