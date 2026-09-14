/**
 * The HTML document served at the bare origin.
 *
 * Extracted as pure functions so they can be unit-tested without booting an Express
 * server — the same reason `cors.ts` is split out. `http-server.ts` owns the route
 * and the origin it passes in; this module owns only the markup.
 */

/**
 * Escape the five HTML metacharacters.
 *
 * This is load-bearing, not defence-in-depth. The origin passed in is built from the
 * caller-controlled Host header, and `URL.origin` is a weaker filter than it looks:
 * it rejects `<`, `>` and space, but `"`, `'`, `` ` `` and `&` are all legal host code
 * points and pass through untouched (`new URL('http://a"b').origin` === `http://a"b`).
 * So the parser blocks tag injection while leaving quote and entity characters live.
 *
 * Two rules follow, and the second matters more than this function:
 *   1. Every interpolated value goes through here.
 *   2. It goes into a text node, never into an attribute. Every `href` on the page is
 *      a hardcoded literal for exactly that reason. Escaping quotes makes an
 *      attribute sink survivable, not safe — a `javascript:` scheme or an event
 *      handler needs no metacharacter at all. Keep caller-controlled values out.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The document served at the bare origin. See the `GET /` route for why it exists.
 *
 * Styling follows the two existing sources of record rather than inventing a look:
 *   - se4-main `SeSharedClient/ClientApp/src/styles/tokens.css` — the product token
 *     contract (radius, spacing, elevation, the electric/spark brand pair)
 *   - sequentum-docs `docs.json` — the Mintlify theme behind docs.sequentum.com
 *     (primary #5248f9, light #7c74fb, dark #14163b)
 * Where the two disagree the docs win, because this page sits next to the docs site
 * rather than inside the product shell: the navy here is the docs' #14163b, which
 * tokens.css also records as a retone it has deferred for the product apps.
 *
 * The dark-mode ramp (#1f2250, #31365d, #a9abbc) is derived here rather than quoted:
 * neither source defines a dark surface set, so don't go looking for these in
 * tokens.css.
 *
 * Inter leads the font stack to match the token vocabulary but is never fetched — a
 * webfont would mean an external request from a protocol server, so this falls back
 * to the system face when Inter is not installed locally. The wordmark is likewise
 * not embedded: the brand signature here is the spark dot and the electric accent,
 * not 9KB of SVG path data inlined into a TypeScript file.
 *
 * The endpoint is interpolated from the request rather than hardcoded so QA and a
 * local run advertise themselves: a page telling a QA user to connect to production
 * would be worse than the 404 it replaces. Everything else is static — no version
 * string, no scripts, no external assets, nothing to keep in sync.
 */
export function renderLandingPage(origin: string): string {
  const endpoint = escapeHtml(`${origin}/mcp`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sequentum MCP Server</title>
<meta name="description" content="Turn the web into structured, reliable, actionable enterprise data for AI Agents.">
<style>
  :root {
    --navy: #14163b;
    --electric: #5248f9;
    --electric-light: #7c74fb;
    --spark: #128cdf;
    --surface: #ebf1fd;
    --text: var(--navy);
    --text-secondary: #70738f;
    --page: #ffffff;
    --rule: #dee2eb;
    --radius-md: 5px;
    --radius-lg: 8px;
    --shadow-sm: 0 1px 5px rgba(0, 0, 0, 0.10);
    --link: var(--electric);
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: var(--navy);
      --text: #ebf1fd;
      --text-secondary: #a9abbc;
      --surface: #1f2250;
      --rule: #31365d;
      --link: var(--electric-light);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 32px 24px 48px;
    max-width: 44rem;
    background: var(--page);
    color: var(--text);
    font-family: Inter, "Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 1rem;
    line-height: 1.6;
  }
  .wordmark {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin-bottom: 32px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--spark);
    flex: none;
  }
  h1 { font-size: 2rem; font-weight: 600; line-height: 1.25; margin: 0 0 12px; }
  .lede { font-size: 1.125rem; color: var(--text-secondary); margin: 0 0 24px; }
  p { margin: 0 0 16px; }
  .endpoint {
    margin: 0 0 24px;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-left: 3px solid var(--electric);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    overflow-x: auto;
  }
  .endpoint .label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.95em; }
  h2 {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    margin: 32px 0 12px;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li { border-top: 1px solid var(--rule); }
  li a {
    display: block;
    padding: 12px 0;
    color: var(--link);
    font-weight: 500;
    text-decoration: none;
    border-radius: var(--radius-md);
  }
  li a:hover { text-decoration: underline; }
  li a:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(82, 72, 249, 0.20);
  }
  li a .desc { display: block; color: var(--text-secondary); font-weight: 400; font-size: 0.9375rem; }
  footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  footer a { color: var(--link); text-decoration: none; }
  footer a:hover { text-decoration: underline; }
  footer a:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(82, 72, 249, 0.20);
  }
</style>
</head>
<body>
<div class="wordmark"><span class="dot"></span>Sequentum</div>
<h1>MCP Server</h1>
<p class="lede">Turn the web into structured, reliable, actionable enterprise data for AI Agents.</p>
<p>This host serves a Model Context Protocol endpoint &mdash; a typed wrapper over the
Sequentum REST API, exposing the same operations (list, run, schedule and monitor
agents) as tools any MCP-aware model can call. Authentication is OAuth&nbsp;2.1 and
there is nothing to install.</p>
<div class="endpoint">
<span class="label">Server URL</span>
<code>${endpoint}</code>
</div>
<p>It is an API rather than a web app, so point an MCP client at that URL instead of a
browser.</p>
<h2>Documentation</h2>
<ul>
<li><a href="https://docs.sequentum.com/mcp/overview">MCP overview<span class="desc">What the server does and where it fits in a pipeline</span></a></li>
<li><a href="https://docs.sequentum.com/mcp/connect">Connect a client<span class="desc">Set up Claude, ChatGPT, Cursor, n8n or the Claude API</span></a></li>
<li><a href="https://dashboard.sequentum.com">Sequentum Dashboard<span class="desc">Manage agents, runs and schedules</span></a></li>
<li><a href="https://github.com/Sequentum/sequentum-mcp">Source on GitHub<span class="desc">Changelog, tool reference and issues</span></a></li>
</ul>
<footer>Sequentum &middot; <a href="https://www.sequentum.com/cloud">sequentum.com</a></footer>
</body>
</html>
`;
}
