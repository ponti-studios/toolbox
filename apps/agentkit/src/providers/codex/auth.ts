// Codex auth: OAuth credential discovery from ~/.codex/auth.json
// Ported from the Raycast Agent Usage extension.
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AuthResult } from "../../types.js";

const DEFAULT_CODEX_AUTH_FILE = path.join(os.homedir(), ".codex", "auth.json");

// ─── Auth file shape ────────────────────────────────────────────────
interface CodexAuthFile {
  OPENAI_API_KEY?: string;
  tokens?: {
    access_token?: string;
    account_id?: string;
    accountId?: string;
    id_token?: string;
  };
}

// ─── Discover credentials ───────────────────────────────────────────
export function discoverCodexAuth(): AuthResult {
  const codexHome = process.env.CODEX_HOME?.trim() ?? path.join(os.homedir(), ".codex");
  const authPath = path.join(codexHome, "auth.json");

  if (!fs.existsSync(authPath)) {
    return { token: null, authType: "oauth", source: "" };
  }

  try {
    const raw = fs.readFileSync(authPath, "utf-8");
    const parsed = JSON.parse(raw) as CodexAuthFile;

    const token = parsed.tokens?.access_token?.trim();
    const accountId = parsed.tokens?.account_id?.trim() ?? parsed.tokens?.accountId?.trim();

    if (token) {
      return {
        token,
        authType: "oauth",
        source: authPath,
        extra: accountId ? { accountId } : undefined,
      };
    }

    // Fallback: OPENAI_API_KEY
    const apiKey = parsed.OPENAI_API_KEY?.trim();
    if (apiKey) {
      return {
        token: apiKey,
        authType: "api_key",
        source: authPath,
      };
    }
  } catch {
    // corrupt file
  }

  return { token: null, authType: "oauth", source: "" };
}
