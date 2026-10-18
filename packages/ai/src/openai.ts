import { AiError, jsonSchemaOf, parseAnswer, type AiModel, type AiPart, type AiRequest, type AiResult } from "./model";

export interface OpenAiOptions {
  apiKey: string;
  /** Default "gpt-5-mini": reads photos and PDFs well and costs little. */
  model?: string;
  baseUrl?: string;
  /** Tests hand in their own. */
  fetch?: typeof fetch;
  /** How long one attempt may take. Reading a long PDF can take a while. */
  timeoutMs?: number;
  /** Waits between attempts after a 429 or a server error. */
  backoffMs?: number[];
}

/**
 * OpenAI's Responses API with a strict JSON schema, so the answer is data of the shape
 * asked for. `store: false`: OpenAI keeps nothing of the café's documents for later.
 * Plain fetch, no SDK: one call is all Peni needs.
 */
export class OpenAiModel implements AiModel {
  readonly name: string;
  private readonly fetch: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAiOptions) {
    this.name = options.model ?? "gpt-5-mini";
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async run<T>(request: AiRequest<T>): Promise<AiResult<T>> {
    const started = Date.now();
    const body = JSON.stringify({
      model: this.name,
      instructions: request.instructions,
      input: [{ role: "user", content: request.parts.map(contentOf) }],
      text: { format: { type: "json_schema", name: request.schemaName, schema: jsonSchemaOf(request.schema), strict: true } },
      store: false,
    });
    const waits = this.options.backoffMs ?? [2_000, 8_000];
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetch(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000),
        });
      } catch (error) {
        if (attempt < waits.length) {
          await sleep(waits[attempt]!);
          continue;
        }
        throw new AiError("AI_UNAVAILABLE", `OpenAI can't be reached: ${error instanceof Error ? error.message : String(error)}`);
      }
      const json = (await res.json().catch(() => null)) as OpenAiResponse | null;
      if (res.status === 429 || res.status >= 500) {
        if (attempt < waits.length) {
          await sleep(waits[attempt]!);
          continue;
        }
        throw new AiError("AI_UNAVAILABLE", `OpenAI answered ${res.status}: ${json?.error?.message ?? res.statusText}`);
      }
      if (!res.ok || !json) throw new AiError("AI_REJECTED", `OpenAI answered ${res.status}: ${json?.error?.message ?? res.statusText}`);
      return this.read(request, json, started);
    }
  }

  private read<T>(request: AiRequest<T>, json: OpenAiResponse, started: number): AiResult<T> {
    const usage = { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 };
    const content = (json.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
    const refusal = content.find((c) => c.type === "refusal");
    if (refusal) throw new AiError("AI_BAD_ANSWER", `The model refused: ${refusal.refusal ?? ""}`, usage);
    if (json.status === "incomplete") throw new AiError("AI_BAD_ANSWER", `The answer was cut off (${json.incomplete_details?.reason ?? "unknown"})`, usage);
    const text = content.find((c) => c.type === "output_text")?.text;
    if (!text) throw new AiError("AI_BAD_ANSWER", "The answer was empty", usage);
    try {
      return { output: parseAnswer(request.schema, text), model: json.model ?? this.name, ...usage, ms: Date.now() - started };
    } catch (error) {
      throw error instanceof AiError ? new AiError(error.code, error.message, usage) : error;
    }
  }
}

interface OpenAiResponse {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function contentOf(part: AiPart) {
  switch (part.type) {
    case "text":
      return { type: "input_text", text: part.text };
    case "image":
      return { type: "input_image", image_url: `data:${part.contentType};base64,${base64(part.bytes)}`, detail: "high" };
    case "pdf":
      return { type: "input_file", filename: part.name, file_data: `data:application/pdf;base64,${base64(part.bytes)}` };
  }
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
