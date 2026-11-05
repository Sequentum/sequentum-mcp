import { arrayOf, bool, int, nullable, num, obj, str, type JsonSchema } from "./helpers.js";

// Every Plan property is optional and every nullable one says so: the Control Center mirrors the
// editor server's Plan by hand, and a property it drops must not turn a finished build into an error.
const planLine = (description?: string): JsonSchema =>
  obj({ text: str(), provenance: str("user, site, assumption or default.") }, { optional: ["text", "provenance"], description });

const plan = nullable(
  obj(
    {
      version: int(),
      target: obj({ url: str(), text: str(), provenance: str() }, { optional: ["url", "text", "provenance"] }),
      item: planLine("What one row of the result is."),
      fields: arrayOf(
        obj(
          {
            name: str(),
            required: bool("True only for a field the user named."),
            source: str("list (on the listing page) or detail (on each item's own page)."),
            example: nullable(str("A value seen on the page.")),
            provenance: str("user, site, assumption or default."),
          },
          { optional: ["name", "required", "source", "example", "provenance"] }
        )
      ),
      scope: obj({ count: nullable(int()), text: str(), provenance: str() }, { optional: ["count", "text", "provenance"] }),
      exclusions: arrayOf(planLine()),
      navigation: arrayOf(planLine()),
      output: planLine(),
    },
    {
      optional: ["version", "target", "item", "fields", "scope", "exclusions", "navigation", "output"],
      description:
        "What the build set out to deliver, written after one look at the target page. Lines with provenance " +
        "'assumption' or 'default' are guesses the build made without asking. Null until the builder has seen the page.",
    }
  )
);

const report = nullable(
  obj(
    {
      lines: obj({}, { description: "Plan line key (target, item, scope, output, field:{name}, ...) to { status: met|partial|unmet, evidence }." }),
      met: int(),
      partial: int(),
      unmet: int(),
      total: int(),
      questions: arrayOf(
        obj(
          { text: str(), replies: arrayOf(str(), "2 or 3 replies; the first is the default the build already used.") },
          { optional: ["replies"] }
        ),
        "Up to 3 open questions for the user."
      ),
      reportedAt: str(),
    },
    {
      optional: ["lines", "met", "partial", "unmet", "total", "questions", "reportedAt"],
      description: "The Plan checked against the finished Agent. Null until a build that wrote a Plan has finished.",
    }
  )
);

// The build result fields shared by get_agent_build_status and a finished start_agent_build.
const buildResult: Record<string, JsonSchema> = {
  agentId: nullable(int()),
  agentName: nullable(str()),
  agentElapsedSeconds: nullable(num()),
  browserIoSeconds: nullable(num()),
  partial: bool("True when the build stopped early but delivered a working Agent."),
  summary: str("What the Agent collects and what is missing. Present only when partial is true."),
  schemaCheck: obj({}, { description: "How far the Agent's columns match a requested schema." }),
  plan,
  report,
};
const buildResultKeys = Object.keys(buildResult);

export const buildOutputSchemas: Record<string, JsonSchema> = {
  // Three success shapes share one loose object: { sessionId } when waitForCompletion is false;
  // { status: completed|ready, agentId, agentName, plan, report, ..., sessionId } when the build
  // finished; { status: timeout, sessionId, message } when polling gave up. Cancellation and
  // failures are isError results, which the SDK does not validate.
  start_agent_build: obj(
    {
      sessionId: str(),
      status: str("completed, ready or timeout. Absent when waitForCompletion is false."),
      ...buildResult,
      message: str("Present only on timeout."),
    },
    { optional: ["status", ...buildResultKeys, "message"] }
  ),
  get_agent_build_status: obj(
    {
      status: str("processing, ready, completed, error or cancelled."),
      ...buildResult,
      error: str("Present only when status is error."),
    },
    { optional: [...buildResultKeys, "error"] }
  ),
  stop_agent_build: obj({ stopped: bool(), sessionId: str() }),
};
