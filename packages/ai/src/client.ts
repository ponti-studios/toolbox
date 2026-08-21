import { createOpenaiChatCompletions } from "@tanstack/ai-openai";
import type { OpenAIChatModel } from "@tanstack/ai-openai";
import type { AnyTextAdapter } from "@tanstack/ai";
import { openRouterApiKey } from "./auth.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterOptions {
  apiKey?: string;
  baseURL?: string;
}

export function openRouterTextAdapter(model: string, options: OpenRouterOptions = {}): AnyTextAdapter {
  const apiKey = options.apiKey?.trim() || openRouterApiKey();
  return createOpenaiChatCompletions(model as OpenAIChatModel, apiKey, {
    baseURL: options.baseURL ?? OPENROUTER_BASE_URL,
  }) as AnyTextAdapter;
}