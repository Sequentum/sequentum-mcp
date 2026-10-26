# create_agent_schedule

Title: Create Agent Schedule

## Annotations

```json
{
  "title": "Create Agent Schedule",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": false
}
```

## Description

Create a scheduled task to automatically run an agent. Three schedule types available: RunOnce (1): Runs once at startTime (required, must be >=1 min in future UTC). RunEvery (2): Repeats every runEveryCount periods (runEveryPeriod: 1=min, 2=hr, 3=day, 4=wk, 5=mo). Optional startTime for first run (must be in future if provided). CRON (3): Uses cronExpression for complex schedules (e.g., '0 9 * * 1,4' = Mon/Thu 9am). Always specify timezone for local time interpretation. Examples: CRON daily at 9am: {scheduleType:3, cronExpression:'0 9 * * *'}. RunOnce: {scheduleType:1, startTime:'2026-01-20T14:30:00Z'}. RunEvery 30min: {scheduleType:2, runEveryCount:30, runEveryPeriod:1}.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent to schedule. Get this from list_agents, search_agents, or get_agent_build_status (when building a new agent)."
    },
    "name": {
      "type": "string",
      "description": "A descriptive name for the schedule (e.g., 'Daily Morning Run')."
    },
    "scheduleType": {
      "type": "number",
      "enum": [
        1,
        2,
        3
      ],
      "description": "Schedule type: 1=RunOnce (single execution), 2=RunEvery (recurring interval), 3=CRON (cron expression). Default: 3 (CRON)."
    },
    "startTime": {
      "type": "string",
      "description": "ISO 8601 UTC datetime (e.g., '2026-01-20T14:30:00Z'). Required for RunOnce (must be >=1 min in future). Optional for RunEvery (sets first run time, must be in future). Not used for CRON."
    },
    "cronExpression": {
      "type": "string",
      "description": "CRON expression for scheduleType=3. Format: 'minute hour day month weekday'. Examples: '0 9 * * *' (daily 9am), '0 9 * * 1,4' (Mon/Thu 9am), '*/30 * * * *' (every 30 min)."
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
      "description": "Timezone for schedule interpretation (e.g., 'America/New_York', 'America/Denver', 'Europe/London'). Default: UTC."
    },
    "inputParameters": {
      "type": "string",
      "description": "Optional JSON string of input parameters to pass to each scheduled run."
    },
    "isEnabled": {
      "type": "boolean",
      "description": "Whether the schedule is active. Default: true."
    },
    "parallelism": {
      "type": "number",
      "description": "Number of parallel instances to run. Default: 1."
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
      "description": "If true, prevents concurrent runs of this agent. Default: false."
    },
    "isWaitOnFailure": {
      "type": "boolean",
      "description": "If true, waits before retrying after a failure. Default: false."
    }
  },
  "required": [
    "agentId",
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
