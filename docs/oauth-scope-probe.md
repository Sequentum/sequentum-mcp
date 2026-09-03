# oauth-scope-probe

Live probe of OAuth scope enforcement on the Sequentum external V1 API (**SE4-3895**) and of
revoke-on-refresh (**SE4-3896**), run against a deployed environment. QA only.

```bash
npm run probe -- --env qa --mode log-only
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
revoking a client through the admin UI ends its refresh sessions.

## Prerequisites

- Node 20 or newer. No npm dependencies beyond this repository's.
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
npm run probe -- --env qa --mode log-only --preflight-only            # no side effects
npm run probe -- --env qa --mode log-only                             # full run: login, three consent clicks, one revoke click
npm run probe -- --env qa --mode log-only --profile read --skip-3896  # quickest real signal, one consent click
npm run probe -- --env qa --mode enforce                              # after the flip
```

| Flag | Meaning |
|---|---|
| `--env qa` | Required. Only `qa` is configured; there is deliberately no prod entry. |
| `--mode log-only\|enforce` | Required. What the server is expected to do on a scope mismatch. The tool never guesses. |
| `--profile all\|read\|none` | Run one scope profile instead of all three. |
| `--skip-mcp` | Don't call the MCP server. |
| `--skip-3896` | Skip refresh → revoke → refresh. |
| `--skip-cloudwatch` | Don't read CloudWatch (no `aws` CLI needed). |
| `--port N` | Fixed loopback port. Default is ephemeral. |
| `--reuse-client ID` | Skip DCR and reuse a client from an earlier `--keep-client` run. Requires the same `--port` it was registered with and `--skip-3896` (that step revokes the client, and revoked is terminal); implies `--keep-client`. Saves the 10-per-IP-hour registration budget while iterating. A `--keep-client` run prints the exact command to use. |
| `--agent-id`, `--space-id` | Use when running a profile alone that cannot list them itself. |
| `--keep-client` | Leave the DCR client Active at the end for inspection in Admin › MCP Integrations. |
| `--no-login-prompt` | Don't open the login page and wait before the first consent (you're already logged in). |
| `--preflight-only` | Check both metadata documents and CloudWatch access, register nothing, exit. |

## What a run does

0. **Login.** Opens `/login` in your browser and waits for Enter. Skip with `--no-login-prompt`.
1. **Preflight.** Reads both metadata documents and warns if this server's
   `scopes_supported` omits scopes the authorization server advertises. Refuses to run if the
   authorization server does not advertise all six API scopes, since that means the
   enforcement build is not deployed there.
2. **Registers** one throwaway DCR client named `oauth-scope-probe <timestamp>` whose only
   redirect URI is the loopback listener the script has already bound.
3. **For each profile** — `all` (six API scopes + `offline_access`), `read`
   (`agents:read` only), `none` (no `scope` parameter at all):
   - opens the browser to `/api/oauth/authorize`; you click Authorize;
   - exchanges the code with PKCE and `resource=<this server's origin>`;
   - calls six V1 endpoints, one per scope, and four read-only MCP tools;
   - judges every response against the mode;
   - polls CloudWatch for up to two minutes until every expected `Scope check` line for this
     client_id has appeared; when none is expected (the `all` profile), waits 45 seconds for
     ingestion before asserting that none appeared.
4. **SE4-3896:** refreshes once (expects a rotated token), then opens Admin › MCP Integrations
   and asks you to revoke the probe client. It confirms the revoke without admin credentials:
   the public authorize endpoint answers 302 for an Active client and 400 for a revoked one.
   Then it refreshes again with the newest token (expects `invalid_grant`). If the `all`
   profile came back without a refresh token despite requesting `offline_access`, this is a
   failed row, not a skip.
5. **Cleanup:** if the client is still Active and `--keep-client` was not given, opens the admin
   page again and asks you to revoke it, then verifies the same way. A client left Active, or
   an agent run that could not be deleted, is a failed row so the run exits non-zero. The
   summary table is printed even if the run aborts on an unexpected error.

## Reading the result

| Mode | Scope matches | Scope mismatches |
|---|---|---|
| `log-only` | V1 2xx, MCP tool ok, no log line | V1 2xx, MCP tool ok, **and** a `Scope check would deny (log-only) … required=X granted=Y clientId=Z` line in CloudWatch |
| `enforce` | V1 2xx, MCP tool ok | V1 **403** with `errorCode: insufficient_scope` and `WWW-Authenticate: Bearer error="insufficient_scope", scope="X"`; MCP tool error starting `Access Denied`; a `Scope check denied …` line |

This server collapses any upstream 403 into a fixed "Access Denied" message, so scope *names*
are only asserted from direct V1 responses and CloudWatch, never from MCP output.

**`SE4-3896 NOT DEPLOYED HERE`** in the summary means a revoked client kept refreshing. That
is what a build without the revoke-on-refresh fix produces. It is reported as a failed row so
the run exits non-zero, but it is a statement about the build, not the tool.

## Side effects and residue

- **One DCR client per run**, revoked at the end. Revoked is terminal (there is no delete
  endpoint for MCP clients by design); the Control Center's stale-client job removes inactive
  dynamically registered rows later. Revoked probe clients are visible in Admin › MCP
  Integrations with Source = Dynamic until then.
- **One agent run per profile** in `log-only` mode (three per full run) — started, stopped,
  and deleted once its status is terminal (the Control Center refuses to delete a run in
  progress; the tool waits up to 45 s after stop, then kills). In `enforce` mode only the `all`
  profile starts one. If the delete still fails, the summary names the run so it can be removed
  by hand.
- **One 1-byte input file** `oauth-scope-probe.txt` in the first space of the org, per
  profile, overwriting itself. There is no V1 endpoint to delete space input files; remove it
  from the Space UI if it bothers anyone.
- Registrations count against the DCR limit of **10 per IP per hour**; token requests against
  20 per minute per client. A full run uses one registration and at most six token requests.

## What it does not do

- Run against production. Add an entry to `ENVS` in the script deliberately if that is ever
  wanted.
- Automate the consent click. That would mean driving the dashboard's consent POST directly
  with a login token, which leans on a gap being closed on the server side.
- Replace the Control Center's unit tests. Those are the CI-time coverage; this tool is the
  live check nothing in a unit suite can perform.
