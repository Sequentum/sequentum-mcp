import { describe, it, expect } from "vitest";
import { buildAllowedOrigins, isAllowedOrigin } from "./cors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allowed(origin: string, env: Record<string, string> = {}, debug = false) {
  return isAllowedOrigin(origin, buildAllowedOrigins(env, debug));
}

// ---------------------------------------------------------------------------
// buildAllowedOrigins — default list
// ---------------------------------------------------------------------------

describe("buildAllowedOrigins (defaults)", () => {
  it("includes the bare claude.ai and claude.com origins", () => {
    const list = buildAllowedOrigins();
    expect(list).toContain("https://claude.ai");
    expect(list).toContain("https://claude.com");
  });

  it("includes the Sequentum dashboard and MCP origins", () => {
    const list = buildAllowedOrigins();
    expect(list).toContain("https://dashboard.sequentum.com");
    expect(list).toContain("https://mcp.sequentum.com");
  });

  it("does NOT include localhost entries when debug=false", () => {
    const list = buildAllowedOrigins({}, false);
    const serialized = list.map(String);
    expect(serialized.some((s) => s.includes("localhost"))).toBe(false);
    expect(serialized.some((s) => s.includes("127.0.0.1"))).toBe(false);
  });

  it("includes localhost entries when debug=true", () => {
    const list = buildAllowedOrigins({}, true);
    // Assert functionally — avoids relying on the escaped serialization of RegExp literals.
    expect(isAllowedOrigin("http://localhost:3000", list)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:8080", list)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildAllowedOrigins — ALLOWED_ORIGINS env override (append semantics)
// ---------------------------------------------------------------------------

describe("buildAllowedOrigins (env override)", () => {
  it("appends env-supplied origins to the defaults, not replaces them", () => {
    const list = buildAllowedOrigins({ ALLOWED_ORIGINS: "https://example.com" });
    // Operator origin is present …
    expect(list).toContain("https://example.com");
    // … and so are the built-in defaults.
    expect(list).toContain("https://claude.ai");
    expect(list).toContain("https://mcp.sequentum.com");
  });

  it("appends multiple env-supplied origins", () => {
    const list = buildAllowedOrigins({ ALLOWED_ORIGINS: "https://a.com,https://b.com" });
    expect(list).toContain("https://a.com");
    expect(list).toContain("https://b.com");
    expect(list).toContain("https://claude.ai");
  });

  it("trims whitespace around entries", () => {
    const list = buildAllowedOrigins({ ALLOWED_ORIGINS: " https://a.com , https://b.com " });
    expect(list).toContain("https://a.com");
    expect(list).toContain("https://b.com");
  });

  it("ignores empty segments from trailing commas", () => {
    const list = buildAllowedOrigins({ ALLOWED_ORIGINS: "https://a.com," });
    expect(list).toContain("https://a.com");
    // No empty-string entry in the list.
    expect(list).not.toContain("");
  });

  it("keeps only defaults when ALLOWED_ORIGINS is an empty string", () => {
    const list = buildAllowedOrigins({ ALLOWED_ORIGINS: "" });
    expect(list).toContain("https://claude.ai");
    expect(list).toContain("https://mcp.sequentum.com");
  });
});

// ---------------------------------------------------------------------------
// isAllowedOrigin — exact-match origins
// ---------------------------------------------------------------------------

describe("isAllowedOrigin (exact matches)", () => {
  it("allows https://claude.ai", () => {
    expect(allowed("https://claude.ai")).toBe(true);
  });

  it("allows https://claude.com", () => {
    expect(allowed("https://claude.com")).toBe(true);
  });

  it("allows https://dashboard.sequentum.com", () => {
    expect(allowed("https://dashboard.sequentum.com")).toBe(true);
  });

  it("allows https://mcp.sequentum.com", () => {
    expect(allowed("https://mcp.sequentum.com")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAllowedOrigin — claude subdomain regex
// ---------------------------------------------------------------------------

describe("isAllowedOrigin (claude subdomain regex)", () => {
  it("allows single-level subdomain under claude.ai", () => {
    expect(allowed("https://team.claude.ai")).toBe(true);
  });

  it("allows single-level subdomain under claude.com", () => {
    expect(allowed("https://app.claude.com")).toBe(true);
  });

  it("allows multi-level subdomain under claude.ai", () => {
    expect(allowed("https://connectors.us.claude.ai")).toBe(true);
  });

  it("allows multi-level subdomain under claude.com", () => {
    expect(allowed("https://connectors.us.claude.com")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAllowedOrigin — adversarial cases
// ---------------------------------------------------------------------------

describe("isAllowedOrigin (adversarial rejections)", () => {
  it("rejects https://claude.ai.evil.com (apex is evil.com)", () => {
    expect(allowed("https://claude.ai.evil.com")).toBe(false);
  });

  it("rejects https://notclaude.ai (no claude. label)", () => {
    expect(allowed("https://notclaude.ai")).toBe(false);
  });

  it("rejects https://x.notclaude.ai (ends in notclaude.ai, not claude.ai)", () => {
    expect(allowed("https://x.notclaude.ai")).toBe(false);
  });

  it("rejects http://claude.ai (wrong scheme)", () => {
    expect(allowed("http://claude.ai")).toBe(false);
  });

  it("rejects https://CLAUDE.AI (uppercase — Origin headers are case-sensitive)", () => {
    expect(allowed("https://CLAUDE.AI")).toBe(false);
  });

  it("rejects https://claude.ai/ (trailing slash is not a valid origin)", () => {
    expect(allowed("https://claude.ai/")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(allowed("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAllowedOrigin — localhost debug flag
// ---------------------------------------------------------------------------

describe("isAllowedOrigin (localhost / debug)", () => {
  it("rejects http://localhost:3000 when debug=false", () => {
    expect(allowed("http://localhost:3000", {}, false)).toBe(false);
  });

  it("allows http://localhost:3000 when debug=true", () => {
    expect(allowed("http://localhost:3000", {}, true)).toBe(true);
  });

  it("allows http://localhost (no port) when debug=true", () => {
    expect(allowed("http://localhost", {}, true)).toBe(true);
  });

  it("allows http://127.0.0.1:8080 when debug=true", () => {
    expect(allowed("http://127.0.0.1:8080", {}, true)).toBe(true);
  });

  it("allows http://[::1]:8080 (IPv6 loopback) when debug=true", () => {
    expect(allowed("http://[::1]:8080", {}, true)).toBe(true);
  });

  it("allows http://[::1] (IPv6 loopback, no port) when debug=true", () => {
    expect(allowed("http://[::1]", {}, true)).toBe(true);
  });

  it("rejects http://[::1]:8080 when debug=false", () => {
    expect(allowed("http://[::1]:8080", {}, false)).toBe(false);
  });

  it("rejects https://localhost (wrong scheme even in debug mode)", () => {
    expect(allowed("https://localhost", {}, true)).toBe(false);
  });
});
