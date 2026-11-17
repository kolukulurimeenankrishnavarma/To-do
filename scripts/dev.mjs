import { spawn } from "node:child_process";
import path from "node:path";

const PORT = process.env.TASKLY_PORT || "8787";
const VITE = path.resolve("node_modules", "vite", "bin", "vite.js");

const children = [];
let shuttingDown = false;

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });

  children.push(child);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    process.exitCode = code ?? 0;
    shutdown();
  });
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // The process may already be gone.
      }
    }
  }

  setTimeout(() => process.exit(), 500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Taskly API: http://127.0.0.1:${PORT}`);
console.log("Taskly web: http://127.0.0.1:5173");

run(process.execPath, ["server/index.mjs"], { TASKLY_PORT: PORT });
run(process.execPath, [VITE, "--host", "127.0.0.1"], {
  VITE_API_TARGET: `http://127.0.0.1:${PORT}`,
});
