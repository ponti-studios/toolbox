// Shell environment variable resolution.
// Spawns $SHELL -ilc to read env vars that aren't inherited by non-login shells.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SHELL_LOOKUP_TIMEOUT_MS = 3000;

// ─── Single env var lookup ──────────────────────────────────────────
export async function resolveShellEnv(varName: string): Promise<string | null> {
  // Try direct process.env first
  const direct = process.env[varName]?.trim();
  if (direct) return direct;

  // Try shell login shell (macOS Raycast-style)
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const markerStart = `__AK_${varName}_START__`;
    const markerEnd = `__AK_${varName}_END__`;
    const script = `printf '${markerStart}%s${markerEnd}\\n' "$${varName}"`;

    const { stdout } = await execFileAsync(shell, ["-ilc", script], {
      encoding: "utf-8",
      timeout: SHELL_LOOKUP_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
    });

    const startIdx = stdout.lastIndexOf(markerStart);
    if (startIdx < 0) return null;

    const valueStart = startIdx + markerStart.length;
    const endIdx = stdout.indexOf(markerEnd, valueStart);
    if (endIdx < 0) return null;

    const value = stdout.slice(valueStart, endIdx).trim();
    return value || null;
  } catch {
    return null;
  }
}

// ─── Multiple env vars ──────────────────────────────────────────────
export async function resolveShellEnvMultiple(
  varNames: string[],
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const name of varNames) {
    result[name] = await resolveShellEnv(name);
  }
  return result;
}
