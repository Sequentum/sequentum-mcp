---
name: run-troubleshooting
description: Use when explaining why a Sequentum agent run failed, stopped, would not start, or returned empty or partial data. Decodes run messages, explains how blocked sites show up, and says how far to trust the failure diagnostics.
---

# Sequentum run troubleshooting

What this covers: how to read the failure diagnostics, what the common run messages mean,
why a blocked site usually looks like a Completed run with no rows, and what to check next.
Status values are written as `Name (number)`; see the run-outcomes skill for the full list.

## How far to trust the diagnostics

get_latest_failure and get_run_diagnostics build `possibleCauses` and `suggestedActions` from
the run status and a keyword match on the run message. Treat them as hints, not a diagnosis:

- For Failure (6) they always say the agent "failed to start on the server". That is wrong:
  Failure (6) means the run failed while it was running. Failed (7) normally means it never
  started, but older (history) runs also show Failed (7) (see the run-outcomes skill).
- The keyword hints (timeout, blocked, captcha, 403, connection, selector, memory) are only
  added for Failed (7).
- For Stopped (8) they always say the run was "manually stopped by a user", even when it hit
  the maximum run time.
- get_latest_failure looks only at the agent's last 50 runs. An older failure is not found.

Reason from the message, the status, the records extracted and exported, the error count and
the runtime instead.

## Run messages

| Message contains | Status | What it means |
|---|---|---|
| "Agent maximum run time exceeded (…)." | Stopped (8) | The run hit the agent's maximum run time. Raise the limit or narrow the crawl. |
| "Agent run cancelled by user." | Stopped (8) | A user stopped the run (stop_agent, or a first kill_agent call). |
| "Agent run killed by user." | Stopped (8) | Despite the wording, the agent's maximum run time was reached while the run was exporting. |
| "Agent data count timeout exceeded (…): runtime data count did not increase." | Failure (6) | The record count stopped growing for longer than the agent's data count timeout. The agent is likely stuck on a page or the site stopped returning data. |
| "Run … was not found on server …", "… failed probe on server …" or "… reported Failure on server …", ending "for N consecutive checks." | Failure (6) | Control Center lost track of the run on its run server over several checks in a row. Run it again. |
| "Agent run failed: N URL(s) blocked by robots.txt. See run log for details." | Failure (6) | The agent is set to obey robots.txt and fail on a block, and some pages were disallowed. |
| "Cannot continue because the browser stopped responding …" | Failure (6) | Repeated browser restarts did not help. Usually an unresponsive proxy or target site. |
| "Unexpected error: …" | Failure (6) | Catch-all. The rest of the message and the run log hold the detail. |
| "Unable to start an exclusive run because one or more runs are already in progress." | not started | An exclusive run cannot start while another run of the agent is active. Wait for it to finish, or stop it. |
| "Unable to start a new run because an exclusive run is already in progress." | not started | An exclusive run of this agent is active. |
| "Unable to start a new run because a previous run is in failure and requires manual intervention." | not started | A failed run with wait-on-failure is blocking every new run of this agent (see the run-inputs skill). |
| "Unable to start a new run because no servers are online." (or a server-group variant) | not started | No run server was available. Retry later. |
| "Your account has insufficient credits to execute the agent. …" | not started | The credit check at run creation failed. Check get_credits_balance. |
| "Run stopped: no credits available. …" | ended early | The account's credit ran out while the run was active. |
| "This agent requires approval before it can be scheduled or run via API." (start_agent and create_agent_schedule) or "This agent requires approval before it can be run via API." (run_space_agents) | not started | An administrator must approve the agent first. |
| "Agent is archived and cannot be run. Restore the agent first." | not started | The agent is archived. |

"Not started" messages come back as the error of start_agent, or per agent in the
run_space_agents results. When a schedule fires and the run is refused for credits, a
wait-on-failure block or no servers online, a Failed (7) run is recorded with that message.
A schedule that collides with an active run is marked Skipped instead, and the schedule of an
agent that still needs approval does not run at all (see the schedule-editing skill).

## Blocked sites look like empty Completed runs

By default an agent ignores HTTP error codes, so a page the site refuses is not an error.
Its captures run against the refusal page, every capture reports a missing element, and the
row comes out empty. So a block usually ends as **Completed (9) with 0 records (or far fewer
than usual) and many missing-element or selector errors, not as a failed run.** Do not
conclude the selectors broke without checking the log.

What the run does about refusals:

- 429 (rate limited) and 503 (temporarily refused): retried up to twice, waiting longer each
  time and using a fresh proxy. The log says "This is throttling, not a selector problem"
  when the retries run out.
- 401: never retried. The log says the site refused the request and "that is the block, not a
  selector problem".

Look for those lines in the run log. If they are there, the fix is on the access side (slower
crawl, a different or larger proxy pool, login), not the selectors.

## Next steps

1. Read the run log: get_run_files, then get_file_download_url for fileType 6 (text) or 7
   (HTML).
2. Compare with the last good run (records, errors, runtime). get_agent_versions shows whether
   the agent changed in between.
3. For "not started" refusals about credits, check get_credits_balance.
