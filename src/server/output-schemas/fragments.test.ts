import { describe, expect, it } from "vitest";
import { AgentSchedule, Space, SpaceAgent, UpcomingSchedule, SCHEDULE_QA_ONLY_KEYS, SPACE_AGENT_QA_ONLY_KEYS, SPACE_QA_ONLY_KEYS, UPCOMING_QA_ONLY_KEYS } from "./fragments.js";

// Production's Control Center lags QA; fields only QA sends must stay optional or the tools
// that return them would fail in production (swagger comparison, 2026-10-02).
describe("QA-only fields are optional", () => {
  it.each([
    ["AgentSchedule", AgentSchedule, SCHEDULE_QA_ONLY_KEYS],
    ["UpcomingSchedule", UpcomingSchedule, UPCOMING_QA_ONLY_KEYS],
    ["Space", Space, SPACE_QA_ONLY_KEYS],
    ["SpaceAgent", SpaceAgent, SPACE_AGENT_QA_ONLY_KEYS],
  ] as const)("%s", (_name, schema, keys) => {
    const required = schema.required as string[];
    for (const key of keys) {
      expect(Object.keys(schema.properties as object)).toContain(key);
      expect(required).not.toContain(key);
    }
  });
});
