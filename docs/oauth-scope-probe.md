# oauth-scope-probe

Live probe of OAuth scope enforcement on the Sequentum external V1 API (**SE4-3895**),
revoke-on-refresh (**SE4-3896**), and refresh-token hardening (**SE4-3922**: mandatory
`client_id` binding, reuse detection, concurrent-redemption locking), run against a deployed
environment. QA only.

```bash
pnpm run probe --env qa --mode log-only
```

It performs the authorization-code flow exactly the way an MCP client does — Dynamic Client
Registration, browser consent with PKCE, a loopback callback, token exchange — then exercises
the V1 API directly and through this MCP server with tokens of three different scope profiles,
and checks the server's behaviour against what the current rollout mode says it should be.

## Why it exists

Scope enforcement on the Control Center shipped in **log-only** mode: the filter logs every
scope mismatch but denies nothing, until a follow-up flips it to enforcing. That flip waits on
log evidence from a real environment, and QA has no organic OAuth traffic, so nothing produces
those log lines unless someone deliberately drives an MCP client against it. This tool does
that, repeatably, and reads the resulting CloudWatch lines back so the run is self-checking.

The same run with `--mode enforce` is the flip-day regression test. It also verifies that
revoking a client through the admin UI ends its refresh sessions, and that the refresh-token
endpoint itself enforces `client_id`, detects reuse, and serializes concurrent redemptions.

## Prerequisites

- Node 22 or newer. No dependencies beyond this repository's.
- The `aws` CLI on `PATH` with credentials that can read the QA Control Center log group. Or
  pass `--skip-cloudwatch`.
- A QA user in an organization with **at least one agent and one space**. The `agents:write`
  probe starts that agent and immediately stops and deletes the run.
- A browser on this machine. Everything that needs a session happens there: the script opens
  the QA login page first and waits for you, then opens each consent page, and for the
  SE4-3896 step and end-of-run cleanup it opens Admin › MCP Integrations and asks you to click
  Revoke. **No credentials are ever typed into the terminal.** Log in as a super-administrator
  if you want the revoke steps to work; otherwise pass `--skip-3896 --keep-client`.

## Running

```bash
pnpm run probe --env qa --mode log-only --preflight-only            # no side effects
pnpm run probe --env qa --mode log-only                             # full run: login, three consent clicks, one revoke click
pnpm run probe --env qa --mode log-only --profile read --skip-3896  # quickest real signal, one consent click
pnpm run probe --env qa --mode enforce                              # after the flip
pnpm run probe --env qa --mode enforce --auth-md-email you@example.com  # auth.md claim flow, one claim in the browser
```

| Flag | Meaning |
|---|---|
| `--env qa` | Required. Only `qa` is configured; there is deliberately no prod entry. |
| `--mode log-only\|enforce` | Required. What the server is expected to do on a scope mismatch. The tool never guesses. |
| `--profile all\|read\|none` | Run one scope profile instead of all three. |
| `--skip-mcp` | Don't call the MCP server. |
| `--skip-3896` | Skip refresh → revoke → refresh. |
| `--skip-3922` | Skip the refresh-token hardening checks (client_id binding, reuse detection, concurrent redemption) — saves one consent click. |
| `--skip-cloudwatch` | Don't read CloudWatch (no `aws` CLI needed). |
| `--port N` | Fixed loopback port. Default is ephemeral. |
| `--reuse-client ID` | Skip DCR and reuse a client from an earlier `--keep-client` run. Requires the same `--port` it was registered with and `--skip-3896` (that step revokes the client, and revoked is terminal); implies `--keep-client`. Saves the 10-per-IP-hour registration budget while iterating. A `--keep-client` run prints the exact command to use. |
| `--agent-id`, `--space-id` | Use when running a profile alone that cannot list them itself. |
| `--keep-client` | Leave the DCR client Active at the end for inspection in Admin › MCP Integrations. |
| `--no-login-prompt` | Don't open the login page and wait before the first consent (you're already logged in). |
| `--preflight-only` | Check both metadata documents and CloudWatch access, register nothing, exit. |
| `--auth-md-email EMAIL` | Run the [auth.md path](#the-authmd-path) instead of the authorization-code scenarios. Cannot be combined with `--profile` or `--reuse-client`. With `--preflight-only` it checks the redirects and metadata and registers nothing. |

## What a run does

0. **Login.** Opens `/login` in your browser and waits for Enter. Skip with `--no-login-prompt`.
1. **Preflight.** Reads both metadata documents and warns if this server's
   `scopes_supported` omits scopes the authorization server advertises. Refuses to run if the
   authorization server does not advertise all six API scopes, since that means the
   enforcement build is not deployed there.
2. **Registers** one throwaway DCR client named `oauth-scope-probe <timestamp>` whose only
   redirect URI is the loopback listener the script has already bound.
3. **For each profile** — `all` (six API scopes + `offline_access`), `read`
   (`agents:read` only), `none` (no `scope` parameter at all; the server grants the six API
   scopes by default, SE4-3895):
   - opens the browser to `/api/oauth/authorize`; you click Authorize;
   - exchanges the code with PKCE and `resource=<this server's origin>`, and checks the granted
     scope: exactly what `all` and `read` asked for, and the six API scopes (no
     `offline_access`) for `none`;
   - calls six V1 endpoints, one per scope, and four read-only MCP tools;
   - judges every response against the mode;
   - polls CloudWatch for up to two minutes until every expected `Scope check` line for this
     client_id has appeared; when none is expected (the `all` and `none` profiles), waits 45
     seconds for ingestion before asserting that none appeared. That check counts only lines
     whose `granted=` is this profile's token scope, because the profiles share one client and
     the previous profile's lines fall inside the query's clock-skew margin.
4. **SE4-3922:** requests one more, separate consent (scope `offline_access` only — a dedicated,
   throwaway grant under the same client, so the `all` profile's chain used by SE4-3896 below is
   left untouched) and exercises the token endpoint directly:
   - fires two refreshes of the same token at once — exactly one must return 200, the rotation
     lock must reject the other with the generic body;
   - refreshes the winner's token with `client_id` omitted (expects `invalid_request`), with a
     wrong `client_id` (expects the *same* generic `invalid_grant` body an unknown token gets —
     that is by design, not a bug), then with the correct `client_id` (expects 200 and a rotated
     token);
   - replays the now-superseded token (expects `invalid_grant`, "already been used"), then
     presents the token that was live at that moment (expects the *generic* body again, not a
     distinctly-worded "revoked grant" response — reuse detection deletes the grant's live token
     outright rather than tagging it).
   Every check here is HTTP-level (status + exact error body); no CloudWatch is read for this
   step. The 90-day absolute lifetime is **not** exercised live (unreachable without changing
   the server's clock) — see `SeControlCenter.Tests.OAuth.TestRefreshTokenStore` and
   `TestOAuthControllerRefreshTokenLifecycle` in the Control Center repo for that coverage.
5. **SE4-3896:** refreshes once (expects a rotated token), then opens Admin › MCP Integrations
   and asks you to revoke the probe client. It confirms the revoke without admin credentials:
   the public authorize endpoint answers 302 for an Active client and 400 for a revoked one.
   Then it refreshes again with the newest token (expects `invalid_grant`). If the `all`
   profile came back without a refresh token despite requesting `offline_access`, this is a
   failed row, not a skip.
6. **Cleanup:** if the client is still Active and `--keep-client` was not given, opens the admin
   page again and asks you to revoke it, then verifies the same way. A client left Active, or
   an agent run that could not be deleted, is a failed row so the run exits non-zero. The
   summary table is printed even if the run aborts on an unexpected error.

## The auth.md path

`--auth-md-email` runs the agent registration flow that the Control Center describes at
`/auth.md`, reached through this server's origin. It registers an agent for the email you pass,
so use an address you can sign in with on the target environment. It uses no DCR client, no
loopback listener and no CloudWatch; you complete one claim in the browser and everything else
is plain HTTP. `--mode` is still required and is used the same way: it only matters to an older
MCP build that dispatches a mismatched call instead of challenging it.

1. **Redirects.** `GET /auth.md` and `GET /.well-known/auth.md` on the MCP origin must answer
   `302` to the Control Center's `/auth.md`, and following the redirect must return
   `text/markdown`.
2. **Metadata.** Reads the authorization server's `agent_auth` endpoints, and checks that the
   MCP server's protected-resource metadata names the MCP origin as `resource` and lists the
   scopes this run requests.
3. **Register.** `POST` to the identity endpoint with `type=service_auth`, your email, and the
   scopes `agents:read runs:read`. These are a strict subset of the API scopes on purpose, so the
   run proves enforcement as well as acceptance.
4. **Claim.** Prints the verification URI and the code (and opens the URI in your browser when it
   is on the environment under test). Sign in as that email and enter the code on that page. The
   probe polls the claim grant at the interval the server asks for, backs off on `slow_down`,
   polls through a `5xx` or a dropped connection, and asks for a fresh code if the first expires.
   It gives up after five minutes. The code goes from the terminal to the browser, never back.
5. **Exchange.** Trades the identity assertion for an access token with
   `resource=<MCP origin>` and checks the token carries exactly the requested scopes and an
   audience on the MCP origin. When a response has no `scope`, the token's own `scope` claim is
   judged instead, since that is what the MCP server enforces; only if neither exists is the
   requested scope assumed. The claim grant's token is checked the same way.
6. **Call `/mcp`.** `list_agents` and `get_agent_runs` must succeed; `list_spaces` and
   `get_credits_balance` must be answered `403 insufficient_scope` naming the missing scope.
   `get_agent_runs` needs an agent: pass `--agent-id`, or the first agent the token can list is
   used, and the row reads `skipped` when there is none.
7. **Re-exchange.** Exchanges the new assertion the first exchange returned, checks its scope
   again, then repeats the calls with the second token. `--skip-mcp` skips both rounds of calls.
8. **Revoke.** Ends the registration with the assertion. The run's last report row shows what the
   Control Center answered; a `200` cannot prove the assertion was recognised (RFC 7009 answers
   `200` for unknown tokens too). If the metadata advertises no `revocation_endpoint`, or the claim
   poll failed so there is no assertion to revoke with, the row fails as `not attempted` and the
   registration may be left live.

Residue: one registration, revoked at the end. If the run dies between the claim and the
revoke, or the revoke row fails, the registration is left until its user revokes it in the
Control Center.

## Reading the result

| Mode | Scope matches | Scope mismatches |
|---|---|---|
| `log-only` | V1 2xx, MCP tool ok, no log line | V1 2xx, **and** a `Scope check would deny (log-only) … required=X granted=Y clientId=Z` line in CloudWatch; MCP **403** scope challenge |
| `enforce` | V1 2xx, MCP tool ok | V1 **403** with `errorCode: insufficient_scope` and `WWW-Authenticate: Bearer error="insufficient_scope", scope="X"`, and a `Scope check denied …` line; MCP **403** scope challenge |

The mode describes the Control Center only. The MCP server also checks each tool's scope itself,
before dispatch and whatever the Control Center's mode, for user tokens and for tokens issued to
a registered agent (`token_type` `agent`); server keys are exempt, as they are on the Control
Center. A mismatched `tools/call` gets HTTP 403 with `WWW-Authenticate: Bearer
error="insufficient_scope", scope="…"` naming the scopes the token holds plus the missing one,
and never reaches V1, so it adds no CloudWatch line.

Against an older MCP build without that check the call is still dispatched and the Control Center
decides: a tool ok in `log-only`, a tool error in `enforce` (`Insufficient Scope: … the "X"
scope …` on a build carrying **SE4-3929**, the fixed "Access Denied" text before it). The probe
accepts that, but flags it in the summary as `old build: no pre-dispatch scope challenge`.
Scope *names* are always asserted from direct V1 responses and CloudWatch as well, regardless
of which build the MCP server is on.

**`SE4-3896 NOT DEPLOYED HERE`** in the summary means a revoked client kept refreshing. That
is what a build without the revoke-on-refresh fix produces. It is reported as a failed row so
the run exits non-zero, but it is a statement about the build, not the tool.

A failed `3922` row means the build predates SE4-3922 or has a regression in it: a client_id
check that lets a mismatch through, missing reuse detection, or a rotation race that let both
concurrent requests through (or neither).

## Side effects and residue

- **One DCR client per run**, revoked at the end. Revoked is terminal (there is no delete
  endpoint for MCP clients by design); the Control Center's stale-client job removes inactive
  dynamically registered rows later. Revoked probe clients are visible in Admin › MCP
  Integrations with Source = Dynamic until then.
- **One agent run per profile** in `log-only` mode (three per full run) — started, stopped,
  and deleted once its status is terminal (the Control Center refuses to delete a run in
  progress; the tool waits up to 45 s after stop, then kills). In `enforce` mode the `all` and
  `none` profiles start one each (`none` gets the default scope, which includes
  `agents:write`). If the delete still fails, the summary names the run so it can be removed
  by hand.
- **One 1-byte input file** `oauth-scope-probe.txt` in the first space of the org, per
  profile, overwriting itself. There is no V1 endpoint to delete space input files; remove it
  from the Space UI if it bothers anyone.
- Registrations count against the DCR limit of **10 per IP per hour**; token requests against
  20 per minute per client. A full run uses one registration and up to a dozen token requests
  (six for the three profiles, plus the SE4-3922 and SE4-3896 checks).
- **SE4-3922's dedicated grant** leaves no separate row anywhere: it is revoked (by its own
  reuse-detection check) under the same client the rest of the run already registered.

## What it does not do

- Run against production. Add an entry to `ENVS` in the script deliberately if that is ever
  wanted.
- Automate the consent click. That would mean driving the dashboard's consent POST directly
  with a login token, which leans on a gap being closed on the server side.
- Replace the Control Center's unit tests. Those are the CI-time coverage; this tool is the
  live check nothing in a unit suite can perform.
