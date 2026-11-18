import { describe, expect, it } from "vitest";
import { publicBase } from "./urls.mjs";

describe("publicBase", () => {
  const request = (headers) => ({ headers });

  it("uses the configured URL exactly when provided", () => {
    expect(
      publicBase(request({ host: "localhost:8787" }), {
        configuredUrl: "https://tasks.example.com/",
      }),
    ).toBe("https://tasks.example.com");
  });

  it("uses the request host for local development", () => {
    expect(publicBase(request({ host: "127.0.0.1:8787" }))).toBe(
      "http://127.0.0.1:8787",
    );
  });

  it("uses forwarded HTTPS headers only when the proxy is trusted", () => {
    const headers = {
      host: "127.0.0.1:10000",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "taskly.onrender.com",
    };

    expect(publicBase(request(headers))).toBe("http://127.0.0.1:10000");
    expect(publicBase(request(headers), { trustProxy: true })).toBe(
      "https://taskly.onrender.com",
    );
  });

  it("handles comma-separated proxy headers and rejects invalid protocols", () => {
    expect(
      publicBase(
        request({
          host: "127.0.0.1:10000",
          "x-forwarded-proto": "https, http",
          "x-forwarded-host": "taskly.onrender.com, other.example.com",
        }),
        { trustProxy: true },
      ),
    ).toBe("https://taskly.onrender.com");

    expect(
      publicBase(
        request({
          host: "taskly.onrender.com",
          "x-forwarded-proto": "javascript",
        }),
        { trustProxy: true },
      ),
    ).toBe("http://taskly.onrender.com");
  });
});
