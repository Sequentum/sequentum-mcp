# get_agent

Title: Get Agent

## Annotations

```json
{
  "title": "Get Agent",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get detailed information about a specific agent including its configuration, input parameters, and documentation. USE AFTER list_agents or search_agents when you need full details for a specific agent. Answers: 'Tell me about agent X', 'What parameters does this agent need?', 'Show agent configuration'. Returns: Full agent details including inputParameters (what inputs the agent accepts), description, documentation, startUrl. REQUIRED: You must have the agentId first (get it from list_agents, search_agents, or get_agent_build_status when building a new agent).

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent. Get this from list_agents, search_agents, or get_agent_build_status (when building a new agent)."
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
    "agentTemplates": {
      "type": [
        "string",
        "null"
      ]
    },
    "configType": {
      "type": "integer",
      "description": "1 Agent, 2 SharedFile, 3 Template, 4 Command."
    },
    "description": {
      "type": [
        "string",
        "null"
      ]
    },
    "documentation": {
      "type": [
        "string",
        "null"
      ]
    },
    "icon": {
      "type": [
        "string",
        "null"
      ]
    },
    "image": {
      "type": [
        "string",
        "null"
      ],
      "description": "Base64-encoded image."
    },
    "inputParameters": {
      "type": [
        "object",
        "null"
      ],
      "properties": {},
      "required": [],
      "description": "Input parameter names mapped to their default values."
    },
    "id": {
      "type": [
        "integer",
        "null"
      ]
    },
    "isActive": {
      "type": "boolean"
    },
    "lastActivity": {
      "type": [
        "string",
        "null"
      ]
    },
    "name": {
      "type": [
        "string",
        "null"
      ]
    },
    "proxyPoolId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "spaceId": {
      "type": [
        "integer",
        "null"
      ],
      "description": "Null for the personal space."
    },
    "startUrl": {
      "type": [
        "string",
        "null"
      ]
    },
    "status": {
      "type": [
        "integer",
        "null"
      ],
      "description": "Run status code: 0 Invalid, 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, 6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet."
    },
    "userId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "validationStatus": {
      "type": [
        "integer",
        "null"
      ],
      "description": "1 Unknown, 2 Invalid, 3 Valid."
    },
    "version": {
      "type": "integer"
    },
    "created": {
      "type": "string"
    },
    "updated": {
      "type": "string"
    }
  },
  "required": [
    "agentTemplates",
    "configType",
    "description",
    "documentation",
    "icon",
    "image",
    "inputParameters",
    "id",
    "isActive",
    "lastActivity",
    "name",
    "proxyPoolId",
    "spaceId",
    "startUrl",
    "status",
    "userId",
    "validationStatus",
    "version",
    "created",
    "updated"
  ]
}
```
