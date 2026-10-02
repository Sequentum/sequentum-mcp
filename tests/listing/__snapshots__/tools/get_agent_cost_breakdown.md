# get_agent_cost_breakdown

Title: Get Agent Cost Breakdown

## Annotations

```json
{
  "title": "Get Agent Cost Breakdown",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get detailed cost breakdown by usage type for a specific agent over time, useful for visualizing costs in charts. USE THIS to understand what's driving costs for an agent (run usage vs exports vs proxies), or to chart agent costs over time. Answers: 'What's causing agent X's costs?', 'Show me cost breakdown for agent 123', 'Chart agent costs by day'. Returns: Cost data with agentId, agentName, date labels array, usageTypes array (each with type name, data points, totalCost), totalCost, startDate, endDate. TIP: Use timeUnit='day' for daily granularity or 'month' for monthly. Usage types are RunUsage, ExportDataBandwidth, ExportDataCpm, InputCount, ProxyUsage and AgentBuilder. Each usageTypes.data array lines up with labels, but is empty for a type with no usage.

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
    "timeUnit": {
      "type": "string",
      "description": "Time unit for grouping: 'day' or 'month'. Default: 'day'."
    },
    "usageTypes": {
      "type": "string",
      "description": "Filter by usage types (comma-separated). Example: 'Server Time,Export GB'."
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
    "agentId": {
      "type": "integer"
    },
    "agentName": {
      "type": "string"
    },
    "labels": {
      "type": "array",
      "items": {
        "type": "string",
        "description": "YYYY-MM-DD"
      }
    },
    "usageTypes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "description": "e.g. RunUsage, ExportDataBandwidth, ExportDataCpm, InputCount, ProxyUsage, AgentBuilder."
          },
          "data": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "description": "Cost per label; empty when the type had no usage."
          },
          "totalCost": {
            "type": "number"
          }
        },
        "required": [
          "type",
          "data",
          "totalCost"
        ]
      }
    },
    "totalCost": {
      "type": "number"
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    }
  },
  "required": [
    "agentId",
    "agentName",
    "labels",
    "usageTypes",
    "totalCost",
    "startDate",
    "endDate"
  ]
}
```
