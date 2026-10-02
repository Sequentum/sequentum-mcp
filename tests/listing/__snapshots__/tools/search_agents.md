# search_agents

Title: Search Agents

## Annotations

```json
{
  "title": "Search Agents",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Search for agents by name or description (case-insensitive partial match). FASTER than list_agents when user mentions a specific agent name. Answers: 'Find the Amazon scraper', 'Which agent handles product data?', 'Search for pricing agents'. Returns: An object with agents (matching agents with id, name, status, configType), plus returned, limit and truncated. TRUNCATION: At most 50 matches are returned unless you raise maxRecords. When truncated is true, the page came back full, so more agents may match than are listed. NEVER count this array to answer 'how many agents match' — use get_agent_search_count for the exact number. TIP: Prefer this over list_agents when user mentions an agent by name.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search term to match against agent names and descriptions. Case-insensitive."
    },
    "maxRecords": {
      "type": "number",
      "description": "Maximum results to return. Default: 50, Max: 1000. A smaller value silently returns fewer matches, so never use it when totals matter — use get_agent_search_count instead."
    }
  },
  "required": [
    "query"
  ]
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
    "returned": {
      "type": "integer"
    },
    "limit": {
      "type": "integer"
    },
    "truncated": {
      "type": "boolean"
    },
    "note": {
      "type": "string",
      "description": "Present only when truncated is true."
    }
  },
  "required": [
    "agents",
    "returned",
    "limit",
    "truncated"
  ]
}
```
