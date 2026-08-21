export type AiErrorCode =
  | "AUTH_MISSING"
  | "REQUEST_TIMEOUT"
  | "INVALID_RESPONSE"
  | "MODEL_ERROR"
  | "NETWORK_ERROR";

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiError";
    this.code = code;
  }
}