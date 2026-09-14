/**
 * Check-level verdict for one run of a conformance scenario.
 *
 * The official CLI's `--expected-failures` baseline is scenario-level: listing a
 * scenario there silences every check in it. This module judges the per-check
 * records the CLI writes to `checks.json` (with `-o <dir>`), so a scenario whose
 * only failures are "Not testable" probes, or a single documented allowlisted
 * check, still guards every other check as a regression.
 *
 * Pure: no I/O. The runner in scripts/conformance.mjs reads the file and reports.
 *
 * The status set below is trusted from the pinned CLI version and must be re-checked
 * whenever that pin is bumped.
 */

export type CheckStatus = "SUCCESS" | "FAILURE" | "WARNING" | "INFO";

/** One record from checks.json. Extra fields (name, description, ...) are ignored. */
export interface CheckRecord {
  id: string;
  status: CheckStatus;
  errorMessage?: string;
  [extra: string]: unknown;
}

export interface ScenarioVerdict {
  /** True only when `failed` and `stale` are empty and `succeeded > 0`. */
  passed: boolean;
  /** Count of SUCCESS records. */
  succeeded: number;
  /** FAILURE ids that count against the scenario. */
  failed: string[];
  /** FAILURE ids skipped because the CLI could not exercise them against this server. */
  notTestable: string[];
  /** FAILURE ids tolerated because they are on the allowlist. */
  allowed: string[];
  /** Allowlisted ids with no FAILURE record; the entry is obsolete and must be removed. */
  stale: string[];
  /** WARNING ids, informational only. */
  warnings: string[];
  /** Human-readable lines explaining why `passed` is false. Empty when it passes. */
  reasons: string[];
}

/** The CLI prefixes a FAILURE with this when the server lacks the diagnostic fixture. */
export const NOT_TESTABLE_PREFIX = "Not testable:";

export function judgeScenario(
  checks: CheckRecord[],
  allowlist: readonly string[] = []
): ScenarioVerdict {
  const allowed = new Set(allowlist);
  const verdict: ScenarioVerdict = {
    passed: false,
    succeeded: 0,
    failed: [],
    notTestable: [],
    allowed: [],
    stale: [],
    warnings: [],
    reasons: [],
  };

  for (const check of checks) {
    switch (check.status) {
      case "SUCCESS":
        verdict.succeeded += 1;
        break;
      case "WARNING":
        verdict.warnings.push(check.id);
        break;
      case "INFO":
        break;
      case "FAILURE":
        if ((check.errorMessage ?? "").startsWith(NOT_TESTABLE_PREFIX)) {
          verdict.notTestable.push(check.id);
        } else if (allowed.has(check.id)) {
          verdict.allowed.push(check.id);
        } else {
          verdict.failed.push(check.id);
          verdict.reasons.push(`FAILURE ${check.id}: ${check.errorMessage ?? "(no message)"}`);
        }
        break;
      default: {
        verdict.failed.push(check.id);
        verdict.reasons.push(`Unknown status "${String(check.status)}" for ${check.id}`);
        const _exhaustive: never = check.status;
        break;
      }
    }
  }

  // An allowlist entry is only justified while the CLI still reports a FAILURE
  // for it. Any status other than FAILURE, or no record at all, means the entry
  // has rotted and must be removed, mirroring the CLI's own baseline behaviour.
  const failureIds = new Set(
    checks.filter((c) => c.status === "FAILURE").map((c) => c.id)
  );
  for (const id of allowlist) {
    if (!failureIds.has(id)) {
      verdict.stale.push(id);
      verdict.reasons.push(
        `Stale allowlist entry ${id}: no FAILURE record; remove it from the allowlist`
      );
    }
  }

  // A run in which nothing succeeded is a misconfiguration (wrong URL, wrong
  // scenario name, every check skipped), never a pass.
  if (verdict.succeeded === 0) {
    verdict.reasons.push("No check succeeded; the scenario did not exercise the server");
  }

  verdict.passed =
    verdict.failed.length === 0 && verdict.stale.length === 0 && verdict.succeeded > 0;
  return verdict;
}
