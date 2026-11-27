import { describe, expect, it } from "vitest";
import {
  TOOL_CONFIRMATIONS,
  clientSupportsFormElicitation,
  confirmationGate,
} from "./confirmations.js";
import { tools } from "./tools.js";

const MODERN = "io.modelcontextprotocol/protocolVersion";
const CAPS = "io.modelcontextprotocol/clientCapabilities";
const env = (caps: unknown) => ({ [MODERN]: "2026-07-28", [CAPS]: caps });

describe("TOOL_CONFIRMATIONS", () => {
  it("covers exactly the destructiveHint tools", () => {
    expect(Object.keys(TOOL_CONFIRMATIONS).sort()).toEqual(
      tools
        .filter((t) => t.annotations?.destructiveHint)
        .map((t) => t.name)
        .sort()
    );
  });

  it("describes delete_run per removeMethod", () => {
    expect(TOOL_CONFIRMATIONS.delete_run({ agentId: 44, runId: 812 })).toBe(
      "Delete run 812 of agent 44 and all its files? This cannot be undone."
    );
    expect(
      TOOL_CONFIRMATIONS.delete_run({ agentId: 44, runId: 812, removeMethod: "RemoveAllFiles" })
    ).toBe("Delete all files of run 812 of agent 44? The run record is kept. This cannot be undone.");
    expect(
      TOOL_CONFIRMATIONS.delete_run({
        agentId: 44,
        runId: 812,
        removeMethod: "RemoveAllFilesAndAgentInput",
      })
    ).toBe(
      "Delete all files and the agent input of run 812 of agent 44? The run record is kept. This cannot be undone."
    );
  });

  it("describes kill_agent and delete_agent_schedule", () => {
    expect(TOOL_CONFIRMATIONS.kill_agent({ agentId: 44, runId: 812 })).toBe(
      "Force-terminate run 812 of agent 44?"
    );
    expect(TOOL_CONFIRMATIONS.delete_agent_schedule({ agentId: 44, scheduleId: 7 })).toBe(
      "Delete schedule 7 of agent 44? The agent will no longer run on it."
    );
  });

  it.each([
    { agentId: 44 },
    { agentId: 44, runId: "abc" },
    { agentId: 0, runId: 1 },
    { agentId: 1.5, runId: 1 },
  ])("returns undefined for invalid ids %j", (args) => {
    expect(TOOL_CONFIRMATIONS.delete_run(args)).toBeUndefined();
    expect(TOOL_CONFIRMATIONS.kill_agent(args)).toBeUndefined();
  });

  it("returns undefined for an invalid scheduleId", () => {
    expect(TOOL_CONFIRMATIONS.delete_agent_schedule({ agentId: 44, scheduleId: "7" })).toBeUndefined();
  });
});

describe("clientSupportsFormElicitation", () => {
  it.each([
    [undefined, false],
    [{ [CAPS]: { elicitation: {} } }, false], // no protocolVersion: not the modern era
    [env({}), false],
    [env(undefined), false],
    [env({ elicitation: {} }), true], // bare object counts as form (pre-mode rule)
    [env({ elicitation: { form: {} } }), true],
    [env({ elicitation: { form: {}, url: {} } }), true],
    [env({ elicitation: { url: {} } }), false],
  ])("%j → %s", (envelope, expected) => {
    expect(clientSupportsFormElicitation(envelope as Record<string, unknown> | undefined)).toBe(
      expected
    );
  });
});

describe("confirmationGate", () => {
  const capable = { envelope: env({ elicitation: {} }) };
  const args = { agentId: 44, runId: 812 };
  const answered = (response: unknown) => ({ ...capable, inputResponses: { confirm: response } });

  it("runs tools without a confirmation", () => {
    expect(confirmationGate("stop_agent", args, capable)).toEqual({ kind: "run" });
  });

  it("runs when the client cannot elicit", () => {
    expect(confirmationGate("delete_run", args, { envelope: env({}) })).toEqual({ kind: "run" });
  });

  it("runs on the legacy era (no envelope)", () => {
    expect(confirmationGate("delete_run", args, {})).toEqual({ kind: "run" });
  });

  it("runs when the ids are invalid", () => {
    expect(confirmationGate("delete_run", { agentId: 44 }, capable)).toEqual({ kind: "run" });
  });

  it("asks on the first call", () => {
    const out = confirmationGate("delete_run", args, capable);
    expect(out.kind).toBe("respond");
    const result = (out as { result: any }).result;
    expect(result.resultType).toBe("input_required");
    expect(result.inputRequests.confirm.method).toBe("elicitation/create");
    expect(result.inputRequests.confirm.params.message).toBe(
      "Delete run 812 of agent 44 and all its files? This cannot be undone."
    );
    expect(result.inputRequests.confirm.params.requestedSchema).toEqual({
      type: "object",
      properties: { confirm: { type: "boolean", title: "Yes, go ahead" } },
      required: ["confirm"],
    });
  });

  it("runs on accept with confirm: true", () => {
    expect(
      confirmationGate("delete_run", args, answered({ action: "accept", content: { confirm: true } }))
    ).toEqual({ kind: "run" });
  });

  it.each([
    { action: "decline" },
    { action: "cancel" },
    { action: "accept", content: { confirm: false } },
    { action: "accept", content: { confirm: "true" } },
    { action: "accept" },
  ])("cancels on %j", (response) => {
    expect(confirmationGate("delete_run", args, answered(response))).toEqual({
      kind: "respond",
      result: {
        content: [
          { type: "text", text: "Cancelled: the user did not confirm Delete Run. Nothing was changed." },
        ],
      },
    });
  });

  it("names the tool in the cancelled text", () => {
    const out = confirmationGate(
      "delete_agent_schedule",
      { agentId: 44, scheduleId: 7 },
      answered({ action: "decline" })
    );
    expect((out as { result: any }).result.content[0].text).toBe(
      "Cancelled: the user did not confirm Delete Agent Schedule. Nothing was changed."
    );
  });
});
