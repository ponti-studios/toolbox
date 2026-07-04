// Codex (OpenAI Codex CLI) provider types
export interface CodexRateWindow {
  percentageRemaining: number;
  resetsInSeconds: number;
  limitWindowSeconds: number;
}

export interface CodexUsage {
  account: string;
  fiveHourLimit: CodexRateWindow;
  weeklyLimit: CodexRateWindow;
  codeReviewLimit?: CodexRateWindow;
  credits: {
    hasCredits: boolean;
    unlimited: boolean;
    balance: string; // dollar amount as string
  };
  resetCredits?: {
    availableCount: number | null;
    expiresAtList: string[];
  };
}
