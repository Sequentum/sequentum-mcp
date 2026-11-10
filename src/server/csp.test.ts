import { describe, it, expect } from "vitest";
import { API_CONTENT_SECURITY_POLICY } from "./csp.js";

describe("API_CONTENT_SECURITY_POLICY (IT-2272)", () => {
  it("is the locked-down API value: load nothing, frame nowhere, no base or form targets", () => {
    // Pinned verbatim: this is the value agreed in IT-2272 to clear Qualys QID 48001,
    // plus base-uri and form-action, which default-src does not cover.
    expect(API_CONTENT_SECURITY_POLICY).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
  });
});
