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
 * Always starts with the hardcoded Sequentum and Anthropic defaults.  If the
 * ALLOWED_ORIGINS environment variable is set (comma-separated exact origins),
 * those entries are **appended** to the defaults — Claude and Sequentum domains
 * remain accessible even when the variable is set.
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
