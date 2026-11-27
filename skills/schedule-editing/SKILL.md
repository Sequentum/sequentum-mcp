---
name: schedule-editing
description: Use when updating, auditing or explaining an existing Sequentum agent schedule - changing its timing or parameters, a schedule marked Skipped, a schedule that fires at an unexpected time, or one that was re-enabled or lost its settings after an edit.
---

# Editing Sequentum schedules

What this covers: how a schedule update really behaves, how schedule timing is evaluated,
what Skipped means, and how schedule parameters are stored. Schedule types are RunOnce (1),
RunEvery (2) and CRON (3).

## An update replaces the whole schedule

update_agent_schedule does not patch. Every field you leave out is reset, not kept:

| Left out | Becomes |
|---|---|
| `isEnabled` | true: a disabled or paused schedule is switched back on |
| `inputParameters` | none: the schedule's parameters are cleared |
| `parallelism` | 1 |
| `parallelMaxConcurrency`, `parallelExport`, `logLevel`, `logMode` | cleared |
| `isExclusive` | true |
| `isWaitOnFailure` | false |
| `timezone` | cleared |
| `scheduleType` and its timing fields | must be sent again, or the timing is lost |

So, every time:

1. Read the schedule first with get_agent_schedule.
2. Send back every field you are not changing, with its current value, plus your change.
3. Read it again afterwards and confirm `isEnabled`, the timing and `nextRunTime` are what the
   user expects.

**Proxy pool and server group cannot be kept.** update_agent_schedule has no `proxyPoolId` or
`serverGroupId`, so any update clears them. If get_agent_schedule shows either one set, do not
update that schedule here: tell the user to make the change in the Sequentum dashboard.

To switch a schedule on or off without touching anything else, use enable_agent_schedule or
disable_agent_schedule instead of an update.

## Timing

- **CRON (3)** is evaluated in the schedule's `timezone`. `0 9 * * *` in `America/New_York`
  fires at 9:00 New York time. With no timezone it is UTC.
- **RunOnce (1)** needs a `startTime` at least 1 minute in the future when created. Changing it
  later to a time in the past is refused.
- **RunEvery (2)** uses `runEveryCount` and `runEveryPeriod`: Minutes (1), Hours (2), Days (3),
  Weeks (4), Months (5). Its `startTime` is the anchor. Days count from the anchor; Weeks
  and Months step on from the previous run time, and Months keep the anchor's day of the
  month. All three follow the schedule's timezone and have no CRON expression.
- **Updating a RunEvery schedule needs a new `startTime` in the future.** Leaving `startTime`
  out is refused ("Start time cannot be empty."), and this server rejects a RunEvery
  `startTime` that is not in the future, so the existing anchor cannot be re-sent once it has
  passed. The new start time becomes the anchor the interval counts from. Agree it with the
  user before updating.

## Skipped (11)

Skipped is set on the schedule, not on a run. When the schedule fired, the agent already had
an active run that it could not run beside:

- an exclusive schedule fires while any run of the agent is active, or
- a non-exclusive schedule fires while an exclusive run of the agent is active.

No run is created. The next run time moves 1 minute later and the scheduler tries again, so a
long-running agent can keep a schedule Skipped until that run ends.

## When a scheduled run cannot start

- If the schedule fires but Control Center refuses the run (no credits, a run waiting on
  failure, no servers online), a Failed (7) run is recorded with the refusal as its message.
  See the run-troubleshooting skill for the messages.
- If the agent still needs approval, the schedule fires without creating any run, and its next
  run time moves on as usual. An administrator must approve the agent.

Editing a schedule is never refused for lack of credits; the credit check runs when the
schedule creates a run.

## Parameters on schedules

- `inputParameters` follow the same rules as for runs (see the run-inputs skill).
- A schedule stores its parameters. A parameter sent without the `?` prefix is stored in clear
  text and returned in clear text to anyone with read access to the agent's space. Send
  secrets as `?name`.
- get_agent_schedule returns a `?` parameter's value encrypted. When you send the schedule
  back, send each `?` entry exactly as returned, name and value: it stays encrypted and is not
  encrypted a second time. Never show those values to the user. To change a secret, ask the
  user for the new value and send it under the same `?name`.
