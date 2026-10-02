# enable_agent_schedule

Title: Enable Agent Schedule

## Annotations

```json
{
  "title": "Enable Agent Schedule",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Enable a previously disabled schedule so it will run according to its configuration. Answers: 'Turn on the schedule', 'Re-enable the Monday schedule', 'Activate schedule X'. TIP: Use list_agent_schedules to check current isEnabled status first.

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
      "description": "The schedule ID to enable. Get this from list_agent_schedules."
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
