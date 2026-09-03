import { describe, it, expect, vi } from "vitest";
import {
  createResourceScopesSource,
  RESOURCE_SCOPES_TTL_MS,
  RESOURCE_SCOPES_REFETCH_COOLDOWN_MS,
} from "./resource-scopes.js";
import { SUPPORTED_SCOPES } from "./oauth-metadata.js";

const API = "https://api.example.test";

function metaResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createResourceScopesSource", () => {
  it("serves the SUPPORTED_SCOPES fallback synchronously before any fetch has landed", () => {
    // No fetch has resolved yet (the mock never settles), so getScopes() must still return
    // immediately with the fallback rather than waiting on the background fetch it kicks off.
    const fetchFn = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    expect(source.getScopes()).toEqual([...SUPPORTED_SCOPES]);
  });

  it("fetches from {apiBaseUrl}/api/oauth/resource-metadata", async () => {
    const fetchFn = vi.fn().mockResolvedValue(metaResponse({ scopes_supported: ["agents:read"] }));
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(fetchFn).toHaveBeenCalledWith(`${API}/api/oauth/resource-metadata`, expect.anything());
  });

  it("adopts the upstream list, appending offline_access, after a successful refresh", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      metaResponse({ scopes_supported: ["agents:read", "agents:write", "runs:read", "spaces:read", "spaces:write", "billing:read"] })
    );
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(source.getScopes()).toEqual([
      "agents:read",
      "agents:write",
      "runs:read",
      "spaces:read",
      "spaces:write",
      "billing:read",
      "offline_access",
    ]);
  });

  it("de-duplicates if the upstream document ever includes offline_access itself", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      metaResponse({ scopes_supported: ["agents:read", "offline_access"] })
    );
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(source.getScopes()).toEqual(["agents:read", "offline_access"]);
  });

  it("ignores a non-2xx response and keeps the fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValue(metaResponse({ scopes_supported: ["agents:read"] }, 500));
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(source.getScopes()).toEqual([...SUPPORTED_SCOPES]);
  });

  it("ignores a non-JSON body and keeps the fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response("not json", { status: 200, headers: { "content-type": "text/plain" } })
    );
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(source.getScopes()).toEqual([...SUPPORTED_SCOPES]);
  });

  it("ignores a response missing scopes_supported and keeps the fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValue(metaResponse({ resource: API }));
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(source.getScopes()).toEqual([...SUPPORTED_SCOPES]);
  });

  it("ignores an empty scopes_supported array and keeps the fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValue(metaResponse({ scopes_supported: [] }));
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(source.getScopes()).toEqual([...SUPPORTED_SCOPES]);
  });

  it("ignores non-string entries in scopes_supported and keeps the fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValue(metaResponse({ scopes_supported: ["agents:read", 5, null] }));
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await source.refresh();

    expect(source.getScopes()).toEqual([...SUPPORTED_SCOPES]);
  });

  it("keeps the last good list when a later refresh fails", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(metaResponse({ scopes_supported: ["agents:read"] }))
      .mockRejectedValueOnce(new Error("network down"));
    let clock = 1_000_000;
    const source = createResourceScopesSource(API, {
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => clock,
    });

    await source.refresh();
    expect(source.getScopes()).toEqual(["agents:read", "offline_access"]);

    clock += RESOURCE_SCOPES_TTL_MS + 1;
    await source.refresh();

    expect(source.getScopes()).toEqual(["agents:read", "offline_access"]);
  });

  it("swallows a rejected/aborted fetch without throwing", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("aborted"));
    const source = createResourceScopesSource(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await expect(source.refresh()).resolves.toBeUndefined();
    expect(source.getScopes()).toEqual([...SUPPORTED_SCOPES]);
  });

  it("getScopes() does not await: a stale list still returns synchronously while a background refresh runs", async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchFn = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve))
    );
    let clock = 1_000_000;
    const source = createResourceScopesSource(API, {
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => clock,
    });

    // Force staleness so getScopes() below triggers a background fetch.
    clock += RESOURCE_SCOPES_TTL_MS + 1;
    const result = source.getScopes();

    // Returned immediately, synchronously, with the fallback -- the in-flight fetch has not
    // resolved yet.
    expect(result).toEqual([...SUPPORTED_SCOPES]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveFetch(metaResponse({ scopes_supported: ["agents:read"] }));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("triggers at most one in-flight background fetch from repeated getScopes() calls", () => {
    let clock = 1_000_000;
    const fetchFn = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));
    const source = createResourceScopesSource(API, {
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => clock,
    });

    clock += RESOURCE_SCOPES_TTL_MS + 1;
    source.getScopes();
    source.getScopes();
    source.getScopes();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not refetch again before the TTL elapses", async () => {
    const fetchFn = vi.fn().mockResolvedValue(metaResponse({ scopes_supported: ["agents:read"] }));
    let clock = 1_000_000;
    const source = createResourceScopesSource(API, {
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => clock,
    });

    await source.refresh();
    source.getScopes();
    source.getScopes();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("honours the refetch cooldown, not just the TTL, before trying again after a failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("down"));
    let clock = 1_000_000;
    const source = createResourceScopesSource(API, {
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => clock,
    });

    await source.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Still within the cooldown: a stale getScopes() must not fire another attempt yet.
    clock += RESOURCE_SCOPES_REFETCH_COOLDOWN_MS - 1;
    source.getScopes();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock += 2;
    source.getScopes();
    await Promise.resolve();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("accepts a custom fallback", () => {
    const fetchFn = vi.fn();
    const source = createResourceScopesSource(API, {
      fetchFn: fetchFn as unknown as typeof fetch,
      fallback: ["custom:scope"],
    });

    expect(source.getScopes()).toEqual(["custom:scope"]);
  });
});
