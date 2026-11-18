import { describe, expect, it } from "vitest";
import { rememberSnapshot, SNAPSHOT_HISTORY_LIMIT } from "./snapshotHistory";

describe("rememberSnapshot", () => {
  it("keeps distinct snapshots in save order", () => {
    const history: string[] = [];
    rememberSnapshot(history, "a");
    rememberSnapshot(history, "b");
    expect(history).toEqual(["a", "b"]);
  });

  it("moves a repeated snapshot to the newest position", () => {
    const history: string[] = [];
    rememberSnapshot(history, "a");
    rememberSnapshot(history, "b");
    rememberSnapshot(history, "a");
    expect(history).toEqual(["b", "a"]);
  });

  it("bounds the history to avoid retaining every edit", () => {
    const history: string[] = [];
    for (let index = 0; index < SNAPSHOT_HISTORY_LIMIT + 2; index += 1) {
      rememberSnapshot(history, `snapshot-${index}`);
    }
    expect(history).toHaveLength(SNAPSHOT_HISTORY_LIMIT);
    expect(history[0]).toBe("snapshot-2");
    expect(history.at(-1)).toBe(`snapshot-${SNAPSHOT_HISTORY_LIMIT + 1}`);
  });
});
