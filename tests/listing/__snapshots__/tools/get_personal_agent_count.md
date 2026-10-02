# get_personal_agent_count

Title: Get Personal Agent Count

## Annotations

```json
{
  "title": "Get Personal Agent Count",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get the number of agents in the user's personal space as a single total. The Control Center lists these under 'Personal' — they belong to no space. USE THIS for any question about how many agents are in the personal space — do NOT call list_agents and count the results yourself. Answers: 'How many agents do I have in Personal?', 'What is my personal agent count?'. Returns: An object with totalCount, the number of personal agents. IMPORTANT: 'Personal' is NOT a space and has no spaceId, so get_space_agent_count and search_space_by_name cannot be used for it, and list_agents rejects spaceId=0 as invalid. The total excludes archived agents and counts only agents.

## inputSchema

```json
{
  "type": "object",
  "properties": {},
  "required": []
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
