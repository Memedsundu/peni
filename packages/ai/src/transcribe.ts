import { AiError } from "./model";

/**
 * Speech to text for quick entry (plan piece 28): a short recording in, what was said out.
 * The text goes back to the person to read and fix before anything is drafted from it,
 * and the recording isn't kept anywhere.
 */

export interface AudioClip {
  bytes: Uint8Array;
  contentType: string;
}

export interface Transcript {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface Transcriber {
  readonly name: string;
  /** `language` is "tr" or "en"; `prompt` gives words it may hear (supplier names). */
  transcribe(clip: AudioClip, opts: { language: string; prompt?: string }): Promise<Transcript>;
}

export interface OpenAiTranscriberOptions {
  apiKey: string;
  /** Default "gpt-4o-mini-transcribe". */
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** The person is waiting, so one quick second try at most. */
  backoffMs?: number[];
}

const EXTENSION: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" };

/** OpenAI's transcription endpoint, plain fetch like `OpenAiModel`. */
export class OpenAiTranscriber implements Transcriber {
  readonly name: string;
  private readonly fetch: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAiTranscriberOptions) {
    this.name = options.model ?? "gpt-4o-mini-transcribe";
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async transcribe(clip: AudioClip, opts: { language: string; prompt?: string }): Promise<Transcript> {
    const started = Date.now();
    const waits = this.options.backoffMs ?? [1_000];
    for (let attempt = 0; ; attempt++) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(clip.bytes)], { type: clip.contentType }), `kayit.${EXTENSION[clip.contentType] ?? "webm"}`);
      form.append("model", this.name);
      form.append("language", opts.language);
      form.append("response_format", "json");
      if (opts.prompt) form.append("prompt", opts.prompt);
      let res: Response;
      try {
        res = await this.fetch(`${this.baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.options.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
        });
      } catch (error) {
        if (attempt < waits.length) {
          await sleep(waits[attempt]!);
          continue;
        }
        throw new AiError("AI_UNAVAILABLE", `OpenAI can't be reached: ${error instanceof Error ? error.message : String(error)}`);
      }
      const json = (await res.json().catch(() => null)) as TranscriptionResponse | null;
      if (res.status === 429 || res.status >= 500) {
        if (attempt < waits.length) {
          await sleep(waits[attempt]!);
          continue;
        }
        throw new AiError("AI_UNAVAILABLE", `OpenAI answered ${res.status}: ${json?.error?.message ?? res.statusText}`);
      }
      if (!res.ok || !json) throw new AiError("AI_REJECTED", `OpenAI answered ${res.status}: ${json?.error?.message ?? res.statusText}`);
      if (typeof json.text !== "string") throw new AiError("AI_BAD_ANSWER", "The transcription had no text");
      return {
        text: json.text.trim(),
        model: this.name,
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        ms: Date.now() - started,
      };
    }
  }
}

interface TranscriptionResponse {
  text?: string;
  error?: { message?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Hears what it's told to: for tests, and for the demo without an OpenAI key. */
export class ScriptedTranscriber implements Transcriber {
  readonly calls: { clip: AudioClip; language: string; prompt?: string }[] = [];
  constructor(
    private readonly answer: (clip: AudioClip) => string,
    readonly name = "scripted",
  ) {}

  async transcribe(clip: AudioClip, opts: { language: string; prompt?: string }): Promise<Transcript> {
    this.calls.push({ clip, ...opts });
    return { text: this.answer(clip), model: this.name, inputTokens: 0, outputTokens: 0, ms: 0 };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
