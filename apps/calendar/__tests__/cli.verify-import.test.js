const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function runCli(args) {
  const preload = path.join(__dirname, "helpers", "mock-calendar-helper.js");
  return spawnSync(process.execPath, ["-r", preload, path.join(__dirname, "..", "dist", "bin", "calendar.js"), ...args], { encoding: "utf8" });
}

test("verify-import reconciles source records with generated EventKit records", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calendar-verify-"));
  const file = path.join(dir, "source.ics");
  fs.writeFileSync(file, [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:U1",
    "DTSTART:20260819T090000Z",
    "RRULE:FREQ=WEEKLY",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:U3",
    "DTSTART:20260820T090000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:U4",
    "DTSTART:20260821T090000Z",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\n"));
  const result = runCli(["verify-import", file, "--calendar-id", "CAL1", "--json"]);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.valid).toBe(true);
  expect(report.reconciliation.uniqueUidCountMatches).toBe(true);
});
