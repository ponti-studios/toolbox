// OpenCode Go auth: workspace ID + auth cookie from env vars or shell lookup.
import { resolveShellEnv } from "../../utils/env.js";
import type { AuthResult } from "../../types.js";

export async function discoverOpenCodeAuth(): Promise<AuthResult> {
  // Direct env
  let workspaceId: string | undefined | null = process.env.OPENCODE_WORKSPACE_ID?.trim();
  let authCookie: string | undefined | null = process.env.OPENCODE_AUTH_COOKIE?.trim();

  // Shell login lookup (for tmux / non-login shells)
  if (!workspaceId) {
    workspaceId = await resolveShellEnv("OPENCODE_WORKSPACE_ID");
  }
  if (!authCookie) {
    authCookie = await resolveShellEnv("OPENCODE_AUTH_COOKIE");
  }

  if (!workspaceId || !authCookie) {
    return { token: null, authType: "cookie", source: "" };
  }

  return {
    token: authCookie,
    authType: "cookie",
    source: "env:OPENCODE_AUTH_COOKIE",
    extra: { workspaceId },
  };
}
