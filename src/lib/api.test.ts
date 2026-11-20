import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEmailExists } from "./api";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkEmailExists", () => {
  it("reads the boolean exists flag from the typed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ valid: true, exists: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkEmailExists("Ada@Example.com")).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/check-email?email=Ada%40Example.com",
    );
  });

  it("returns false when the address is not registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ valid: true, exists: false })),
    );

    await expect(checkEmailExists("nobody@example.com")).resolves.toBe(false);
  });
});
