import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";

type PageErrorsFixture = { pageErrors: string[] };

/** Each test gets its own error list, including errors from extra tabs. */
const test = base.extend<PageErrorsFixture>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const DB_FILE = path.resolve(process.cwd(), "test-results", "e2e-db.json");

type DbUser = {
  id: string;
  name: string;
  email: string;
  emailKey: string;
  mobile: string;
  mobileKey: string;
  createdAt: number;
};

type DbTask = {
  id: string;
  title: string;
  createdAt: number;
  deadline: number | null;
  assigneeId: string | null;
  progress: number;
  progressLog: {
    value: number;
    at: number;
    note: string;
    by?: string | null;
  }[];
  completedAt?: number;
};

type DbTeam = {
  id: string;
  name: string;
  hostId: string;
  members: { userId: string; role: string; joinedAt: number }[];
  invites: {
    id: string;
    email: string;
    emailKey: string;
    status: string;
  }[];
  state: {
    tasks: DbTask[];
    history: DbTask[];
  };
};

type DbInsights = {
  checkIn?: { energy: number } | null;
  recurringRules?: { id: string; title: string }[];
};

type Db = {
  revision: number;
  users: DbUser[];
  data: Record<string, unknown>;
  teams: DbTeam[];
  insights?: Record<string, DbInsights>;
};

async function readDb(): Promise<Db> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const raw = await readFile(DB_FILE, "utf8");
      return JSON.parse(raw) as Db;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not read the Taskly test database.");
}

async function waitForDb(check: (db: Db) => boolean): Promise<Db> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const db = await readDb();
    if (check(db)) return db;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for the Taskly test database to update.");
}

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post("/api/test/reset");
  expect(reset.ok()).toBe(true);

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await expect(page.locator("#auth-form")).toBeVisible();
});

const DEFAULT_NAME = "E2E User";
const DEFAULT_EMAIL = "e2e@example.com";
const DEFAULT_MOBILE = "555 123 4567";
const DEFAULT_PASSWORD = "password123";

type SignupOptions = {
  name?: string;
  email?: string;
  mobile?: string;
  password?: string;
  country?: string;
};

async function selectCountry(page: Page, query: string) {
  await page.locator("#auth-country-button").click();
  await expect(page.locator("#auth-country-search")).toBeVisible();
  await page.fill("#auth-country-search", query);
  await page.locator("#auth-country-search").press("Enter");
  await expect(page.locator("#auth-country-list")).toHaveCount(0);
}

async function signUp(
  page: Page,
  {
    name = DEFAULT_NAME,
    email = DEFAULT_EMAIL,
    mobile = DEFAULT_MOBILE,
    password = DEFAULT_PASSWORD,
    country,
  }: SignupOptions = {},
) {
  await page.locator("#auth-mode-signup").click();
  await page.fill("#auth-name", name);
  await page.fill("#auth-email", email);
  if (country) await selectCountry(page, country);
  await page.fill("#auth-mobile", mobile);
  await page.fill("#auth-password", password);
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator(".app__title")).toHaveText("Taskly");
}

async function signIn(
  page: Page,
  email = DEFAULT_EMAIL,
  password = DEFAULT_PASSWORD,
) {
  await page.locator("#auth-mode-signin").click();
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator(".app__title")).toHaveText("Taskly");
}

async function logout(page: Page) {
  await page.locator(".app__logout").click();
  await expect(page.locator("#auth-form")).toBeVisible();
}

async function storedState(page: Page, email = DEFAULT_EMAIL) {
  void page;
  const db = await readDb();
  const user = db.users.find((entry) => entry.emailKey === email.toLowerCase());
  return user ? db.data[user.id] : null;
}

async function storedUser(page: Page, email = DEFAULT_EMAIL) {
  void page;
  const db = await readDb();
  return (
    db.users.find((entry) => entry.emailKey === email.toLowerCase()) ?? null
  );
}

async function putTeamState(
  page: Page,
  teamId: string,
  token: string,
  state: DbTeam["state"],
) {
  return page.request.put(`/api/teams/${teamId}/state`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { state },
  });
}

async function storedTeams(page: Page): Promise<DbTeam[]> {
  void page;
  return (await readDb()).teams;
}

async function storedTeam(page: Page, teamId?: string): Promise<DbTeam | null> {
  const teams = await storedTeams(page);
  return (
    (teamId ? teams.find((team) => team.id === teamId) : teams[0]) ?? null
  );
}

async function storedTeamMembers(page: Page, teamId?: string) {
  const team = await storedTeam(page, teamId);
  return {
    members: team?.members ?? [],
    invites: team?.invites ?? [],
  };
}

async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() =>
    sessionStorage.getItem("taskly.server.token"),
  );
  if (!token) throw new Error("No active Taskly session token.");
  return token;
}

async function openTeam(page: Page) {
  await page.locator("#workspace-team").click();
}

async function createTeam(page: Page) {
  await openTeam(page);
  await expect(page.locator("#team-gate")).toBeVisible();
  await page.locator("#team-create-submit").click();
  await expect(page.locator("#team-overview")).toBeVisible();
}

async function inviteByEmail(page: Page, email: string) {
  await page.fill("#team-invite-email", email);
  await page.locator("#team-invite-submit").click();
  await expect(
    page.locator("#team-invite-list .team-invite", { hasText: email }),
  ).toHaveCount(1);
}

async function acceptInvitation(page: Page) {
  await openTeam(page);
  await expect(page.locator("#team-invitation")).toBeVisible();
  await page.locator("#team-invitation-accept").click();
  await expect(page.locator("#team-overview")).toBeVisible();
}

async function openPicker(page: Page) {
  await page.locator("#deadline-trigger").click();
  await expect(page.locator("#deadline-panel")).toBeVisible();
}

async function fillPicker(page: Page, date: string, time: string) {
  await page.fill("#deadline-date", date);
  await page.fill("#deadline-time", time);
}

async function savePicker(page: Page) {
  await page.locator("#deadline-save").click();
  await expect(page.locator("#deadline-panel")).toBeHidden();
}

async function addTask(page: Page, title: string) {
  await page.fill("#task-input", title);
  await page.locator('#task-form button[type="submit"]').click();
  await expect(page.locator("#task-list .item", { hasText: title })).toHaveCount(
    1,
  );

  // Wait for the queued save so a reload or another tab cannot race it.
  await waitForDb((db) =>
    [...Object.values(db.data), ...db.teams.map((team) => team.state)].some(
      (state) => {
        const tasks = (state as { tasks?: { title: string }[] }).tasks ?? [];
        return tasks.some((task) => task.title === title);
      },
    ),
  );
}

async function addTaskWithDeadline(
  page: Page,
  title: string,
  date: string,
  time: string,
) {
  await openPicker(page);
  await fillPicker(page, date, time);
  await savePicker(page);
  await addTask(page, title);
}

async function setProgress(item: Locator, value: number) {
  await item.locator(".progress__slider").evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;

    setter?.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);

  await expect(item.locator(".progress__value")).toHaveText(`${value}%`);
}

async function taskTitles(page: Page): Promise<string[]> {
  return page.locator("#task-list .item__title--editable").allTextContents();
}

/** Check real element bounds, not just scrollWidth (which can be masked). */
async function assertFitsViewport(page: Page, label: string) {
  const width = page.viewportSize()?.width ?? 0;
  const report = await page.evaluate((viewportWidth) => {
    const selector = [
      "button",
      "input",
      "select",
      "textarea",
      "summary",
      "a",
      "h1",
      "h2",
      "h3",
      "p",
      ".card",
      ".item",
      ".deadline",
      ".stats",
      ".toolbar",
      ".sidebar",
      ".team-summary",
      ".team-member",
      ".team-switcher",
      ".app__meta",
      ".app__account",
      ".country-picker__popover",
      ".deadline-panel",
    ].join(",");

    const offenders = Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        const outside = box.left < -1 || box.right > viewportWidth + 1;
        const textSpills =
          !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) &&
          style.overflowX === "visible" &&
          element.scrollWidth > element.clientWidth + 1;
        return outside || textSpills;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        const className =
          typeof element.className === "string" ? element.className : "";
        return `${element.tagName.toLowerCase()}.${className} [${Math.round(
          box.left,
        )}, ${Math.round(box.right)}] scroll:${element.scrollWidth}/${
          element.clientWidth
        }`;
      })
      .slice(0, 8);

    return { offenders, scrollWidth: document.documentElement.scrollWidth };
  }, width);

  expect(report.offenders, `${label}: elements outside viewport`).toEqual([]);
  expect(report.scrollWidth, `${label}: document overflow`).toBeLessThanOrEqual(
    width + 1,
  );
}

test("deadline picker previews, cancels, saves, clears, and submits while open", async ({
  page,
}) => {
  await signUp(page);

  const trigger = page.locator("#deadline-trigger");

  await expect(trigger).toContainText("Add a deadline");
  await openPicker(page);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#deadline-save")).toBeEnabled();

  // Presets fill the date/time fields and update the preview.
  await page.locator('[data-preset="1"]').click();
  await expect(page.locator("#deadline-preview")).toContainText("Due");
  await expect(page.locator("#deadline-time")).toHaveValue("17:00");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowValue = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    String(tomorrow.getDate()).padStart(2, "0"),
  ].join("-");
  await expect(page.locator("#deadline-date")).toHaveValue(tomorrowValue);

  // Escape cancels without saving.
  await page.keyboard.press("Escape");
  await expect(page.locator("#deadline-panel")).toBeHidden();
  await expect(trigger).toContainText("Add a deadline");

  // A specific deadline saves and updates the trigger.
  await openPicker(page);
  await fillPicker(page, "2027-01-15", "17:00");
  await expect(page.locator("#deadline-preview")).toContainText(
    "January 15, 2027",
  );
  await savePicker(page);
  await expect(trigger).toContainText("Jan 15");
  await expect(trigger).toContainText("5:00 PM");
  await expect(page.locator("#deadline-clear")).toBeVisible();

  // Clearing removes the draft deadline.
  await page.locator("#deadline-clear").click();
  await expect(trigger).toContainText("Add a deadline");
  await expect(page.locator("#deadline-clear")).toBeHidden();

  // Adding a task uses the saved deadline and resets the form.
  await openPicker(page);
  await fillPicker(page, "2027-01-15", "17:00");
  await savePicker(page);
  await addTask(page, "Buy groceries");

  const groceries = page.locator("#task-list .item", {
    hasText: "Buy groceries",
  });
  await expect(groceries.locator(".deadline")).toContainText("Jan 15");
  await expect(groceries.locator(".deadline")).toHaveClass(/deadline--due/);
  await expect(trigger).toContainText("Add a deadline");

  // Submitting with the picker still open uses the field values.
  await page.fill("#task-input", "Send old invoice");
  await openPicker(page);
  await fillPicker(page, "2020-01-01", "10:00");
  await page.locator('#task-form button[type="submit"]').click();

  const overdue = page.locator("#task-list .item", {
    hasText: "Send old invoice",
  });
  await expect(overdue.locator(".deadline")).toContainText("Overdue");
  await expect(overdue.locator(".deadline")).toHaveClass(/deadline--overdue/);
  await expect(page.locator("#deadline-panel")).toBeHidden();

  // Clicking outside cancels without changing the saved deadline.
  await openPicker(page);
  await fillPicker(page, "2028-05-05", "09:30");
  await page.locator(".app__header").click();
  await expect(page.locator("#deadline-panel")).toBeHidden();
  await expect(trigger).toContainText("Add a deadline");
});

test("progress notes persist, log with button or Enter, complete, and restore", async ({
  page,
}) => {
  await signUp(page);

  await addTaskWithDeadline(page, "Buy groceries", "2027-01-15", "17:00");
  let groceries = page.locator("#task-list .item", {
    hasText: "Buy groceries",
  });

  // A 0% update would record no change, so the log action stays disabled until
  // progress moves. Enter must not bypass it either.
  await expect(groceries.locator('[data-action="log-progress"]')).toBeDisabled();
  await groceries.locator(".progress-note").fill("Starting up");
  await groceries.locator(".progress-note").press("Enter");
  await expect(groceries.locator("details.log")).toHaveCount(0);
  await expect(groceries.locator(".progress-note")).toHaveValue("Starting up");

  await setProgress(groceries, 40);
  await groceries.locator(".progress-note").fill("Bought the vegetables");
  await groceries.locator('[data-action="log-progress"]').click();

  await expect(groceries.locator(".log summary")).toContainText("1 update");
  await expect(groceries.locator("details.log")).toHaveJSProperty("open", true);
  await expect(groceries.locator(".log__note")).toHaveText(
    "Bought the vegetables",
  );
  await expect(groceries.locator(".log__value").first()).toHaveText("40%");
  await expect(groceries.locator(".progress-note")).toHaveValue("");
  await expect(groceries.locator('[data-action="log-progress"]')).toHaveText(
    "Logged",
  );

  // Enter in the note field logs too.
  await setProgress(groceries, 75);
  await groceries.locator(".progress-note").fill("Halfway there");
  await groceries.locator(".progress-note").press("Enter");

  await expect(groceries.locator(".log summary")).toContainText("2 updates");
  await expect(groceries.locator(".log__note")).toHaveText([
    "Halfway there",
    "Bought the vegetables",
  ]);
  await expect(groceries.locator(".log__value")).toHaveText(["75%", "40%"]);

  const stored = (await storedState(page)) as {
    tasks: {
      title: string;
      progress: number;
      progressLog: { value: number; note: string }[];
    }[];
  };
  const storedTask = stored.tasks.find((task) => task.title === "Buy groceries");
  expect(storedTask?.progress).toBe(75);
  expect(storedTask?.progressLog.map((entry) => entry.value)).toEqual([40, 75]);
  expect(storedTask?.progressLog.map((entry) => entry.note)).toEqual([
    "Bought the vegetables",
    "Halfway there",
  ]);

  // Progress and notes survive a reload.
  await page.reload();
  groceries = page.locator("#task-list .item", { hasText: "Buy groceries" });
  await expect(groceries.locator(".progress__slider")).toHaveValue("75");
  await expect(groceries.locator(".log summary")).toContainText("2 updates");

  // Finish the task at 100% and keep the final note.
  await setProgress(groceries, 100);
  await groceries.locator(".progress-note").fill("All done shopping");
  await groceries.locator('[data-action="log-progress"]').click();
  await expect(groceries.locator(".log__note").first()).toHaveText(
    "All done shopping",
  );

  await groceries.locator(".check").click();
  await expect(page.locator("#task-count")).toHaveText("0");
  await expect(page.locator("#history-count")).toHaveText("1");

  const historyGroceries = page.locator("#history-list .item", {
    hasText: "Buy groceries",
  });
  await expect(historyGroceries.locator(".deadline")).toContainText("On time");
  await expect(historyGroceries.locator(".progress__value")).toHaveText("100%");
  await historyGroceries.locator(".log summary").click();
  await expect(historyGroceries.locator(".log__value")).toHaveText([
    "100%",
    "75%",
    "40%",
  ]);
  await expect(historyGroceries.locator(".log__note").first()).toHaveText(
    "All done shopping",
  );

  // Completing an overdue task records a "Task completed" log entry.
  await page.fill("#task-input", "Send old invoice");
  await openPicker(page);
  await fillPicker(page, "2020-01-01", "10:00");
  await page.locator('#task-form button[type="submit"]').click();
  const overdue = page.locator("#task-list .item", {
    hasText: "Send old invoice",
  });
  await overdue.locator(".check").click();

  await expect(page.locator("#history-count")).toHaveText("2");
  const historyOverdue = page.locator("#history-list .item", {
    hasText: "Send old invoice",
  });
  await expect(historyOverdue.locator(".deadline")).toContainText("Late");
  await expect(historyOverdue.locator(".progress__value")).toHaveText("100%");
  await historyOverdue.locator(".log summary").click();
  await expect(historyOverdue.locator(".log__value")).toHaveText(["100%"]);
  await expect(historyOverdue.locator(".log__note")).toHaveText(
    "Task completed",
  );

  // Restoring keeps deadline, progress, notes, and the log.
  await historyGroceries.locator('[data-action="restore"]').click();
  const restored = page.locator("#task-list .item", {
    hasText: "Buy groceries",
  });
  await expect(restored.locator(".progress__slider")).toHaveValue("100");
  await expect(restored.locator(".log summary")).toContainText("3 updates");
  await expect(restored.locator(".deadline")).toContainText("Jan 15");
  await restored.locator(".log summary").click();
  await expect(restored.locator(".log__note").first()).toHaveText(
    "All done shopping",
  );
  await expect(page.locator("#history-count")).toHaveText("1");
});

test("filters, sorting, and the stats summary stay in sync", async ({ page }) => {
  await signUp(page);

  await addTaskWithDeadline(page, "Alpha overdue", "2020-01-01", "10:00");
  await addTask(page, "Beta active");
  await addTask(page, "Gamma new");
  await addTaskWithDeadline(page, "Delta soon", "2027-01-15", "17:00");

  const beta = page.locator("#task-list .item", { hasText: "Beta active" });
  await setProgress(beta, 40);

  await expect(page.locator("#task-list .item")).toHaveCount(4);

  const statValue = (label: string) =>
    page.locator(".stat", { hasText: label }).locator(".stat__value");

  await expect(statValue("Pending")).toHaveText("3");
  await expect(statValue("Overdue")).toHaveText("1");
  await expect(statValue("Completed")).toHaveText("0");

  // Newest-first is the default.
  expect(await taskTitles(page)).toEqual([
    "Delta soon",
    "Gamma new",
    "Beta active",
    "Alpha overdue",
  ]);

  // The sidebar drives the views and shows live counts.
  await expect(page.locator("#view-all-count")).toHaveText("4");
  await expect(page.locator("#view-pending-count")).toHaveText("3");
  await expect(page.locator("#view-overdue-count")).toHaveText("1");
  await expect(page.locator("#view-completed-count")).toHaveText("0");

  await page.locator("#view-pending").click();
  await expect(page.locator("#task-list .item")).toHaveCount(3);
  await expect(
    page.locator("#task-list .item", { hasText: "Alpha overdue" }),
  ).toHaveCount(0);

  await page.locator("#view-overdue").click();
  await expect(page.locator("#task-list .item")).toHaveCount(1);
  await expect(page.locator("#task-list .item")).toContainText("Alpha overdue");

  await page.locator("#view-all").click();
  await expect(page.locator("#task-list .item")).toHaveCount(4);

  // Sorting: deadline soonest puts undated tasks last.
  await page.selectOption(".sort__select", "deadline");
  expect(await taskTitles(page)).toEqual([
    "Alpha overdue",
    "Delta soon",
    "Gamma new",
    "Beta active",
  ]);

  await page.selectOption(".sort__select", "title");
  expect(await taskTitles(page)).toEqual([
    "Alpha overdue",
    "Beta active",
    "Delta soon",
    "Gamma new",
  ]);

  // The chosen sort survives a reload.
  await expect
    .poll(async () => {
      const state = (await storedState(page)) as { tasks?: unknown[] } | null;
      return state?.tasks?.length;
    })
    .toBe(4);
  await page.reload();
  await expect(page.locator(".sort__select")).toHaveValue("title");
  await expect(page.locator("#task-list .item")).toHaveCount(4);
  expect(await taskTitles(page)).toEqual([
    "Alpha overdue",
    "Beta active",
    "Delta soon",
    "Gamma new",
  ]);

  await page.selectOption(".sort__select", "progress-desc");
  expect(await taskTitles(page)).toEqual([
    "Beta active",
    "Delta soon",
    "Gamma new",
    "Alpha overdue",
  ]);

  await page.selectOption(".sort__select", "progress-asc");
  expect(await taskTitles(page)).toEqual([
    "Delta soon",
    "Gamma new",
    "Alpha overdue",
    "Beta active",
  ]);

  // Completing a task updates the pending, overdue, and completed counts.
  await page.selectOption(".sort__select", "newest");
  await beta.locator(".check").click();
  await expect(page.locator("#task-count")).toHaveText("3");
  await expect(page.locator("#history-count")).toHaveText("1");
  await expect(statValue("Pending")).toHaveText("2");
  await expect(statValue("Overdue")).toHaveText("1");
  await expect(statValue("Completed")).toHaveText("1");
  await expect(page.locator("#view-all-count")).toHaveText("4");
  await expect(page.locator("#view-pending-count")).toHaveText("2");
  await expect(page.locator("#view-completed-count")).toHaveText("1");

  // The completed view hides the open list and shows their full history.
  await page.locator("#view-completed").click();
  await expect(page.locator("#task-list")).toHaveCount(0);
  await expect(page.locator("#history-list .item")).toHaveCount(1);
  await expect(page.locator("#history-list .item")).toContainText(
    "Beta active",
  );
});

test("task and history titles can be renamed inline", async ({ page }) => {
  await signUp(page);

  await addTask(page, "Original title");

  const item = page.locator("#task-list .item").first();
  await item.locator(".item__title--editable").click();

  const input = item.locator(".title-input");
  await expect(input).toBeFocused();
  await input.fill("Renamed title");
  await input.press("Enter");

  await expect(item.locator(".item__title--editable")).toHaveText(
    "Renamed title",
  );
  await expect(
    page.locator("#task-list .item", { hasText: "Renamed title" }),
  ).toHaveCount(1);

  const stored = (await storedState(page)) as { tasks: { title: string }[] };
  expect(stored.tasks[0].title).toBe("Renamed title");

  // Escape cancels an in-progress rename.
  await item.locator(".item__title--editable").click();
  await item.locator(".title-input").fill("Should not save");
  await item.locator(".title-input").press("Escape");
  await expect(item.locator(".item__title--editable")).toHaveText(
    "Renamed title",
  );

  // An empty title is rejected, leaving the old title in place.
  await item.locator(".item__title--editable").click();
  await item.locator(".title-input").fill("   ");
  await item.locator(".title-input").press("Enter");
  await expect(item.locator(".item__title--editable")).toHaveText(
    "Renamed title",
  );

  // History items are editable too.
  await item.locator(".check").click();
  const historyItem = page.locator("#history-list .item").first();
  await historyItem.locator(".item__title--editable").click();
  await historyItem.locator(".title-input").fill("Finished title");
  await historyItem.locator(".title-input").press("Enter");
  await expect(historyItem.locator(".item__title--editable")).toHaveText(
    "Finished title",
  );
});

test("signup validates name, email, mobile, password, and uses email-only login", async ({
  page,
}) => {
  // Warnings appear while typing, before the form is submitted.
  await page.fill("#auth-name", "   ");
  await expect(page.locator("#auth-name-warning")).toContainText(
    "Enter your name",
  );

  await page.fill("#auth-email", "a@b");
  await expect(page.locator("#auth-email-warning")).toContainText(
    "valid email address",
  );
  await expect(page.locator("#auth-email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await page.fill("#auth-mobile", "123");
  await expect(page.locator("#auth-mobile-warning")).toContainText(
    "valid mobile number",
  );

  await page.fill("#auth-email", "alice@example.com");
  await expect(page.locator("#auth-email-warning")).toHaveCount(0);

  await page.fill("#auth-password", "short");
  await expect(page.locator("#auth-password-warning")).toContainText(
    "at least 8",
  );
  await page.fill("#auth-password", "password123");
  await expect(page.locator("#auth-password-warning")).toHaveCount(0);

  // A valid signup creates the account and signs in.
  await signUp(page, {
    name: "Alice Example",
    email: "Alice@Example.com",
    mobile: "555 123 4567",
    country: "US",
  });
  await expect(page.locator(".user-chip__name")).toHaveText("Alice Example");
  await expect(page.locator(".footer")).toContainText("Alice Example");

  const alice = await storedUser(page, "alice@example.com");
  expect(alice?.emailKey).toBe("alice@example.com");
  expect(alice?.mobile).toBe("+15551234567");

  await logout(page);

  // A duplicate signup is blocked with a live warning.
  await page.locator("#auth-mode-signup").click();
  await page.fill("#auth-name", "Alice Again");
  await page.fill("#auth-email", "ALICE@EXAMPLE.COM");
  await page.fill("#auth-mobile", "555 987 6543");
  await page.fill("#auth-password", "password123");
  await expect(page.locator("#auth-email-warning")).toContainText(
    "already exists",
  );
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator("#auth-form")).toBeVisible();

  // Email-only login rejects a wrong password.
  await page.locator("#auth-mode-signin").click();
  await page.fill("#auth-email", "ALICE@EXAMPLE.COM");
  await page.fill("#auth-password", "wrong-password");
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator("#auth-error")).toContainText("Incorrect password");

  // The correct password logs the existing account back in.
  await page.fill("#auth-password", "password123");
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator(".app__title")).toHaveText("Taskly");
  await expect(page.locator(".user-chip__name")).toHaveText("Alice Example");

  // Emails are case-insensitive, so no duplicate account was created.
  const users = (await readDb()).users.map((user) => user.email);
  expect(users).toEqual(["alice@example.com"]);
});

test("login is email-only even after signing up with a mobile number", async ({
  page,
}) => {
  await signUp(page, { mobile: "+1 (555) 123-4567", country: "US" });
  await expect(page.locator(".user-chip__name")).toHaveText(DEFAULT_NAME);
  await addTask(page, "Mobile task");

  const user = await storedUser(page);
  expect(user?.mobile).toBe("+15551234567");
  expect(user?.mobileKey).toBe("15551234567");

  await logout(page);

  // Mobile numbers are not accepted as a login identifier.
  await page.locator("#auth-mode-signin").click();
  await page.fill("#auth-email", "+15551234567");
  await expect(page.locator("#auth-email-warning")).toContainText(
    "valid email address",
  );
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator("#auth-form")).toBeVisible();

  // The email address returns to the same private data.
  await signIn(page, DEFAULT_EMAIL);
  await expect(page.locator("#task-list .item")).toContainText("Mobile task");
});

test("country picker finds India by typing 91 and prefixes the number", async ({
  page,
}) => {
  await page.locator("#auth-country-button").click();
  await page.fill("#auth-country-search", "91");
  await expect(page.locator("#auth-country-search")).toBeVisible();
  await page.locator("#auth-country-search").press("Enter");

  await expect(page.locator("#auth-country-button")).toContainText("+91");

  await page.fill("#auth-name", "Ravi Kumar");
  await page.fill("#auth-email", "ravi@example.com");
  await page.fill("#auth-mobile", "98765 43210");
  await page.fill("#auth-password", "password789");
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator(".app__title")).toHaveText("Taskly");
  await expect(page.locator(".user-chip__name")).toHaveText("Ravi Kumar");

  const ravi = await storedUser(page, "ravi@example.com");
  expect(ravi?.mobile).toBe("+919876543210");
  expect(ravi?.mobileKey).toBe("919876543210");

  await logout(page);

  // A fully international number is still accepted at signup.
  await page.locator("#auth-mode-signup").click();
  await page.fill("#auth-name", "Ravi International");
  await page.fill("#auth-email", "ravi.intl@example.com");
  await page.fill("#auth-mobile", "+91 98765 43210");
  await page.fill("#auth-password", "password789");
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator(".app__title")).toHaveText("Taskly");

  const intl = await storedUser(page, "ravi.intl@example.com");
  expect(intl?.mobile).toBe("+919876543210");
});

test("private tasks stay isolated while team tasks require an accepted invitation", async ({
  page,
}) => {
  await signUp(page, {
    name: "Alice",
    email: "alice@example.com",
    mobile: "555 111 1111",
  });
  await addTask(page, "Alice private");
  await addTask(page, "Alice finished");
  await page
    .locator("#task-list .item", { hasText: "Alice finished" })
    .locator(".check")
    .click();
  await expect(page.locator("#history-count")).toHaveText("1");

  await logout(page);

  await signUp(page, {
    name: "Bob",
    email: "bob@example.com",
    mobile: "555 222 2222",
    password: "password456",
  });
  await expect(page.locator("#task-count")).toHaveText("0");
  await expect(page.locator("#history-count")).toHaveText("0");
  await addTask(page, "Bob private");

  // Before any team exists, the team workspace offers a create-team panel.
  // Joining is never implied by another account already hosting a team.
  await openTeam(page);
  await expect(page.locator("#team-gate")).toBeVisible();
  await expect(page.locator("#team-create-submit")).toBeVisible();
  await expect(page.locator("#team-overview")).toHaveCount(0);
  await expect(page.locator("#task-list")).toHaveCount(0);
  await page.locator("#workspace-private").click();
  await expect(page.locator("#task-list .item")).toContainText("Bob private");

  await logout(page);
  await signIn(page, "alice@example.com");

  // Alice starts the team and invites Bob by email.
  await createTeam(page);
  await expect(page.locator("#team-member-count")).toHaveText("1");
  await addTask(page, "Shared release");
  await inviteByEmail(page, "bob@example.com");

  const teams = await storedTeams(page);
  expect(teams).toHaveLength(1);
  const teamId = teams[0].id;
  let storedMembership = await storedTeamMembers(page, teamId);
  expect(storedMembership.members).toHaveLength(1);
  expect(storedMembership.members[0].role).toBe("host");
  expect(
    storedMembership.invites.map(({ email, status }) => ({ email, status })),
  ).toEqual([{ email: "bob@example.com", status: "pending" }]);

  await logout(page);

  // A third account that was never invited is not shown a blocking outside
  // screen. It starts with no team and can create its own.
  await signUp(page, {
    name: "Carol",
    email: "carol@example.com",
    mobile: "555 333 3333",
    password: "password789",
  });
  await openTeam(page);
  await expect(page.locator("#team-outsider")).toHaveCount(0);
  await expect(page.locator("#team-gate")).toBeVisible();
  await expect(page.locator("#team-create-submit")).toBeVisible();
  await expect(page.locator("#team-overview")).toHaveCount(0);
  await expect(page.locator("#task-list")).toHaveCount(0);
  await logout(page);

  // Bob sees the invitation in his private workspace and must accept it
  // before any team tasks appear.
  await signIn(page, "bob@example.com", "password456");
  await page.locator("#workspace-private").click();
  await expect(page.locator("#invite-banner")).toBeVisible();
  await page.locator("#invite-banner-review").click();
  await expect(page.locator("#team-invitation")).toBeVisible();
  await page.locator("#team-invitation-accept").click();
  await expect(page.locator("#team-overview")).toBeVisible();
  await expect(page.locator("#team-member-count")).toHaveText("2");
  await expect(
    page.locator("#task-list .item", { hasText: "Shared release" }),
  ).toHaveCount(1);
  await expect(
    page.locator("#task-list .item", { hasText: "Bob private" }),
  ).toHaveCount(0);

  // Bob's private list is still private and intact.
  await page.locator("#workspace-private").click();
  await expect(page.locator("#task-list .item")).toContainText("Bob private");

  storedMembership = await storedTeamMembers(page, teamId);
  expect(storedMembership.members.map((member) => member.role)).toEqual([
    "host",
    "member",
  ]);
  expect(
    storedMembership.invites.map(({ email, status }) => ({ email, status })),
  ).toEqual([{ email: "bob@example.com", status: "accepted" }]);

  await logout(page);
  await signIn(page, "alice@example.com");

  await expect(page.locator("#task-count")).toHaveText("1");
  await expect(page.locator("#task-list .item")).toContainText("Alice private");
  await expect(
    page.locator("#task-list .item", { hasText: "Bob private" }),
  ).toHaveCount(0);
  await expect(page.locator("#history-list .item")).toContainText(
    "Alice finished",
  );

  await openTeam(page);
  await expect(
    page.locator("#task-list .item", { hasText: "Shared release" }),
  ).toHaveCount(1);
  await expect(
    page.locator("#task-list .item", { hasText: "Alice private" }),
  ).toHaveCount(0);

  const bob = await storedUser(page, "bob@example.com");
  await expect(
    page.locator(`.team-member[data-member-id="${bob?.id}"]`),
  ).toContainText("Bob");

  // Both accounts' private data and the shared team data are stored side by side.
  const db = await readDb();
  const store = {
    users: db.users.map((user) => ({
      email: user.email,
      tasks: (
        db.data[user.id] as { tasks: { title: string }[] } | undefined
      )?.tasks.map((task) => task.title),
    })),
    teams: db.teams.map((team) =>
      team.state.tasks.map((task) => task.title),
    ),
  };
  expect(store.users).toEqual([
    { email: "alice@example.com", tasks: ["Alice private"] },
    { email: "bob@example.com", tasks: ["Bob private"] },
    { email: "carol@example.com", tasks: [] },
  ]);
  expect(store.teams).toEqual([["Shared release"]]);
});

test("team workspace invites, assigns responsibility, and tracks overall progress", async ({
  page,
}) => {
  await signUp(page, {
    name: "Alice",
    email: "alice@example.com",
    mobile: "555 111 1111",
  });
  await createTeam(page);
  await inviteByEmail(page, "bob@example.com");
  await logout(page);

  await signUp(page, {
    name: "Bob",
    email: "bob@example.com",
    mobile: "555 222 2222",
    password: "password456",
  });
  await acceptInvitation(page);

  const members = (await readDb()).users.map((user) => ({
    id: user.id,
    name: user.name,
  }));
  const aliceId = members.find((member) => member.name === "Alice")?.id;
  const bobId = members.find((member) => member.name === "Bob")?.id;
  expect(aliceId).toBeTruthy();
  expect(bobId).toBeTruthy();

  await expect(page.locator("#team-member-count")).toHaveText("2");

  const aliceSummary = page.locator(
    `.team-member[data-member-id="${aliceId}"]`,
  );
  const bobSummary = page.locator(`.team-member[data-member-id="${bobId}"]`);
  await expect(aliceSummary.locator(".team-member__badge").first()).toHaveText(
    "Host",
  );
  await expect(bobSummary).toContainText("You");

  // Team mode shows exactly three summary boxes, not the private stats bar.
  await expect(page.locator("#team-overview .team-summary__item")).toHaveCount(
    3,
  );
  await expect(page.locator(".stats")).toHaveCount(0);

  // New team tasks default to the signed-in member.
  await expect(page.locator("#task-assignee")).toHaveValue(bobId ?? "");

  // Bob can assign work to Alice...
  await page.selectOption("#task-assignee", aliceId ?? "");
  await addTask(page, "Draft launch plan");

  // ...assign work to himself...
  await page.selectOption("#task-assignee", bobId ?? "");
  await addTask(page, "Collect metrics");

  // ...or leave a task unassigned. This one is already overdue.
  await page.selectOption("#task-assignee", "");
  await openPicker(page);
  await fillPicker(page, "2020-01-01", "10:00");
  await savePicker(page);
  await addTask(page, "Unassigned cleanup");

  const plan = page.locator("#task-list .item", {
    hasText: "Draft launch plan",
  });
  const metrics = page.locator("#task-list .item", {
    hasText: "Collect metrics",
  });
  const cleanup = page.locator("#task-list .item", {
    hasText: "Unassigned cleanup",
  });

  await expect(plan.locator(".assignee__select")).toHaveValue(aliceId ?? "");
  await expect(metrics.locator(".assignee__select")).toHaveValue(bobId ?? "");
  await expect(cleanup.locator(".assignee__select")).toHaveValue("");

  // Bob is not responsible for Alice's task, so completion, progress, rename,
  // and delete are locked. He can still comment and reassign it.
  await expect(plan.locator(".check")).toBeDisabled();
  await expect(plan.locator(".progress__slider")).toBeDisabled();
  await expect(plan.locator(".item__permission")).toContainText("Alice");
  await expect(plan.locator(".item__title--editable")).toHaveCount(0);
  await expect(plan.locator('[data-action="delete"]')).toBeDisabled();
  await expect(plan.locator('[data-action="log-progress"]')).toHaveText(
    "Add comment",
  );

  // Bulk clearing is hidden in team mode so it cannot bypass ownership.
  await expect(page.getByRole("button", { name: "Clear all" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear history" }),
  ).toHaveCount(0);

  // Unassigned work shows how to claim it and stays locked until then.
  await expect(cleanup.locator(".item__permission")).toContainText("Unassigned");
  await expect(cleanup.locator('[data-action="delete"]')).toBeDisabled();

  await plan.locator(".progress-note").fill("Outline approved");
  await plan.locator('[data-action="log-progress"]').click();

  // The comment is attributed to Bob, not to the task's assignee.
  const planUpdate = page.locator("#team-updates .team-update").first();
  await expect(planUpdate).toContainText("Outline approved");
  await expect(planUpdate).toContainText("Bob");

  // Any member can reassign, but progress unlocks only once Bob is responsible.
  await plan.locator(".assignee__select").selectOption(bobId ?? "");
  await expect(plan.locator(".check")).toBeEnabled();
  await expect(plan.locator(".item__title--editable")).toHaveCount(1);
  await expect(plan.locator('[data-action="delete"]')).toBeEnabled();
  await setProgress(plan, 40);
  await plan.locator(".assignee__select").selectOption(aliceId ?? "");
  await expect(plan.locator(".check")).toBeDisabled();
  await expect(plan.locator('[data-action="delete"]')).toBeDisabled();

  await setProgress(metrics, 80);
  await metrics.locator(".progress-note").fill("Halfway through");
  await metrics.locator('[data-action="log-progress"]').click();

  // Central visibility of workload, overdue work, and completion.
  await expect(page.locator("#team-open-count")).toHaveText("3");
  await expect(page.locator("#team-overdue-count")).toHaveText("1");
  await expect(page.locator("#team-unassigned-count")).toHaveText("1");

  await expect(aliceSummary.locator('[data-stat="assigned"]')).toHaveText(
    "1 assigned",
  );
  await expect(aliceSummary.locator('[data-stat="overdue"]')).toHaveText(
    "0 overdue",
  );
  await expect(aliceSummary.locator(".team-member__percent")).toHaveText("40%");
  await expect(bobSummary.locator('[data-stat="assigned"]')).toHaveText(
    "1 assigned",
  );
  await expect(bobSummary.locator(".team-member__percent")).toHaveText("80%");

  // Latest updates show the exact time and the note, not relative text.
  const updates = page.locator("#team-updates .team-update");
  await expect(updates.first()).toContainText("Halfway through");
  const updateTime = updates.first().locator(".team-update__time");
  await expect(updateTime).not.toHaveText(/just now|ago/);
  await expect(updateTime).toHaveAttribute("title", /^Updated /);

  // Completing Bob's task must not reset his progress to zero: the completed
  // work stays in the overall calculation and the bar reaches 100%.
  await metrics.locator(".check").click();
  await expect(page.locator("#team-overview #team-open-count")).toHaveText("2");
  await expect(bobSummary.locator('[data-stat="completed"]')).toHaveText(
    "1 done",
  );
  await expect(bobSummary.locator('[data-stat="assigned"]')).toHaveText(
    "0 assigned",
  );
  await expect(bobSummary.locator(".team-member__percent")).toHaveText("100%");

  const historyItem = page.locator("#history-list .item", {
    hasText: "Collect metrics",
  });
  await expect(historyItem.locator(".assignee--static")).toContainText("Bob");

  // Reassignment keeps overall progress meaningful for the new owner.
  await plan.locator(".assignee__select").selectOption(bobId ?? "");
  await expect(aliceSummary.locator('[data-stat="assigned"]')).toHaveText(
    "0 assigned",
  );
  await expect(aliceSummary.locator(".team-member__percent")).toHaveText("—");
  await expect(bobSummary.locator('[data-stat="assigned"]')).toHaveText(
    "1 assigned",
  );
  await expect(bobSummary.locator(".team-member__percent")).toHaveText("70%");
  await expect(page.locator("#team-unassigned-count")).toHaveText("1");

  // The host sees the same shared work after logging back in.
  await logout(page);
  await signIn(page, "alice@example.com");
  await openTeam(page);
  await expect(page.locator("#team-member-count")).toHaveText("2");
  const hostPlan = page.locator("#task-list .item", {
    hasText: "Draft launch plan",
  });
  await expect(hostPlan).toHaveCount(1);
  await expect(bobSummary.locator(".team-member__percent")).toHaveText("70%");

  // Alice is the host but not the assignee, so Bob's work is still locked.
  await expect(hostPlan.locator(".check")).toBeDisabled();
  await expect(hostPlan.locator(".item__title--editable")).toHaveCount(0);
  await expect(hostPlan.locator('[data-action="delete"]')).toBeDisabled();

  const bobHistory = page.locator("#history-list .item", {
    hasText: "Collect metrics",
  });
  await expect(bobHistory.locator(".item__title--editable")).toHaveCount(0);
  await expect(bobHistory.locator('[data-action="restore"]')).toBeDisabled();
  await expect(bobHistory.locator('[data-action="delete"]')).toBeDisabled();

  // An unassigned task has no responsible member, so anyone can claim it by
  // finishing it. The host claims this one and the history records her.
  const cleanupItem = page.locator("#task-list .item", {
    hasText: "Unassigned cleanup",
  });
  await expect(cleanupItem.locator(".check")).toBeEnabled();
  await cleanupItem.locator(".check").click();
  await expect(page.locator("#team-unassigned-count")).toHaveText("0");
  await expect(
    page
      .locator("#history-list .item", { hasText: "Unassigned cleanup" })
      .locator(".assignee--static"),
  ).toContainText("Alice");

  const team = await storedTeam(page);
  expect(team).not.toBeNull();
  if (!team) return;
  expect(
    team.state.tasks.find((task) => task.title === "Draft launch plan"),
  ).toMatchObject({ assigneeId: bobId });
  expect(
    team.state.tasks.find((task) => task.title === "Unassigned cleanup"),
  ).toBeUndefined();
  expect(
    team.state.history.find((item) => item.title === "Unassigned cleanup")
      ?.assigneeId,
  ).toBe(aliceId);
  expect(
    team.state.history.find((item) => item.title === "Collect metrics")
      ?.assigneeId,
  ).toBe(bobId);

  const membership = await storedTeamMembers(page);
  expect(
    membership.members.map((member) => ({
      userId: member.userId,
      role: member.role,
    })),
  ).toEqual([
    { userId: aliceId, role: "host" },
    { userId: bobId, role: "member" },
  ]);
});

test("the server rejects completion, progress, rename, delete, and restore edits from non-assignees", async ({
  page,
}) => {
  await signUp(page, {
    name: "Cleo",
    email: "cleo@example.com",
    mobile: "555 333 3333",
  });
  await createTeam(page);
  await inviteByEmail(page, "dan@example.com");

  // Cleo also finishes one of her own tasks before Dan joins.
  await addTask(page, "Cleo's archived report");
  await page
    .locator("#task-list .item", { hasText: "Cleo's archived report" })
    .locator(".check")
    .click();
  await expect(
    page.locator("#history-list .item", { hasText: "Cleo's archived report" }),
  ).toHaveCount(1);
  await logout(page);

  await signUp(page, {
    name: "Dan",
    email: "dan@example.com",
    mobile: "555 444 4444",
    password: "password456",
  });
  await acceptInvitation(page);

  const users = (await readDb()).users;
  const cleoId = users.find((user) => user.name === "Cleo")?.id;
  expect(cleoId).toBeTruthy();

  await page.selectOption("#task-assignee", cleoId ?? "");
  await addTask(page, "Cleo's report");

  const before = await storedTeam(page);
  expect(before).not.toBeNull();
  if (!before) return;

  const task = before.state.tasks.find(
    (entry) => entry.title === "Cleo's report",
  );
  expect(task).toBeTruthy();
  if (!task) return;

  const archived = before.state.history.find(
    (entry) => entry.title === "Cleo's archived report",
  );
  expect(archived).toBeTruthy();
  if (!archived) return;

  const token = await sessionToken(page);

  // Dan cannot move Cleo's task into history...
  const completion = await putTeamState(page, before.id, token, {
    tasks: before.state.tasks.filter((entry) => entry.id !== task.id),
    history: [
      { ...task, progress: 100, completedAt: Date.now() },
      ...before.state.history,
    ],
  });
  expect(completion.status()).toBe(403);

  // ...or change its progress.
  const progress = await putTeamState(page, before.id, token, {
    tasks: before.state.tasks.map((entry) =>
      entry.id === task.id ? { ...entry, progress: 50 } : entry,
    ),
    history: before.state.history,
  });
  expect(progress.status()).toBe(403);

  // ...rename or delete it...
  const rename = await putTeamState(page, before.id, token, {
    tasks: before.state.tasks.map((entry) =>
      entry.id === task.id ? { ...entry, title: "Hijacked report" } : entry,
    ),
    history: before.state.history,
  });
  expect(rename.status()).toBe(403);

  const removal = await putTeamState(page, before.id, token, {
    tasks: before.state.tasks.filter((entry) => entry.id !== task.id),
    history: before.state.history,
  });
  expect(removal.status()).toBe(403);

  // ...or rename, restore, and delete finished work that is not his.
  const historyRename = await putTeamState(page, before.id, token, {
    tasks: before.state.tasks,
    history: before.state.history.map((entry) =>
      entry.id === archived.id ? { ...entry, title: "Hijacked history" } : entry,
    ),
  });
  expect(historyRename.status()).toBe(403);

  const restore = await putTeamState(page, before.id, token, {
    tasks: [...before.state.tasks, { ...archived }],
    history: before.state.history.filter(
      (entry) => entry.id !== archived.id,
    ),
  });
  expect(restore.status()).toBe(403);

  const historyRemoval = await putTeamState(page, before.id, token, {
    tasks: before.state.tasks,
    history: before.state.history.filter(
      (entry) => entry.id !== archived.id,
    ),
  });
  expect(historyRemoval.status()).toBe(403);

  // Comments keep the progress value unchanged and are allowed.
  const comment = await putTeamState(page, before.id, token, {
    tasks: before.state.tasks.map((entry) =>
      entry.id === task.id
        ? {
            ...entry,
            progressLog: [
              ...entry.progressLog,
              {
                value: entry.progress,
                at: Date.now(),
                note: "Looks good from my side",
                by: users.find((user) => user.name === "Dan")?.id ?? null,
              },
            ],
          }
        : entry,
    ),
    history: before.state.history,
  });
  expect(comment.ok()).toBe(true);

  const after = await storedTeam(page);
  const stored = after?.state.tasks.find((entry) => entry.id === task.id);
  expect(stored?.progress).toBe(0);
  expect(stored?.title).toBe("Cleo's report");
  expect(stored?.progressLog.at(-1)?.note).toBe("Looks good from my side");
  expect(
    after?.state.history.some((entry) => entry.id === task.id),
  ).toBe(false);
  expect(
    after?.state.history.find((entry) => entry.id === archived.id)?.title,
  ).toBe("Cleo's archived report");
});

test("accounts can host independent teams and join teams they are invited to", async ({
  page,
}) => {
  // Alice hosts her own team.
  await signUp(page, {
    name: "Alice",
    email: "alice@example.com",
    mobile: "555 111 1111",
  });
  await createTeam(page);
  await addTask(page, "Alice team task");
  await logout(page);

  // Bob is not forced into Alice's team; he creates an independent one.
  await signUp(page, {
    name: "Bob",
    email: "bob@example.com",
    mobile: "555 222 2222",
    password: "password456",
  });
  await openTeam(page);
  await expect(page.locator("#team-gate")).toBeVisible();
  await expect(page.locator("#team-outsider")).toHaveCount(0);
  await page.locator("#team-create-submit").click();
  await expect(page.locator("#team-overview")).toBeVisible();
  await addTask(page, "Bob team task");

  const alice = await storedUser(page, "alice@example.com");
  const bob = await storedUser(page, "bob@example.com");
  let teams = await storedTeams(page);
  expect(teams).toHaveLength(2);
  const aliceTeamId = teams.find((team) => team.hostId === alice?.id)?.id;
  const bobTeamId = teams.find((team) => team.hostId === bob?.id)?.id;
  expect(aliceTeamId).toBeTruthy();
  expect(bobTeamId).toBeTruthy();

  await expect(
    page.locator(`.team-switcher__btn[data-team-id="${bobTeamId}"]`),
  ).toContainText("Host");

  await logout(page);

  // Alice invites Bob from her own team while he already hosts another team.
  await signIn(page, "alice@example.com");
  await openTeam(page);
  await inviteByEmail(page, "bob@example.com");
  await logout(page);

  await signIn(page, "bob@example.com", "password456");

  // The invitation is visible in both workspaces, not buried behind the team
  // he already hosts.
  const invitation = page.locator(
    `.team-invitation-card[data-team-id="${aliceTeamId}"]`,
  );
  await page.locator("#workspace-team").click();
  await expect(invitation).toBeVisible();

  await page.locator("#workspace-private").click();
  await expect(page.locator("#invite-banner")).toBeVisible();
  await page.locator("#invite-banner-review").click();
  await expect(invitation).toBeVisible();
  await invitation.locator('[data-action="accept-invite"]').click();
  await expect(page.locator("#team-overview")).toBeVisible();

  // Bob now belongs to both teams and can switch between them.
  await expect(page.locator("#team-switcher")).toBeVisible();
  await expect(
    page.locator(".team-switcher__btn[data-team-id]"),
  ).toHaveCount(2);
  await expect(
    page.locator(
      `.team-switcher__btn[data-team-id="${bobTeamId}"] .team-switcher__badge`,
    ),
  ).toHaveText("Host");
  await expect(
    page.locator(
      `.team-switcher__btn[data-team-id="${aliceTeamId}"] .team-switcher__badge`,
    ),
  ).toHaveCount(0);

  // The accepted team's work is visible; his own team stays separate.
  await expect(
    page.locator("#task-list .item", { hasText: "Alice team task" }),
  ).toHaveCount(1);
  await expect(
    page.locator("#task-list .item", { hasText: "Bob team task" }),
  ).toHaveCount(0);

  await page
    .locator(`.team-switcher__btn[data-team-id="${bobTeamId}"]`)
    .click();
  await expect(
    page.locator("#task-list .item", { hasText: "Bob team task" }),
  ).toHaveCount(1);
  await expect(
    page.locator("#task-list .item", { hasText: "Alice team task" }),
  ).toHaveCount(0);

  teams = await storedTeams(page);
  expect(teams.find((team) => team.id === bobTeamId)?.members).toHaveLength(1);
  expect(
    teams
      .find((team) => team.id === aliceTeamId)
      ?.members.map((member) => member.role),
  ).toEqual(["host", "member"]);

  // Even with memberships already in place, a new independent team can be made.
  await page.locator("#team-create-new").click();
  await expect
    .poll(async () => (await storedTeams(page)).length)
    .toBe(3);
  await expect(
    page.locator(".team-switcher__btn[data-team-id]"),
  ).toHaveCount(3);
  await expect(page.locator("#task-list .item")).toHaveCount(0);
});

test("invite links open the acceptance flow for the matching account", async ({
  page,
}) => {
  await signUp(page, {
    name: "Host Harper",
    email: "harper@example.com",
    mobile: "555 111 1111",
  });
  await createTeam(page);
  await inviteByEmail(page, "dave@example.com");

  // The host can copy every pending invite link without SMTP.
  await expect(
    page.locator('#team-invite-list [data-action="copy-invite"]'),
  ).toHaveCount(1);

  const team = await storedTeam(page);
  const invite = team?.invites[0];
  expect(invite).toBeTruthy();

  await logout(page);

  // Opening the copied link signs the invitee in and lands on the invitation.
  await page.goto(`/?invite=${encodeURIComponent(invite?.id ?? "")}`);
  await signUp(page, {
    name: "Dave Invitee",
    email: "dave@example.com",
    mobile: "555 222 2222",
    password: "password456",
  });

  await expect(page.locator("#team-invitation")).toBeVisible();
  await expect(page.locator("#team-member-count")).toHaveCount(0);
  await page.locator("#team-invitation-accept").click();
  await expect(page.locator("#team-overview")).toBeVisible();
  await expect(page.locator("#team-member-count")).toHaveText("2");
});

test("two tabs exchange an invitation and share updates live", async ({
  context,
  page,
  pageErrors,
}) => {
  await signUp(page, {
    name: "Varma",
    email: "varma@example.com",
    mobile: "555 111 1111",
  });
  await createTeam(page);
  await addTask(page, "Host task");

  // A second tab signs up as the invitee before the invitation exists.
  const guest = await context.newPage();
  guest.on("pageerror", (error) => pageErrors.push(error.message));
  await guest.goto("/");
  await expect(
    guest.locator(".app__logout, #auth-form").first(),
  ).toBeVisible();
  if (await guest.locator(".app__logout").isVisible()) await logout(guest);
  await signUp(guest, {
    name: "Meenan",
    email: "meenan@example.com",
    mobile: "555 222 2222",
    password: "password456",
  });

  // The guest starts with their own empty team space, not someone else's.
  await openTeam(guest);
  await expect(guest.locator("#team-gate")).toBeVisible();
  await expect(guest.locator("#team-outsider")).toHaveCount(0);

  // Host invites while the guest tab is open and signed in.
  await page.fill("#team-invite-email", "meenan@example.com");
  await page.locator("#team-invite-submit").click();
  await expect(page.locator("#team-invite-list .team-invite")).toHaveCount(1);

  // Server-sent events surface the invitation without a reload.
  await expect(guest.locator("#team-invitation")).toBeVisible({
    timeout: 5000,
  });
  await guest.locator("#team-invitation-accept").click();
  await expect(guest.locator("#team-overview")).toBeVisible();
  await expect(guest.locator("#team-member-count")).toHaveText("2");
  await expect(
    guest.locator("#task-list .item", { hasText: "Host task" }),
  ).toHaveCount(1);

  // New shared work in one tab appears in the other tab live.
  await guest.fill("#task-input", "Guest task");
  await guest.locator('#task-form button[type="submit"]').click();
  await expect(
    page.locator("#task-list .item", { hasText: "Guest task" }),
  ).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator("#team-member-count")).toHaveText("2");
});

test("sessions persist across reloads and logout preserves account data", async ({
  page,
}) => {
  await signUp(page, { name: "Carol", email: "carol@example.com" });
  await addTask(page, "Carry over");

  await page.reload();
  await expect(page.locator(".user-chip__name")).toHaveText("Carol");
  await expect(page.locator("#task-list .item")).toContainText("Carry over");

  await logout(page);
  await page.reload();
  await expect(page.locator("#auth-form")).toBeVisible();

  await signIn(page, "carol@example.com");
  await expect(page.locator("#task-list .item")).toContainText("Carry over");
});

test("progress updates show an exact timestamp with a relative tooltip", async ({
  page,
}) => {
  await signUp(page, {
    name: "Timekeeper",
    email: "timekeeper@example.com",
  });
  await addTask(page, "Timestamped task");

  const item = page.locator("#task-list .item", {
    hasText: "Timestamped task",
  });
  await setProgress(item, 35);
  await item.locator(".progress-note").fill("Checked in");
  await item.locator('[data-action="log-progress"]').click();

  await expect(item.locator(".log summary")).toContainText("1 update");
  // The log is saved through a debounced update; wait before reading the DB.
  await waitForDb((db) => {
    const user = db.users.find((entry) => entry.email === "timekeeper@example.com");
    const state = user ? (db.data[user.id] as { tasks?: { progressLog?: unknown[] }[] }) : null;
    return (state?.tasks?.[0]?.progressLog?.length ?? 0) === 1;
  });
  const time = item.locator(".log__time").first();
  await expect(time).toHaveAttribute("title", "Updated just now");

  const stored = (await storedState(page, "timekeeper@example.com")) as {
    tasks: { progressLog: { at: number }[] }[];
  };
  const at = stored.tasks[0].progressLog[0].at;
  const expected = await page.evaluate(
    (timestamp) =>
      new Date(timestamp).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    at,
  );

  await expect(time).toHaveText(expected);
  await expect(time).not.toHaveText(/just now|ago/);
  await expect(time).toHaveAttribute("datetime", new Date(at).toISOString());
});

test("hosts can remove teammates one by one and delete the team", async ({
  page,
}) => {
  await signUp(page, {
    name: "Host Hana",
    email: "hana@example.com",
    mobile: "555 111 1111",
  });
  await createTeam(page);
  await inviteByEmail(page, "ivan@example.com");
  await inviteByEmail(page, "jo@example.com");
  await logout(page);

  // Ivan joins and confirms a non-host cannot delete the team.
  await signUp(page, {
    name: "Ivan",
    email: "ivan@example.com",
    mobile: "555 222 2222",
    password: "password456",
  });
  await acceptInvitation(page);

  const ivanToken = await sessionToken(page);
  const joinedTeam = await storedTeam(page);
  expect(joinedTeam).not.toBeNull();
  if (!joinedTeam) return;

  const nonHostDelete = await page.request.delete(
    `/api/teams/${joinedTeam.id}`,
    { headers: { Authorization: `Bearer ${ivanToken}` } },
  );
  expect(nonHostDelete.status()).toBe(403);

  const nonHostRemove = await page.request.delete(
    `/api/teams/${joinedTeam.id}/members/${joinedTeam.hostId}`,
    { headers: { Authorization: `Bearer ${ivanToken}` } },
  );
  expect(nonHostRemove.status()).toBe(403);
  await logout(page);

  // Jo joins too, so the host can remove two teammates one at a time.
  await signUp(page, {
    name: "Jo",
    email: "jo@example.com",
    mobile: "555 333 3333",
    password: "password789",
  });
  await acceptInvitation(page);
  await logout(page);

  await signIn(page, "hana@example.com");
  await openTeam(page);
  await expect(page.locator("#team-member-count")).toHaveText("3");

  const ivan = await storedUser(page, "ivan@example.com");
  expect(ivan).toBeTruthy();
  await page.selectOption("#task-assignee", ivan?.id ?? "");
  await addTask(page, "Ivan handoff");

  const hostTeam = await storedTeam(page);
  expect(hostTeam).not.toBeNull();
  if (!hostTeam) return;

  // The host cannot remove themselves; deleting the team is the exit path.
  const hostToken = await sessionToken(page);
  const selfRemove = await page.request.delete(
    `/api/teams/${hostTeam.id}/members/${hostTeam.hostId}`,
    { headers: { Authorization: `Bearer ${hostToken}` } },
  );
  expect(selfRemove.status()).toBe(400);

  // Remove Ivan. His open task stays in the team but becomes unassigned.
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .locator(".team-member", { hasText: "ivan@example.com" })
    .locator('[data-action="remove-member"]')
    .click();
  await expect(page.locator("#team-member-count")).toHaveText("2");
  await expect(
    page.locator(".team-member", { hasText: "ivan@example.com" }),
  ).toHaveCount(0);
  await expect(page.locator("#team-manage-message")).toContainText(
    "Ivan was removed",
  );

  const afterIvan = await storedTeam(page);
  expect(afterIvan?.members.map((member) => member.userId)).not.toContain(
    ivan?.id,
  );
  expect(
    afterIvan?.state.tasks.find((task) => task.title === "Ivan handoff")
      ?.assigneeId,
  ).toBeNull();

  // Replay the pre-removal snapshot, as a delayed tab save would. The server
  // must not let a former member be restored as the assignee.
  const staleSave = await putTeamState(
    page,
    hostTeam.id,
    hostToken,
    hostTeam.state,
  );
  expect(staleSave.ok()).toBe(true);
  const afterStaleSave = await storedTeam(page);
  expect(
    afterStaleSave?.state.tasks.find((task) => task.title === "Ivan handoff")
      ?.assigneeId,
  ).toBeNull();

  // Remove Jo next, leaving the host alone.
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .locator(".team-member", { hasText: "jo@example.com" })
    .locator('[data-action="remove-member"]')
    .click();
  await expect(page.locator("#team-member-count")).toHaveText("1");
  await expect(page.locator("#team-delete")).toBeVisible();

  // Delete the entire team and confirm it disappears from the database.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#team-delete").click();
  await expect(page.locator("#team-gate")).toBeVisible();
  await expect.poll(async () => (await storedTeams(page)).length).toBe(0);

  // A removed teammate no longer has the team after signing back in.
  await logout(page);
  await signIn(page, "ivan@example.com", "password456");
  await openTeam(page);
  await expect(page.locator("#team-gate")).toBeVisible();
});

test("forgotten passwords can be reset without SMTP and old sessions stop working", async ({
  page,
}) => {
  await signUp(page, {
    name: "Rita Reset",
    email: "rita@example.com",
    mobile: "555 777 7777",
    password: "password123",
  });

  // Keep a second, independent session so the reset can invalidate it.
  const otherLogin = await page.request.post("/api/auth/login", {
    data: { email: "rita@example.com", password: "password123" },
  });
  expect(otherLogin.ok()).toBe(true);
  const otherToken = (await otherLogin.json()).token as string;
  expect(otherToken).toBeTruthy();

  await logout(page);
  await expect(page.locator("#auth-forgot-link")).toBeVisible();
  await page.locator("#auth-forgot-link").click();
  await expect(page.locator("#auth-forgot-form")).toBeVisible();

  await page.fill("#auth-email", "rita@example.com");
  await page.locator('#auth-forgot-form button[type="submit"]').click();
  await expect(page.locator("#auth-reset-link")).toBeVisible();

  const resetUrl = await page.locator("#auth-reset-link").getAttribute("href");
  expect(resetUrl).toContain("?reset=");
  if (!resetUrl) throw new Error("No password reset link was returned.");

  const beforeReset = await page.request.get("/api/session", {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  expect(beforeReset.status()).toBe(200);

  await page.goto(resetUrl);
  await expect(page.locator("#auth-reset-form")).toBeVisible();
  await page.fill("#auth-reset-password", "newpassword456");
  await page.fill("#auth-reset-confirm", "newpassword456");
  await page.locator('#auth-reset-form button[type="submit"]').click();

  // The reset signs the browser in and removes the reset token from the URL.
  await expect(page.locator(".app__title")).toHaveText("Taskly");
  await expect(page).not.toHaveURL(/reset=/);
  await expect(page.locator("#auth-reset-form")).toHaveCount(0);

  // Every older session was invalidated by the password change.
  const afterReset = await page.request.get("/api/session", {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  expect(afterReset.status()).toBe(401);

  await logout(page);

  // The old password fails and the new one works.
  await page.fill("#auth-email", "rita@example.com");
  await page.fill("#auth-password", "password123");
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator("#auth-error")).toContainText("Incorrect password");

  await page.fill("#auth-password", "newpassword456");
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator(".app__title")).toHaveText("Taskly");

  // A reset link can only be used once.
  const resetToken = new URL(resetUrl).searchParams.get("reset");
  const reuse = await page.request.post("/api/auth/reset-password", {
    data: { token: resetToken, password: "anotherpassword789" },
  });
  expect(reuse.status()).toBe(400);
});

test("theme toggle switches between light and dark and remembers the choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const background = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    );

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#theme-toggle")).toBeVisible();
  await expect(page.locator("#theme-toggle")).toHaveAttribute(
    "aria-label",
    "Switch to dark mode",
  );
  await expect.poll(background).toBe("#f4f5fb");

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#theme-toggle")).toHaveAttribute(
    "aria-label",
    "Switch to light mode",
  );
  await expect.poll(background).toBe("#0b0d14");

  // The choice survives a reload instead of following the system preference.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(background).toBe("#0b0d14");

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(background).toBe("#f4f5fb");
});

test("mobile layout stays within the viewport and dark mode applies", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);

  await assertFitsViewport(page, "390 board");

  await page.fill("#task-input", "Mobile task");
  await openPicker(page);

  const panelBox = await page.locator("#deadline-panel").boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await assertFitsViewport(page, "390 deadline picker");

  await page.locator("#deadline-cancel").click();
  await page.locator('#task-form button[type="submit"]').click();
  await expect(page.locator(".progress-note").first()).toBeVisible();
  await assertFitsViewport(page, "390 task list");

  // The team gate and the team overview both fit on a narrow screen.
  await page.locator("#workspace-team").click();
  await expect(page.locator("#team-gate")).toBeVisible();
  await assertFitsViewport(page, "390 team gate");
  await page.locator("#team-create-submit").click();
  await expect(page.locator("#team-overview")).toBeVisible();
  await assertFitsViewport(page, "390 team overview");

  await page.screenshot({
    path: "/tmp/opencode/react-todo-mobile.png",
    fullPage: true,
  });

  // Dark mode uses the dark design tokens.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bg")
          .trim(),
      ),
    )
    .toBe("#0b0d14");

  await assertFitsViewport(page, "390 dark mode");
  await page.screenshot({
    path: "/tmp/opencode/react-todo-dark.png",
    fullPage: true,
  });
});

test("layout adapts from small phones to wide desktops", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signUp(page);
  await addTaskWithDeadline(page, "Deadline task", "2020-01-01", "10:00");

  const viewports = [
    { width: 320, height: 568, label: "small phone" },
    { width: 360, height: 740, label: "phone" },
    { width: 390, height: 844, label: "large phone" },
    { width: 640, height: 800, label: "200% zoom reflow" },
    { width: 667, height: 375, label: "landscape phone" },
    { width: 768, height: 1024, label: "tablet portrait" },
    { width: 1024, height: 768, label: "small laptop" },
    { width: 1440, height: 900, label: "desktop" },
    { width: 1920, height: 1080, label: "wide desktop" },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await expect(page.locator("#task-input")).toBeVisible();
    await expect(page.locator(".sort__select")).toBeVisible();
    await expect(page.locator(".deadline").first()).toBeVisible();
    await assertFitsViewport(page, viewport.label);
  }

  // Primary controls remain reachable at the narrowest width.
  await page.setViewportSize({ width: 320, height: 568 });
  for (const selector of [
    ".app__logout",
    "#theme-toggle",
    ".check",
    ".progress__slider",
    ".icon-btn",
  ]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} has no box`).not.toBeNull();
    expect(box?.x ?? -1, `${selector} starts off-screen`).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      (box?.x ?? 0) + (box?.width ?? 0),
      `${selector} ends off-screen`,
    ).toBeLessThanOrEqual(321);
  }

  // A picker opened low on a short screen flips above the trigger.
  await page.setViewportSize({ width: 667, height: 375 });
  await openPicker(page);
  const panel = await page.locator("#deadline-panel").boundingBox();
  expect(panel).not.toBeNull();
  expect(panel?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(376);
  await assertFitsViewport(page, "landscape phone with picker open");
  await page.locator("#deadline-cancel").click();
});

test("long names, emails, and deadline badges wrap on a 320px phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signUp(page, { name: "A".repeat(80) });
  await assertFitsViewport(page, "320 long signup name");

  const longTitle = "Finish the released checklist ".repeat(6).trim();
  await addTaskWithDeadline(page, longTitle, "2020-01-01", "10:00");
  await expect(page.locator(".deadline").first()).toBeVisible();
  await assertFitsViewport(page, "320 long title and overdue badge");

  await createTeam(page);
  const longEmail = `${"x".repeat(200)}@example.com`;
  await inviteByEmail(page, longEmail);
  await assertFitsViewport(page, "320 long team name and invite email");
});

test("check-in applies reversible best-fit ordering without changing saved sort", async ({
  page,
}) => {
  await signUp(page);
  await addTask(page, "Alpha Review Dashboard UI #1");
  await setProgress(page.locator("#task-list .item").first(), 75);
  await addTask(page, "Zulu Refactor API Gateway #2");

  await expect(page.locator("#task-list .item").first()).toContainText(
    "Zulu Refactor API Gateway",
  );

  await page.locator("#checkin-energy-1 + span").click();
  await page.locator("#checkin-focus-2 + span").click();
  await page.locator("#checkin-time").selectOption("15");
  await page.locator("#checkin-save").click();

  await expect(page.locator("#best-fit-strip")).toBeVisible();
  await expect(page.locator("#task-list .item").first()).toContainText(
    "Alpha Review Dashboard UI",
  );
  await expect(page.locator(".sort__select")).toHaveValue("newest");

  await page.locator("#best-fit-strip button").click();
  await expect(page.locator("#best-fit-strip")).toBeHidden();
  await expect(page.locator("#task-list .item").first()).toContainText(
    "Zulu Refactor API Gateway",
  );

  const user = await storedUser(page);
  await waitForDb((db) =>
    Boolean(user && db.insights?.[user.id]?.checkIn?.energy === 1),
  );
});

test("draft advice appears and due recurring rules create tasks", async ({
  page,
}) => {
  await signUp(page);

  await page.fill("#task-input", "Review API Gateway #3");
  await expect(page.locator("#draft-advice")).toContainText("about 9 days");
  await page.fill("#task-input", "");
  await expect(page.locator("#draft-advice")).toHaveCount(0);

  const token = await sessionToken(page);
  const lastCreatedAt = Date.now() - 40 * 86_400_000;
  const saved = await page.request.put("/api/insights", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      insights: {
        recurringRules: [
          {
            id: "e2e-rule",
            title: "Review API Gateway",
            titleKey: "review api gateway",
            cadence: "weekly",
            intervalMs: 7 * 86_400_000,
            lastCreatedAt,
            createdAt: lastCreatedAt,
            sourceTaskIds: [],
            targetTeamId: null,
            enabled: true,
          },
        ],
      },
    },
  });
  expect(saved.ok()).toBe(true);

  await page.reload();
  await expect(page.locator("#recurring-run")).toBeEnabled();
  await page.locator("#recurring-run").click();

  await expect(page.locator("#task-list .item", { hasText: "Review API Gateway" })).toHaveCount(1);
  await waitForDb((db) =>
    [...Object.values(db.data)].some((state) =>
      ((state as { tasks?: { title: string }[] }).tasks ?? []).some(
        (task) => task.title === "Review API Gateway",
      ),
    ),
  );
});
