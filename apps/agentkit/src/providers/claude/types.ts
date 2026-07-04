// Claude Code provider types
export interface ClaudeRateWindow {
  percentageRemaining: number;
  resetsIn: string | null;
}

export interface ClaudeExtraUsage {
  used: number;
  limit: number;
  currency: string;
}

export interface ClaudeUsage {
  plan: string;
  fiveHour: ClaudeRateWindow;
  sevenDay: ClaudeRateWindow | null;
  sevenDayModel: ClaudeRateWindow | null;
  extraUsage: ClaudeExtraUsage | null;
}
