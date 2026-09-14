import { describe, it, expect } from "vitest";
import { escapeHtml, renderLandingPage } from "./landing-page.js";

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
