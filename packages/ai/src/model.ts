import { z } from "zod";

/**
 * One way to ask a model for something (plan piece 24). Every request names what it is
 * for, gives its instructions and what to look at (text, photos, PDFs), and the shape
 * the answer must have. The answer is checked against that shape before anyone sees it,
 * so a model can only ever hand back data, never act (D21).
 *
 * OpenAI behind it for now (D23); another provider is another AiModel.
 */

export type AiPart =
  | { type: "text"; text: string }
  | { type: "image"; contentType: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array }
  | { type: "pdf"; name: string; bytes: Uint8Array };

export interface AiRequest<T> {
  /** What it's for, for the log: "document.read". */
  purpose: string;
  instructions: string;
  parts: AiPart[];
  /** The answer's shape. Use `.nullable()` rather than `.optional()`: every field is always given. */
  schema: z.ZodType<T>;
  /** A short name for the shape: letters, digits, "_" and "-". */
  schemaName: string;
}

export interface AiResult<T> {
  output: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface AiModel {
  /** Which model answers, for the log. */
  readonly name: string;
  run<T>(request: AiRequest<T>): Promise<AiResult<T>>;
}

export type AiErrorCode =
  /** The provider can't be reached or keeps failing. Worth trying again later. */
  | "AI_UNAVAILABLE"
  /** The provider said no: bad key, too large, against its rules. Trying again won't help. */
  | "AI_REJECTED"
  /** The model refused, or its answer didn't have the shape asked for. */
  | "AI_BAD_ANSWER";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    /** Tokens used before it failed, when known. */
    readonly usage?: { inputTokens: number; outputTokens: number },
  ) {
    super(message);
    this.name = "AiError";
  }
  /** Whether a later attempt may go better. */
  get retry(): boolean {
    return this.code === "AI_UNAVAILABLE";
  }
}

export const isAiError = (e: unknown): e is AiError => e instanceof AiError;

/** A JSON Schema the provider's strict mode takes: the zod schema without its `$schema` line. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** Checks an answer against the shape asked for. */
export function parseAnswer<T>(schema: z.ZodType<T>, text: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("AI_BAD_ANSWER", "The answer wasn't JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AiError("AI_BAD_ANSWER", `The answer didn't fit: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  return parsed.data;
}

/**
 * A model that answers from a script: for tests, and for the demo when there's no
 * OpenAI key. `answer` gets each request and returns what the model "says".
 */
export class ScriptedModel implements AiModel {
  readonly calls: AiRequest<unknown>[] = [];
  constructor(
    private readonly answer: (request: AiRequest<unknown>) => unknown,
    readonly name = "scripted",
  ) {}

  async run<T>(request: AiRequest<T>): Promise<AiResult<T>> {
    this.calls.push(request as AiRequest<unknown>);
    const started = Date.now();
    const output = parseAnswer(request.schema, JSON.stringify(await this.answer(request as AiRequest<unknown>)));
    return { output, model: this.name, inputTokens: 0, outputTokens: 0, ms: Date.now() - started };
  }
}
