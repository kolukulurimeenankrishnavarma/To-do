import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ENV_FILE = path.resolve(HERE, "..", ".env");

/** Parse a small, dependency-free KEY=value file. Real env vars still win. */
export function parseEnvFile(contents) {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    } else {
      value = value.replace(/\s+#.*$/, "");
    }

    values[key] = value;
  }

  return values;
}

/**
 * Load .env once at startup. E2E runs deliberately skip it so local SMTP
 * credentials never change the app's no-SMTP link-in-UI behavior.
 */
export function loadEnvFile(file = ENV_FILE) {
  if (
    process.env.TASKLY_TEST_MODE === "1" ||
    process.env.TASKLY_SKIP_ENV_FILE === "1"
  ) {
    return {};
  }

  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    console.warn(`Could not read ${file}: ${error.message}`);
    return {};
  }

  const values = parseEnvFile(contents);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return values;
}
