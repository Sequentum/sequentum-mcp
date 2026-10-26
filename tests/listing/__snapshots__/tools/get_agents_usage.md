# get_agents_usage

Title: Get Agents Usage

## Annotations

```json
{
  "title": "Get Agents Usage",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get all agents with their total costs for a date range, with filtering and sorting options. USE THIS to analyze which agents are costing the most, compare agent costs, or track spending by agent. Answers: 'Which agents cost the most?', 'Show agent costs this month', 'What did agent X cost in January?'. Returns: Paginated list of agents with agentId, agentName, cost, spaceId, plus totalRecordCount and totalCost. TIP: Use sortColumn='cost' and sortOrder=1 to see most expensive agents first. Filter by name to find specific agents. Usage types: 'Server Time,Export GB,Agent Inputs,Proxy Data,Export CPM'.

## inputSchema

```json
{
  "type": "object",
  "properties": {
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
      "description": "Column to sort by: 'name' or 'cost'. Default: 'name'."
    },
    "sortOrder": {
      "type": "number",
      "description": "Sort order: 0 = ascending, 1 = descending. Default: 0."
    },
    "name": {
      "type": "string",
      "description": "Filter by agent name (case-insensitive contains match)."
    },
    "usageTypes": {
      "type": "string",
      "description": "Filter by usage types (comma-separated). Example: 'Server Time,Export GB'."
    }
  },
  "required": []
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "agents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "agentId": {
            "type": "integer"
          },
          "agentName": {
            "type": [
              "string",
              "null"
            ]
          },
          "cost": {
            "type": "number"
          },
          "spaceId": {
            "type": [
              "integer",
              "null"
            ]
          }
        },
        "required": [
          "agentId",
          "agentName",
          "cost",
          "spaceId"
        ]
      }
    },
    "totalRecordCount": {
      "type": "integer"
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
    "agents",
    "totalRecordCount",
    "totalCost",
    "startDate",
    "endDate"
  ]
}
```
