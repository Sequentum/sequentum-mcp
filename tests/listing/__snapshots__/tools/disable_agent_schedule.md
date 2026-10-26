# disable_agent_schedule

Title: Disable Agent Schedule

## Annotations

```json
{
  "title": "Disable Agent Schedule",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Disable a schedule so it will not run until re-enabled. The schedule is preserved but inactive. Answers: 'Pause the schedule', 'Turn off the daily run', 'Disable schedule X temporarily'. TIP: Unlike delete, this preserves the schedule configuration. Use enable_agent_schedule to reactivate.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent."
    },
    "scheduleId": {
      "type": "number",
      "description": "The schedule ID to disable. Get this from list_agent_schedules."
    }
  },
  "required": [
    "agentId",
    "scheduleId"
  ]
}
```

## outputSchema

(none)
