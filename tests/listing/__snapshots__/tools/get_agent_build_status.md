# get_agent_build_status

Title: Get Agent Build Status

## Annotations

```json
{
  "title": "Get Agent Build Status",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Poll the status of an agent building session. Returns { status, agentId?, agentName?, plan?, report?, partial?, summary?, error? }. status: 'processing' (keep polling) | 'ready' | 'completed' | 'error' | 'cancelled'. The result also carries `plan`: what the build set out to deliver, written after one look at the page. Each plan line has a provenance: 'user' (the request said it), 'site' (seen on the page), 'assumption' or 'default' (a choice the build made without asking). When the build finishes it carries `report`: each plan line graded met, partial or unmet with evidence, and up to 3 `questions` for the user, each with suggested `replies` whose first entry is the choice the build already made. The build never pauses for an answer. There is no call that applies an answer to a finished build: a different answer needs a new start_agent_build whose prompt includes it. `partial: true` means the build stopped early but delivered a working Agent; `summary` then says what is missing. `plan` appears while still 'processing', once the builder has seen the page. STOP POLLING on: completed, ready, error, or cancelled — the session tears down automatically. The returned agentId is the permanent workspace ID usable with get_agent, run_agent, schedule tools, and every other endpoint that takes an agentId. POLLING CADENCE: honor any user-expressed preference (e.g., 'poll quickly', 'every N seconds'); otherwise use moderate backoff (~5s start, max ~30s between polls).

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "The session ID returned by start_agent_build."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "processing, ready, completed, error or cancelled."
    },
    "agentId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "agentName": {
      "type": [
        "string",
        "null"
      ]
    },
    "agentElapsedSeconds": {
      "type": [
        "number",
        "null"
      ]
    },
    "browserIoSeconds": {
      "type": [
        "number",
        "null"
      ]
    },
    "partial": {
      "type": "boolean",
      "description": "True when the build stopped early but delivered a working Agent."
    },
    "summary": {
      "type": "string",
      "description": "What the Agent collects and what is missing. Present only when partial is true."
    },
    "schemaCheck": {
      "type": "object",
      "properties": {},
      "required": [],
      "description": "How far the Agent's columns match a requested schema."
    },
    "plan": {
      "type": [
        "object",
        "null"
      ],
      "properties": {
        "version": {
          "type": "integer"
        },
        "target": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string"
            },
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string"
            }
          },
          "required": []
        },
        "item": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string",
              "description": "user, site, assumption or default."
            }
          },
          "required": [],
          "description": "What one row of the result is."
        },
        "fields": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "required": {
                "type": "boolean",
                "description": "True only for a field the user named."
              },
              "source": {
                "type": "string",
                "description": "list (on the listing page) or detail (on each item's own page)."
              },
              "example": {
                "type": [
                  "string",
                  "null"
                ],
                "description": "A value seen on the page."
              },
              "provenance": {
                "type": "string",
                "description": "user, site, assumption or default."
              }
            },
            "required": []
          }
        },
        "scope": {
          "type": "object",
          "properties": {
            "count": {
              "type": [
                "integer",
                "null"
              ]
            },
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string"
            }
          },
          "required": []
        },
        "exclusions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": {
                "type": "string"
              },
              "provenance": {
                "type": "string",
                "description": "user, site, assumption or default."
              }
            },
            "required": []
          }
        },
        "navigation": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": {
                "type": "string"
              },
              "provenance": {
                "type": "string",
                "description": "user, site, assumption or default."
              }
            },
            "required": []
          }
        },
        "output": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string",
              "description": "user, site, assumption or default."
            }
          },
          "required": []
        }
      },
      "required": [],
      "description": "What the build set out to deliver, written after one look at the target page. Lines with provenance 'assumption' or 'default' are guesses the build made without asking. Null until the builder has seen the page."
    },
    "report": {
      "type": [
        "object",
        "null"
      ],
      "properties": {
        "lines": {
          "type": "object",
          "properties": {},
          "required": [],
          "description": "Plan line key (target, item, scope, output, field:{name}, ...) to { status: met|partial|unmet, evidence }."
        },
        "met": {
          "type": "integer"
        },
        "partial": {
          "type": "integer"
        },
        "unmet": {
          "type": "integer"
        },
        "total": {
          "type": "integer"
        },
        "questions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": {
                "type": "string"
              },
              "replies": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "2 or 3 replies; the first is the default the build already used."
              }
            },
            "required": [
              "text"
            ]
          },
          "description": "Up to 3 open questions for the user."
        },
        "reportedAt": {
          "type": "string"
        }
      },
      "required": [],
      "description": "The Plan checked against the finished Agent. Null until a build that wrote a Plan has finished."
    },
    "error": {
      "type": "string",
      "description": "Present only when status is error."
    }
  },
  "required": [
    "status"
  ]
}
```
