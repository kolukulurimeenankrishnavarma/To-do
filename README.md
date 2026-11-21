# Taskly — React To-Do

A React + TypeScript version of **Taskly**, the small to-do app with deadlines,
progress notes, and a completion history. It keeps the same visual design as the
original vanilla app, and adds accounts, separate private task lists, and teams
where members can share work, assign responsibility, and monitor progress.
Accounts, teams, and task data live in a local Node server backed by
`data/db.json`, so teammates on the same network see the same shared work.
Teams are independent, so several accounts can each host their own.

The vanilla version lives in the sibling `../to-do` directory.

## Accounts

Taskly has separate **Sign in** and **Create account** modes:

- **Create account** requires a **full name**, **email address**, and **mobile
  number**, plus a password.
- **Sign in** uses the **email address and password** only. Mobile numbers are
  saved on the profile but are never used to sign in.
- **Email** addresses are case-insensitive, and an email can only have one
  account.
- **Mobile numbers** accept spaces, dashes, dots, and parentheses. Choose a
  country code from the searchable picker and enter the national number, or type
  a full international number starting with `+`. Typing a dial code such as `91`
  in the country search selects India and a national `98765 43210` becomes
  `+919876543210`.
- **Validation warnings** appear inline **while typing**, before the form is
  submitted, including duplicate-email notices checked against the server.
- Passwords must be at least 8 characters.
- **Forgot password?** on the sign-in screen creates a single-use reset link
  that expires after one hour. Setting a new password signs out every existing
  session. With SMTP configured the link is emailed; without SMTP it appears in
  the UI so local setups still work without email delivery.
- Sessions persist across reloads. **Log out** clears the session but keeps the
  account's tasks and history.
- Each tab holds its own bearer token in `sessionStorage`. That means two tabs
  can be signed in as two different teammates at once, which is handy for trying
  the invitation flow locally.
- Each account has a **My tasks** workspace. Tasks and history there are stored
  per user in the server database, so switching accounts never mixes private
  lists.
- **Team tasks** is invitation-based and supports multiple independent teams.
  Each account can host its own team, belong to several teams, and accept a new
  invitation even while already on another team. An invitation must be accepted
  from the matching account before that team's shared tasks are visible.

The server stores passwords as salted PBKDF2-SHA256 hashes (150,000 iterations),
never as plain text, and only sends a reduced profile to the browser. It is
still a small local app: bind it to `127.0.0.1` unless you deliberately want
other devices on your network to connect.

Invitations are delivered in-app and by shareable invite links. If SMTP is
configured, the server also emails the invitation. Without SMTP, the host can
copy the link (`/?invite=<id>`) and send it over any channel. Password reset
links (`/?reset=<token>`) follow the same pattern and are shown directly in the
sign-in screen when SMTP is unavailable. Realtime updates use server-sent
events, so tabs and browsers pointed at the same server stay in sync. Google
sign-in is unavailable because it needs an external OAuth server.

Each invited teammate needs an account whose email address exactly matches the
invitation.

## Team workspace

Use the **My tasks / Team tasks** toggle beside the title to switch workspaces.
They keep separate task lists and histories.

The Team workspace is built for coordination without manual sync meetings:

- **Independent teams, one host each** — any account can create a team and
  become its host. Creating a team never moves anyone else into it, so a second
  account can always start its own team. When you belong to more than one team,
  a team switcher shows every team with a **Host** badge on the ones you own and
  a **New team** button.
- **Invite by email** — the host enters a teammate's email address. Pending
  invitations appear as a banner in **My tasks** and as invitation cards in
  **Team tasks**, so they are easy to find and accept. The host can copy each
  invite link, and the server emails it automatically when SMTP is configured.
  An invitee can accept even if they already belong to another team.
- **Host controls** — the host can remove teammates one by one or delete the
  entire team. Removed members lose access immediately; their open tasks become
  unassigned so the team does not lose work, while completed history stays
  intact. A host cannot remove themselves; deleting the team is the exit path.
  Every action is checked on the server, so a direct API call cannot bypass it.
- **Explicit membership** — only accepted members see a team's shared tasks.
  There is no global "outsider" screen: an account with no teams and no
  invitations simply sees the create-team panel, and private lists stay intact.
- **Assignment** — any accepted member can create a team task and assign it to
  any member of that team or leave it unassigned. Owners can be changed from the
  task row, and are preserved in shared history.
- **Responsibility** — only the assigned member can mark a task complete,
  change its progress, rename it, or delete it. Finished work follows the same
  rule for rename, restore, and delete. Everyone else can read it, comment on
  it, and reassign it. An unassigned task can be claimed by any member (the host
  included) by updating or finishing it; shared history records who actually did
  the work. Bulk clearing is hidden in team mode so it cannot bypass these
  rules, and the server enforces the same checks, so a direct API call cannot
  bypass them either.
- **Three central totals** — team mode shows exactly three summary boxes: open,
  overdue, and unassigned. The private stats bar is hidden so nothing is
  duplicated.
- **Member progress** — each member has an overall bar that keeps completed
  history in the calculation. Finishing a task raises progress instead of
  resetting it to zero.
- **Shared updates** — the six latest progress updates and comments show the
  exact date/time (for example `Nov 11, 2026, 4:02 PM`) with a relative-time
  tooltip, and credit the member who wrote them.
- **Live over the network** — changes are persisted by the server and pushed to
  other members through server-sent events. Any browser or device pointed at the
  same server sees the same shared work.

Each tab remembers its active team in `sessionStorage`, so two tabs can watch
different teams side by side while still seeing live updates for both.

## Stack

- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite 8](https://vite.dev/)
- [Vitest](https://vitest.dev/) for unit tests
- [Playwright](https://playwright.dev/) for browser tests

Requires Node `^20.19.0` or `>=22.12.0` (Vite 8's requirement). This is also
declared in `package.json` under `engines`, and the npm scripts run a preflight
check with a clear message if the active Node is too old.

This machine has Node 22.14.0 installed under `~/.local/share/node-v22.14.0`,
with `node`, `npm`, and `npx` symlinked into `~/.local/bin` (already first on
`PATH`). If an existing terminal still reports Node 18, run `hash -r` or open a
new terminal.

If you use nvm, `.nvmrc` / `.node-version` pin Node 22.14.0:

```bash
nvm install
nvm use
```

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` starts the local API on <http://127.0.0.1:8787> and Vite on
<http://127.0.0.1:5173>. Open the Vite URL for hot reload; Vite proxies `/api`
to the Node server.

For a production-style run, build once and start only the server:

```bash
npm run build
npm start
```

The Node server serves the built `dist/` app and the API from the same origin at
<http://127.0.0.1:8787>.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TASKLY_PORT` | `8787` | API and production web port |
| `TASKLY_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` for a LAN) |
| `TASKLY_DB` | `data/db.json` | JSON database file |
| `TASKLY_PUBLIC_URL` | request origin | Base URL used in invite and reset links (set this in production) |
| `TASKLY_TRUST_PROXY` | off | Set to `1` behind Render/reverse proxies so HTTPS links use forwarded headers |
| `TASKLY_TEST_MODE` | off | Enables `POST /api/test/reset` for E2E; also ignores `.env` |
| `TASKLY_SKIP_ENV_FILE` | off | Set to `1` to ignore `.env` without test mode |
| `TASKLY_SMTP_URL` | unset | SMTP URL, e.g. `smtp://user:pass@smtp.example.com:587` |
| `TASKLY_SMTP_HOST` | unset | SMTP host when not using `TASKLY_SMTP_URL` |
| `TASKLY_SMTP_PORT` | `587` (`465` with `SECURE=1`) | SMTP port |
| `TASKLY_SMTP_USER` / `TASKLY_SMTP_PASS` | empty | SMTP credentials; many relays need an app password or API key |
| `TASKLY_SMTP_SECURE` | `0` | Set to `1` for implicit TLS (normally port 465) |
| `TASKLY_SMTP_STARTTLS` | `1` | Set to `0` only for a local relay that cannot upgrade |
| `TASKLY_SMTP_FROM` | SMTP user | Sender address; display names such as `Taskly <hi@example.com>` are supported |
| `TASKLY_TEST_EMAIL` | unset | Default recipient for `npm run mail:test` |

Environment variables can be placed in a `.env` file in the project root.
Start the server with `npm start` or `npm run dev` and it is loaded
automatically. Real shell/process variables take precedence, `.env` is ignored
by Git, and E2E runs skip it so local credentials never change test behavior.

### Email (SMTP) setup

1. Copy the template: `cp .env.example .env`.
2. Set `TASKLY_PUBLIC_URL` to the exact address teammates use in the browser
   (for example `https://tasks.example.com`). Invitation and reset links use it,
   so links still work behind a reverse proxy or on another device.
3. Uncomment **either** `TASKLY_SMTP_URL` **or** the individual
   `TASKLY_SMTP_*` lines. URL credentials must be percent-encoded (`@` → `%40`).
4. Use your provider's SMTP host, port, username, and password. For Gmail and
   Outlook, create an **app password**; for SendGrid/Resend/Brevo, use the API
   key as the password and the provider's documented username.
5. Test delivery, then restart the server:

   ```bash
   npm run mail:test -- --to you@example.com
   npm start
   ```

`GET /api/meta` reports `smtpConfigured`. When SMTP is configured, invitation
and reset URLs are not returned in API responses; the server emails them and
responses include `emailSent` / `emailError`. When it is not configured, the UI
keeps showing the links so local setups still work without a mail provider.
Delivery errors are reported to the caller rather than failing silently.

JSON writes are serialized in-process and written atomically (`write temp file →
rename`). Back up `data/db.json` to keep accounts and tasks.

### Gmail app password

Gmail needs an **app password**; your normal Google password will not work.

1. Turn on 2-step verification at <https://myaccount.google.com/security>.
2. Open <https://myaccount.google.com/apppasswords>, choose **Mail** and
   **Other (Custom name)** such as `Taskly`, then generate.
3. Copy the 16-character password (spaces can be omitted).
4. Use your full Gmail address as `TASKLY_SMTP_USER`, that app password as
   `TASKLY_SMTP_PASS`, and `Taskly <you@gmail.com>` as `TASKLY_SMTP_FROM`.

Never put the app password in a committed file. Keep it in local `.env` or in
the Render dashboard's environment variables.

## Deploy to Render

This app needs a Node server for accounts, the JSON database, SSE realtime
updates, and SMTP email. **GitHub Pages only serves static files**, so it cannot
run Taskly; use Render for the app (GitHub Pages could only host a separate
static landing page).

Both blueprints build the client and run the same server that serves `dist/`
and `/api/*` from one origin. `TASKLY_TRUST_PROXY=1` makes generated links use
`https://` on Render.

1. Push this repository to GitHub (it is already public at
   `https://github.com/kolukulurimeenankrishnavarma/To-do.git`).
2. In Render, choose **New → Blueprint** and connect that repository.
3. Select `render.yaml` for a free web service, or `render-persistent.yaml` if
   you want data to survive restarts (paid plan with a persistent disk).
4. When prompted, set:
   - `TASKLY_SMTP_USER` = your full Gmail address
   - `TASKLY_SMTP_PASS` = the 16-character Gmail app password
   - `TASKLY_SMTP_FROM` = `Taskly <you@gmail.com>`
5. After the first deploy, open the service's **Environment** tab and add
   `TASKLY_PUBLIC_URL` = `https://<your-service>.onrender.com` (or your custom
   domain), then **Redeploy**. This is the address in invitation and reset
   emails; setting it explicitly prevents links from depending on request
   headers.
6. Check `https://<your-service>.onrender.com/api/health` and `/api/meta`.
   `smtpConfigured` should be `true`. Invite a teammate and use **Forgot
   password** to confirm real emails arrive.

Free web services sleep when idle, so the first request after inactivity can be
slow, and the JSON database is ephemeral. Use `render-persistent.yaml` (or add a
persistent disk yourself) for a real shared deployment. To add it manually:
create a 1 GB disk mounted at `/data` on a paid plan and set
`TASKLY_DB=/data/db.json`.

## Scripts

| Command              | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Start the API and Vite dev server together          |
| `npm run dev:web`    | Start only Vite (proxies `/api` to port 8787)       |
| `npm run server`     | Start only the Node API/server                     |
| `npm start`          | Start the server against the built `dist/`          |
| `npm run build`      | Type-check and build production assets into `dist`  |
| `npm run preview`    | Serve the production build with Vite preview       |
| `npm test`           | Run Vitest unit tests once                         |
| `npm run test:watch` | Run Vitest in watch mode                           |
| `npm run test:e2e`   | Run the Playwright browser suite                   |
| `npm run mail:test`  | Send a test email using the configured SMTP server  |
| `npm run typecheck`  | Run TypeScript project checks                      |
| `npm run lint`       | Run oxlint                                         |

Playwright needs a browser binary once:

```bash
npx playwright install chromium
```

The E2E config starts a test API on port `8788` with an isolated database under
`test-results/e2e-db.json`, plus Vite on port `4173`.

## Features

Parity with the vanilla app:

- Add tasks with an optional deadline
- Deadline picker with **Today** / **Tomorrow** / **Next week** presets,
  separate date/time fields, live preview, **Save deadline**, cancel, and clear
- Overdue, due-today, and due-tomorrow deadline highlighting
- Progress slider plus **Log progress** (or `Enter` in the note field)
- Optional notes on every progress update
- Expandable progress log with an exact date/time on every entry (for example
  `Nov 11, 2026, 4:02 PM`) and a relative-time tooltip
- Check a task off to move it into **History** at 100%, preserving its deadline
  and full progress log
- Automatic `100% — Task completed` entries where needed
- On-time / late badges for finished tasks
- Restore finished tasks with deadline, progress, and log intact
- Delete individual tasks, clear the to-do list, or clear history
- Account chip, log out, and a pending-task count in the browser tab title
- Light/dark theme toggle that starts from the system preference, remembers
  the chosen mode, and keeps text and controls readable in both themes
- Responsive, keyboard-accessible layout that reflows from 320px phones through
  tablets and 200% zoom to wide desktops, with touch-sized controls, wrapped
  long text, and popovers that stay inside the viewport

React-only enhancements:

- **Accounts** — separate sign-up and sign-in modes with live inline
  validation, a searchable country-code picker, persistent sessions, and
  private tasks/history per user
- **My tasks / Team tasks workspaces** — a toggle beside the title switches
  between personal work and server-backed shared team boards
- **Team membership** — independent team creation, email invitations,
  accept/decline, multiple memberships per account, member-only shared tasks,
  and a switcher for moving between teams
- **Team assignment** — any member can pick an owner when adding a team task or
  reassign it inline; the owner is preserved in shared history
- **Team overview** — three summary boxes (open, overdue, unassigned), a member
  roster with host/you badges and overall progress, and the latest updates
- **Per-tab sessions** — two tabs can be signed in as different teammates
- **Filters** — a sidebar with All tasks / Pending / Overdue / Completed, each
  with a live count. Pending means still open within its deadline; overdue means
  past its target date and time; completed opens the full history.
- **Sorting** — newest, deadline soonest (undated last), progress high/low,
  or title A–Z. Your last choice is remembered across reloads.
- **Stats summary** — pending, overdue, and completed totals
- **Inline title editing** — click a task or history title to rename it in
  place; `Enter` or blur saves, `Esc` cancels
- **Private daily check-in** — the first time **My tasks** opens each day, a
  one-question-at-a-time wizard asks three rotating mood questions, then direct
  energy and available-time questions. Answers are stored once per day and
  never asked twice in the same check-in.
- **Private recommendations** — today's check-in suggests tasks that fit your
  mood, energy, and time, plus quick wins that may lift momentum. A reversible
  **Best-fit order** control reorders private All/Pending tasks without
  changing your saved sort; Overdue and Completed stay as they are.
- **Seven-day personal baseline** — after seven active private days, Taskly
  learns your daily completion streak. Adding tasks up to that streak triggers
  a friendly nudge, never a block. Repeated tasks with recorded durations get
  an advisory deadline suggestion. Every recommendation is per-user,
  rule-based, and advisory only; the team workspace is unchanged.

## Storage format

Accounts, sessions, every team's shared state, and per-user task data live in the
server's JSON database (`data/db.json` by default):

```json
{
  "version": 7,
  "revision": 12,
  "users": [
    {
      "id": "user_...",
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "emailKey": "ada@example.com",
      "mobile": "+15551234567",
      "mobileKey": "15551234567",
      "salt": "base64…",
      "hash": "base64…",
      "iterations": 150000,
      "createdAt": 0
    }
  ],
  "data": {
    "user_...": {
      "tasks": [
        {
          "id": "...",
          "title": "...",
          "createdAt": 0,
          "deadline": 0,
          "assigneeId": null,
          "progress": 40,
          "progressLog": [
            {
              "value": 40,
              "at": 0,
              "note": "Bought the vegetables",
              "by": "user_..."
            }
          ]
        }
      ],
      "history": [
        {
          "id": "...",
          "title": "...",
          "createdAt": 0,
          "deadline": null,
          "assigneeId": null,
          "progress": 100,
          "progressLog": [
            { "value": 40, "at": 0, "note": "Bought the vegetables" },
            { "value": 100, "at": 0, "note": "Task completed" }
          ],
          "completedAt": 0
        }
      ]
    }
  },
  "insights": {
    "user_...": {
      "version": 1,
      "checkIn": {
        "day": "2026-11-21",
        "energy": 4,
        "mood": 3.7,
        "timeWindow": 45,
        "answers": [
          { "id": "clarity", "prompt": "I feel clear-headed about my work.", "value": 4 },
          { "id": "motivation", "prompt": "I feel motivated to start something new.", "value": 3 },
          { "id": "patience", "prompt": "Small delays are easy for me to handle.", "value": 4 }
        ],
        "createdAt": 0
      },
      "lastPromptDay": "2026-11-21",
      "updatedAt": 0
    }
  },
  "teams": [
    {
      "id": "team_...",
      "name": "Ada's team",
      "hostId": "user_...",
      "createdAt": 0,
      "members": [
        { "userId": "user_...", "role": "host", "joinedAt": 0 },
        { "userId": "user_...", "role": "member", "joinedAt": 0 }
      ],
      "invites": [
        {
          "id": "invite_...",
          "email": "bob@example.com",
          "emailKey": "bob@example.com",
          "invitedByUserId": "user_...",
          "createdAt": 0,
          "status": "pending",
          "respondedAt": null,
          "acceptedByUserId": null
        }
      ],
      "state": {
        "tasks": [
          {
            "id": "...",
            "title": "Ship release",
            "createdAt": 0,
            "deadline": null,
            "assigneeId": "user_...",
            "progress": 40,
            "progressLog": []
          }
        ],
        "history": []
      }
    }
  ],
  "sessions": [
    {
      "tokenHash": "sha256…",
      "userId": "user_...",
      "createdAt": 0
    }
  ],
  "passwordResets": [
    {
      "tokenHash": "sha256…",
      "userId": "user_...",
      "createdAt": 0,
      "expiresAt": 0
    }
  ]
}
```

`email` and `mobile` are display forms; `emailKey` (lowercased email) and
`mobileKey` (digits only) are lookup keys. Passwords are never stored directly:
`salt`, `hash`, and `iterations` are the PBKDF2-SHA256 record used to verify a
login. Session tokens are never stored either; only their SHA-256 hashes are
kept. `deadline` is `null` when unset. `assigneeId` points at a user ID for team
tasks and is `null` for private or unassigned tasks. `progressLog[].by` is the
member who wrote a comment or update, so comments from teammates are credited to
the right person.

`passwordResets[]` stores only SHA-256 hashes of single-use reset tokens, with a
one-hour expiry. A successful reset replaces the password hash, deletes the
user's reset tokens, and removes every session for that account. Expired reset
tokens and sessions are dropped when the database is loaded.

`teams[]` holds every independent team. Each team's `state` is shared with its
accepted members, while `data[userId]` is always private to that user. Team
`members` has exactly one `host`; everyone else is a `member`.
`invites[].status` is `pending`, `accepted`, or `declined`, and each invitation
belongs to a specific team. `revision` increments on every mutation and drives
live-update notifications. Removing a member deletes their membership and
unassigns their open tasks while leaving completed history alone; deleting a
team removes the whole record for every member. A stale team save that names a
former member as assignee is normalized to unassigned, so a delayed request
cannot undo a removal.

When a team snapshot is saved, the server compares it with the stored state:
moving another member's task into history or changing its progress is rejected,
while comments, reassignment, and claiming unassigned work are allowed. This
keeps the permission rule enforced even when the HTTP API is called directly.

The server serializes every mutation and persists it atomically by writing a
temporary file and renaming it over `data/db.json`. On load it normalizes the
file: malformed tasks are dropped, progress is clamped, and expired or orphaned
sessions are removed. Each task keeps at most 100 log entries, and notes are
limited to 280 characters.

In the browser, the current tab's bearer token and client ID live in
`sessionStorage` under `taskly.server.token` and `taskly.server.client`. The
active team selection is kept under `taskly.v4.team` so two tabs can watch
different teams. There is no authoritative app data left in localStorage.

## Project structure

```text
src/
  App.tsx                 session shell: restores session, auth or board
  main.tsx                React entry point
  styles.css              shared design system + auth/account styles
  types.ts                task, user, auth, result, filter, and sort types
  components/
    AuthField.tsx         labelled auth input with inline warning
    AuthScreen.tsx        sign-up/sign-in plus forgot/reset password panels
    CountryPicker.tsx     searchable flag/dial-code combobox
    DailyCheckIn.tsx      one-question daily private check-in wizard
    DeadlineBadge.tsx     due/overdue/on-time/late labels
    DeadlinePicker.tsx    popover, presets, preview, save/cancel/clear
    EditableTitle.tsx     inline rename with Enter/Escape handling
    EmptyState.tsx        shared empty-list message and recovery action
    HistoryItem.tsx       completed-task row and restore action
    Icons.tsx             inline SVG icons, including the profile glyph
    InsightPanel.tsx      private suggestions, streak, and advisory notices
    ProgressControls.tsx  slider, note field, log button
    ProgressLog.tsx       expandable log with exact timestamps
    StatsBar.tsx          pending/overdue/completed summary
    StatusMessage.tsx     shared auth/team success and error feedback
    TaskForm.tsx          new-task form, deadline, team assignment
    TaskItem.tsx          active-task row and inline reassignment
    TasklyBoard.tsx       board layout around the state hook
    TaskToolbar.tsx       view hint and sort select
    TeamGate.tsx          create-team and pending-invitation panels
    TeamOverview.tsx      totals, roster, invites, host controls, updates
    ThemeToggle.tsx       light/dark mode control
  lib/
    api.ts                server client, tab token/client IDs, SSE URL
    auth.ts               name/email/mobile/password validation
    constants.ts          storage keys, limits, auth parameters
    countryCodes.ts       country names, flags, dial codes, locale default
    date.ts               deadline labels, picker helpers, timestamps
    id.ts                 local task IDs
    insights.ts           rotating questions, baseline, nudges, task scoring
    insights.test.ts      rule-engine unit tests
    popoverPlacement.ts   keeps popovers inside the viewport
    progress.ts           clamping and note-aware progress entries
    snapshotHistory.ts    bounded history of locally saved snapshots
    sortPreference.ts     remembered sort choice
    storage.ts            safe storage access + empty task-state factory
    tabState.ts           per-tab active team selection
    taskPermissions.ts    single assignee-only client-side guard
    tasks.ts              completion, filters, sorting, stats
    theme.ts              system/remembered theme handling
    useAsyncAction.ts     shared in-flight action state
    useTaskBoard.ts       private/team board state, actions, persistence
    useTransientFlag.ts   short-lived UI flags
server/
  index.mjs             route table, SSE wiring, static dist/ serving
  authRoutes.mjs        register/login/forgot/reset/logout handlers
  insightRoutes.mjs     private GET/PUT check-in handlers
  insights.mjs          private check-in normalization
  teamRoutes.mjs        team, invite, and state-save handlers
  db.mjs                serialized atomic JSON persistence
  state.mjs             task/team state normalization
  permissions.mjs       shared server-side ownership checks
  sessions.mjs          bearer lookup, token hashing, session invalidation
  validation.mjs        auth validation and PBKDF2 helpers
  smtp.mjs              optional invitation and reset email delivery
  sse.mjs               server-sent event broadcast
  urls.mjs              public invite/reset URL construction
  env.mjs               .env loading
  http.mjs              JSON/error responses and request body reading
  responses.mjs         shared session and mutation response helpers
  views.mjs             session payload and team/invitation projections
  staticFiles.mjs       built-asset serving with traversal guard
  mail-test.mjs         `npm run mail:test` entry point
scripts/
  check-node.mjs        Node version preflight used by npm scripts
  dev.mjs               starts the API and Vite together
tests/
  e2e/app.spec.ts        Playwright coverage of the main flows
```

API routes:

```text
GET    /api/health                   server liveness check
GET    /api/meta                     first-run and SMTP status
POST   /api/auth/register            create account and session
POST   /api/auth/login               email + password login
POST   /api/auth/forgot-password     create a single-use reset link
POST   /api/auth/reset-password      set a new password and session
GET    /api/check-email?email=       duplicate-email check
GET    /api/session                  current user, private state, teams, invites
POST   /api/auth/logout              revoke this tab's session
PUT    /api/private-state            save private tasks/history
GET    /api/insights                 current user's private check-in
PUT    /api/insights                 save current user's private check-in
POST   /api/teams                    create a team
PUT    /api/teams/:id/state          save shared tasks/history
POST   /api/teams/:id/invites        invite by email
POST   /api/teams/:id/invites/:invite/accept|decline
DELETE /api/teams/:id/invites/:invite
DELETE /api/teams/:id/members/:user  host removes one teammate
DELETE /api/teams/:id                host deletes the whole team
GET    /api/events?token=&client=    server-sent realtime updates
POST   /api/test/reset               E2E-only database reset (TASKLY_TEST_MODE=1)
```

Every route except `/api/health`, `/api/meta`, `/api/events`,
`/api/check-email`, auth registration/login/reset, and the test reset needs a
bearer token from `/api/auth/register`, `/api/auth/login`, or
`/api/auth/reset-password`. Team host controls and task ownership are checked
again on the server, so calling `PUT /api/teams/:id/state` directly cannot grant
permissions the browser does not allow.

## Tests

```bash
npm test          # unit tests for pure helpers, validation, and SMTP
npm run test:e2e  # browser flows at phone, tablet, laptop, and desktop sizes
npm run build     # includes tsc project checks
```

Unit tests run from both source trees:

- `src/lib/auth.test.ts` — name, email, mobile, and password validation
- `src/lib/tasks.test.ts` — filters, sorting, completion, and statistics
- `src/lib/insights.test.ts` — question rotation, baseline, nudges, and scoring
- `src/lib/date.test.ts` — deadline labels, picker helpers, and timestamps
- `src/lib/api.test.ts` — typed API responses, including email availability
- `src/lib/taskPermissions.test.ts` — assignee-only client-side task rules
- `src/lib/snapshotHistory.test.ts` — bounded history of local save snapshots
- `server/insights.test.mjs` — private check-in normalization bounds
- `server/validationParity.test.mjs` — client/server validation constants and
  message parity
- `server/permissions.test.mjs` — server-side task ownership checks
- `server/smtp.test.mjs` — SMTP configuration and delivery through a local fake
  server
- `server/env.test.mjs` — `.env` parsing and precedence
- `server/urls.test.mjs` — public invite/reset URL construction

The E2E suite resets the server database before each test and covers
name/email/mobile signup, email-only login, duplicate emails, typed country-code
selection (including `91` → India), the country-code prefixing rules, live
validation warnings, wrong passwords, private task isolation, team creation and
email invitation, invite acceptance/decline, independent teams hosted by
different accounts, invitations to someone who already belongs to another team,
team switching, the pending-invitation banner, live cross-tab invitations and
shared-task updates over SSE, team assignment, assignee-only completion and
progress with comments/reassignment for everyone else, server-side rejection of
unauthorized team edits, claiming unassigned work, the three-box overview,
overall member progress that survives completion, host-only teammate removal
with task unassignment, team deletion, the full no-SMTP password reset flow,
session invalidation after a reset, session persistence and logout, exact
progress timestamps, the deadline picker, progress notes and persistence,
completion/history/restore, sidebar filters/sort/stats, inline rename, the
one-question daily check-in and its one-per-day storage, the seven-day streak
nudge, advisory repeated-task deadlines with team isolation, reversible best-fit
ordering, the persisted light/dark toggle, and dark mode. The responsive checks
assert real
element bounds and text wrapping at 320px, 360px, 390px, 640px (200% zoom),
667×375 landscape, 768px, 1024px, 1440px, and 1920px, including long names,
emails, task titles, overdue deadlines, and popover placement on short screens.
Unit tests exercise SMTP configuration and delivery against a local fake SMTP
server; `npm run mail:test` verifies a real provider once credentials are set.
