import { fail, readBody, sendJson } from "./http.mjs";
import { normalizeInsights } from "./insights.mjs";
import { requireExistingUser } from "./views.mjs";

/** Private daily check-in storage. No team or cross-user access is possible. */
export function createInsightRoutes({ store, responses }) {
  function getInsights(req, res, auth) {
    const db = store.get();
    const user = requireExistingUser(
      db,
      auth.user.id,
      401,
      "Your account is no longer available.",
    );
    sendJson(res, 200, {
      ok: true,
      insights: normalizeInsights(db.insights?.[user.id]),
    });
  }

  async function saveInsights(req, res, auth, clientId) {
    const body = await readBody(req);
    if (!body.insights || typeof body.insights !== "object") {
      fail(400, "A valid check-in is required.");
    }
    const next = normalizeInsights(body.insights);

    await store.mutate((db) => {
      const user = requireExistingUser(
        db,
        auth.user.id,
        401,
        "Your account is no longer available.",
      );
      db.insights ??= {};
      db.insights[user.id] = next;
    });

    responses.commitAndNotify(res, {
      targets: [auth.user.id],
      exceptClientId: clientId,
      status: 200,
      payload: { insights: next },
      withRevision: true,
    });
  }

  return { getInsights, saveInsights };
}
