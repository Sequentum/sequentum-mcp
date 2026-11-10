import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { escapeHtml, LANDING_PAGE_CSP, renderLandingPage } from "./landing-page.js";
import { API_CONTENT_SECURITY_POLICY } from "./csp.js";

/**
 * Every `<style>` element's text in a rendered page, exactly as a browser sees it.
 * Pulled from the rendered HTML rather than from the module's constant, so a test
 * built on it notices if the two ever stop being the same string.
 */
function styleBlocksOf(html: string): string[] {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/**
 * The CSP hash source a browser computes for an inline element: SHA-256 over the
 * element's exact UTF-8 text, base64-encoded. One changed byte of whitespace and the
 * browser computes a different value and refuses the stylesheet.
 */
function cspHashOf(text: string): string {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

describe("escapeHtml", () => {
  it("escapes all five metacharacters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-encoded", () => {
    // `&` last would turn `<` into `&amp;lt;` and render the literal text `&lt;`.
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("renderLandingPage", () => {
  it("advertises the origin it was given", () => {
    const html = renderLandingPage("https://mcp-qa.example.test");
    expect(html).toContain("<code>https://mcp-qa.example.test/mcp</code>");
    expect(html).not.toContain("mcp.sequentum.com");
  });

  it("escapes characters URL.origin lets through", () => {
    // The reason this function escapes at all. `URL.origin` rejects `<`, `>` and
    // space in a host, but `"`, `'`, backtick and `&` are legal host code points:
    // new URL('http://a"b').origin === 'http://a"b'. So the parser stops tag
    // injection and nothing else — the escape is what makes the rest inert.
    for (const raw of [`http://a"b`, `http://a'b`, `http://a&b`]) {
      const html = renderLandingPage(raw);
      expect(html).not.toContain(raw);
    }
    expect(renderLandingPage(`http://a"b`)).toContain("<code>http://a&quot;b/mcp</code>");
    expect(renderLandingPage("http://a&b")).toContain("<code>http://a&amp;b/mcp</code>");
  });

  it("would neutralise a tag even if one reached it", () => {
    // URL.origin makes this unreachable today. Asserted anyway: the guarantee this
    // function owns is "no caller can open a tag", independent of who calls it.
    const html = renderLandingPage(`https://x/"><script>alert(1)</script>`);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps every caller-controlled value out of attribute context", () => {
    // Escaping quotes makes an attribute sink survivable, not safe: a `javascript:`
    // href needs no metacharacter at all. This pins the stronger property — the
    // interpolated origin appears only in text nodes.
    const html = renderLandingPage("https://sentinel.example.test");
    for (const attr of html.match(/(?:href|src|content|style)="[^"]*"/g) ?? []) {
      expect(attr).not.toContain("sentinel.example.test");
    }
  });

  it("references no external asset", () => {
    const html = renderLandingPage("https://mcp.example.test");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdn\./i);
  });
});

describe("LANDING_PAGE_CSP (IT-2272)", () => {
  it("is the API lockdown plus a style-src for the page's own stylesheet, by hash", () => {
    // The API policy alone (`default-src 'none'`) would block the inline <style> and
    // ship the page unstyled; allowing it by hash keeps everything else locked down.
    const [style] = styleBlocksOf(renderLandingPage("https://mcp.example.test"));
    expect(LANDING_PAGE_CSP).toBe(`${API_CONTENT_SECURITY_POLICY}; style-src ${cspHashOf(style)}`);
  });

  it("never falls back to 'unsafe-inline'", () => {
    expect(LANDING_PAGE_CSP).not.toContain("unsafe-inline");
  });

  it("has exactly one style block, so the single hash covers all of the page's CSS", () => {
    // A second <style> would hash differently and be silently blocked by the browser.
    expect(styleBlocksOf(renderLandingPage("https://mcp.example.test"))).toHaveLength(1);
  });

  it("keeps the stylesheet independent of the origin, so one constant policy fits every host", () => {
    // The policy is computed once at module load; if the origin ever leaked into the
    // CSS, QA and Prod would serve a hash that matches neither.
    const qa = styleBlocksOf(renderLandingPage("https://mcp-qa.example.test"))[0];
    const prod = styleBlocksOf(renderLandingPage("https://mcp.example.test"))[0];
    expect(qa).toBe(prod);
  });
});
