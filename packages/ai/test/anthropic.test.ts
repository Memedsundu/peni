import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError, AnthropicModel, billReadingSchema, chatStepSchema, letterSchema, quickReadingSchema, statementReadingSchema, zReadingSchema } from "../src";

const request = {
  purpose: "test",
  instructions: "Answer.",
  parts: [
    { type: "text" as const, text: "Hi" },
    { type: "image" as const, contentType: "image/png" as const, bytes: new Uint8Array([1, 2, 3]) },
    { type: "pdf" as const, name: "fatura.pdf", bytes: new Uint8Array([4]) },
  ],
  schema: z.object({ n: z.number(), note: z.string().nullable() }),
  schemaName: "answer",
};

const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const answer = (text: string, extra: object = {}) =>
  json(200, {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 8 },
    ...extra,
  });

// The SDK waits as long as `retry-after-ms` says, so tests don't sit through its real backoff.
const soon = { "retry-after-ms": "1" };

describe("AnthropicModel (D23, Claude)", () => {
  it("asks Messages for Haiku with the shape as a structured output, sends photos and PDFs inline, and checks the answer", async () => {
    const sent: { url: string; body: Record<string, unknown>; key: string | null }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(init.body as string), key: new Headers(init.headers).get("x-api-key") });
      return answer('{"n":3,"note":null}');
    }) as unknown as typeof globalThis.fetch;
    const r = await new AnthropicModel({ apiKey: "sk-ant-test", fetch }).run(request);
    expect(r).toMatchObject({ output: { n: 3, note: null }, model: "claude-haiku-5-5", inputTokens: 120, outputTokens: 8 });
    expect(sent[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0]!.key).toBe("sk-ant-test");
    expect(sent[0]!.body).toMatchObject({ model: "claude-haiku-5-5", system: "Answer.", output_config: { effort: "medium", format: { type: "json_schema" } } });
    expect(sent[0]!.body.thinking).toBeUndefined();
    const schema = (sent[0]!.body.output_config as { format: { schema: Record<string, unknown>; parse?: unknown } }).format;
    expect(schema.parse).toBeUndefined();
    expect(schema.schema).toMatchObject({ type: "object", required: ["n", "note"] });
    const content = (sent[0]!.body.messages as { role: string; content: Record<string, unknown>[] }[])[0]!.content;
    expect(content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } });
    expect(content[2]).toEqual({ type: "document", title: "fatura.pdf", source: { type: "base64", media_type: "application/pdf", data: "BA==" } });
  });

  it("tries again after a 429 or a 5xx, then gives up as unavailable; a 401 isn't retried", async () => {
    let calls = 0;
    const busy = (async () => (calls++, json(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, soon))) as unknown as typeof fetch;
    const e = await new AnthropicModel({ apiKey: "k", fetch: busy }).run(request).catch((x) => x);
    expect(e).toBeInstanceOf(AiError);
    expect([e.code, e.retry, calls]).toEqual(["AI_UNAVAILABLE", true, 3]);

    let tries = 0;
    const flaky = (async () =>
      ++tries === 1 ? json(529, { type: "error", error: { type: "overloaded_error", message: "busy" } }, soon) : answer('{"n":1,"note":"ok"}')) as unknown as typeof fetch;
    expect((await new AnthropicModel({ apiKey: "k", fetch: flaky }).run(request)).output.n).toBe(1);

    calls = 0;
    const bad = (async () => (calls++, json(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }))) as unknown as typeof fetch;
    const r = await new AnthropicModel({ apiKey: "k", fetch: bad }).run(request).catch((x) => x);
    expect([r.code, r.retry, calls]).toEqual(["AI_REJECTED", false, 1]);
    expect(r.message).toMatch(/^Anthropic answered 401: /);
  });

  it("turns a refusal, a cut-off answer or a wrong shape into AI_BAD_ANSWER with the tokens used", async () => {
    const one = (res: Response) => new AnthropicModel({ apiKey: "k", fetch: (async () => res) as unknown as typeof fetch }).run(request).catch((x) => x);
    const refused = await one(answer("", { content: [], stop_reason: "refusal" }));
    expect([refused.code, refused.usage]).toEqual(["AI_BAD_ANSWER", { inputTokens: 120, outputTokens: 8 }]);
    expect((await one(answer('{"n":1', { stop_reason: "max_tokens" }))).code).toBe("AI_BAD_ANSWER");
    expect((await one(answer('{"n":"three","note":null}'))).code).toBe("AI_BAD_ANSWER");
    expect((await one(answer("not json"))).code).toBe("AI_BAD_ANSWER");
  });

  it("takes every shape Peni asks for, as a schema Claude's structured outputs accept", () => {
    const shapes = { billReadingSchema, chatStepSchema, letterSchema, quickReadingSchema, statementReadingSchema, zReadingSchema };
    for (const shape of Object.values(shapes)) {
      const { type, schema } = zodOutputFormat(shape);
      expect(type).toBe("json_schema");
      expect(schema).toMatchObject({ type: "object", additionalProperties: false });
      // Claude's strict schemas don't take number or length limits; the SDK moves them into descriptions.
      expect(JSON.stringify(schema)).not.toMatch(/"(minimum|maximum|minLength|maxLength|minItems|maxItems)"/);
    }
  });
});
