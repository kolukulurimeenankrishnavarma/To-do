import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fail } from "./http.mjs";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Serves the built single-page app, with the SPA fallback for HTML routes. */
export function createStaticFiles({ dist }) {
  async function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      fail(405, "Method not allowed.");
    }

    let relative = url.pathname === "/" ? "index.html" : url.pathname;
    try {
      relative = decodeURIComponent(relative);
    } catch {
      fail(400, "Invalid path.");
    }
    relative = relative.replace(/^\/+/, "");

    let filePath = path.resolve(dist, relative);
    if (filePath !== dist && !filePath.startsWith(`${dist}${path.sep}`)) {
      fail(403, "Forbidden.");
    }

    let stat = null;
    try {
      stat = await fs.stat(filePath);
    } catch {
      stat = null;
    }

    if (!stat || stat.isDirectory()) {
      const acceptsHtml = String(req.headers.accept ?? "").includes("text/html");
      if (!acceptsHtml) fail(404, "Not found.");
      filePath = path.join(dist, "index.html");
      try {
        stat = await fs.stat(filePath);
      } catch {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(
          "Taskly API is running. Build the web app first with `npm run build`, then restart the server.",
        );
        return;
      }
    }

    const type =
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stat.size,
      "Cache-Control": filePath.endsWith("index.html")
        ? "no-store"
        : "public, max-age=31536000, immutable",
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    createReadStream(filePath)
      .on("error", () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      })
      .pipe(res);
  }

  return { serveStatic };
}
