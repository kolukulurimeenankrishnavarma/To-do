import { sendJson } from "./http.mjs";
import { findSessionByToken } from "./sessions.mjs";

/** Owns the live client registry and all change broadcasts. */
export function createEvents({ store }) {
  const clients = new Set();

  function removeClient(client) {
    if (client.heartbeat) clearInterval(client.heartbeat);
    clients.delete(client);
  }

  function broadcast(userIds, exceptClientId = "") {
    if (typeof userIds === "string") userIds = [userIds];
    const targets = new Set(userIds.filter(Boolean));
    if (targets.size === 0) return;

    const data = JSON.stringify({ revision: store.get().revision });
    for (const client of clients) {
      if (!targets.has(client.userId)) continue;
      if (exceptClientId && client.clientId === exceptClientId) continue;
      try {
        client.res.write(`event: change\ndata: ${data}\n\n`);
      } catch {
        removeClient(client);
      }
    }
  }

  function broadcastAll() {
    broadcast([...clients].map((client) => client.userId));
  }

  function openEvents(req, res, url) {
    const db = store.get();
    const found = findSessionByToken(db, url.searchParams.get("token") ?? "");

    if (!found) {
      sendJson(res, 401, { error: "Sign in to receive live updates." });
      return;
    }
    if (!found.user) {
      sendJson(res, 401, { error: "This account is no longer available." });
      return;
    }
    const user = found.user;

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 2000\n\n");
    res.write(
      `event: ready\ndata: ${JSON.stringify({
        revision: db.revision,
      })}\n\n`,
    );

    const client = {
      res,
      userId: user.id,
      clientId: url.searchParams.get("client") ?? "",
      heartbeat: null,
    };
    client.heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        removeClient(client);
      }
    }, 25_000);
    clients.add(client);

    const cleanup = () => removeClient(client);
    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  }

  function close() {
    for (const client of clients) {
      removeClient(client);
      try {
        client.res.end();
      } catch {
        // Ignore closed connections.
      }
    }
    clients.clear();
  }

  return { broadcast, broadcastAll, openEvents, close };
}
