// OpenCode Go provider types
export interface OpencodeQuota {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

export interface OpencodeUsage {
  planName: string;
  primary: OpencodeQuota;
  quotas: OpencodeQuota[];
  resetsAt: string | null;
}
