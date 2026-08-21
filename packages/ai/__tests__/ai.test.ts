import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import {
  AiError,
  chatJson,
  chatJsonLoose,
  chatText,
  openRouterApiKey,
  openRouterTextAdapter,
} from "../dist/index.js";

const KEY = "sk-or-v1-test-0123456789abcdef0123456789abcdef";

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

async function withMockServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  callback: (baseURL: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock server did not start");
  try {
    await callback(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function writeSse(response: ServerResponse, content: string) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  response.end("data: [DONE]\n\n");
}

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
    expect(() => openRouterTextAdapter("qwen/qwen3.5-9b", { apiKey: "" })).toThrow(
      /OPENROUTER_API_KEY/,
    );
  });
});

describe("chatText", () => {
  test("returns streamed provider content", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await withMockServer(
      (_request, response) => writeSse(response, "hello"),
      async (baseURL) => {
        await expect(chatText({ model: "test/model", prompt: "hi", baseURL })).resolves.toBe(
          "hello",
        );
      },
    );
  });

  test("throws AUTH_MISSING when no key is configured", async () => {
    await expect(chatText({ model: "qwen/qwen3.5-9b", prompt: "hi" })).rejects.toMatchObject({
      code: "AUTH_MISSING",
    });
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

  test("maps provider HTTP failures to MODEL_ERROR", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await withMockServer(
      (_request, response) => {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "unauthorized" } }));
      },
      async (baseURL) => {
        await expect(
          chatText({ model: "test/model", prompt: "hi", baseURL }),
        ).rejects.toMatchObject({ code: "MODEL_ERROR" });
      },
    );
  });

  test("maps an aborted request to REQUEST_TIMEOUT", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await withMockServer(
      (_request, _response) => {},
      async (baseURL) => {
        await expect(
          chatText({ model: "test/model", prompt: "hi", baseURL, timeoutMs: 10 }),
        ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
      },
    );
  });
});

describe("chatJson", () => {
  const schema = z.object({ ok: z.boolean() });

  test("returns a validated non-streaming provider response", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await withMockServer(
      (_request, response) => writeSse(response, JSON.stringify({ ok: true })),
      async (baseURL) => {
        await expect(
          chatJson({ model: "test/model", prompt: "hi", baseURL, schema }),
        ).resolves.toEqual({ ok: true });
      },
    );
  });

  test("maps schema mismatches to INVALID_RESPONSE", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await withMockServer(
      (_request, response) => writeSse(response, JSON.stringify({ ok: "yes" })),
      async (baseURL) => {
        await expect(
          chatJson({ model: "test/model", prompt: "hi", baseURL, schema }),
        ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
      },
    );
  });
});

describe("chatJsonLoose", () => {
  test("parses JSON content from a streamed provider response", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await withMockServer(
      (_request, response) => writeSse(response, '{"ok":true}'),
      async (baseURL) => {
        await expect(
          chatJsonLoose({ model: "test/model", prompt: "hi", baseURL }),
        ).resolves.toEqual({ ok: true });
      },
    );
  });

  test("throws AUTH_MISSING when no key is configured", async () => {
    await expect(chatJsonLoose({ model: "qwen/qwen3.5-9b", prompt: "hi" })).rejects.toMatchObject({
      code: "AUTH_MISSING",
    });
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

  test("maps invalid JSON content to INVALID_RESPONSE", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    await withMockServer(
      (_request, response) => writeSse(response, "not json"),
      async (baseURL) => {
        await expect(
          chatJsonLoose({ model: "test/model", prompt: "hi", baseURL }),
        ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
      },
    );
  });
});
