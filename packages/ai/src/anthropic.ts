import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError, parseAnswer, type AiModel, type AiPart, type AiRequest, type AiResult } from "./model";

/** Room for the model to think and answer; a 50-line bill or a month of statement lines fits. */
const MAX_TOKENS = 32_000;

export interface AnthropicOptions {
  apiKey: string;
  /** Default "claude-haiku-5-5": reads photos and PDFs, and costs least. */
  model?: string;
  baseUrl?: string;
  /** Tests hand in their own. */
  fetch?: typeof fetch;
  /** How long one attempt may take. Reading a long PDF can take a while. */
  timeoutMs?: number;
  /** Tries after the first on a 429, a 5xx or a lost connection. */
  retries?: number;
}

/**
 * Claude through Anthropic's SDK, with structured outputs so the answer is data of the
 * shape asked for (D23, changed 2026-10-20). Each request stands alone: instructions as the
 * system prompt and one user turn, so there's no history to keep in step. Thinking is left
 * as the model's default (adaptive) and effort is set to medium, Haiku's own default, so it's
 * written down rather than assumed.
 */
export class AnthropicModel implements AiModel {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicOptions) {
    this.name = options.model ?? "claude-haiku-5-5";
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: options.fetch,
      timeout: options.timeoutMs ?? 120_000,
      maxRetries: options.retries ?? 2,
    });
  }

  async run<T>(request: AiRequest<T>): Promise<AiResult<T>> {
    const started = Date.now();
    const { type, schema } = zodOutputFormat(request.schema);
    let message: Anthropic.Message;
    try {
      // Streamed, so a long bill or statement (thinking counts towards the limit) has room to
      // finish without the request itself timing out; only the whole message is used.
      message = await this.client.messages
        .stream({
          model: this.name,
          max_tokens: MAX_TOKENS,
          system: request.instructions,
          messages: [{ role: "user", content: request.parts.map(contentOf) }],
          output_config: { effort: "medium", format: { type, schema } },
        })
        .finalMessage();
    } catch (error) {
      throw failure(error);
    }
    const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
    if (message.stop_reason === "refusal") throw new AiError("AI_BAD_ANSWER", "The model refused", usage);
    if (message.stop_reason === "max_tokens") throw new AiError("AI_BAD_ANSWER", "The answer was cut off (max_tokens)", usage);
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (!text) throw new AiError("AI_BAD_ANSWER", "The answer was empty", usage);
    try {
      return { output: parseAnswer(request.schema, text), model: message.model, ...usage, ms: Date.now() - started };
    } catch (error) {
      throw error instanceof AiError ? new AiError(error.code, error.message, usage) : error;
    }
  }
}

/** The SDK has already tried again by now; a 429, a 5xx or no connection may go better later, anything else won't. */
function failure(error: unknown): AiError {
  if (error instanceof Anthropic.APIConnectionError) return new AiError("AI_UNAVAILABLE", `Anthropic can't be reached: ${error.message}`);
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    return new AiError("AI_UNAVAILABLE", `Anthropic answered ${error.status}: ${error.message}`);
  }
  if (error instanceof Anthropic.APIError) return new AiError("AI_REJECTED", `Anthropic answered ${error.status}: ${error.message}`);
  return new AiError("AI_UNAVAILABLE", `Anthropic failed: ${error instanceof Error ? error.message : String(error)}`);
}

function contentOf(part: AiPart): Anthropic.ContentBlockParam {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return { type: "image", source: { type: "base64", media_type: part.contentType, data: base64(part.bytes) } };
    case "pdf":
      return { type: "document", title: part.name || undefined, source: { type: "base64", media_type: "application/pdf", data: base64(part.bytes) } };
  }
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
