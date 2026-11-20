import { sendJson } from "./http.mjs";
import { getUser, sessionPayload } from "./views.mjs";

export function createResponses({ store, broadcast }) {
  /** Every successful sign-in-like response has the same token/session shape. */
  function sendSession(res, status, token, userId) {
    const db = store.get();
    sendJson(res, status, {
      token,
      session: sessionPayload(db, getUser(db, userId)),
    });
  }

  /** Notify affected clients once, then answer the mutating request. */
  function commitAndNotify(
    res,
    {
      targets,
      exceptClientId = "",
      status = 200,
      payload = {},
      withRevision = false,
    },
  ) {
    broadcast(targets, exceptClientId);
    sendJson(res, status, {
      ok: true,
      ...payload,
      ...(withRevision ? { revision: store.get().revision } : {}),
    });
  }

  return { sendSession, commitAndNotify };
}
