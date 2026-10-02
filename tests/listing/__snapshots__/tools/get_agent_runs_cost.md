# get_agent_runs_cost

Title: Get Agent Runs Cost

## Annotations

```json
{
  "title": "Get Agent Runs Cost",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get individual run costs for a specific agent with detailed run information and filtering options. USE THIS to drill down into specific runs, identify expensive runs, or analyze run costs over time. Answers: 'Which runs were most expensive?', 'Show run costs for agent X', 'What did run Y cost?'. Returns: Paginated list of runs with runId, date, startTime, endTime, cost, billingType, plus agentId, agentName, totalRecordCount and totalCost. TIP: Sort by cost (sortColumn='cost', sortOrder=1) to find most expensive runs. Filter by usageTypes to see specific cost categories.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent."
    },
    "startDate": {
      "type": "string",
      "description": "Start date in ISO 8601 format. Defaults to start of current month. Example: '2026-01-01' or '2026-01-01T00:00:00Z'."
    },
    "endDate": {
      "type": "string",
      "description": "End date in ISO 8601 format. Defaults to now. Example: '2026-01-31' or '2026-01-31T23:59:59Z'."
    },
    "pageIndex": {
      "type": "number",
      "description": "Page number (1-based). Default: 1."
    },
    "recordsPerPage": {
      "type": "number",
      "description": "Records per page. Default: 50, Max: 1000."
    },
    "sortColumn": {
      "type": "string",
      "description": "Column to sort by: 'date', 'cost', or 'duration'. Default: 'date'."
    },
    "sortOrder": {
      "type": "number",
      "description": "Sort order: 0 = ascending, 1 = descending. Default: 0."
    },
    "usageTypes": {
      "type": "string",
      "description": "Filter by usage types (comma-separated). Example: 'Server Time,Proxy Data'."
    }
  },
  "required": [
    "agentId"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "runs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "runId": {
            "type": "integer"
          },
          "date": {
            "type": "string"
          },
          "startTime": {
            "type": [
              "string",
              "null"
            ]
          },
          "endTime": {
            "type": [
              "string",
              "null"
            ]
          },
          "cost": {
            "type": "number"
          },
          "billingType": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "runId",
          "date",
          "startTime",
          "endTime",
          "cost",
          "billingType"
        ]
      }
    },
    "totalRecordCount": {
      "type": "integer"
    },
    "totalCost": {
      "type": "number",
      "description": "Total for this page only."
    },
    "agentId": {
      "type": "integer"
    },
    "agentName": {
      "type": "string"
    }
  },
  "required": [
    "runs",
    "totalRecordCount",
    "totalCost",
    "agentId",
    "agentName"
  ]
}
```
