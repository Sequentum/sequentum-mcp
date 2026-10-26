# get_space_agent_count

Title: Get Space Agent Count

## Annotations

```json
{
  "title": "Get Space Agent Count",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get the number of agents in a space as a single total. USE THIS for any question about how many agents a space contains — do NOT call get_space_agents and count the results yourself. Answers: 'How many agents are in space X?', 'What's the total agent count for the Production folder?', 'Does this space have more than 50 agents?'. Returns: An object with totalCount, the number of agents in the space. The total excludes archived agents and counts only agents, matching get_space_agents. NOT FOR PERSONAL: the 'Personal' listing is not a space and has no spaceId — use get_personal_agent_count for it.

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
    "totalCount": {
      "type": "integer"
    }
  },
  "required": [
    "totalCount"
  ]
}
```
