/**
 * CORS origin allowlist helpers.
 *
 * Extracted as pure functions so they can be unit-tested without booting an
 * Express server.  `http-server.ts` calls `buildAllowedOrigins()` once at
 * startup and passes the result into `isAllowedOrigin()` for each request.
 */

/**
 * Build the list of origins that are allowed to make cross-origin requests.
 *
 * Always starts with the hardcoded Sequentum, Anthropic, and OpenAI defaults.
 * If the ALLOWED_ORIGINS environment variable is set (comma-separated exact
 * origins), those entries are **appended** to the defaults — Claude, ChatGPT,
 * and Sequentum domains remain accessible even when the variable is set.
 *
 * Only exact-string origins are accepted via the env var.  Wildcards and
 * regular expressions are not supported; if you need a subdomain wildcard,
 * add a RegExp entry directly in this file.
 *
 * Requests that carry no Origin header (native MCP clients such as Cursor,
 * Claude Desktop, and Claude Code) are always passed through — Origin is
 * browser-only.
 *
 * @param env   - environment variable map (defaults to `process.env`)
 * @param debug - when true, adds localhost/127.0.0.1 to the list
 */
export function buildAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
  debug = false,
): (string | RegExp)[] {
  const base: (string | RegExp)[] = [
    "https://claude.ai",
    "https://claude.com",
    // Allow any depth of subdomains under Anthropic-owned claude.ai / claude.com
    // (e.g. team.claude.ai, connectors.us.claude.com). Each label is a valid DNS
    // label (alphanumeric + hyphen). Trust scope is unchanged — both TLDs are
    // Anthropic-owned.
    /^https:\/\/(?:[a-z0-9-]+\.)+claude\.(ai|com)$/,
    "https://chatgpt.com",
    // Allow any depth of subdomains under OpenAI-owned chatgpt.com (e.g.
    // connector.chatgpt.com).  Same DNS-label rule and trust rationale as the
    // Claude pattern above.
    /^https:\/\/(?:[a-z0-9-]+\.)+chatgpt\.com$/,
    // platform.openai.com is the developer console for ChatGPT App registration
    // and is the only openai.com subdomain we need.  We deliberately do NOT allow
    // *.openai.com here: openai.com is OpenAI's corporate domain and hosts many
    // non-ChatGPT properties (Sora, status, marketing, careers, etc.) whose
    // browser contexts have no reason to reach this MCP server.  If a new
    // ChatGPT-specific subdomain is needed in future, add it explicitly so the
    // trust scope stays auditable.
    "https://platform.openai.com",
    "https://dashboard.sequentum.com",
    "https://mcp.sequentum.com",
  ];

  // Append operator-supplied origins (exact strings only) to the defaults.
  const fromEnv = env["ALLOWED_ORIGINS"]
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  base.push(...fromEnv);

  if (debug) {
    base.push(
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      // IPv6 loopback — browsers on IPv6-preferred systems send Origin: http://[::1]:port
      /^http:\/\/\[::1\](:\d+)?$/,
    );
  }

  return base;
}

/**
 * Return true if `origin` is present in the `allowed` list.
 * String entries are compared with strict equality; RegExp entries are tested.
 */
export function isAllowedOrigin(
  origin: string,
  allowed: (string | RegExp)[],
): boolean {
  return allowed.some((entry) =>
    typeof entry === "string" ? entry === origin : entry.test(origin),
  );
}
