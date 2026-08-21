const { spawnSync } = require("child_process");
const readline = require("readline");

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function promptYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(false);

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer: string) => {
      rl.close();
      const normalized = String(answer || "")
        .trim()
        .toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

export function openCalendarsPrivacySettings(): void {
  const url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars";
  spawnSync("open", [url], { stdio: "ignore" });
}
