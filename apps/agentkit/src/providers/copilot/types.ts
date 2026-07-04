// GitHub Copilot provider types
export interface CopilotUsage {
  plan: string;
  premiumRemaining: number | null;
  chatRemaining: number | null;
  quotaResetDate: string | null;
}
