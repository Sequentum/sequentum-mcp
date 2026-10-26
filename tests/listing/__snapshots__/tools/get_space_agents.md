# get_space_agents

Title: Get Space Agents

## Annotations

```json
{
  "title": "Get Space Agents",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

List all agents that belong to a specific space. Answers: 'What agents are in space X?', 'Show agents in the Production folder'. Returns: Array of agents in the space with id, name, status, configType, lastActivity. ALTERNATIVE: You can also use list_agents with spaceId filter. COUNTING: If you only need how many agents are in the space, call get_space_agent_count instead of counting this array — counting a long list by hand is error-prone.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "spaceId": {
      "type": "number",
      "description": "The unique ID of the space. Get this from list_spaces or search_space_by_name."
    }
  },
  "required": [
    "spaceId"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "result": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "configType": {
            "type": "integer",
            "description": "1 Agent, 2 SharedFile, 3 Template, 4 Command."
          },
          "status": {
            "type": [
              "integer",
              "null"
            ],
            "description": "Run status code: 0 Invalid, 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, 6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet."
          },
          "validationStatus": {
            "type": [
              "integer",
              "null"
            ],
            "description": "1 Unknown, 2 Invalid, 3 Valid."
          },
          "lastActivity": {
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
          },
          "updated": {
            "type": [
              "string",
              "null"
            ]
          },
          "version": {
            "type": "integer"
          },
          "isArchived": {
            "type": "boolean"
          },
          "approvalStatus": {
            "type": [
              "integer",
              "null"
            ],
            "description": "0 NotApproved, 1 PendingApproval, 2 Approved."
          },
          "labels": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "integer"
                },
                "name": {
                  "type": "string"
                }
              },
              "required": [
                "id",
                "name"
              ]
            }
          }
        },
        "required": [
          "id",
          "name",
          "description",
          "configType",
          "status",
          "validationStatus",
          "lastActivity"
        ]
      }
    }
  },
  "required": [
    "result"
  ]
}
```
