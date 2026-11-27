---
name: run-outcomes
description: Use when reading or reporting the status, counts or files of a Sequentum agent run - "did it work?", "why is there no data?", success-rate or failure reports, stopping, killing or deleting a run. Explains what each run status means, the run file types and the quirks of the runs summary.
---

# Sequentum run outcomes

What this covers: what a Sequentum run status really means, which statuses count together,
which run files hold the data and the logs, how the runs summary counts runs, and how stop,
kill and delete behave. Run statuses and file types come back as numbers; this skill writes
them as `Name (number)`.

## Run statuses

| Status | Meaning |
|---|---|
| Running (1), Exporting (2), Starting (3), Queuing (4), Stopping (5), Waiting (12), UpdatingDataSet (13) | Still in progress. Not a final result. |
| Failure (6) | The run failed while it was running on the run server. |
| Failed (7) | The run never launched: Control Center refused or could not start it. A schedule that fires when the account has no credits, a wait-on-failure run blocks the agent, or no servers are online records a Failed (7) run with the refusal as its message. |
| Stopped (8) | Ended early: stopped or killed by a user, or stopped at the agent's maximum run time. Read the message to tell which (see the run-troubleshooting skill). |
| Completed (9) | Finished. It can still have errors or zero records. |
| Success (10) | Finished and the agent's success criteria passed. Only runs without parallel sets, of agents with success criteria turned on, get it; when the criteria fail the run is Failure (6) instead. Parallel runs end Completed (9). |
| Skipped (11) | Shown on a schedule whose run could not start beside an active run: see the schedule-editing skill. |

- **Treat Failure (6) and Failed (7) as one "failed" family, and Completed (9) and Success (10)
  as one "succeeded" family.** Status filters already work this way: filtering on either value
  returns both.
- **Older runs show Failed (7) where they were Failure (6).** When runs move to history,
  Failure (6) is rewritten as Failed (7). So 7 on an old run does not prove the run never
  launched; read the message.
- **Completed (9) is not proof of data.** Check the records extracted and exported and the
  error count. A blocked site usually ends as Completed (9) with 0 records (see the
  run-troubleshooting skill).
- **Failure (6) from robots.txt:** an agent set to always obey robots.txt and to fail on a
  block turns an otherwise Completed or Success run into Failure (6) with the message
  "Agent run failed: N URL(s) blocked by robots.txt. See run log for details."

### Parallel runs

- A run with parallelism above 1 has one parent run plus one sub-run per set.
- Sets above the parallel max concurrency start as Waiting (12) and start as others finish.
- The parent takes the worst set status, in this order: Failure (6), Failed (7), Stopped (8),
  Completed (9), Success (10), Skipped (11).

## Run files (get_run_files)

`fileType` is a number:

| fileType | What it is |
|---|---|
| 1 | Delivered export file: the data the user receives. |
| 2 | Extracted files (files the agent downloaded). |
| 6 | Run log, plain text. |
| 7 | Run log, HTML. |

Other values are internal. Fetch a file with get_file_download_url. The log (6 or 7) is the
best source for why a run went wrong.

## Runs summary (get_runs_summary)

- With no dates it covers the last 24 hours.
- An explicit `endDate` always runs to the end of that day, even when it includes a time.
- `completedRuns` counts Completed (9) and Success (10). `failedRuns` counts Failure (6) and
  Failed (7).
- The buckets do not add up to `totalRuns`: Starting, Exporting, Waiting, Stopping, Skipped
  and UpdatingDataSet runs count in the total but in no bucket.
- `completedWithErrorsRuns` is always 0. Do not report it.
- In `failedRunDetails`, `spaceName` is always empty. Use `spaceId` with get_space if the
  space name matters.

## Stop, kill and delete

- **Stop (stop_agent) is asynchronous.** Success means the stop was requested. Poll
  get_run_status until the run reaches a final status before reporting it stopped.
- **A stopped run still exports.** For a run without parallel sets, stop_agent (or a first
  kill_agent call) still exports, delivers and bills the rows collected before the stop.
- **Kill (kill_agent):** the first call is a graceful stop. A second call while the run is
  still Stopping (5) forces it to end.
- **Delete (delete_run)** `removeMethod`:
  - `RemoveEntireRun` (default): removes the run and all its files.
  - `RemoveAllFiles`: removes the files and keeps the run record.
  - `RemoveAllFilesAndAgentInput`: removes the files and clears the agent input parameters.
- Delete is refused when:
  - the run, or any of its parallel sub-runs, is still Starting, Running, Exporting or
    UpdatingDataSet. Stop it, wait for a final status, then delete.
  - another operation is changing the agent. Retry shortly.
  - the ID is a parallel sub-run. Delete the parent run instead.
  - the agent is archived. It must be restored first.

## Polling

The API is rate limited per credential. Poll run status at a modest interval, and back off
when a call returns 429.
