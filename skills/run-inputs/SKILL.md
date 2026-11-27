---
name: run-inputs
description: Use when starting a Sequentum agent run, running every agent in a space, or creating a schedule with input parameters, secrets, synchronous mode, parallelism, exclusive runs or wait-on-failure.
---

# Sequentum run inputs and run options

What this covers: the format of `inputParameters`, how to pass secrets so they are encrypted,
and what the run options do for start_agent, run_space_agents, create_agent_schedule and
update_agent_schedule.

## inputParameters format

- `inputParameters` is a **JSON string** holding a flat object of parameter names to text
  values, for example `'{"url": "https://example.com", "pages": "5"}'`.
- Nested objects or arrays are refused with "Invalid JSON format for input parameters."
- A parameter you leave out keeps the agent's own definition (its default value and its
  encryption).
- Use get_agent to see the parameters the agent defines (`inputParameters`).

## Secrets: the `?` prefix

- Prefix a parameter name with `?` (for example `"?apiKey"`) to store its value encrypted
  and hide it in the run log.
- **The name you send decides.** A name without `?` is stored and logged in clear text, even
  when the agent defines that parameter as encrypted.
- If you send both `"apiKey"` and `"?apiKey"`, the `?` one is used and the plain one is
  dropped.
- In get_agent's `inputParameters`, a name that starts with `?` is an encrypted parameter.
  Its value is not the real default; do not show it or send it as a run or new schedule
  value. Ask the user for the value instead. (When updating a schedule, its own `?` values
  are sent back as returned; see the schedule-editing skill.)
- Schedules store their parameters, and a clear-text one is visible to anyone who can read
  the agent's space. Always send secrets on schedules as `?name`.

These rules are the same for start_agent, run_space_agents, create_agent_schedule and
update_agent_schedule.

## start_agent options

- **Synchronous mode** (`isRunSynchronously: true`) waits for the run and returns the data.
  It cannot be combined with `parallelism` above 1 ("Parallel runs cannot be run in
  synchronous mode"). Use it only for short runs, within `timeout`.
- **Parallelism:** start_agent sets the parallel max concurrency to 1. With `parallelism`
  above 1, only one set runs at a time; the others wait as Waiting (12) until a set finishes.
- start_agent runs are always **exclusive** and never **wait-on-failure** (see below).

## Exclusive runs

- An exclusive run cannot start while any other run of the agent is active, and no other run
  can start while it is active.
- start_agent and run_space_agents runs are exclusive. On a schedule, `isExclusive` defaults
  to true when you leave it out, on create and on update.
- A refused start returns "Unable to start an exclusive run because one or more runs are
  already in progress." or "Unable to start a new run because an exclusive run is already in
  progress."

## Wait-on-failure

- Of these tools, only the schedule tools can turn it on (`isWaitOnFailure`, default false).
- When a run with wait-on-failure ends in Failure (6), **new runs of that agent are refused**,
  manual and scheduled, with "Unable to start a new run because a previous run is in failure
  and requires manual intervention."
- Turn it on only when the user wants runs to halt after a failure until someone looks.

## Running every agent in a space (run_space_agents)

- Starts each agent in the space separately, with the same `inputParameters` for all of them.
- An agent that cannot start (already running, needs approval, no credits) is reported in the
  results and does not stop the others. Check each result, not just the totals.
- Runs are exclusive and never wait-on-failure.
