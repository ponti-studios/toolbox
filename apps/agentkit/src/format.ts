// Shared formatting helpers
import type { TokenUsage } from "./pricing.js";
import { estimateCost } from "./pricing.js";

// ─── Token formatting ───────────────────────────────────────────────
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

// ─── Cost formatting ────────────────────────────────────────────────
export function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `${(cost * 100).toFixed(1)}¢`;
  if (cost === 0) return "$0";
  return `$${cost.toFixed(4)}`;
}

// ─── Duration formatting ────────────────────────────────────────────
export function formatDuration(startMs: number, endMs: number): string {
  const diffMs = endMs - startMs;
  if (diffMs < 0) return "0s";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ─── Relative time formatting ───────────────────────────────────────
export function formatRelativeTime(ms: number): string {
  const diffMs = Date.now() - ms;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

// ─── ASCII bar chart ────────────────────────────────────────────────
export function asciiBar(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return bar;
}

// ─── Compact usage line (Pi-style) ──────────────────────────────────
export function compactUsageLine(model: string, usage: TokenUsage, cacheHitRate: number): string {
  const input = formatTokens(usage.inputTokens);
  const output = formatTokens(usage.outputTokens);
  const cost = formatCost(estimateCost("claude", model, usage));
  return `↑${input} ↓${output} CH${cacheHitRate.toFixed(1)}% ${cost}`;
}

// ─── Session summary line ───────────────────────────────────────────
export interface SessionSummary {
  model: string;
  project: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  lastModified: Date;
}

export function sessionLine(s: SessionSummary): string {
  const model = s.model.padEnd(24);
  const proj = s.project.slice(0, 20).padEnd(20);
  const tokens = `${formatTokens(s.inputTokens)}/${formatTokens(s.outputTokens)}`.padStart(14);
  const cost = formatCost(s.cost).padStart(8);
  const turns = `${s.turns}t`.padStart(5);
  const time = formatRelativeTime(s.lastModified.getTime());
  return `${model} ${proj} ${tokens} ${cost} ${turns} ${time}`;
}
