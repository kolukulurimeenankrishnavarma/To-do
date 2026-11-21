import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Deterministic synthetic fixtures. The templates, cadences, categories and
 * shift reasons come from the supplied "To-Do List DataSet - Sheet1.pdf";
 * the PDF itself is deliberately not copied into the repository.
 */

const VERBS = [
  "Review",
  "Deploy",
  "Analyze",
  "Migrate",
  "Design",
  "Implement",
  "Audit",
  "Automate",
  "Optimize",
  "Refactor",
];
const OBJECTS = [
  "Database Indexing",
  "Dashboard UI",
  "API Gateway",
  "User Onboarding Flow",
  "Cloud Storage Cluster",
  "Billing Pipeline",
  "Auth Service",
  "Security Patch",
  "Quarterly Audit Report",
  "Performance Profiling",
];
const CATEGORIES = [
  "Quality Assurance",
  "Data Engineering & AI",
  "Finance & Compliance",
  "Operations",
  "Software Engineering",
  "Product Design",
  "DevOps & Infrastructure",
  "Marketing & Content",
];
const CADENCES = ["None", "Daily", "Weekly", "Bi-weekly", "Monthly"];
const REASONS = [
  "Dependency Block",
  "Scope Expansion",
  "Resource Reallocation",
  "Technical Roadblock",
  "Client Feedback Delay",
];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const DAY_MS = 86_400_000;
const BASE_DATE = Date.UTC(2025, 0, 1);

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function titleKey(title) {
  return title
    .replace(/#\d+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function taskFor(index, random, state) {
  const verb = pick(random, VERBS);
  const object = pick(random, OBJECTS);
  const title = `${verb} ${object} #${String(index + 1).padStart(3, "0")}`;
  const createdAt = BASE_DATE + Math.floor(random() * 180) * DAY_MS;
  const leadDays = 3 + Math.floor(random() * 19);
  const deadline = createdAt + leadDays * DAY_MS;
  const duration = leadDays + Math.floor(random() * 7) - 2;
  const completedAt = deadline + (random() < 0.36 ? Math.ceil(random() * 6) : -Math.ceil(random() * 4)) * DAY_MS;
  const completed = state === "history";

  return {
    id: `synthetic_${state}_${index + 1}`,
    title,
    createdAt,
    deadline,
    assigneeId: null,
    progress: completed ? 100 : [0, 25, 50, 75][Math.floor(random() * 4)],
    progressLog: [],
    ...(completed ? { completedAt } : {}),
    meta: {
      category: pick(random, CATEGORIES),
      priority: pick(random, PRIORITIES),
      cadence: pick(random, CADENCES),
      shiftReason: pick(random, REASONS),
      actualDurationDays: Math.max(1, duration),
    },
  };
}

const count = Math.max(20, Math.min(5000, Number(process.argv[2] ?? 200)));
const seed = Number(process.argv[3] ?? 20250101);
const random = mulberry32(seed);

const tasks = [];
const history = [];
for (let index = 0; index < count; index += 1) {
  const target = random() < 0.35 ? history : tasks;
  target.push(taskFor(index, random, target === history ? "history" : "tasks"));
}

for (let index = 0; index < 6; index += 1) {
  const title = `Review ${OBJECTS[index % OBJECTS.length]} #${index + 1}`;
  const completedAt = BASE_DATE + (40 + index * 7) * DAY_MS;
  history.push({
    id: `synthetic_recurring_${index + 1}`,
    title,
    createdAt: completedAt - 6 * DAY_MS,
    deadline: completedAt,
    assigneeId: null,
    progress: 100,
    progressLog: [],
    completedAt,
  });
}

const recurringRules = ["Daily", "Weekly", "Bi-weekly", "Monthly"].map(
  (cadence, index) => {
    const intervalMs = [1, 7, 14, 30][index] * DAY_MS;
    const title = `Review ${OBJECTS[index]} #${index + 1}`;
    return {
      id: `synthetic_rule_${index + 1}`,
      titleKey: titleKey(title),
      title: `Review ${OBJECTS[index]}`,
      cadence: cadence.toLowerCase(),
      intervalMs,
      lastCreatedAt: BASE_DATE + (120 + index * 7) * DAY_MS,
      createdAt: BASE_DATE + 100 * DAY_MS,
      sourceTaskIds: [`synthetic_recurring_${index + 1}`],
      targetTeamId: null,
      enabled: true,
    };
  },
);

const insights = {
  version: 1,
  checkIn: {
    energy: 3,
    mood: 4,
    focus: 3,
    timeWindow: 60,
    goal: "finish the API migration",
    blockers: "waiting on client feedback",
    createdAt: BASE_DATE + 150 * DAY_MS,
  },
  recurringRules,
  dismissedNudges: [],
  updatedAt: BASE_DATE + 150 * DAY_MS,
};

const outputDir = path.resolve(process.cwd(), "data", "synthetic");
await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "tasks.json"),
  `${JSON.stringify({ tasks, history }, null, 2)}\n`,
);
await writeFile(
  path.join(outputDir, "insights.json"),
  `${JSON.stringify(insights, null, 2)}\n`,
);

console.log(
  `Wrote ${tasks.length} open and ${history.length} completed synthetic tasks to ${outputDir}`,
);
