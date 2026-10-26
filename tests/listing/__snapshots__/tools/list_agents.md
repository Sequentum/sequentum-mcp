# list_agents

Title: List Agents

## Annotations

```json
{
  "title": "List Agents",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

List web scraping agents with IDs, names, status, and configuration. USE THIS FIRST to discover available agents before running or managing them. Answers: 'What agents do I have?', 'Show me my scrapers', 'List all completed agents'. Returns: An object with agents (agent summaries with id, name, status (last run status label), configType, version, lastActivity) and pagination. Pagination always applied (defaults: pageIndex=1, recordsPerPage=50). TIP: Use 'search' param to find agents by name, or 'status' to filter by last run status (Completed, Failed, etc.).

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "number",
      "enum": [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13
      ],
      "description": "Filter by last run status: 0=Invalid, 1=Running, 2=Exporting, 3=Starting, 4=Queuing, 5=Stopping, 6=Failure, 7=Failed, 8=Stopped, 9=Completed, 10=Success, 11=Skipped, 12=Waiting, 13=UpdatingDataSet. 6=Failure and 7=Failed are one filter, and so are 9=Completed and 10=Success: either value returns agents in both. Agents that never ran have null status and match no status filter."
    },
    "spaceId": {
      "type": "number",
      "description": "Filter by space ID. Use list_spaces first to find space IDs."
    },
    "search": {
      "type": "string",
      "description": "Search by agent name (case-insensitive partial match). Example: 'amazon' finds 'Amazon Product Scraper'."
    },
    "configType": {
      "type": "string",
      "enum": [
        "Agent",
        "Command",
        "Api",
        "Shared"
      ],
      "description": "Filter by type. 'Agent' = web scrapers, 'Command' = data inputs, 'Api' = API configs, 'Shared' = reusable components."
    },
    "sortColumn": {
      "type": "string",
      "enum": [
        "name",
        "lastActivity",
        "created",
        "updated",
        "status",
        "configType"
      ],
      "description": "Column to sort by. 'lastActivity' shows recently run agents first (with sortOrder=1)."
    },
    "sortOrder": {
      "type": "string",
      "enum": [
        "asc",
        "desc"
      ],
      "description": "Sort direction. 'desc' = newest/Z first (descending), 'asc' = oldest/A first (ascending, default)."
    },
    "pageIndex": {
      "type": "number",
      "description": "Page number (1-based). Defaults to 1. Use with recordsPerPage to paginate large result sets."
    },
    "recordsPerPage": {
      "type": "number",
      "description": "Results per page. Defaults to 50. Max recommended: 100."
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
          "id": {
            "type": [
              "integer",
              "null"
            ]
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "status": {
            "type": "string",
            "description": "Last run status label, e.g. Success, Failed, Never Run, or Unknown (<code>)."
          },
          "configType": {
            "type": "integer",
            "description": "1 Agent, 2 SharedFile, 3 Template, 4 Command."
          },
          "version": {
            "type": "integer"
          },
          "lastActivity": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "id",
          "name",
          "description",
          "status",
          "configType",
          "version",
          "lastActivity"
        ]
      }
    },
    "pagination": {
      "type": "object",
      "properties": {
        "totalRecordCount": {
          "type": "integer"
        },
        "pageIndex": {
          "type": "integer"
        },
        "recordsPerPage": {
          "type": "integer"
        }
      },
      "required": [
        "totalRecordCount",
        "pageIndex",
        "recordsPerPage"
      ]
    }
  },
  "required": [
    "agents"
  ]
}
```
