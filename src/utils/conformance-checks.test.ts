import { describe, it, expect } from "vitest";
import { judgeScenario, type CheckRecord } from "./conformance-checks.js";
import statelessFixture from "../../tests/fixtures/conformance/server-stateless.checks.json";
import cachingFixture from "../../tests/fixtures/conformance/caching.checks.json";

function ok(id: string): CheckRecord {
  return { id, status: "SUCCESS" };
}
function fail(id: string, errorMessage = "assertion failed"): CheckRecord {
  return { id, status: "FAILURE", errorMessage };
}
function notTestable(id: string): CheckRecord {
  return fail(id, `Not testable: server does not list the diagnostic tool 'test_x' in tools/list`);
}

describe("judgeScenario: core rules", () => {
  it("skips FAILURE checks whose message starts with 'Not testable:' and passes", () => {
    const v = judgeScenario([ok("a"), notTestable("b")]);
    expect(v.passed).toBe(true);
    expect(v.notTestable).toEqual(["b"]);
    expect(v.failed).toEqual([]);
    expect(v.succeeded).toBe(1);
  });

  it("allows FAILURE checks whose id is on the allowlist and passes", () => {
    const v = judgeScenario([ok("a"), fail("b")], ["b"]);
    expect(v.passed).toBe(true);
    expect(v.allowed).toEqual(["b"]);
    expect(v.failed).toEqual([]);
  });

  it("fails on any other FAILURE and names it in failed and reasons", () => {
    const v = judgeScenario([ok("a"), fail("b", "boom")]);
    expect(v.passed).toBe(false);
    expect(v.failed).toEqual(["b"]);
    expect(v.reasons.join("\n")).toContain("b");
    expect(v.reasons.join("\n")).toContain("boom");
  });

  it("never fails on WARNING or INFO, and lists warnings", () => {
    const v = judgeScenario([
      ok("a"),
      { id: "w", status: "WARNING", errorMessage: "should but did not" },
      { id: "i", status: "INFO" },
    ]);
    expect(v.passed).toBe(true);
    expect(v.warnings).toEqual(["w"]);
    expect(v.failed).toEqual([]);
  });

  it("prefers the not-testable rule over the allowlist", () => {
    const v = judgeScenario([ok("a"), notTestable("b")], ["b"]);
    expect(v.notTestable).toEqual(["b"]);
    expect(v.allowed).toEqual([]);
  });
});

describe("judgeScenario: scenario-level guards", () => {
  it("marks an allowlisted id that now passes as stale and fails the scenario", () => {
    const v = judgeScenario([ok("a"), ok("b")], ["b"]);
    expect(v.passed).toBe(false);
    expect(v.stale).toEqual(["b"]);
    expect(v.reasons.join("\n")).toMatch(/stale/i);
    expect(v.reasons.join("\n")).toContain("b");
  });

  it("marks an allowlisted id absent from the records as stale and fails the scenario", () => {
    const v = judgeScenario([ok("a")], ["ghost"]);
    expect(v.passed).toBe(false);
    expect(v.stale).toEqual(["ghost"]);
  });

  it("does not mark an allowlisted id stale when its FAILURE is not testable", () => {
    const v = judgeScenario(
      [ok("a"), fail("b", "Not testable: server does not list the diagnostic tool 'x'")],
      ["b"]
    );
    expect(v.stale).toEqual([]);
    expect(v.notTestable).toEqual(["b"]);
    expect(v.passed).toBe(true);
  });

  it("fails when there are zero SUCCESS checks even with no FAILURE", () => {
    const v = judgeScenario([{ id: "w", status: "WARNING" }]);
    expect(v.passed).toBe(false);
    expect(v.succeeded).toBe(0);
    expect(v.reasons.join("\n")).toMatch(/no check succeeded/i);
  });

  it("fails on an empty record list", () => {
    const v = judgeScenario([]);
    expect(v.passed).toBe(false);
  });

  it("allows every record of a duplicated allowlisted id", () => {
    const v = judgeScenario([ok("a"), fail("dup", "first"), fail("dup", "second")], ["dup"]);
    expect(v.passed).toBe(true);
    expect(v.allowed).toEqual(["dup", "dup"]);
    expect(v.failed).toEqual([]);
  });

  it("fails the scenario on an unknown status value", () => {
    const bogus = { id: "b", status: "BOGUS" as unknown as CheckRecord["status"] };
    const v = judgeScenario([ok("a"), bogus]);
    expect(v.passed).toBe(false);
    expect(v.failed).toEqual(["b"]);
    expect(v.reasons.join("\n")).toMatch(/unknown status/i);
  });
});

describe("judgeScenario: real CLI output captured against this server", () => {
  it("passes server-stateless with only not-testable failures", () => {
    const v = judgeScenario(statelessFixture as CheckRecord[]);
    expect(v.passed).toBe(true);
    expect(v.failed).toEqual([]);
    expect(v.notTestable.length).toBeGreaterThan(0);
    expect(v.notTestable.length).toBe(
      statelessFixture.filter((c) => c.status === "FAILURE").length
    );
    expect(v.succeeded).toBeGreaterThan(20);
  });

  it("passes caching only with the resources/read check allowlisted", () => {
    const withAllowlist = judgeScenario(cachingFixture as CheckRecord[], [
      "sep-2549-resources-read-caching-hints",
    ]);
    expect(withAllowlist.passed).toBe(true);
    expect(withAllowlist.allowed).toEqual(["sep-2549-resources-read-caching-hints"]);

    const withoutAllowlist = judgeScenario(cachingFixture as CheckRecord[]);
    expect(withoutAllowlist.passed).toBe(false);
    expect(withoutAllowlist.failed).toEqual(["sep-2549-resources-read-caching-hints"]);
  });
});
