// OpenRouter auth: API key from env var or shell lookup.
import { resolveShellEnv } from "../../utils/env.js";
import type { AuthResult } from "../../types.js";

export async function discoverOpenRouterAuth(): Promise<AuthResult> {
  // Direct env
  const directKey = process.env.OPENROUTER_API_KEY?.trim();
  if (directKey) {
    return { token: directKey, authType: "api_key", source: "env:OPENROUTER_API_KEY" };
  }

  // Shell login lookup (for tmux / non-login shells)
  const shellKey = await resolveShellEnv("OPENROUTER_API_KEY");
  if (shellKey) {
    return { token: shellKey, authType: "api_key", source: "shell:OPENROUTER_API_KEY" };
  }

  return { token: null, authType: "api_key", source: "" };
}
