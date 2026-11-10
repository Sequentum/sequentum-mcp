/**
 * Content-Security-Policy for this server's responses (IT-2272).
 *
 * Qualys QID 48001 flagged the header as missing behind both MCP Network Load
 * Balancers. An NLB forwards bytes unchanged and cannot add headers, so the policy
 * has to come from this app.
 *
 * This is an API: MCP clients ignore CSP, and no response here needs to load
 * anything in a browser. The policy therefore allows nothing:
 *   - `default-src 'none'`      — load no script, style, image, font, frame or fetch.
 *   - `frame-ancestors 'none'`  — never render inside another page (clickjacking).
 *   - `base-uri 'none'`, `form-action 'none'` — two navigation directives that
 *     `default-src` does not cover, closed for the same reason.
 *
 * The one HTML document, the landing page at `/`, extends this with a hash for its
 * own inline stylesheet — see `LANDING_PAGE_CSP` in `landing-page.ts`.
 */
export const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
