const [major, minor] = process.versions.node.split(".").map(Number);

const supported =
  (major === 20 && minor >= 19) ||
  (major === 22 && minor >= 12) ||
  major > 22;

if (!supported) {
  console.error(
    [
      "",
      `Taskly needs Node ^20.19.0 or >=22.12.0, but this shell is using ${process.versions.node}.`,
      "",
      "Install Node 22+ (or switch with nvm), open a new terminal, then run the command again.",
      "See the README for details.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
