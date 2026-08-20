import { afterEach, describe, expect, test } from "vitest";
import { AiError, chatJsonLoose, chatText, openRouterApiKey, openRouterTextAdapter } from "../dist/index.js";

const KEY = "sk-or-v1-test-0123456789abcdef0123456789abcdef";

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

describe("auth", () => {
  test("returns the API key from the environment", () => {
    process.env.OPENROUTER_API_KEY = KEY;
    expect(openRouterApiKey()).toBe(KEY);
  });

  test("throws AUTH_MISSING without a key", () => {
    expect(() => openRouterApiKey()).toThrow(AiError);
    try {
      openRouterApiKey();
    } catch (error) {
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).code).toBe("AUTH_MISSING");
    }
  });
});

describe("client", () => {
  test("builds a text adapter against OpenRouter", () => {
    process.env.OPENROUTER_API_KEY = KEY;
    const adapter = openRouterTextAdapter("qwen/qwen3.5-9b");
    expect(adapter).toBeDefined();
  });

  test("requires an API key when none is provided", () => {
    expect(() => openRouterTextAdapter("qwen/qwen3.5-9b", { apiKey: "" })).toThrow(/OPENROUTER_API_KEY/);
  });
});

describe("chatText", () => {
  test("throws AUTH_MISSING when no key is configured", async () => {
    await expect(
      chatText({ model: "qwen/qwen3.5-9b", prompt: "hi" }),
    ).rejects.toMatchObject({ code: "AUTH_MISSING" });
  });

  test("maps connection failures to NETWORK_ERROR instead of an empty result", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await expect(
      chatText({
        model: "qwen/qwen3.5-9b",
        prompt: "hi",
        baseURL: "http://127.0.0.1:1/v1",
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});

describe("chatJsonLoose", () => {
  test("throws AUTH_MISSING when no key is configured", async () => {
    await expect(
      chatJsonLoose({ model: "qwen/qwen3.5-9b", prompt: "hi" }),
    ).rejects.toMatchObject({ code: "AUTH_MISSING" });
  });

  test("maps connection failures to NETWORK_ERROR", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await expect(
      chatJsonLoose({
        model: "qwen/qwen3.5-9b",
        prompt: "hi",
        baseURL: "http://127.0.0.1:1/v1",
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});