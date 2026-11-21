import { fail, readBody, sendJson } from "./http.mjs";
import { emptyState } from "./state.mjs";
import { newId } from "./validation.mjs";
import { requireExistingUser } from "./views.mjs";
import {
  classifyRulesForRun,
  emptyInsights,
  normalizeInsights,
  titleKey,
} from "./insights.mjs";

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

export function createInsightRoutes({ store, responses }) {
  function getInsights(req, res, auth) {
    const db = store.get();
    sendJson(
      res,
      200,
      normalizeInsights(db.insights?.[auth.user.id] ?? emptyInsights()),
    );
  }

  async function saveInsights(req, res, auth, clientId) {
    const body = await readBody(req);
    if (!isRecord(body.insights)) {
      fail(400, "Expected an insights object.");
    }

    await store.mutate((db) => {
      requireExistingUser(
        db,
        auth.user.id,
        401,
        "Your account is no longer available.",
      );
      const current = normalizeInsights(db.insights?.[auth.user.id]);
      const incoming = normalizeInsights({
        ...current,
        ...body.insights,
        updatedAt: Date.now(),
      });

      db.insights ??= {};
      db.insights[auth.user.id] = incoming;
    });

    responses.commitAndNotify(res, {
      targets: [auth.user.id],
      exceptClientId: clientId,
    });
  }

  async function runRecurring(req, res, auth, clientId) {
    const result = await store.mutate((db) => {
      requireExistingUser(
        db,
        auth.user.id,
        401,
        "Your account is no longer available.",
      );

      const now = Date.now();
      const current = normalizeInsights(db.insights?.[auth.user.id]);
      const { ready, disabled } = classifyRulesForRun(db, auth.user.id, current);
      const rules = current.recurringRules.map((rule) =>
        disabled.includes(rule.id) ? { ...rule, enabled: false } : rule,
      );
      const byId = new Map(rules.map((rule) => [rule.id, rule]));
      const created = [];
      const targets = new Set([auth.user.id]);

      for (const candidate of ready) {
        const rule = byId.get(candidate.id);
        if (!rule || !rule.enabled) continue;
        if (now - rule.lastCreatedAt < rule.intervalMs) continue;

        let state;
        if (rule.targetTeamId) {
          const team = db.teams.find((entry) => entry.id === rule.targetTeamId);
          if (!team) continue;
          state = team.state;
          for (const member of team.members) targets.add(member.userId);
        } else {
          db.data[auth.user.id] ??= emptyState();
          state = db.data[auth.user.id];
        }

        const duplicates = state.tasks.filter(
          (task) =>
            titleKey(task.title) === rule.titleKey &&
            task.createdAt > rule.lastCreatedAt,
        );
        if (duplicates.length > 0) {
          rule.lastCreatedAt = Math.max(
            ...duplicates.map((task) => task.createdAt),
          );
          continue;
        }

        const task = {
          id: newId("task"),
          title: rule.title,
          createdAt: now,
          deadline: null,
          assigneeId: null,
          progress: 0,
          progressLog: [],
        };
        state.tasks.unshift(task);
        rule.lastCreatedAt = now;
        created.push({
          taskId: task.id,
          title: task.title,
          teamId: rule.targetTeamId,
        });
      }

      db.insights ??= {};
      db.insights[auth.user.id] = {
        ...current,
        recurringRules: rules,
        updatedAt: now,
      };

      return { created, targets: [...targets] };
    });

    responses.commitAndNotify(res, {
      targets: result.targets,
      exceptClientId: clientId,
      withRevision: true,
      payload: { created: result.created, count: result.created.length },
    });
  }

  return { getInsights, saveInsights, runRecurring };
}
