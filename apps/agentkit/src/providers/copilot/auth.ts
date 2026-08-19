// Copilot auth: GH_TOKEN / GITHUB_TOKEN from env + shell lookup.
// Ported from the Raycast Agent Usage extension.
import { resolveShellEnv } from "../../utils/env.js";
import type { AuthResult } from "../../types.js";

// ─── Discover credentials ───────────────────────────────────────────
export async function discoverCopilotAuth(): Promise<AuthResult> {
  // Direct env
  const directToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (directToken) {
    return { token: directToken, authType: "env", source: "env:GITHUB_TOKEN" };
  }

  // Shell login lookup (Raycast-style)
  for (const varName of ["GITHUB_TOKEN", "GH_TOKEN"]) {
    const shellToken = await resolveShellEnv(varName);
    if (shellToken) {
      return { token: shellToken, authType: "env", source: `shell:${varName}` };
    }
  }

  return {
    token: null,
    authType: "env",
    source: "",
  };
}
