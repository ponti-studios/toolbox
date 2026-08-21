import { chat } from "@tanstack/ai";
import type { ZodType } from "zod";
import { z } from "zod";
import { openRouterTextAdapter } from "./client.js";
import { AiError } from "./errors.js";

export interface ChatTextOptions {
  model: string;
  prompt: string;
  system?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  thinking?: boolean;
  responseFormat?: "text" | "json_object";
}

export interface ChatJsonOptions<T extends ZodType> extends ChatTextOptions {
  schema: T;
}

function providerError(message: string, code: unknown, model: string): AiError {
  const codeText = typeof code === "string" ? code : code != null ? String(code) : "";
  if (codeText === "structured-output-validation-failed")
    return new AiError(
      "INVALID_RESPONSE",
      `Model output did not match the expected schema (${model})`,
    );
  const isModel =
    /^(?:4|5)\d{2}\b/.test(message) ||
    /^(?:4|5)\d{2}$/.test(codeText) ||
    /(?:unauthorized|forbidden|rate.?limit|quota|not.?found|invalid)/i.test(message);
  const isNetwork = /(?:connection|fetch failed|econnrefused|enetunreach|socket|network)/i.test(
    message,
  );
  const category = isNetwork && !isModel ? "NETWORK_ERROR" : "MODEL_ERROR";
  return new AiError(category, `OpenRouter request failed (${model}): ${message}`);
}

function mapError(error: unknown, aborted: boolean, model: string): never {
  if (aborted)
    throw new AiError("REQUEST_TIMEOUT", `OpenRouter request timed out (${model})`, {
      cause: error,
    });
  if (error instanceof AiError) throw error;
  if (error instanceof z.ZodError)
    throw new AiError(
      "INVALID_RESPONSE",
      `Model output did not match the expected schema (${model})`,
      { cause: error },
    );
  const message = error instanceof Error ? error.message : String(error);
  const candidate = error as { status?: unknown; code?: unknown };
  if (
    typeof candidate.status === "number" ||
    (typeof candidate.status === "string" && /^\d{3}$/.test(candidate.status))
  )
    throw new AiError(
      "MODEL_ERROR",
      `OpenRouter rejected the request (${model}): ${candidate.status}`,
      { cause: error },
    );
  throw providerError(message, candidate.code, model);
}

function withTimeout(controller: AbortController, timeoutMs: number) {
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return () => clearTimeout(timer);
}

function modelOptionsOf(
  temperature?: number,
  maxTokens?: number,
  thinking?: boolean,
  responseFormat?: "text" | "json_object",
) {
  return {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_output_tokens: maxTokens } : {}),
    ...(thinking === false ? { reasoning: { enabled: false } } : {}),
    ...(responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
  };
}

export async function chatText(options: ChatTextOptions): Promise<string> {
  const {
    model,
    prompt,
    system,
    apiKey,
    baseURL,
    temperature,
    maxTokens,
    timeoutMs,
    thinking,
    responseFormat,
  } = options;
  const controller = new AbortController();
  const clear = withTimeout(controller, timeoutMs ?? 120_000);
  try {
    const stream = chat({
      adapter: openRouterTextAdapter(model, { apiKey, baseURL }),
      stream: true,
      systemPrompts: system ? [{ content: system }] : undefined,
      messages: [{ role: "user", content: prompt }],
      modelOptions: modelOptionsOf(temperature, maxTokens, thinking, responseFormat) as never,
      abortController: controller,
    });
    let text = "";
    for await (const chunk of stream) {
      if (chunk.type === "TEXT_MESSAGE_CONTENT") text += chunk.delta ?? chunk.content ?? "";
      else if (chunk.type === "RUN_ERROR") throw providerError(chunk.message, chunk.code, model);
    }
    clear();
    if (text.trim() === "")
      throw new AiError("MODEL_ERROR", `OpenRouter returned an empty response (${model})`);
    return text;
  } catch (error) {
    clear();
    mapError(error, controller.signal.aborted, model);
  }
}

export async function chatJson<T extends ZodType>(
  options: ChatJsonOptions<T>,
): Promise<z.infer<T>> {
  const {
    model,
    prompt,
    system,
    apiKey,
    baseURL,
    schema,
    temperature,
    maxTokens,
    timeoutMs,
    thinking,
  } = options;
  const controller = new AbortController();
  const clear = withTimeout(controller, timeoutMs ?? 120_000);
  try {
    const result = (await chat({
      adapter: openRouterTextAdapter(model, { apiKey, baseURL }),
      stream: false,
      systemPrompts: system ? [{ content: system }] : undefined,
      messages: [{ role: "user", content: prompt }],
      outputSchema: schema,
      modelOptions: modelOptionsOf(temperature, maxTokens, thinking) as never,
      abortController: controller,
    })) as z.infer<T>;
    clear();
    return result;
  } catch (error) {
    clear();
    mapError(error, controller.signal.aborted, model);
  }
}

export async function chatJsonLoose(options: ChatTextOptions): Promise<Record<string, unknown>> {
  const { model } = options;
  const text = await chatText({ ...options, responseFormat: "json_object" });
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new AiError("INVALID_RESPONSE", `Model returned no JSON object (${model})`);
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new AiError("INVALID_RESPONSE", `Model returned invalid JSON (${model})`, {
      cause: error,
    });
  }
}
