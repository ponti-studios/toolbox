// macOS Keychain operations.
// Used by Claude provider to read/store OAuth credentials.
import { execSync } from "node:child_process";

const KEYCHAIN_SERVICE = "Claude Code-credentials";

// ─── Read password ──────────────────────────────────────────────────
export function readKeychainPassword(service: string = KEYCHAIN_SERVICE): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const result = execSync(`security find-generic-password -s ${JSON.stringify(service)} -w`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

// ─── Read account name ──────────────────────────────────────────────
export function readKeychainAccount(service: string = KEYCHAIN_SERVICE): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const result = execSync(
      `security find-generic-password -s ${JSON.stringify(service)} -g 2>&1`,
      {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const match = result.match(/"acct"<blob>="([^"\n]*)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Write password ─────────────────────────────────────────────────
export function writeKeychainPassword(service: string, account: string, value: string): void {
  if (process.platform !== "darwin") return;
  try {
    execSync(
      `security add-generic-password -U -a ${JSON.stringify(account)} -s ${JSON.stringify(service)} -w ${JSON.stringify(value)}`,
      { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch {
    // Best effort
  }
}
