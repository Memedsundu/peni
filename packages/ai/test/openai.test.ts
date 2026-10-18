import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiError, OpenAiModel, OpenAiTranscriber, ScriptedModel, billReadingRequest, readBill, type BillReading } from "../src";

const request = {
  purpose: "test",
  instructions: "Answer.",
  parts: [
    { type: "text" as const, text: "Hi" },
    { type: "image" as const, contentType: "image/png" as const, bytes: new Uint8Array([1, 2, 3]) },
  ],
  schema: z.object({ n: z.number(), note: z.string().nullable() }),
  schemaName: "answer",
};

const answer = (text: string, extra: object = {}) =>
  new Response(
    JSON.stringify({
      model: "gpt-5-mini-2026",
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
      usage: { input_tokens: 120, output_tokens: 8 },
      ...extra,
    }),
    {
      status: 200,
    },
  );

describe("OpenAiModel (plan piece 24)", () => {
  it("asks the Responses API for a strict schema, sends photos inline, keeps nothing at OpenAI, and checks the answer", async () => {
    const sent: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string), auth: new Headers(init.headers).get("authorization") });
      return answer('{"n":3,"note":null}');
    }) as unknown as typeof globalThis.fetch;
    const r = await new OpenAiModel({ apiKey: "sk-test", fetch }).run(request);
    expect(r).toMatchObject({ output: { n: 3, note: null }, model: "gpt-5-mini-2026", inputTokens: 120, outputTokens: 8 });
    expect(sent[0]!.url).toBe("https://api.openai.com/v1/responses");
    expect(sent[0]!.auth).toBe("Bearer sk-test");
    expect(sent[0]!.body).toMatchObject({
      model: "gpt-5-mini",
      instructions: "Answer.",
      store: false,
      text: { format: { type: "json_schema", name: "answer", strict: true } },
    });
    const format = (sent[0]!.body.text as { format: { schema: Record<string, unknown> } }).format.schema;
    expect(format.$schema).toBeUndefined();
    expect(format).toMatchObject({ additionalProperties: false, required: ["n", "note"] });
    const content = (sent[0]!.body.input as { content: Record<string, string>[] }[])[0]!.content;
    expect(content[1]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,AQID" });
  });

  it("tries again after a 429 or a 5xx, then gives up as unavailable; a 401 isn't retried", async () => {
    let calls = 0;
    const busy = (async () => (calls++, new Response('{"error":{"message":"slow down"}}', { status: 429 }))) as unknown as typeof fetch;
    const e = await new OpenAiModel({ apiKey: "k", fetch: busy, backoffMs: [1, 1] }).run(request).catch((x) => x);
    expect(e).toBeInstanceOf(AiError);
    expect([e.code, e.retry, calls]).toEqual(["AI_UNAVAILABLE", true, 3]);

    let tries = 0;
    const flaky = (async () => (++tries === 1 ? new Response("", { status: 502 }) : answer('{"n":1,"note":"ok"}'))) as unknown as typeof fetch;
    expect((await new OpenAiModel({ apiKey: "k", fetch: flaky, backoffMs: [1] }).run(request)).output.n).toBe(1);

    calls = 0;
    const bad = (async () => (calls++, new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 }))) as unknown as typeof fetch;
    const r = await new OpenAiModel({ apiKey: "k", fetch: bad, backoffMs: [1] }).run(request).catch((x) => x);
    expect([r.code, r.retry, calls, r.message]).toEqual(["AI_REJECTED", false, 1, "OpenAI answered 401: Incorrect API key"]);
  });

  it("turns a refusal, a cut-off answer or a wrong shape into AI_BAD_ANSWER with the tokens used", async () => {
    const one = (res: Response) => new OpenAiModel({ apiKey: "k", fetch: (async () => res) as unknown as typeof fetch }).run(request).catch((x) => x);
    const refused = await one(answer("", { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }));
    expect([refused.code, refused.usage]).toEqual(["AI_BAD_ANSWER", { inputTokens: 120, outputTokens: 8 }]);
    expect((await one(answer('{"n":1,"note":null}', { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }))).code).toBe(
      "AI_BAD_ANSWER",
    );
    expect((await one(answer('{"n":"three","note":null}'))).code).toBe("AI_BAD_ANSWER");
    expect((await one(answer("not json"))).code).toBe("AI_BAD_ANSWER");
  });
});

describe("Reading a bill", () => {
  const reading: BillReading = {
    kind: "bill",
    supplierName: "  Moda Süt Ürünleri ",
    supplierTaxNumber: "1234567890",
    number: "A-1024",
    date: "2026-10-14",
    dueDate: "2026-02-30",
    total: 1234.5,
    lines: [
      { name: "Süt 1 L", quantity: 24, unit: "adet", total: 984.5, category: "ingredients", stockItem: 1, stockQuantity: 24 },
      { name: "Bardak", quantity: null, unit: null, total: 200, category: "supplies", stockItem: 7, stockQuantity: 50 },
      { name: " ", quantity: 1, unit: null, total: 5, category: "other", stockItem: null, stockQuantity: null },
    ],
    kdv: [
      { rate: 1, amount: 9.75 },
      { rate: 20, amount: 33.33 },
      { rate: 7, amount: 2 },
    ],
    doubts: ["Fiş biraz bulanık."],
  };

  it("sends a PDF as a file and a photo as an image", () => {
    expect(billReadingRequest({ name: "f.pdf", contentType: "application/pdf", bytes: new Uint8Array([1]) }).parts[1]).toMatchObject({
      type: "pdf",
      name: "f.pdf",
    });
    expect(billReadingRequest({ name: "", contentType: "image/jpeg", bytes: new Uint8Array([1]) }).parts[1]).toMatchObject({
      type: "image",
      contentType: "image/jpeg",
    });
  });

  it("turns lira into kuruş, drops empty lines, and says what doesn't add up", () => {
    const r = readBill(reading, 2);
    expect(r).toMatchObject({ supplierName: "Moda Süt Ürünleri", number: "A-1024", date: "2026-10-14", dueDate: null, totalKurus: 123_450 });
    expect(r.lines).toEqual([
      { name: "Süt 1 L", quantityMilli: 24_000, unit: "adet", totalKurus: 98_450, category: "ingredients", stockIndex: 0, stockQtyMilli: 24_000 },
      // Item 7 isn't one of the two given.
      { name: "Bardak", quantityMilli: null, unit: null, totalKurus: 20_000, category: "supplies", stockIndex: null, stockQtyMilli: null },
    ]);
    expect(r.kdv).toEqual([
      { ratePct: 1, amountKurus: 975 },
      { ratePct: 20, amountKurus: 3_333 },
    ]);
    expect(r.doubts).toEqual([
      "Fiş biraz bulanık.",
      'Son ödeme tarihi okunamadı ("2026-02-30").',
      "Satırların toplamı ₺1.184,50, belgedeki toplam ₺1.234,50. Satırları kontrol et.",
      "KDV oranı okunamadı (%7).",
    ]);
  });

  it("lists the café's stock items for the model to pick from, by number", () => {
    const req = billReadingRequest({ name: "", contentType: "image/png", bytes: new Uint8Array([1]) }, [
      { name: "Süt", unit: "l" },
      { name: "Karton  bardak", unit: "adet" },
    ]);
    expect(req.parts[0]).toEqual({ type: "text", text: "Read this document.\n\nStock items:\n1. Süt (l)\n2. Karton bardak (adet)" });
    expect(req.instructions).toContain("stockQuantity");
    expect(billReadingRequest({ name: "", contentType: "image/png", bytes: new Uint8Array([1]) }).instructions).not.toContain("stockQuantity");
  });

  it("drops KDV that can't be right", () => {
    expect(readBill({ ...reading, kdv: [{ rate: 20, amount: 5000 }] }).kdv).toEqual([]);
  });

  it("runs through a scripted model like any other", async () => {
    const model = new ScriptedModel(() => reading);
    const r = await model.run(billReadingRequest({ name: "", contentType: "image/png", bytes: new Uint8Array([1]) }));
    expect(r.output.supplierName).toBe("  Moda Süt Ürünleri ");
    expect(model.calls[0]!.purpose).toBe("document.read");
  });
});

describe("OpenAiTranscriber (plan piece 28)", () => {
  it("sends the recording with its language and the words it may hear, and reads back the text", async () => {
    const sent: { url: string; form: FormData }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, form: init.body as FormData });
      return new Response(JSON.stringify({ text: " Simitçiye 120 lira verdim. ", usage: { input_tokens: 30, output_tokens: 9 } }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const r = await new OpenAiTranscriber({ apiKey: "k", fetch }).transcribe(
      { bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), contentType: "audio/webm" },
      { language: "tr", prompt: "Tedarikçiler: Fırıncı Hasan." },
    );
    expect(r).toMatchObject({ text: "Simitçiye 120 lira verdim.", model: "gpt-4o-mini-transcribe", inputTokens: 30, outputTokens: 9 });
    expect(sent[0]!.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const form = sent[0]!.form;
    expect([form.get("model"), form.get("language"), form.get("prompt")]).toEqual(["gpt-4o-mini-transcribe", "tr", "Tedarikçiler: Fırıncı Hasan."]);
    expect((form.get("file") as File).name).toBe("kayit.webm");
  });

  it("tries once more after a server error, and doesn't retry a refusal", async () => {
    let calls = 0;
    const down = (async () => (calls++, new Response("{}", { status: 503 }))) as unknown as typeof fetch;
    const e = await new OpenAiTranscriber({ apiKey: "k", fetch: down, backoffMs: [1] })
      .transcribe({ bytes: new Uint8Array([1]), contentType: "audio/webm" }, { language: "tr" })
      .catch((x) => x);
    expect([e.code, calls]).toEqual(["AI_UNAVAILABLE", 2]);
    calls = 0;
    const no = (async () => (calls++, new Response('{"error":{"message":"bad file"}}', { status: 400 }))) as unknown as typeof fetch;
    const f = await new OpenAiTranscriber({ apiKey: "k", fetch: no })
      .transcribe({ bytes: new Uint8Array([1]), contentType: "audio/webm" }, { language: "tr" })
      .catch((x) => x);
    expect([f.code, calls]).toEqual(["AI_REJECTED", 1]);
  });
});
