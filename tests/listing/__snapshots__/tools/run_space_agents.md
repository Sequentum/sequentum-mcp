# run_space_agents

Title: Run Space Agents

## Annotations

```json
{
  "title": "Run Space Agents",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": true
}
```

## Description

Start ALL agents in a space at once (batch operation). Useful for running a group of related agents together. Answers: 'Run all agents in space X', 'Execute the Production folder', 'Start all scrapers in Bot Blocking'. Returns: Summary with totalAgents, agentsStarted, agentsFailed, and individual results. WARNING: This starts multiple agents. Use get_space_agents first to see what will run. ARGUMENT REQUIREMENTS: this tool's arguments are only sufficient when (1) the target URL or domain, (2) the data the user wants extracted, (3) any qualifiers that affect scope (section, filters, language, etc.) are each unambiguous. Arguments derived by analogy from a different site, or reused from a previous request for a different purpose, are not sufficient. When a required detail is absent, ask one consolidated clarifying question covering every gap instead of supplying an invented value.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "spaceId": {
      "type": "number",
      "description": "The unique ID of the space. Get this from list_spaces or search_space_by_name."
    },
    "inputParameters": {
      "type": "string",
      "description": "Optional JSON string of input parameters to pass to ALL agents in the space."
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
    "spaceId": {
      "type": "integer"
    },
    "spaceName": {
      "type": "string"
    },
    "totalAgents": {
      "type": "integer"
    },
    "agentsStarted": {
      "type": "integer"
    },
    "agentsFailed": {
      "type": "integer"
    },
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "agentId": {
            "type": "integer"
          },
          "agentName": {
            "type": "string"
          },
          "success": {
            "type": "boolean"
          },
          "runId": {
            "type": [
              "integer",
              "null"
            ],
            "description": "Null when the agent failed to start."
          },
          "errorMessage": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "agentId",
          "agentName",
          "success",
          "runId",
          "errorMessage"
        ]
      }
    }
  },
  "required": [
    "spaceId",
    "spaceName",
    "totalAgents",
    "agentsStarted",
    "agentsFailed",
    "results"
  ]
}
```
