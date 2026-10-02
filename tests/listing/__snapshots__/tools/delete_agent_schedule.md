# delete_agent_schedule

Title: Delete Agent Schedule

## Annotations

```json
{
  "title": "Delete Agent Schedule",
  "readOnlyHint": false,
  "destructiveHint": true,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Remove a schedule from an agent. The agent will no longer run automatically on this schedule. Answers: 'Stop the scheduled runs', 'Remove the Monday schedule', 'Delete schedule X'. WARNING: This permanently deletes the schedule. Use list_agent_schedules first to find the scheduleId.

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
      "description": "The schedule ID to delete. Get this from list_agent_schedules."
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
