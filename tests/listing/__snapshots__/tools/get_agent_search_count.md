# get_agent_search_count

Title: Get Agent Search Count

## Annotations

```json
{
  "title": "Get Agent Search Count",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get the exact number of agents matching a search term, as a single total. USE THIS for any question about how many agents match a name or description — do NOT call search_agents and count the results, which returns at most 50 matches by default. Answers: 'How many agents have checkout in the name?', 'How many scrapers match X?'. Returns: An object with totalCount, the number of matching agents. Matched the same way as search_agents — names and descriptions, case-insensitive — and never capped, so with includeArchived left false this equals what search_agents would return if its limit were high enough.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search term to match against agent names and descriptions. Case-insensitive."
    },
    "includeArchived": {
      "type": "boolean",
      "description": "Include archived agents in the count. Default: false."
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
    "totalCount": {
      "type": "integer"
    }
  },
  "required": [
    "totalCount"
  ]
}
```
