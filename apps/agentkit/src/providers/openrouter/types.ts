// OpenRouter provider types
export interface OpenRouterUsage {
  creditBalance: number; // dollars remaining
  totalSpend: number; // lifetime usage
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

// API response from https://openrouter.ai/api/v1/auth/key
export interface OpenRouterKeyResponse {
  data?: {
    label?: string;
    is_free_tier?: boolean;
    is_management_key?: boolean;
    limit?: number | null; // credit limit (null = pay-as-you-go)
    limit_reset?: string | null;
    limit_remaining?: number | null;
    usage?: number; // lifetime usage in USD cents
    usage_daily?: number;
    usage_weekly?: number;
    usage_monthly?: number;
    rate_limit?: {
      requests: number;
      interval: string;
      note: string;
    };
  };
}
