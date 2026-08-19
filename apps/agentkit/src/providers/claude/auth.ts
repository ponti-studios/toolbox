// Claude Code auth: OAuth credential discovery from ~/.claude/.credentials.json
// and macOS Keychain fallback. Ported from the Raycast Agent Usage extension.
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readKeychainPassword } from "../../utils/keychain.js";
import type { AuthResult } from "../../types.js";

const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
const DEFAULT_CLAUDE_CONFIG_DIR = path.join(os.homedir(), ".claude");
const CLAUDE_CREDENTIALS_FILE = ".credentials.json";
const KEYCHAIN_SERVICE = "Claude Code-credentials";

// ─── Credential paths ───────────────────────────────────────────────
function resolveCredentialPaths(): string[] {
  const configuredDir = process.env[CLAUDE_CONFIG_DIR_ENV]?.trim();
  const configDirs = configuredDir
    ? [configuredDir, DEFAULT_CLAUDE_CONFIG_DIR]
    : [DEFAULT_CLAUDE_CONFIG_DIR];

  return [...new Set(configDirs.map((d) => path.resolve(d, CLAUDE_CREDENTIALS_FILE)))];
}

// ─── Credentials JSON shape ─────────────────────────────────────────
interface ClaudeCredentialsRaw {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
    rateLimitTier?: string;
    rate_limit_tier?: string;
    subscriptionType?: string;
    subscription_type?: string;
  };
}

// ─── Hex-decode fallback (Claude Code sometimes writes hex-encoded JSON) ──
function tryDecodeHexJson(text: string): ClaudeCredentialsRaw | null {
  let hex = text.trim();
  if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return JSON.parse(decoded) as ClaudeCredentialsRaw;
  } catch {
    return null;
  }
}

function tryParseCredentialJSON(text: string): ClaudeCredentialsRaw | null {
  try {
    return JSON.parse(text) as ClaudeCredentialsRaw;
  } catch {
    return tryDecodeHexJson(text);
  }
}

// ─── Discover credentials ───────────────────────────────────────────
// ─── Helpers ───────────────────────────────────────────────────────
function pickString(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

export function discoverClaudeAuth(): AuthResult {
  // Strategy 1: File-based (~/.claude/.credentials.json)
  for (const credentialsPath of resolveCredentialPaths()) {
    if (!fs.existsSync(credentialsPath)) continue;

    try {
      const text = fs.readFileSync(credentialsPath, "utf-8");
      const parsed = tryParseCredentialJSON(text);
      const oauth = parsed?.claudeAiOauth;
      const accessToken = oauth?.accessToken?.trim();
      if (accessToken) {
        // Normalize: strip "Bearer " prefix
        const cleanToken = accessToken.toLowerCase().startsWith("bearer ")
          ? accessToken.slice(7).trim()
          : accessToken;

        return {
          token: cleanToken,
          authType: "oauth",
          source: credentialsPath,
          extra: {
            refreshToken: oauth?.refreshToken?.trim() ?? undefined,
            tier: pickString(oauth?.rateLimitTier, oauth?.rate_limit_tier),
            subscription: pickString(oauth?.subscriptionType, oauth?.subscription_type),
          },
        };
      }
    } catch {
      // Fall through to keychain
    }
  }

  // Strategy 2: macOS Keychain
  if (process.platform === "darwin") {
    const keychainValue = readKeychainPassword(KEYCHAIN_SERVICE);
    if (keychainValue) {
      const parsed = tryParseCredentialJSON(keychainValue);
      const oauth = parsed?.claudeAiOauth;
      const accessToken = oauth?.accessToken?.trim();
      if (accessToken) {
        const cleanToken = accessToken.toLowerCase().startsWith("bearer ")
          ? accessToken.slice(7).trim()
          : accessToken;

        return {
          token: cleanToken,
          authType: "oauth",
          source: `keychain:${KEYCHAIN_SERVICE}`,
          extra: {
            refreshToken: oauth?.refreshToken?.trim() ?? undefined,
            tier: pickString(oauth?.rateLimitTier, oauth?.rate_limit_tier),
            subscription: pickString(oauth?.subscriptionType, oauth?.subscription_type),
          },
        };
      }
    }
  }

  return { token: null, authType: "oauth", source: "" };
}
