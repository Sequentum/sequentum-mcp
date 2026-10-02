# update_agent_schedule

Title: Update Agent Schedule

## Annotations

```json
{
  "title": "Update Agent Schedule",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Update an existing schedule for an agent. Modify timing, parameters, or other settings. Answers: 'Change the schedule to run at 10am', 'Update the cron expression', 'Modify the schedule timezone'. Three schedule types: RunOnce (1), RunEvery (2), CRON (3). TIP: Use get_agent_schedule or list_agent_schedules first to see current settings before updating.

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
      "description": "The schedule ID to update. Get this from list_agent_schedules."
    },
    "name": {
      "type": "string",
      "description": "A descriptive name for the schedule."
    },
    "scheduleType": {
      "type": "number",
      "enum": [
        1,
        2,
        3
      ],
      "description": "Schedule type: 1=RunOnce (single execution), 2=RunEvery (recurring interval), 3=CRON (cron expression)."
    },
    "startTime": {
      "type": "string",
      "description": "Start time in ISO 8601 UTC format (e.g., '2026-01-20T14:30:00Z'). Required for RunOnce, optional for RunEvery."
    },
    "cronExpression": {
      "type": "string",
      "description": "CRON expression for scheduleType=3. Format: 'minute hour day month weekday'. Examples: '0 9 * * *' (daily 9am), '0 9 * * 1,4' (Mon/Thu 9am)."
    },
    "runEveryCount": {
      "type": "number",
      "description": "For scheduleType=2 (RunEvery): The interval count. Example: 30 with runEveryPeriod=1 means every 30 minutes."
    },
    "runEveryPeriod": {
      "type": "number",
      "enum": [
        1,
        2,
        3,
        4,
        5
      ],
      "description": "For scheduleType=2 (RunEvery): The time unit. 1=minutes, 2=hours, 3=days, 4=weeks, 5=months."
    },
    "timezone": {
      "type": "string",
      "description": "Timezone for schedule interpretation (e.g., 'America/New_York', 'Europe/London')."
    },
    "inputParameters": {
      "type": "string",
      "description": "Optional JSON string of input parameters to pass to each scheduled run."
    },
    "isEnabled": {
      "type": "boolean",
      "description": "Whether the schedule is active."
    },
    "parallelism": {
      "type": "number",
      "description": "Number of parallel instances to run."
    },
    "parallelMaxConcurrency": {
      "type": "number",
      "description": "Maximum concurrent parallel instances. Only relevant when parallelism > 1."
    },
    "parallelExport": {
      "type": "string",
      "enum": [
        "Combined",
        "Separated"
      ],
      "description": "How parallel run exports are handled. 'Combined' merges output, 'Separated' keeps per-instance files."
    },
    "logLevel": {
      "type": "string",
      "enum": [
        "Fatal",
        "Error",
        "Warning",
        "Info"
      ],
      "description": "Log verbosity for scheduled runs. Default: 'Info'."
    },
    "logMode": {
      "type": "string",
      "enum": [
        "Text",
        "TextAndHtml"
      ],
      "description": "Log format. 'Text' for plain text, 'TextAndHtml' for both. Default: 'Text'."
    },
    "isExclusive": {
      "type": "boolean",
      "description": "If true, prevents concurrent runs of this agent."
    },
    "isWaitOnFailure": {
      "type": "boolean",
      "description": "If true, waits before retrying after a failure."
    }
  },
  "required": [
    "agentId",
    "scheduleId",
    "name"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "tag": {
      "type": [
        "string",
        "null"
      ]
    },
    "id": {
      "type": "integer",
      "description": "The scheduleId."
    },
    "configId": {
      "type": "integer",
      "description": "The agentId."
    },
    "name": {
      "type": [
        "string",
        "null"
      ]
    },
    "schedule": {
      "type": [
        "string",
        "null"
      ],
      "description": "CRON expression, for CRON schedules."
    },
    "localSchedule": {
      "type": [
        "string",
        "null"
      ]
    },
    "timezone": {
      "type": [
        "string",
        "null"
      ]
    },
    "nextRunTime": {
      "type": [
        "string",
        "null"
      ]
    },
    "startTime": {
      "type": [
        "string",
        "null"
      ]
    },
    "scheduleType": {
      "type": [
        "integer",
        "null"
      ],
      "description": "0 None, 1 RunOnce, 2 RunEvery, 3 CRON."
    },
    "isEnabled": {
      "type": "boolean"
    },
    "runEveryCount": {
      "type": [
        "integer",
        "null"
      ]
    },
    "runEveryPeriod": {
      "type": [
        "integer",
        "null"
      ],
      "description": "1 minute, 2 hour, 3 day, 4 week, 5 month."
    },
    "inputParameters": {
      "type": [
        "string",
        "null"
      ],
      "description": "JSON string of input parameters."
    },
    "parallelism": {
      "type": [
        "integer",
        "null"
      ]
    },
    "parallelMaxConcurrency": {
      "type": [
        "integer",
        "null"
      ]
    },
    "parallelExport": {
      "type": [
        "string",
        "null"
      ],
      "description": "Combined or Separated."
    },
    "proxyPoolId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "serverGroupId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "logLevel": {
      "type": [
        "string",
        "null"
      ]
    },
    "logMode": {
      "type": [
        "string",
        "null"
      ]
    },
    "isExclusive": {
      "type": "boolean"
    },
    "isWaitOnFailure": {
      "type": "boolean"
    },
    "startedBy": {
      "type": [
        "string",
        "null"
      ]
    },
    "serverId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "httpVersion": {
      "type": [
        "string",
        "null"
      ]
    },
    "saveContentCache": {
      "type": "boolean"
    },
    "configName": {
      "type": [
        "string",
        "null"
      ]
    },
    "created": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "tag",
    "id",
    "configId",
    "name",
    "schedule",
    "localSchedule",
    "timezone",
    "nextRunTime",
    "startTime",
    "scheduleType",
    "isEnabled",
    "runEveryCount",
    "runEveryPeriod",
    "inputParameters",
    "parallelism",
    "parallelMaxConcurrency",
    "parallelExport",
    "proxyPoolId",
    "serverGroupId",
    "logLevel",
    "logMode",
    "isExclusive",
    "isWaitOnFailure",
    "created"
  ]
}
```
