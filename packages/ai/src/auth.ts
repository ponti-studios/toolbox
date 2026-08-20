import { AiError } from "./errors.js";

export function openRouterApiKey(): string {
  const token = process.env.OPENROUTER_API_KEY?.trim();
  if (token) return token;
  throw new AiError(
    "AUTH_MISSING",
    "OpenRouter API key is missing. Set OPENROUTER_API_KEY in the environment.",
  );
}