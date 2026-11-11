# start_agent_build

Title: Build Agent from Prompt

## Annotations

```json
{
  "title": "Build Agent from Prompt",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": true
}
```

## Description

Start a new AI-powered agent building session from a natural language prompt. By default (waitForCompletion=true), this call waits for the build to finish and returns the agentId directly — no polling required. Unlike start_agent (which defaults to async because run durations vary widely), start_agent_build defaults to sync because builds typically complete in 1-2 minutes. The agent is saved to your workspace as soon as the AI creates it. Set waitForCompletion=false to get the sessionId immediately and poll manually via get_agent_build_status. If the build times out (>5 minutes), the build is still running — the response will include the sessionId so you can check status manually via get_agent_build_status. Note: clients should set a tool-call timeout > 5 min or enable resetTimeoutOnProgress, as the default MCP SDK timeout (60s) may expire before the build completes on slow sites. Optionally call stop_agent_build to abort early while still in 'processing'. If spaceName is known, resolve it to a spaceId via search_space_by_name first. The result also carries `plan`: what the build set out to deliver, written after one look at the page. Each plan line has a provenance: 'user' (the request said it), 'site' (seen on the page), 'assumption' or 'default' (a choice the build made without asking). When the build finishes it carries `report`: each plan line graded met, partial or unmet with evidence, and up to 3 `questions` for the user, each with suggested `replies` whose first entry is the choice the build already made. The build never pauses for an answer. There is no call that applies an answer to a finished build: a different answer needs a new start_agent_build whose prompt includes it. `partial: true` means the build stopped early but delivered a working Agent; `summary` then says what is missing. ARGUMENT REQUIREMENTS: this tool's arguments are only sufficient when (1) the target URL or domain, (2) the data the user wants extracted, (3) any qualifiers that affect scope (section, filters, language, etc.) are each unambiguous. Arguments derived by analogy from a different site, or reused from a previous request for a different purpose, are not sufficient. When a required detail is absent, ask one consolidated clarifying question covering every gap instead of supplying an invented value. PROMPT-HANDLING POLICY: (1) Pass the user's wording (and any clarification answers from earlier in the conversation) through verbatim. (2) Trivial normalizations (adding 'https://', fixing an obvious URL typo) are fine. (3) Do NOT invent details the user did not state — extra fields, output formats, price-handling rules, lazy-load instructions, pagination strategies, etc. The upstream Sequentum Agent Builder pipeline will infer these on its own from the page; do not pre-empt it. If a detail feels essential to include, that is a sufficiency gap — ask one clarifying question instead of inventing.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "The user's automation request, passed through as closely as possible to their original wording. Do not add fields, formatting rules, or scraping techniques the user did not mention. Must be between 10 and 5000 characters (trimmed). Example: user says 'get product names and prices from example.com/shop/shoes' → send 'get product names and prices from https://example.com/shop/shoes'.",
      "minLength": 10,
      "maxLength": 5000
    },
    "spaceId": {
      "type": "number",
      "description": "Optional space ID to associate the agent with. Use search_space_by_name to get the ID from a name. If omitted, the default space is used."
    },
    "waitForCompletion": {
      "type": "boolean",
      "description": "If true (default), wait for the build to complete and return the agentId directly in a single call (up to ~5 minutes). If false, return the sessionId immediately for manual polling via get_agent_build_status."
    }
  },
  "required": [
    "prompt"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "description": "completed, ready or timeout. Absent when waitForCompletion is false."
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
    "message": {
      "type": "string",
      "description": "Present only on timeout."
    }
  },
  "required": [
    "sessionId"
  ]
}
```
