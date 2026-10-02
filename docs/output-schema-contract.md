# Output schema contract check

`npm run contract:output-schemas` checks the tools' output schemas against real data from the
QA Control Center. Run it before taking an output-schema change out of draft, and again
whenever the Control Center changes a DTO the MCP server returns.

## Why it exists

The MCP SDK validates every successful tool result against the tool's `outputSchema` and turns
a mismatch into an error result. A schema that disagrees with the Control Center therefore
breaks a working tool for every client. Unit tests check the schemas against recorded payloads;
this check uses live ones.

## What it does

1. Builds the branch (`npm run build`).
2. Opens the QA login page, then a consent page asking for read scopes only
   (`agents:read runs:read spaces:read billing:read`). The token stays in memory.
3. Starts the built server in process, pointed at `https://dashboard-qa.sequentum.com`.
4. Discovers ids (an agent with runs, a run with files, a space, a schedule) and calls every
   read-only tool that has an output schema, except `get_agent_build_status`, which is skipped:
   it needs a build session, and creating one is a write.
5. Prints one row per call (a tool called more than once gets a row each time), plus a SKIPPED
   row for any read-only tool it did not call, and exits non-zero on any SCHEMA FAIL.

It never calls a write tool.

## Verdicts

| Verdict | Meaning |
|---|---|
| PASS | The SDK accepted the structured content. |
| SCHEMA FAIL | The SDK rejected it; the row shows the validator's message. Fix the schema. |
| UPSTREAM ERROR | The call failed for another reason (for example a Control Center 401). Not a schema problem. |
| SKIPPED | No suitable id was found, or the tool is a write tool. |

## Residue

Each run registers one OAuth client through Dynamic Client Registration. Pass
`--reuse-client <client_id>` (printed by the first run) to reuse it.

## Limits

It sees QA only. Fields that production's Control Center does not send yet are handled when the
schemas are written (see `src/server/output-schemas/fragments.ts`, `*_QA_ONLY_KEYS`).
